import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, LessThan, Not, Repository } from 'typeorm';
import { LoggingService } from '../../common/logging/logging.service';
import { fetchAndValidateFeed } from '../../common/util/feed-validator.util';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { CreateSourceDto } from '../dto/create-source.dto';
import { QuerySourceDto } from '../dto/query-source.dto';
import { UpdateSourceDto } from '../dto/update-source.dto';
import { Source, SourceStatus, SourceType } from '../entities/source.entity';
import { SourceIngestionAttempt } from '../entities/source-ingestion-attempt.entity';
import { MetricsService } from '../../common/metrics/metrics.service';
import { DiscoveryQuotaRecord } from '../entities/discovery-quota-record.entity';
import { TaxonomySourceDiscoveryRequest } from '../../taxonomy/entities/taxonomy-source-discovery-request.entity';
import { QueueService } from '../../queue/services/queue.service';
import { SourceCoverage } from '../entities/source-coverage.entity';
import { WebSourceConfig } from '../entities/web-source-config.entity';
import { SourceDiscoveryService } from './source-discovery.service';
import { SourceStructureAiService } from './source-structure-ai.service';
import { SourceIdentityService } from './source-identity.service';

type SourceWithWebConfig = Source & {
  webConfig?: WebSourceConfig;
  associatedTechnologies?: Array<{ id: string; name: string }>;
  associatedInterests?: Array<{ id: string; name: string }>;
  associatedStreams?: Array<{ id: string; key: string }>;
  nextScheduledFetchAt?: Date | null;
};

@Injectable()
export class SourcesService {
  private readonly logger = new LoggingService(SourcesService.name);

  constructor(
    @InjectRepository(Source)
    private readonly sourceRepo: Repository<Source>,
    @InjectRepository(WebSourceConfig)
    private readonly webSourceConfigRepo: Repository<WebSourceConfig>,
    @InjectRepository(SourceIngestionAttempt)
    private readonly ingestionAttemptRepo: Repository<SourceIngestionAttempt>,
    @InjectRepository(DiscoveryQuotaRecord)
    private readonly discoveryQuotaRepo: Repository<DiscoveryQuotaRecord>,
    @InjectRepository(TaxonomySourceDiscoveryRequest)
    private readonly discoveryRequestRepo: Repository<TaxonomySourceDiscoveryRequest>,
    @InjectRepository(SourceCoverage)
    private readonly sourceCoverageRepo: Repository<SourceCoverage>,
    private readonly sourceDiscoveryService: SourceDiscoveryService,
    private readonly sourceStructureAiService: SourceStructureAiService,
    private readonly sourceIdentityService: SourceIdentityService,
    private readonly metricsService: MetricsService,
    private readonly queueService: QueueService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateSourceDto): Promise<SourceWithWebConfig> {
    const existing = await this.sourceRepo.findOne({ where: { url: dto.url } });
    if (existing) {
      throw new ConflictException('Source with this URL already exists');
    }

    if (dto.type === SourceType.WEB) {
      return this.createWebSource(dto);
    }

    await this.validateFeedUrl(dto.url);
    const source = this.sourceRepo.create(this.toSourceFields(dto));
    const saved = await this.sourceRepo.save(source);
    this.logger.info('Source created', { id: saved.id, name: saved.name });
    return saved;
  }

  async createOrReuse(dto: CreateSourceDto): Promise<SourceWithWebConfig> {
    const existing = await this.sourceIdentityService.findEquivalent(dto.url);
    if (existing) return existing;
    if (dto.type === SourceType.WEB) return this.createWebSource(dto, true);

    await this.validateFeedUrl(dto.url);
    const resolution = await this.sourceIdentityService.resolveOrCreate(
      dto.url,
      async (manager, normalizedUrl) =>
        manager.save(
          Source,
          manager.create(Source, { ...this.toSourceFields(dto), url: normalizedUrl }),
        ),
    );
    return resolution.source;
  }

