import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { LoggingService } from '../../common/logging/logging.service';
import { fetchAndValidateFeed } from '../../common/util/feed-validator.util';
import { CreateSourceDto } from '../dto/create-source.dto';
import { UpdateSourceDto } from '../dto/update-source.dto';
import { Source, SourceType } from '../entities/source.entity';
import { WebSourceConfig } from '../entities/web-source-config.entity';
import { SourceDiscoveryService } from './source-discovery.service';
import { SourceStructureAiService } from './source-structure-ai.service';

type SourceWithWebConfig = Source & { webConfig?: WebSourceConfig };

@Injectable()
export class SourcesService {
  private readonly logger = new LoggingService(SourcesService.name);

  constructor(
    @InjectRepository(Source)
    private readonly sourceRepo: Repository<Source>,
    @InjectRepository(WebSourceConfig)
    private readonly webSourceConfigRepo: Repository<WebSourceConfig>,
    private readonly sourceDiscoveryService: SourceDiscoveryService,
    private readonly sourceStructureAiService: SourceStructureAiService,
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

  private async createWebSource(dto: CreateSourceDto): Promise<SourceWithWebConfig> {
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

  async findAll(): Promise<SourceWithWebConfig[]> {
    const sources = await this.sourceRepo.find();
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
    return this.attachWebConfig(source);
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
    return this.sourceRepo.find({ where: { enabled: true } });
  }

  async updateLastChecked(id: string): Promise<void> {
    await this.sourceRepo.update(id, { lastCheckedAt: new Date() });
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
