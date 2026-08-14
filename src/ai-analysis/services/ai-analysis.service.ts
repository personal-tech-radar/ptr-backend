import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { readFileSync } from 'fs';
import OpenAI from 'openai';
import * as path from 'path';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { LoggingService } from '../../common/logging/logging.service';
import { ArticlesService } from '../../articles/services/articles.service';
import { ArticleStatus } from '../../articles/entities/article.entity';
import { ContentStreamQueryService } from '../../taxonomy/services/content-stream-query.service';
import { TechnologyInterestResolverService } from '../../taxonomy/services/technology-interest-resolver.service';
import { TechnologyInterestKind } from '../../taxonomy/entities/technology-interest.entity';
import { TechnologyInterestQueryService } from '../../taxonomy/services/technology-interest-query.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import {
  ArticleAnalysis,
  ArticleComplexityLevel,
  ArticleMaterialType,
} from '../entities/article-analysis.entity';
import { ArticleStream } from '../entities/article-stream.entity';
import { ArticleTechnologyInterest } from '../entities/article-technology-interest.entity';

const ANALYSIS_WINDOW_HOURS = 78;
const MAX_SECONDARY_STREAMS = 2;

interface PreAnalysisResult {
  isPotentiallyRelevant: boolean;
  shortReason: string;
}

interface FullAnalysisResult {
  shortSummary: string;
  longSummary: string;
  whyItMatters: string;
  practicalValue: string;
  tags: string[];
  relevanceScore: number;
  qualityScore: number;
  complexityLevel: ArticleComplexityLevel;
  materialType: ArticleMaterialType;
  urgencyScore: number;
  evergreen: boolean;
  breakingChanges: boolean;
  releaseData: Record<string, unknown> | null;
  securityData: Record<string, unknown> | null;
  mainStreamKey: string;
  secondaryStreamKeys: string[];
  technologySignals: string[];
  interestSignals: string[];
  shouldIncludeInDailyDigest: boolean;
  shouldIncludeInWeeklyDigest: boolean;
}

// Two-stage, fully global pipeline (no per-user dimension — see the removed ArticleRelevance
// entity/MVP3 phase 3 spec). Stage 1 (pre-screen) always creates the ArticleAnalysis row; Stage 2
// (full analysis) fills it in in place and stamps `fullAnalysisAt`, which is the single source of
// truth for "has Stage 2 run".
@Injectable()
export class AiAnalysisService implements OnModuleInit {
  private readonly logger = new LoggingService(AiAnalysisService.name);
  private openai: OpenAI;
  private systemPromptTemplate: string = '';
  private preAnalysisPromptTemplate: string = '';

