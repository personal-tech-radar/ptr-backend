import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { ArticleAnalysis } from '../../ai-analysis/entities/article-analysis.entity';
import { ArticleStream } from '../../ai-analysis/entities/article-stream.entity';
import { ArticleTechnologyInterest } from '../../ai-analysis/entities/article-technology-interest.entity';
import { ArticleStatus } from '../../articles/entities/article.entity';
import { LoggingService } from '../../common/logging/logging.service';
import {
  addDaysToDateString,
  getLocalDateString,
  zonedEndOfDayExclusiveUTC,
  zonedStartOfDayUTC,
} from '../../common/util/timezone.util';
import { RelevanceScoringService } from '../../scoring/services/relevance-scoring.service';
import { UserScoringProfileService } from '../../scoring/services/user-scoring-profile.service';
import { Source } from '../../sources/entities/source.entity';
import { ContentStream } from '../../taxonomy/entities/content-stream.entity';
import { TechnologyInterestKind } from '../../taxonomy/entities/technology-interest.entity';
import { ContentStreamQueryService } from '../../taxonomy/services/content-stream-query.service';
import { TechnologyInterestQueryService } from '../../taxonomy/services/technology-interest-query.service';
import { PersonalArticleLinkContext } from '../../user-actions/entities/personal-article-link.entity';
import { SavedArticle } from '../../user-actions/entities/saved-article.entity';
import { PersonalArticleLinkService } from '../../user-actions/services/personal-article-link.service';
import { UserQueryService } from '../../users/services/user-query.service';
import { FeedArticleItemDto } from '../dto/feed-article-item.dto';
import { FeedDayGroupDto } from '../dto/feed-day-group.dto';
import { FeedResponseDto } from '../dto/feed-response.dto';
import { QueryFeedDto } from '../dto/query-feed.dto';
import { FeedCandidate, FeedScoredCandidate } from '../feed.types';

const DEFAULT_DAYS = 7;
const DEFAULT_MAX_DAYS = 30;
const PER_STREAM_DAILY_CAP = 50;
const DAY_TOTAL_CAP = 100;

interface ResolvedFeedFilters {
  streamIds: string[];
  technologyInterestIds: string[];
  sourceIds: string[];
}

@Injectable()
export class FeedQueryService {
  private readonly logger = new LoggingService(FeedQueryService.name);

  constructor(
    @InjectRepository(ArticleAnalysis)
    private readonly analysisRepo: Repository<ArticleAnalysis>,
    @InjectRepository(ArticleStream)
    private readonly articleStreamRepo: Repository<ArticleStream>,
    @InjectRepository(ArticleTechnologyInterest)
    private readonly articleTechnologyInterestRepo: Repository<ArticleTechnologyInterest>,
    @InjectRepository(Source)
    private readonly sourceRepo: Repository<Source>,
    @InjectRepository(SavedArticle)
    private readonly savedArticleRepo: Repository<SavedArticle>,
    private readonly contentStreamQueryService: ContentStreamQueryService,
    private readonly technologyInterestQueryService: TechnologyInterestQueryService,
    private readonly userQueryService: UserQueryService,
    private readonly userScoringProfileService: UserScoringProfileService,
    private readonly relevanceScoringService: RelevanceScoringService,
    private readonly personalArticleLinkService: PersonalArticleLinkService,
  ) {}

