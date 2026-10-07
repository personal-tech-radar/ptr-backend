import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SourcesService } from './sources.service';
import { Source } from '../entities/source.entity';
import { SourceIngestionAttempt } from '../entities/source-ingestion-attempt.entity';
import {
  AdminSourceDetailResponseDto,
  AdminSourceResponseDto,
  PaginatedAdminSourceResponseDto,
  SourceVolumeResponseDto,
} from '../dto/admin-source-response.dto';
import { SourceResponseDto } from '../dto/source-response.dto';
import { QuerySourceDto } from '../dto/query-source.dto';
import { adminPeriod, AdminPeriod } from '../../common/util/admin-period.util';

@Injectable()
export class AdminSourceQueryService {
  constructor(
    private readonly sources: SourcesService,
    @InjectRepository(Source) private readonly sourceRepo: Repository<Source>,
    @InjectRepository(SourceIngestionAttempt)
    private readonly attempts: Repository<SourceIngestionAttempt>,
  ) {}

  private toList(
    source: Source & SourceResponseDto,
    periodArticleCount = 0,
  ): AdminSourceResponseDto {
    const fields = [
      'id',
      'name',
      'url',
      'type',
      'category',
      'enabled',
      'status',
      'consecutiveFailures',
      'lastSuccessfulFetchAt',
      'lastAttemptAt',
      'lastError',
      'processedArticleCount',
      'nextScheduledFetchAt',
      'associatedTechnologies',
      'associatedInterests',
      'associatedStreams',
      'trustScore',
      'lastCheckedAt',
      'createdAt',
      'updatedAt',
      'webConfig',
    ] as const;
    return {
      ...Object.fromEntries(fields.map((key) => [key, source[key]])),
      trustScore: Number(source.trustScore),
      interactionScore: Number(source.globalInteractionScore),
      includedSignalCount:
        source.globalOpenedCount +
        source.globalSavedCount +
        source.globalUsefulCount +
        source.globalNotUsefulCount,
      periodArticleCount,
    } as AdminSourceResponseDto;
  }
  async findAll(query: QuerySourceDto): Promise<PaginatedAdminSourceResponseDto> {
    const result = await this.sources.findAll(query);
    const period = adminPeriod(query.period ?? '24h');
    if (!result.data.length) return { ...result, period, data: [] };
    const counts = await this.sourceRepo.query<Array<{ sourceId: string; count: number }>>(
      `SELECT "sourceId", count(*)::int AS count FROM articles
       WHERE "sourceId"=ANY($1::uuid[]) AND "deletedAt" IS NULL
         AND "createdAt">=$2 AND "createdAt"<$3 GROUP BY "sourceId"`,
      [result.data.map((source) => source.id), period.from, period.to],
    );
    const bySource = new Map(counts.map((row) => [row.sourceId, Number(row.count)]));
    return {
      ...result,
      period,
      data: result.data.map((source) => this.toList(source, bySource.get(source.id) ?? 0)),
    };
  }
  async detail(id: string, value: AdminPeriod): Promise<AdminSourceDetailResponseDto> {
    const source = await this.sources.findOne(id);
    const period = adminPeriod(value);
    const [recentAttempts, rows] = await Promise.all([
      this.attempts.find({
        where: { sourceId: id },
        order: { startedAt: 'DESC', id: 'DESC' },
        take: 20,
      }),
      this.sourceRepo.query<SourceVolumeResponseDto[]>(
        `SELECT
        (SELECT count(*)::int FROM articles WHERE "sourceId"=$1 AND "deletedAt" IS NULL) AS "totalArticles",
        (SELECT count(*)::int FROM articles WHERE "sourceId"=$1 AND "deletedAt" IS NULL AND "createdAt">=$2 AND "createdAt"<$3) AS "receivedArticles",
        count(*)::int AS attempts, count(*) FILTER (WHERE succeeded=true)::int AS "successfulAttempts",
        count(*) FILTER (WHERE succeeded=false)::int AS "failedAttempts", coalesce(sum("publicationsProcessed"),0)::int AS "publicationsProcessed"
        FROM source_ingestion_attempts WHERE "sourceId"=$1 AND "startedAt">=$2 AND "startedAt"<$3`,
        [id, period.from, period.to],
      ),
    ]);
    const list = this.toList(source, rows[0].receivedArticles);
    return {
      ...list,
      period,
      volume: rows[0],
      recentAttempts: recentAttempts.map(
        ({ id, streamIds, startedAt, completedAt, succeeded, publicationsProcessed, error }) => ({
          id,
          streamIds,
          startedAt,
          completedAt,
          succeeded,
          publicationsProcessed,
          error,
        }),
      ),
      signals: {
        opened: source.globalOpenedCount,
        saved: source.globalSavedCount,
        useful: source.globalUsefulCount,
        notUseful: source.globalNotUsefulCount,
        total: list.includedSignalCount,
      },
    };
  }
}