  constructor(
    @InjectRepository(ArticleAnalysis)
    private readonly analysisRepo: Repository<ArticleAnalysis>,
    private readonly articlesService: ArticlesService,
    private readonly technologyInterestResolverService: TechnologyInterestResolverService,
    private readonly contentStreamQueryService: ContentStreamQueryService,
    private readonly technologyInterestQueryService: TechnologyInterestQueryService,
    private readonly metricsService: MetricsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit(): void {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.loadSystemPrompt();
    this.loadPreAnalysisPrompt();
  }

  private loadSystemPrompt(): void {
    try {
      const filePath = path.join(__dirname, '..', 'instructions', 'analyze-article.txt');
      this.systemPromptTemplate = readFileSync(filePath, 'utf8');
    } catch (err) {
      this.logger.error('Failed to load analyze-article.txt', err);
      this.systemPromptTemplate = '';
    }
  }

  private loadPreAnalysisPrompt(): void {
    try {
      const filePath = path.join(__dirname, '..', 'instructions', 'pre-analyze-article.txt');
      this.preAnalysisPromptTemplate = readFileSync(filePath, 'utf8');
    } catch (err) {
      this.logger.error('Failed to load pre-analyze-article.txt', err);
      this.preAnalysisPromptTemplate = '';
    }
  }

  async analyzeArticle(articleId: string): Promise<void> {
    const article = await this.articlesService.findOne(articleId);

    const cutoff = new Date(Date.now() - ANALYSIS_WINDOW_HOURS * 60 * 60 * 1000);
    if (!article.publishedAt || article.publishedAt < cutoff) {
      this.logger.info('Article outside analysis window, skipping', {
        articleId,
        publishedAt: article.publishedAt,
      });
      await this.articlesService.updateStatus(articleId, ArticleStatus.SKIPPED);
      return;
    }

    const existing = await this.analysisRepo.findOne({ where: { articleId } });

    if (existing) {
      if (existing.preScreenIsRelevant === false) {
        await this.articlesService.updateStatus(articleId, ArticleStatus.SKIPPED);
        return;
      }
      if (existing.fullAnalysisAt) {
        await this.articlesService.updateStatus(articleId, ArticleStatus.ANALYZED);
        return;
      }
      // preScreenIsRelevant=true but fullAnalysisAt not set — idempotent resume into Stage 2.
      await this.runFullAnalysis(article, existing);
      return;
    }

    try {
      const preResult = await this.callOpenAIPreAnalysis(article.title, article.summaryFromFeed);

      const analysis = await this.analysisRepo.save(
        this.analysisRepo.create({
          articleId,
          preScreenIsRelevant: preResult.isPotentiallyRelevant,
          preScreenReason: preResult.shortReason,
          preScreenAt: new Date(),
        }),
      );

      this.logger.info('Pre-screen complete', {
        articleId,
        relevant: preResult.isPotentiallyRelevant,
        reason: preResult.shortReason,
      });

      if (!preResult.isPotentiallyRelevant) {
        await this.articlesService.updateStatus(articleId, ArticleStatus.SKIPPED);
        await this.metricsService.increment('pre_analysis_total', { outcome: 'skipped' });
        return;
      }

      await this.metricsService.increment('pre_analysis_total', { outcome: 'accepted' });

      await this.runFullAnalysis(article, analysis);
    } catch (err) {
      if (err?.code === '23505') {
        this.logger.warn('ArticleAnalysis already exists, resuming from existing record', {
          articleId,
        });
        const existingAnalysis = await this.analysisRepo.findOne({ where: { articleId } });
        if (existingAnalysis?.preScreenIsRelevant && !existingAnalysis.fullAnalysisAt) {
          await this.runFullAnalysis(article, existingAnalysis);
        } else {
          await this.articlesService.updateStatus(articleId, ArticleStatus.ANALYZED);
        }
        return;
      }
      this.logger.error('Pre-screen failed', err, {
        articleId,
        ...this.providerErrorMeta(err, 'pre-analysis'),
      });
      await this.articlesService.updateStatus(articleId, ArticleStatus.FAILED);
      await this.metricsService.increment('pre_analysis_total', { outcome: 'failed' });
    }
  }

  // Pre-screen stage only, deliberately isolated from `analyzeArticle`'s chain into full
  // analysis. Used by SourceCandidatesService to sample a bounded set of candidate articles
  // during promotion without spending full-analysis tokens on URLs that may never become a
  // real source. Idempotent: returns the existing analysis row if one is already there.
  async preAnalyzeArticle(
    articleId: string,
    requiredTaxonomyName?: string,
    requiredStreamKey?: string,
  ): Promise<ArticleAnalysis> {
    const existing = await this.analysisRepo.findOne({ where: { articleId } });
    if (existing) return existing;

    const article = await this.articlesService.findOne(articleId);
    const preResult = await this.callOpenAIPreAnalysis(
      article.title,
      article.summaryFromFeed,
      requiredTaxonomyName,
      requiredStreamKey,
    );

    try {
      const saved = await this.analysisRepo.save(
        this.analysisRepo.create({
          articleId,
          preScreenIsRelevant: preResult.isPotentiallyRelevant,
          preScreenReason: preResult.shortReason,
          preScreenAt: new Date(),
        }),
      );
      this.logger.info('Pre-screen-only complete (candidate sampling)', {
        articleId,
        relevant: preResult.isPotentiallyRelevant,
      });
      return saved;
    } catch (err) {
      if (err?.code === '23505') {
        const raced = await this.analysisRepo.findOne({ where: { articleId } });
        if (raced) return raced;
      }
      throw err;
    }
  }

  private async runFullAnalysis(
    article: {
      id: string;
      title: string;
      url: string;
      author?: string | null;
      summaryFromFeed?: string | null;
      rawContent?: string | null;
    },
    analysis: ArticleAnalysis,
  ): Promise<void> {
    const articleId = article.id;

    try {
      const result = await this.callOpenAI(article);
      const finalScore = Number(result.relevanceScore) * 0.6 + Number(result.qualityScore) * 0.4;

      const technologyInterestIds = await this.resolveSignalLinks(
        result.technologySignals,
        result.interestSignals,
      );
      const { main, secondary } = await this.resolveStreams(
        result.mainStreamKey,
        result.secondaryStreamKeys,
      );

      await this.dataSource.transaction(async (manager) => {
        // Mutate the already-fetched entity and save() it, rather than manager.update() with a
        // partial — TypeORM's QueryDeepPartialEntity typing for update() doesn't accept the
        // jsonb Record<string, unknown> shape of releaseData/securityData cleanly.
        analysis.shortSummary = result.shortSummary;
        analysis.longSummary = result.longSummary;
        analysis.whyItMatters = result.whyItMatters;
        analysis.practicalValue = result.practicalValue;
        analysis.tags = result.tags;
        analysis.relevanceScore = result.relevanceScore;
        analysis.qualityScore = result.qualityScore;
        analysis.finalScore = Math.round(finalScore * 100) / 100;
        analysis.complexityLevel = result.complexityLevel;
        analysis.materialType = result.materialType;
        analysis.urgencyScore = result.urgencyScore;
        analysis.evergreen = result.evergreen;
        analysis.breakingChanges = result.breakingChanges;
        analysis.releaseData = result.releaseData;
        analysis.securityData = result.securityData;
        analysis.mainStreamId = main?.id ?? null;
        analysis.shouldIncludeInDailyDigest = result.shouldIncludeInDailyDigest;
        analysis.shouldIncludeInWeeklyDigest = result.shouldIncludeInWeeklyDigest;
        analysis.fullAnalysisAt = new Date();

        await manager.save(ArticleAnalysis, analysis);

        for (const technologyInterestId of technologyInterestIds) {
          const existingLink = await manager.findOne(ArticleTechnologyInterest, {
            where: { articleId, technologyInterestId },
          });
          if (!existingLink) {
            await manager.save(
              ArticleTechnologyInterest,
              manager.create(ArticleTechnologyInterest, { articleId, technologyInterestId }),
            );
          }
        }

        if (main) {
          await this.upsertArticleStream(manager, articleId, main.id, true);
        } else {
          this.logger.warn(
            'mainStreamKey did not resolve to a real content stream, skipping primary stream assignment',
            {
              articleId,
              mainStreamKey: result.mainStreamKey,
            },
          );
        }
        for (const stream of secondary) {
          await this.upsertArticleStream(manager, articleId, stream.id, false);
        }
      });

      await this.articlesService.updateStatus(articleId, ArticleStatus.ANALYZED);
      await this.metricsService.increment('full_analysis_total', { outcome: 'completed' });

      this.logger.info('Full analysis complete', {
        articleId,
        relevance: result.relevanceScore,
        quality: result.qualityScore,
        include: result.shouldIncludeInDailyDigest,
      });
    } catch (err) {
      this.logger.error('Full analysis failed', err, {
        articleId,
        ...this.providerErrorMeta(err, 'full-analysis'),
      });
      await this.articlesService.updateStatus(articleId, ArticleStatus.FAILED);
    }
  }

  private providerErrorMeta(
    error: unknown,
    requestContext: 'pre-analysis' | 'full-analysis',
  ): {
    provider: 'openai';
    providerStatus: number | null;
    retryable: boolean;
    requestContext: string;
  } {
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? (error as { status?: unknown }).status
        : null;
    const providerStatus = typeof status === 'number' ? status : null;

    return {
      provider: 'openai',
      providerStatus,
      retryable: providerStatus === null || providerStatus === 429 || providerStatus >= 500,
      requestContext,
    };
  }

  // Resolves each technologySignals/interestSignals entry against the existing taxonomy catalog
  // only (TechnologyInterestResolverService.resolveExisting — never resolve()/create). Unmatched
  // signals are dropped silently: an article's analysis output must never grow the taxonomy.
  private async resolveSignalLinks(
    technologySignals: string[],
    interestSignals: string[],
  ): Promise<string[]> {
    const resolvedIds: string[] = [];

    for (const rawName of technologySignals) {
      const match = await this.technologyInterestResolverService.resolveExisting(
        TechnologyInterestKind.TECHNOLOGY,
        rawName,
      );
      if (match) resolvedIds.push(match.id);
    }

    for (const rawName of interestSignals) {
      const match = await this.technologyInterestResolverService.resolveExisting(
        TechnologyInterestKind.INTEREST,
        rawName,
      );
      if (match) resolvedIds.push(match.id);
    }

    return Array.from(new Set(resolvedIds));
  }

  private async resolveStreams(
    mainStreamKey: string,
    secondaryStreamKeys: string[],
  ): Promise<{
    main: Awaited<ReturnType<ContentStreamQueryService['findByKey']>>;
    secondary: NonNullable<Awaited<ReturnType<ContentStreamQueryService['findByKey']>>>[];
  }> {
    const main = await this.contentStreamQueryService.findByKey(mainStreamKey);

    const secondaryKeys = secondaryStreamKeys
      .filter((key) => key !== mainStreamKey)
      .slice(0, MAX_SECONDARY_STREAMS);

    const secondary: NonNullable<Awaited<ReturnType<ContentStreamQueryService['findByKey']>>>[] =
      [];
    for (const key of secondaryKeys) {
      const stream = await this.contentStreamQueryService.findByKey(key);
      if (stream) secondary.push(stream);
    }

    return { main, secondary };
  }

  private async upsertArticleStream(
    manager: EntityManager,
    articleId: string,
    streamId: string,
    isPrimary: boolean,
  ): Promise<void> {
    const existing = await manager.findOne(ArticleStream, { where: { articleId, streamId } });
    if (existing) {
      if (existing.isPrimary !== isPrimary) {
        await manager.update(ArticleStream, existing.id, { isPrimary });
      }
      return;
    }
    await manager.save(
      ArticleStream,
      manager.create(ArticleStream, { articleId, streamId, isPrimary }),
    );
  }

  private async callOpenAIPreAnalysis(
    title: string,
    summaryFromFeed: string | null,
    requiredTaxonomyName?: string,
    requiredStreamKey?: string,
  ): Promise<PreAnalysisResult> {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const [taxonomy, streams] = await Promise.all([
      this.technologyInterestQueryService.findAllActive(),
      this.contentStreamQueryService.findAll(),
    ]);

    const userContent = [
      `Title: ${title}`,
      summaryFromFeed ? `Description: ${summaryFromFeed.slice(0, 500)}` : null,
      `Supported streams: ${requiredStreamKey ?? streams.map((stream) => stream.key).join(', ')}`,
      `Technologies: ${
        requiredTaxonomyName ??
        taxonomy
          .filter((item) => item.kind === TechnologyInterestKind.TECHNOLOGY)
          .map((item) => item.name)
          .join(', ')
      }`,
      `Interests: ${
        requiredTaxonomyName ??
        taxonomy
          .filter((item) => item.kind === TechnologyInterestKind.INTEREST)
          .map((item) => item.name)
          .join(', ')
      }`,
    ]
      .filter(Boolean)
      .join('\n');

    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: this.preAnalysisPromptTemplate },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw);