  async getFeed(userId: string, query: QueryFeedDto): Promise<FeedResponseDto> {
    const isSaved = query.saved === true;
    this.validateFilterCombination(query, isSaved);

    const user = await this.userQueryService.findById(userId);

    const [streamIds, technologyInterestIds, sourceIds] = await Promise.all([
      this.resolveStreamFilter(query.stream),
      this.resolveTechnologyInterestFilter(query.technology, query.interest),
      this.resolveSourceFilter(query.source),
    ]);
    const filters: ResolvedFeedFilters = { streamIds, technologyInterestIds, sourceIds };

    const maxDays = Number(process.env.FEED_MAX_DAYS) || DEFAULT_MAX_DAYS;
    const days = Math.min(query.days ?? DEFAULT_DAYS, maxDays);
    const timezone = user.timezone!;
    const todayStr = getLocalDateString(new Date(), timezone);
    const beforeDateStr = query.dateTo ?? query.beforeDate ?? todayStr;
    const rangeStartStr = query.dateFrom ?? addDaysToDateString(beforeDateStr, -(days - 1));
    const requestedDays = this.calendarDaysBetween(rangeStartStr, beforeDateStr);
    if (requestedDays < 1) {
      throw new BadRequestException('dateFrom must be on or before dateTo');
    }
    if (requestedDays > maxDays) {
      throw new BadRequestException(`Date range cannot exceed ${maxDays} days`);
    }
    const effectiveDays = query.dateFrom || query.dateTo ? requestedDays : days;

    const toDateExclusive = zonedEndOfDayExclusiveUTC(beforeDateStr, timezone);
    let fromDateInclusive = zonedStartOfDayUTC(rangeStartStr, timezone);

    // Permanent 30-day floor (FEED_MAX_DAYS-configurable) — unconditional for every path except
    // saved=true, which must always be able to surface a user's own saved articles regardless of
    // age (see coder.md decision #2).
    if (!isSaved) {
      const floorDateStr = addDaysToDateString(todayStr, -(maxDays - 1));
      const floorDate = zonedStartOfDayUTC(floorDateStr, timezone);
      if (floorDate.getTime() > fromDateInclusive.getTime()) {
        fromDateInclusive = floorDate;
      }
    }

    const analyses = isSaved
      ? await this.fetchSavedCandidates(userId, fromDateInclusive, toDateExclusive)
      : await this.fetchNonSavedCandidates(fromDateInclusive, toDateExclusive, filters);

    const scored = await this.scoreCandidates(userId, analyses, isSaved);

    let selectedStreams: ContentStream[] = [];
    if (!isSaved && streamIds.length === 0) {
      selectedStreams = await this.contentStreamQueryService.findSelectedByUser(userId);
    }

    const dayStrings = this.buildDayRange(beforeDateStr, effectiveDays);
    const byDay = this.groupByLocalDay(scored, timezone);

    const rawDayGroups = dayStrings.map((date) => ({
      date,
      items: this.capAndDistributeForDay(byDay.get(date) ?? [], {
        isSaved,
        streamFilterIds: streamIds,
        selectedStreams,
      }),
    }));

    const dayGroups = await this.renderDayGroups(userId, rawDayGroups);

    this.logger.info('Feed computed', {
      userId,
      isSaved,
      dayCount: dayStrings.length,
      candidateCount: analyses.length,
      totalSelected: rawDayGroups.reduce((sum, g) => sum + g.items.length, 0),
    });

    return { days: dayGroups };
  }