  private async createWebSource(
    dto: CreateSourceDto,
    reuseExisting = false,
  ): Promise<SourceWithWebConfig> {
    const entryUrls = dto.webConfig?.entryUrls?.length ? dto.webConfig.entryUrls : [dto.url];
    const discoveryConfig = {
      entryUrls,
      articleLinkSelector: dto.webConfig?.articleLinkSelector ?? null,
    } as Partial<WebSourceConfig>;

    // Playwright, when needed, runs here inline (bounded by PLAYWRIGHT_TIMEOUT_MS) since this is
    // a one-off, low-frequency admin action — unlike the hourly re-fetch cycle, which enqueues it
    // instead (see WebSourceFetcherService).
    let discovery = await this.sourceDiscoveryService.discoverEntryPoints(dto.url, discoveryConfig);

    if (!discovery.success) {
      const aiSuggestion = await this.sourceStructureAiService.suggestAndValidate(
        dto.url,
        discoveryConfig,
        discovery.reason ?? 'Unknown discovery failure',
      );

      if (aiSuggestion?.validated) {
        discovery = aiSuggestion.result;
      } else {
        this.logger.error('Web source discovery failed, refusing to create source', null, {
          url: dto.url,
          reason: discovery.reason,
        });
        throw new BadRequestException(
          `Could not discover a working entry point for this web source: ${discovery.reason}`,
        );
      }
    }

    const dtoWebConfig = dto.webConfig;

    if (reuseExisting) {
      let createdConfig: WebSourceConfig | null = null;
      const resolution = await this.sourceIdentityService.resolveOrCreate(
        dto.url,
        async (manager, normalizedUrl) => {
          const savedSource = await manager.save(
            Source,
            manager.create(Source, { ...this.toSourceFields(dto), url: normalizedUrl }),
          );
          createdConfig = await manager.save(
            WebSourceConfig,
            manager.create(WebSourceConfig, {
              sourceId: savedSource.id,
              entryUrls,
              sitemapUrl: discovery.sitemapUrl ?? dto.webConfig?.sitemapUrl ?? null,
              preferredDiscoveryMethod: discovery.method,
              preferredExtractionMethod: dto.webConfig?.preferredExtractionMethod ?? null,
              articleLinkSelector:
                discovery.articleLinkSelector ?? dto.webConfig?.articleLinkSelector ?? null,
              articleContentSelector: dto.webConfig?.articleContentSelector ?? null,
              nextPageSelector: dto.webConfig?.nextPageSelector ?? null,
              allowedPathPatterns: dto.webConfig?.allowedPathPatterns ?? null,
              excludedPathPatterns: dto.webConfig?.excludedPathPatterns ?? null,
              lastValidatedAt: new Date(),
            }),
          );
          return savedSource;
        },
      );
      return createdConfig ? { ...resolution.source, webConfig: createdConfig } : resolution.source;
    }

    const { savedSource, savedWebConfig } = await this.dataSource.transaction(async (manager) => {
      const source = manager.create(Source, this.toSourceFields(dto));
      const savedSource = await manager.save(Source, source);

      const webConfig = manager.create(WebSourceConfig, {
        sourceId: savedSource.id,
        entryUrls,
        sitemapUrl: discovery.sitemapUrl ?? dtoWebConfig?.sitemapUrl ?? null,
        preferredDiscoveryMethod: discovery.method,
        preferredExtractionMethod: dtoWebConfig?.preferredExtractionMethod ?? null,
        articleLinkSelector:
          discovery.articleLinkSelector ?? dtoWebConfig?.articleLinkSelector ?? null,
        articleContentSelector: dtoWebConfig?.articleContentSelector ?? null,
        nextPageSelector: dtoWebConfig?.nextPageSelector ?? null,
        allowedPathPatterns: dtoWebConfig?.allowedPathPatterns ?? null,
        excludedPathPatterns: dtoWebConfig?.excludedPathPatterns ?? null,
        lastValidatedAt: new Date(),
      });
      const savedWebConfig = await manager.save(WebSourceConfig, webConfig);

      return { savedSource, savedWebConfig };
    });

    this.logger.info('Web source created', {
      id: savedSource.id,
      name: savedSource.name,
      method: discovery.method,
    });

    return { ...savedSource, webConfig: savedWebConfig };
  }

  private toSourceFields(dto: CreateSourceDto): Omit<CreateSourceDto, 'webConfig'> {
    const { name, url, type, category, enabled, trustScore } = dto;
    return { name, url, type, category, enabled, trustScore };
  }

  private async validateFeedUrl(url: string): Promise<void> {
    const result = await fetchAndValidateFeed(url);
    if (result.ok) return;

    switch (result.reason) {
      case 'http_error':
        this.logger.error(`Feed validation failed: HTTP ${result.httpStatus}`, null, { url });
        break;
      case 'unreachable':
        this.logger.error('Feed URL unreachable', result.cause, { url });
        break;
      case 'parse_error':
        this.logger.error('Feed URL could not be parsed as RSS/Atom', result.cause, { url });
        break;
      case 'empty':
        this.logger.error('Feed URL contains no items', null, { url });
        break;
    }
    throw new BadRequestException(result.message);
  }

  async findAll(query: QuerySourceDto): Promise<PaginatedResponseDto<SourceWithWebConfig>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.sourceRepo.createQueryBuilder('source');
    if (query.includeDeleted) {
      qb.withDeleted();
    }
    if (query.type) {
      qb.andWhere('source.type = :type', { type: query.type });
    }
    if (query.category) {
      qb.andWhere('source.category = :category', { category: query.category });
    }
    if (query.enabled !== undefined) {
      qb.andWhere('source.enabled = :enabled', { enabled: query.enabled });
    }
    if (query.status) {
      qb.andWhere('source.status = :status', { status: query.status });
    }