    return {
      isPotentiallyRelevant: Boolean(parsed.isPotentiallyRelevant),
      shortReason: String(parsed.shortReason ?? ''),
    };
  }

  private async callOpenAI(article: {
    title: string;
    url: string;
    author?: string | null;
    summaryFromFeed?: string | null;
    rawContent?: string | null;
  }): Promise<FullAnalysisResult> {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const taxonomy = await this.technologyInterestQueryService.findAllActive();
    const taxonomyCatalog = taxonomy
      .map(
        (item) =>
          `${item.kind}: ${item.name}${item.aliases.length ? ` (aliases: ${item.aliases.join(', ')})` : ''}`,
      )
      .join('\n');

    const userContent = [
      `Title: ${article.title}`,
      `URL: ${article.url}`,
      article.author ? `Author: ${article.author}` : null,
      article.summaryFromFeed ? `Summary: ${article.summaryFromFeed.slice(0, 1000)}` : null,
      article.rawContent ? `Article content excerpt:\n${article.rawContent.slice(0, 12000)}` : null,
      `Available taxonomy (signals must use these canonical names or aliases):\n${taxonomyCatalog}`,
    ]
      .filter(Boolean)
      .join('\n');

    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: this.systemPromptTemplate },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw);

    return {
      shortSummary: String(parsed.shortSummary ?? ''),
      longSummary: String(parsed.longSummary ?? parsed.shortSummary ?? ''),
      whyItMatters: String(parsed.whyItMatters ?? ''),
      practicalValue: String(parsed.practicalValue ?? ''),
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
      relevanceScore: clampScore(parsed.relevanceScore),
      qualityScore: clampScore(parsed.qualityScore),
      complexityLevel: isValidComplexityLevel(parsed.complexityLevel)
        ? parsed.complexityLevel
        : ArticleComplexityLevel.INTERMEDIATE,
      materialType: isValidMaterialType(parsed.materialType)
        ? parsed.materialType
        : ArticleMaterialType.ARTICLE,
      urgencyScore: clampScore(parsed.urgencyScore),
      evergreen: Boolean(parsed.evergreen),
      breakingChanges: Boolean(parsed.breakingChanges),
      releaseData:
        parsed.releaseData && typeof parsed.releaseData === 'object' ? parsed.releaseData : null,
      securityData:
        parsed.securityData && typeof parsed.securityData === 'object' ? parsed.securityData : null,
      mainStreamKey: String(parsed.mainStreamKey ?? ''),
      secondaryStreamKeys: Array.isArray(parsed.secondaryStreamKeys)
        ? parsed.secondaryStreamKeys.map(String).slice(0, MAX_SECONDARY_STREAMS)
        : [],
      technologySignals: Array.isArray(parsed.technologySignals)
        ? parsed.technologySignals.map(String)
        : [],
      interestSignals: Array.isArray(parsed.interestSignals)
        ? parsed.interestSignals.map(String)
        : [],
      shouldIncludeInDailyDigest: Boolean(parsed.shouldIncludeInDailyDigest),
      shouldIncludeInWeeklyDigest: Boolean(parsed.shouldIncludeInWeeklyDigest),
    };
  }
}

function clampScore(value: unknown): number {
  return Math.min(100, Math.max(0, Number(value ?? 0)));
}

function isValidComplexityLevel(value: unknown): value is ArticleComplexityLevel {
  return (Object.values(ArticleComplexityLevel) as unknown[]).includes(value);
}

function isValidMaterialType(value: unknown): value is ArticleMaterialType {
  return (Object.values(ArticleMaterialType) as unknown[]).includes(value);
}