  private validateFilterCombination(query: QueryFeedDto, isSaved: boolean): void {
    const hasTopicalFilter =
      (query.stream?.length ?? 0) > 0 ||
      (query.technology?.length ?? 0) > 0 ||
      (query.interest?.length ?? 0) > 0 ||
      (query.source?.length ?? 0) > 0;

    if (isSaved && hasTopicalFilter) {
      throw new BadRequestException(
        'saved=true cannot be combined with stream/technology/interest/source filters',
      );
    }

    if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo) {
      throw new BadRequestException('dateFrom must be on or before dateTo');
    }
  }

  private calendarDaysBetween(fromDate: string, toDate: string): number {
    const [fromYear, fromMonth, fromDay] = fromDate.split('-').map(Number);
    const [toYear, toMonth, toDay] = toDate.split('-').map(Number);
    const from = Date.UTC(fromYear, fromMonth - 1, fromDay);
    const to = Date.UTC(toYear, toMonth - 1, toDay);
    return Math.floor((to - from) / (24 * 60 * 60 * 1000)) + 1;
  }

  private async resolveStreamFilter(streamKeys?: string[]): Promise<string[]> {
    if (!streamKeys || streamKeys.length === 0) return [];
    const uniqueKeys = [...new Set(streamKeys)];
    const resolved = await Promise.all(
      uniqueKeys.map((key) => this.contentStreamQueryService.findByKey(key)),
    );
    const missing = uniqueKeys.filter((_, i) => !resolved[i]);
    if (missing.length > 0) {
      throw new BadRequestException(`Unknown content stream key(s): ${missing.join(', ')}`);
    }
    return resolved.map((cs) => (cs as ContentStream).id);
  }

  private async resolveTechnologyInterestFilter(
    technologyIds?: string[],
    interestIds?: string[],
  ): Promise<string[]> {
    const combined = [...new Set([...(technologyIds ?? []), ...(interestIds ?? [])])];
    if (combined.length === 0) return [];

    const found = await this.technologyInterestQueryService.findByIds(combined);
    const foundIds = new Set(found.map((ti) => ti.id));
    const missing = combined.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(`Unknown technology/interest id(s): ${missing.join(', ')}`);
    }
    return combined;
  }

  private async resolveSourceFilter(sourceIds?: string[]): Promise<string[]> {
    if (!sourceIds || sourceIds.length === 0) return [];
    const uniqueIds = [...new Set(sourceIds)];
    const found = await this.sourceRepo.find({ where: { id: In(uniqueIds), deletedAt: IsNull() } });
    const foundIds = new Set(found.map((s) => s.id));
    const missing = uniqueIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(`Unknown source id(s): ${missing.join(', ')}`);
    }
    return uniqueIds;
  }

  private async fetchNonSavedCandidates(
    fromDateInclusive: Date,
    toDateExclusive: Date,
    filters: ResolvedFeedFilters,
  ): Promise<ArticleAnalysis[]> {
    const qb = this.analysisRepo
      .createQueryBuilder('aa')
      .innerJoinAndSelect('aa.article', 'a')
      .innerJoinAndSelect('a.source', 's')
      .where('aa.deletedAt IS NULL')
      .andWhere('aa.fullAnalysisAt IS NOT NULL')
      .andWhere('aa.preScreenIsRelevant = true')
      .andWhere('a.deletedAt IS NULL')
      .andWhere('s.deletedAt IS NULL')
      .andWhere('a.status = :status', { status: ArticleStatus.ANALYZED })
      .andWhere('a.publishedAt >= :fromDate', { fromDate: fromDateInclusive })
      .andWhere('a.publishedAt < :toDate', { toDate: toDateExclusive });

    if (filters.sourceIds.length > 0) {
      qb.andWhere('a.sourceId IN (:...sourceIds)', { sourceIds: filters.sourceIds });
    }

    // Subquery/join against article_technology_interests rather than a SQL filter on `stream`
    // (that one is applied as an in-memory post-filter on resolved streamIds — see
    // capAndDistributeForDay — because it also drives the per-day distribution algorithm, not
    // just membership).
    if (filters.technologyInterestIds.length > 0) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM article_technology_interests ati ` +
          `WHERE ati."articleId" = aa."articleId" AND ati."technologyInterestId" IN (:...technologyInterestIds))`,
        { technologyInterestIds: filters.technologyInterestIds },
      );
    }

    return qb.getMany();
  }

  // Two-query batch pattern (find saved article ids in range, then batch-fetch their analyses) —
  // avoids a raw cross-repository join and keeps SavedArticle's own filtering (userId, date
  // range) independent from ArticleAnalysis's eligibility filtering.
  private async fetchSavedCandidates(
    userId: string,
    fromDateInclusive: Date,
    toDateExclusive: Date,
  ): Promise<ArticleAnalysis[]> {
    const savedRows = await this.savedArticleRepo
      .createQueryBuilder('sa')
      .innerJoinAndSelect('sa.article', 'a')
      .where('sa.userId = :userId', { userId })
      .andWhere('a.deletedAt IS NULL')
      .andWhere('a.publishedAt >= :fromDate', { fromDate: fromDateInclusive })
      .andWhere('a.publishedAt < :toDate', { toDate: toDateExclusive })
      .getMany();

    const articleIds = savedRows.map((row) => row.articleId);
    if (articleIds.length === 0) return [];

    return this.analysisRepo
      .createQueryBuilder('aa')
      .innerJoinAndSelect('aa.article', 'a')
      .innerJoinAndSelect('a.source', 's')
      .where('aa.deletedAt IS NULL')
      .andWhere('aa.fullAnalysisAt IS NOT NULL')
      .andWhere('aa.preScreenIsRelevant = true')
      .andWhere('a.status = :status', { status: ArticleStatus.ANALYZED })
      .andWhere('aa.articleId IN (:...articleIds)', { articleIds })
      .getMany();
  }

  private async scoreCandidates(
    userId: string,
    analyses: ArticleAnalysis[],
    isSaved: boolean,
  ): Promise<FeedScoredCandidate[]> {
    if (analyses.length === 0) return [];

    const articleIds = analyses.map((a) => a.articleId);
    const sourceIds = [...new Set(analyses.map((a) => a.article.sourceId))];

    const [
      {
        streamIdsByArticle,
        technologyInterestIdsByArticle,
        technologyIdsByArticle,
        interestIdsByArticle,
      },
      profile,
    ] = await Promise.all([
      this.buildScorableMaps(articleIds),
      this.userScoringProfileService.buildProfile(userId, sourceIds),
    ]);

    const candidates: FeedCandidate[] = analyses.map((analysis) => ({
      analysis,
      technologyInterestIds: technologyInterestIdsByArticle.get(analysis.articleId) ?? [],
      technologyIds: technologyIdsByArticle.get(analysis.articleId) ?? [],
      interestIds: interestIdsByArticle.get(analysis.articleId) ?? [],
      streamIds: streamIdsByArticle.get(analysis.articleId) ?? [],
      alwaysInclude: isSaved,
    }));

    return candidates
      .map((candidate) => ({
        candidate,
        result: this.relevanceScoringService.computeScore(candidate, profile),
      }))
      .filter((item) => item.candidate.alwaysInclude || item.result.eligible);
  }

  // Batched, two-query lookup (streams + technology/interests) rather than N+1 per candidate —
  // mirrors DigestBuilderService.buildMatchedInterestsMap's pattern.
  private async buildScorableMaps(articleIds: string[]): Promise<{
    streamIdsByArticle: Map<string, string[]>;
    technologyInterestIdsByArticle: Map<string, string[]>;
    technologyIdsByArticle: Map<string, string[]>;
    interestIdsByArticle: Map<string, string[]>;
  }> {
    const [streams, technologyInterests] = await Promise.all([
      this.articleStreamRepo.find({ where: { articleId: In(articleIds) } }),
      this.articleTechnologyInterestRepo.find({
        where: { articleId: In(articleIds) },
        relations: { technologyInterest: true },
      }),
    ]);

    const streamIdsByArticle = new Map<string, string[]>();
    for (const s of streams) {
      const list = streamIdsByArticle.get(s.articleId) ?? [];
      list.push(s.streamId);
      streamIdsByArticle.set(s.articleId, list);
    }

    const technologyInterestIdsByArticle = new Map<string, string[]>();
    const technologyIdsByArticle = new Map<string, string[]>();
    const interestIdsByArticle = new Map<string, string[]>();
    for (const t of technologyInterests) {
      const list = technologyInterestIdsByArticle.get(t.articleId) ?? [];
      list.push(t.technologyInterestId);
      technologyInterestIdsByArticle.set(t.articleId, list);
      const target =
        t.technologyInterest.kind === TechnologyInterestKind.TECHNOLOGY
          ? technologyIdsByArticle
          : interestIdsByArticle;
      target.set(t.articleId, [...(target.get(t.articleId) ?? []), t.technologyInterestId]);
    }

    return {
      streamIdsByArticle,
      technologyInterestIdsByArticle,
      technologyIdsByArticle,
      interestIdsByArticle,
    };
  }

  // Descending, most-recent-first — [beforeDate, beforeDate-1, ..., beforeDate-(days-1)].
  private buildDayRange(beforeDateStr: string, days: number): string[] {
    const result: string[] = [];
    for (let i = 0; i < days; i++) {
      result.push(addDaysToDateString(beforeDateStr, -i));
    }
    return result;
  }

  private groupByLocalDay(
    scored: FeedScoredCandidate[],
    timezone: string,
  ): Map<string, FeedScoredCandidate[]> {
    const byDay = new Map<string, FeedScoredCandidate[]>();
    for (const item of scored) {
      const publishedAt = item.candidate.analysis.article.publishedAt;
      if (!publishedAt) continue; // SQL bounds already exclude nulls; defensive only.
      const dateStr = getLocalDateString(publishedAt, timezone);
      const list = byDay.get(dateStr);
      if (list) {
        list.push(item);
      } else {
        byDay.set(dateStr, [item]);
      }
    }
    return byDay;
  }

  private capAndDistributeForDay(
    dayCandidates: FeedScoredCandidate[],
    ctx: { isSaved: boolean; streamFilterIds: string[]; selectedStreams: ContentStream[] },
  ): FeedScoredCandidate[] {
    let selected: FeedScoredCandidate[];

    if (ctx.isSaved) {
      selected = this.sortByScoreDesc(dayCandidates).slice(0, DAY_TOTAL_CAP);
    } else if (ctx.streamFilterIds.length > 0) {
      const matching = dayCandidates.filter((item) =>
        item.candidate.streamIds.some((id) => ctx.streamFilterIds.includes(id)),
      );
      selected = this.sortByScoreDesc(matching).slice(0, PER_STREAM_DAILY_CAP);
    } else if (ctx.selectedStreams.length === 0) {
      // Defensive fallback — onboarding requires at least one selected stream, so this shouldn't
      // occur in practice, but a user with zero selections still gets a sane top-N result rather
      // than an empty feed.
      selected = this.sortByScoreDesc(dayCandidates).slice(0, DAY_TOTAL_CAP);
    } else {
      selected = this.distributeAcrossStreams(dayCandidates, ctx.selectedStreams);
    }

    return this.sortByScoreDesc(selected);
  }

  // Per coder.md's capping/distribution algorithm:
  //  1. Build one capped (top 50), score-sorted sub-list ("queue") per user-selected stream,
  //     stream order stable by ContentStream.sortOrder.
  //  2. Round-robin merge: one item at a time per stream per round, duplicates allowed, until
  //     every queue is exhausted or DAY_TOTAL_CAP items have been collected.
  //  3. Dedup by articleId, keeping the first occurrence — an article matching 2+ streams only
  //     appears once.
  //  4. Backfill the slots freed by dedup from the highest-scored, not-yet-selected candidate
  //     remaining across ALL streams' capped sub-lists (not just the stream that had the
  //     duplicate), up to DAY_TOTAL_CAP.
  private distributeAcrossStreams(
    dayCandidates: FeedScoredCandidate[],
    selectedStreams: ContentStream[],
  ): FeedScoredCandidate[] {
    const orderedStreams = [...selectedStreams].sort((a, b) => a.sortOrder - b.sortOrder);

    const queues = orderedStreams.map((stream) => {
      const matches = dayCandidates.filter((item) => item.candidate.streamIds.includes(stream.id));
      return this.sortByScoreDesc(matches).slice(0, PER_STREAM_DAILY_CAP);
    });

    const cursors = queues.map(() => 0);
    const merged: FeedScoredCandidate[] = [];
    let anyRemaining = true;
    while (merged.length < DAY_TOTAL_CAP && anyRemaining) {
      anyRemaining = false;
      for (let i = 0; i < queues.length; i++) {
        if (merged.length >= DAY_TOTAL_CAP) break;
        if (cursors[i] < queues[i].length) {
          merged.push(queues[i][cursors[i]]);
          cursors[i]++;
          if (cursors[i] < queues[i].length) anyRemaining = true;
        }
      }
    }

    const seen = new Set<string>();
    const deduped: FeedScoredCandidate[] = [];
    for (const item of merged) {
      const id = item.candidate.analysis.articleId;
      if (seen.has(id)) continue;
      seen.add(id);
      deduped.push(item);
    }

    const freedSlots = DAY_TOTAL_CAP - deduped.length;
    if (freedSlots > 0) {
      const leftoverSeen = new Set<string>();
      const leftoverPool = queues.flat().filter((item) => {
        const id = item.candidate.analysis.articleId;
        if (seen.has(id) || leftoverSeen.has(id)) return false;
        leftoverSeen.add(id);
        return true;
      });
      const backfill = this.sortByScoreDesc(leftoverPool).slice(0, freedSlots);
      for (const item of backfill) {
        seen.add(item.candidate.analysis.articleId);
        deduped.push(item);
      }
    }

    return deduped;
  }

  private sortByScoreDesc(items: FeedScoredCandidate[]): FeedScoredCandidate[] {
    return [...items].sort((a, b) => b.result.score - a.result.score);
  }

  private async renderDayGroups(
    userId: string,
    rawDayGroups: Array<{ date: string; items: FeedScoredCandidate[] }>,
  ): Promise<FeedDayGroupDto[]> {
    const finalArticleIds = [
      ...new Set(rawDayGroups.flatMap((g) => g.items.map((i) => i.candidate.analysis.articleId))),
    ];

    // Single batch call on the final, trimmed article set — never the full candidate pool — so
    // this stays O(1) DB round trips regardless of how many candidates were scored.
    const linkMap =
      finalArticleIds.length > 0
        ? await this.personalArticleLinkService.findOrCreateLinksBatch(
            userId,
            finalArticleIds,
            PersonalArticleLinkContext.FEED,
          )
        : new Map<string, string>();

    const appUrl = process.env.APP_URL ?? '';

    return rawDayGroups.map((group) => ({
      date: group.date,
      articles: group.items.map((item) => this.toFeedArticleItemDto(item, linkMap, appUrl)),
    }));
  }

  private toFeedArticleItemDto(
    item: FeedScoredCandidate,
    linkMap: Map<string, string>,
    appUrl: string,
  ): FeedArticleItemDto {
    const { analysis } = item.candidate;
    const linkId = linkMap.get(analysis.articleId);
    return {
      articleId: analysis.articleId,
      title: analysis.article.title,
      // Falls back to the raw URL only if the batch link call somehow didn't cover this article
      // id — should never happen since finalArticleIds is built from the same rawDayGroups.
      url: linkId ? `${appUrl}/r/${linkId}` : analysis.article.url,
      sourceName: analysis.article.source?.name ?? '',
      publishedAt: analysis.article.publishedAt as Date,
      shortSummary: analysis.shortSummary ?? '',
      complexityLevel: analysis.complexityLevel,
      materialType: analysis.materialType,
      score: item.result.score,
    };
  }
}
