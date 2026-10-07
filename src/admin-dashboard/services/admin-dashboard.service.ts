import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ObjectLiteral, Repository } from 'typeorm';
import { Article, ArticleStatus } from '../../articles/entities/article.entity';
import { Digest, DigestStatus } from '../../digest/entities/digest.entity';
import { Source, SourceStatus } from '../../sources/entities/source.entity';
import {
  SourceCandidate,
  SourceCandidateStatus,
} from '../../sources/entities/source-candidate.entity';
import { UserAnalyticsService } from '../../users/services/user-analytics.service';
import { adminPeriod, AdminPeriod } from '../../common/util/admin-period.util';
import {
  DashboardOverviewResponseDto,
  ArticleCountsDto,
  CandidateCountsDto,
  DigestCountsDto,
  LifecycleCountsDto,
  SourceTypeOverviewDto,
} from '../dto/dashboard-overview-response.dto';

@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectRepository(Source) private readonly sources: Repository<Source>,
    @InjectRepository(Article) private readonly articles: Repository<Article>,
    @InjectRepository(SourceCandidate) private readonly candidates: Repository<SourceCandidate>,
    @InjectRepository(Digest) private readonly digests: Repository<Digest>,
    private readonly analytics: UserAnalyticsService,
  ) {}

  private async counts<T extends ObjectLiteral>(
    repo: Repository<T>,
    statuses: string[],
    from?: Date,
    to?: Date,
  ) {
    const qb = repo.createQueryBuilder('row').select('COUNT(*)::int', 'total');
    for (const status of statuses)
      qb.addSelect(`COUNT(*) FILTER (WHERE row.status = '${status}')::int`, status);
    if (from) qb.andWhere('row.createdAt >= :from AND row.createdAt < :to', { from, to });
    return qb.getRawOne<Record<string, number>>();
  }

  async overview(value: AdminPeriod): Promise<DashboardOverviewResponseDto> {
    const period = adminPeriod(value);
    const [
      users,
      sourceCounts,
      sourcesCreated,
      articlesAllTime,
      articlesPeriod,
      sourceCandidates,
      sourceCandidatesPeriod,
      digestAll,
      digestPeriod,
      sourceTypes,
      latest,
    ] = await Promise.all([
      this.analytics.get(value, period.to),
      this.counts(this.sources, Object.values(SourceStatus)),
      this.counts(this.sources, [], period.from, period.to),
      this.counts(this.articles, Object.values(ArticleStatus)),
      this.counts(this.articles, Object.values(ArticleStatus), period.from, period.to),
      this.counts(this.candidates, Object.values(SourceCandidateStatus)),
      this.counts(this.candidates, Object.values(SourceCandidateStatus), period.from, period.to),
      this.counts(this.digests, Object.values(DigestStatus)),
      this.digests
        .createQueryBuilder('digest')
        .select('COUNT(*)::int', 'total')
        .addSelect("COUNT(*) FILTER (WHERE digest.status='sent')::int", 'sent')
        .addSelect("COUNT(*) FILTER (WHERE digest.status='failed')::int", 'failed')
        .addSelect("COUNT(*) FILTER (WHERE digest.status='draft')::int", 'draft')
        .addSelect("COUNT(*) FILTER (WHERE digest.status='skipped_empty')::int", 'skipped_empty')
        .where(
          "(CASE WHEN digest.status='sent' THEN digest.sentAt WHEN digest.status='failed' THEN digest.updatedAt ELSE digest.createdAt END) >= :from AND (CASE WHEN digest.status='sent' THEN digest.sentAt WHEN digest.status='failed' THEN digest.updatedAt ELSE digest.createdAt END) < :to",
          { from: period.from, to: period.to },
        )
        .getRawOne<DigestCountsDto>(),
      this.sources.query<SourceTypeOverviewDto[]>(
        `SELECT groups.name AS "group", groups.types,
        count(s.id)::int AS total,
        count(s.id) FILTER (WHERE s."createdAt">=$1 AND s."createdAt"<$2)::int AS created,
        json_build_object('active',count(s.id) FILTER (WHERE s.status='active'),'degraded',count(s.id) FILTER (WHERE s.status='degraded'),'disabled',count(s.id) FILTER (WHERE s.status='disabled')) AS lifecycle,
        coalesce(sum(a.period),0)::int AS "receivedArticles", coalesce(sum(a.total),0)::int AS "totalArticles",
        json_build_object('opened',coalesce(sum(s."globalOpenedCount"),0),'saved',coalesce(sum(s."globalSavedCount"),0),'useful',coalesce(sum(s."globalUsefulCount"),0),'notUseful',coalesce(sum(s."globalNotUsefulCount"),0),'total',coalesce(sum(s."globalOpenedCount"+s."globalSavedCount"+s."globalUsefulCount"+s."globalNotUsefulCount"),0)) AS signals
        FROM (VALUES ('feeds',ARRAY['rss','atom']),('web',ARRAY['web']),('github_release',ARRAY['github_release'])) groups(name,types)
        LEFT JOIN sources s ON s.type::text=ANY(groups.types) AND s."deletedAt" IS NULL
        LEFT JOIN (SELECT "sourceId", count(*) AS total, count(*) FILTER (WHERE "createdAt">=$1 AND "createdAt"<$2) AS period FROM articles WHERE "deletedAt" IS NULL GROUP BY "sourceId") a ON a."sourceId"=s.id
        GROUP BY groups.name,groups.types ORDER BY groups.name`,
        [period.from, period.to],
      ),
      this.sources
        .createQueryBuilder('s')
        .select('MAX(s.lastSuccessfulFetchAt)', 'at')
        .getRawOne<{ at: Date | null }>(),
    ]);
    return {
      period,
      users,
      content: {
        sourcesCreated: sourcesCreated!.total,
        totalSources: sourceCounts!.total,
        sourceLifecycle: sourceCounts as unknown as LifecycleCountsDto,
        receivedArticles: articlesPeriod!.total,
        totalArticles: articlesAllTime!.total,
        pendingAnalysis: articlesAllTime!.pending_analysis,
        analyzed: articlesAllTime!.analyzed,
        failed: articlesAllTime!.failed,
        articlesPeriod: articlesPeriod as unknown as ArticleCountsDto,
        articlesAllTime: articlesAllTime as unknown as ArticleCountsDto,
        sourceCandidates: sourceCandidates as unknown as CandidateCountsDto,
        sourceCandidatesPeriod: sourceCandidatesPeriod as unknown as CandidateCountsDto,
      },
      sourceTypes,
      digests: {
        period: digestPeriod as unknown as DigestCountsDto,
        allTime: digestAll as unknown as DigestCountsDto,
      },
      backend: {
        appName: process.env.APP_NAME || 'nestjs-app',
        environment: process.env.NODE_ENV || 'development',
        status: 'ok',
        uptime: process.uptime(),
        lastSuccessfulUpdateAt: latest?.at ?? null,
      },
    };
  }
}