    const [sources, total] = await qb
      .orderBy('source.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const data = await this.attachOperationalDetails(await this.attachWebConfigs(sources));

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private async attachWebConfigs(sources: Source[]): Promise<SourceWithWebConfig[]> {
    const webSourceIds = sources
      .filter((source) => source.type === SourceType.WEB)
      .map((source) => source.id);

    if (webSourceIds.length === 0) return sources;

    const webConfigs = await this.webSourceConfigRepo.find({
      where: { sourceId: In(webSourceIds) },
    });
    const webConfigBySourceId = new Map(webConfigs.map((config) => [config.sourceId, config]));

    return sources.map((source) => ({
      ...source,
      webConfig: webConfigBySourceId.get(source.id),
    }));
  }

  async findOne(id: string): Promise<SourceWithWebConfig> {
    const source = await this.getSourceOrFail(id);
    const withWebConfig = await this.attachWebConfig(source);
    return (await this.attachOperationalDetails([withWebConfig]))[0];
  }

  private async getSourceOrFail(id: string): Promise<Source> {
    const source = await this.sourceRepo.findOne({ where: { id } });
    if (!source) {
      throw new NotFoundException(`Source ${id} not found`);
    }
    return source;
  }

  private async attachWebConfig(source: Source): Promise<SourceWithWebConfig> {
    if (source.type !== SourceType.WEB) return source;
    const webConfig = await this.webSourceConfigRepo.findOne({ where: { sourceId: source.id } });
    return { ...source, webConfig: webConfig ?? undefined };
  }

  private async attachOperationalDetails(
    sources: SourceWithWebConfig[],
  ): Promise<SourceWithWebConfig[]> {
    if (sources.length === 0) return [];
    const coverages = await this.sourceCoverageRepo.find({
      where: { sourceId: In(sources.map((source) => source.id)) },
      relations: { technologyInterest: true, contentStream: true },
    });
    return sources.map((source) => {
      const sourceCoverages = coverages.filter((coverage) => coverage.sourceId === source.id);
      const technologies = sourceCoverages
        .filter((coverage) => coverage.technologyInterest.kind === 'technology')
        .map((coverage) => ({
          id: coverage.technologyInterestId,
          name: coverage.technologyInterest.name,
        }));
      const interests = sourceCoverages
        .filter((coverage) => coverage.technologyInterest.kind === 'interest')
        .map((coverage) => ({
          id: coverage.technologyInterestId,
          name: coverage.technologyInterest.name,
        }));
      const streams = sourceCoverages.map((coverage) => ({
        id: coverage.contentStreamId,
        key: coverage.contentStream.key,
      }));
      const intervalHours = Math.min(
        ...sourceCoverages.map(
          (coverage) =>
            ({
              security: 1,
              releases_and_changes: 3,
              industry_pulse: 2,
              engineering_experience: 12,
              expert_opinions_and_practices: 12,
            })[coverage.contentStream.key] ?? 12,
        ),
      );
      const last = source.lastSuccessfulFetchAt ?? source.lastAttemptAt;
      return {
        ...source,
        associatedTechnologies: uniqueById(technologies),
        associatedInterests: uniqueById(interests),
        associatedStreams: uniqueById(streams),
        nextScheduledFetchAt:
          source.status === SourceStatus.DISABLED || !last || !Number.isFinite(intervalHours)
            ? null
            : new Date(last.getTime() + intervalHours * 3_600_000),
      };
    });
  }

  async update(id: string, dto: UpdateSourceDto): Promise<Source> {
    const source = await this.getSourceOrFail(id);
    // webConfig is not a Source column; TypeORM's save() ignores unmapped properties.
    Object.assign(source, dto);
    return this.sourceRepo.save(source);
  }

  async remove(id: string): Promise<void> {
    await this.getSourceOrFail(id);
    await this.sourceRepo.softDelete(id);
    this.logger.info('Source soft-deleted', { id });
  }

  async findAllEnabled(): Promise<Source[]> {
    return this.sourceRepo.find({
      where: { enabled: true, status: Not(SourceStatus.DISABLED) },
    });
  }

  async updateLastChecked(id: string): Promise<void> {
    await this.sourceRepo.update(id, { lastCheckedAt: new Date() });
  }

  async beginIngestionAttempt(
    sourceId: string,
    streamIds: string[],
  ): Promise<SourceIngestionAttempt> {
    const now = new Date();
    await this.sourceRepo.update(sourceId, { lastAttemptAt: now, lastCheckedAt: now });
    return this.ingestionAttemptRepo.save(
      this.ingestionAttemptRepo.create({ sourceId, streamIds, startedAt: now }),
    );
  }

  async recordIngestionSuccess(
    sourceId: string,
    attemptId: string,
    publicationsProcessed: number,
  ): Promise<void> {
    const now = new Date();
    await this.dataSource.transaction(async (manager) => {
      await manager.update(Source, sourceId, {
        status: SourceStatus.ACTIVE,
        enabled: true,
        consecutiveFailures: 0,
        lastSuccessfulFetchAt: now,
        lastAttemptAt: now,
        lastCheckedAt: now,
        lastError: null,
        processedArticleCount: () =>
          `"processedArticleCount" + ${Math.max(0, publicationsProcessed)}`,
      });
      await manager.update(SourceIngestionAttempt, attemptId, {
        completedAt: now,
        succeeded: true,
        publicationsProcessed,
      });
    });
    await this.metricsService.increment('ingestion_jobs_total', { outcome: 'success' });
    if (publicationsProcessed > 0) {
      await this.metricsService.increment('publications_fetched_total');
    }
  }

  async recordIngestionFailure(sourceId: string, attemptId: string, error: unknown): Promise<void> {
    const source = await this.getSourceOrFail(sourceId);
    const failures = source.consecutiveFailures + 1;
    const status =
      failures >= 6
        ? SourceStatus.DISABLED
        : failures >= 3
          ? SourceStatus.DEGRADED
          : SourceStatus.ACTIVE;
    const message = error instanceof Error ? error.message : String(error);
    const now = new Date();
    await this.dataSource.transaction(async (manager) => {
      await manager.update(Source, sourceId, {
        status,
        enabled: status !== SourceStatus.DISABLED,
        consecutiveFailures: failures,
        lastAttemptAt: now,
        lastCheckedAt: now,
        lastError: message,
      });
      await manager.update(SourceIngestionAttempt, attemptId, {
        completedAt: now,
        succeeded: false,
        error: message,
      });
    });
    await this.metricsService.increment('ingestion_failures_total');
    if (status !== source.status) {
      await this.metricsService.increment('source_health_transitions_total', {
        from: source.status,
        to: status,
      });
    }
  }

  async activate(id: string): Promise<Source> {
    const source = await this.getSourceOrFail(id);
    source.status = SourceStatus.ACTIVE;
    source.enabled = true;
    source.consecutiveFailures = 0;
    source.lastError = null;
    return this.sourceRepo.save(source);
  }

  async disable(id: string): Promise<Source> {
    const source = await this.getSourceOrFail(id);
    source.status = SourceStatus.DISABLED;
    source.enabled = false;
    return this.sourceRepo.save(source);
  }

  async retryValidation(id: string): Promise<SourceWithWebConfig> {
    const source = await this.findOne(id);
    if (source.type === SourceType.WEB) {
      const result = await this.sourceDiscoveryService.discoverEntryPoints(
        source.url,
        source.webConfig,
      );
      if (!result.success) {
        throw new BadRequestException(result.reason ?? 'Source validation failed');
      }
    } else {
      await this.validateFeedUrl(source.url);
    }
    return source;
  }

  async retryIngestion(id: string): Promise<void> {
    await this.getSourceOrFail(id);
    await this.queueService.addFetchSourceJob(id);
  }

  async cleanupTechnicalHistory(): Promise<void> {
    const days = Number(process.env.TECHNICAL_HISTORY_RETENTION_DAYS ?? 30);
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const [attempts, quotaRecords, discoveryRequests] = await Promise.all([
      this.ingestionAttemptRepo.delete({ createdAt: LessThan(cutoff) }),
      this.discoveryQuotaRepo.delete({ createdAt: LessThan(cutoff) }),
      this.discoveryRequestRepo.delete({ createdAt: LessThan(cutoff) }),
    ]);
    this.logger.info('Technical history cleanup completed', {
      cutoff,
      ingestionAttempts: attempts.affected ?? 0,
      discoveryQuotaRecords: quotaRecords.affected ?? 0,
      discoveryRequests: discoveryRequests.affected ?? 0,
    });
  }

  async updateWebSourceConfigRecipe(
    sourceId: string,
    updates: Partial<
      Pick<
        WebSourceConfig,
        'preferredDiscoveryMethod' | 'preferredExtractionMethod' | 'articleLinkSelector'
      >
    >,
  ): Promise<void> {
    await this.webSourceConfigRepo.update(
      { sourceId },
      { ...updates, lastValidatedAt: new Date() },
    );
    this.logger.info('Web source recipe self-healed to a new method', { sourceId, ...updates });
  }
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}
