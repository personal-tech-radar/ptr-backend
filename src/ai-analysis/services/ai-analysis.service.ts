import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { readFileSync } from 'fs';
import * as yaml from 'js-yaml';
import OpenAI from 'openai';
import * as path from 'path';
import { Repository } from 'typeorm';
import { LoggingService } from '../../common/logging/logging.service';
import { ArticlesService } from '../../articles/services/articles.service';
import { ArticleStatus } from '../../articles/entities/article.entity';
import { ArticleAnalysis } from '../entities/article-analysis.entity';
import { ArticleRelevance } from '../entities/article-relevance.entity';

export const DEFAULT_USER_ID = 'default_user';

const ANALYSIS_WINDOW_HOURS = 78;

interface PreAnalysisResult {
  isPotentiallyRelevant: boolean;
  shortReason: string;
}

interface FullAnalysisResult {
  shortSummary: string;
  whyItMatters: string;
  practicalValue: string;
  tags: string[];
  matchedInterests: string[];
  relevanceScore: number;
  qualityScore: number;
  deepDiveScore: number;
  complexityLevel: string;
  shouldIncludeInDailyDigest: boolean;
  shouldIncludeInWeeklyDigest: boolean;
  shouldIncludeInDeepDiveDigest: boolean;
}

@Injectable()
export class AiAnalysisService implements OnModuleInit {
  private readonly logger = new LoggingService(AiAnalysisService.name);
  private openai: OpenAI;
  private userInterests: string[] = [];
  private systemPromptTemplate: string = '';
  private preAnalysisPromptTemplate: string = '';

  constructor(
    @InjectRepository(ArticleAnalysis)
    private readonly analysisRepo: Repository<ArticleAnalysis>,
    @InjectRepository(ArticleRelevance)
    private readonly relevanceRepo: Repository<ArticleRelevance>,
    private readonly articlesService: ArticlesService,
  ) {}

  onModuleInit(): void {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.loadUserInterests();
    this.loadSystemPrompt();
    this.loadPreAnalysisPrompt();
  }

  private loadUserInterests(): void {
    try {
      const filePath = path.join(process.cwd(), 'config', 'user-interests.yaml');
      this.userInterests = yaml.load(readFileSync(filePath, 'utf8')) as string[];
      this.logger.info('User interests loaded', { count: this.userInterests.length });
    } catch (err) {
      this.logger.error('Failed to load user-interests.yaml', err);
      this.userInterests = [];
    }
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

  async analyzeArticle(articleId: string, userId: string = DEFAULT_USER_ID): Promise<void> {
    const article = await this.articlesService.findOne(articleId);

    const cutoff = new Date(Date.now() - ANALYSIS_WINDOW_HOURS * 60 * 60 * 1000);
    if (article.publishedAt && article.publishedAt < cutoff) {
      this.logger.info('Article outside analysis window, skipping', { articleId, publishedAt: article.publishedAt });
      await this.articlesService.updateStatus(articleId, ArticleStatus.ANALYZED);
      return;
    }

    const existing = await this.relevanceRepo.findOne({ where: { articleId, userId } });

    if (existing) {
      if (!existing.preAnalysisIsRelevant) {
        await this.articlesService.updateStatus(articleId, ArticleStatus.ANALYZED);
        return;
      }
      if (existing.fullAnalysisId) {
        await this.articlesService.updateStatus(articleId, ArticleStatus.ANALYZED);
        return;
      }
      // preAnalysisIsRelevant=true but fullAnalysisId not set — resume from phase 2
      await this.runFullAnalysis(article, existing);
      return;
    }

    try {
      const preResult = await this.callOpenAIPreAnalysis(article.title, article.summaryFromFeed);

      const relevance = await this.relevanceRepo.save(
        this.relevanceRepo.create({
          articleId,
          userId,
          preAnalysisIsRelevant: preResult.isPotentiallyRelevant,
          preAnalysisReason: preResult.shortReason,
          preAnalysisAt: new Date(),
          fullAnalysisId: null,
        }),
      );

      this.logger.info('Pre-analysis complete', {
        articleId,
        relevant: preResult.isPotentiallyRelevant,
        reason: preResult.shortReason,
      });

      if (!preResult.isPotentiallyRelevant) {
        await this.articlesService.updateStatus(articleId, ArticleStatus.ANALYZED);
        return;
      }

      await this.runFullAnalysis(article, relevance);
    } catch (err) {
      if ((err as any)?.code === '23505') {
        this.logger.warn('ArticleRelevance already exists, resuming from existing record', { articleId });
        const existingRelevance = await this.relevanceRepo.findOne({ where: { articleId, userId } });
        if (existingRelevance?.preAnalysisIsRelevant && !existingRelevance.fullAnalysisId) {
          await this.runFullAnalysis(article, existingRelevance);
        } else {
          await this.articlesService.updateStatus(articleId, ArticleStatus.ANALYZED);
        }
        return;
      }
      this.logger.error('Pre-analysis failed', err, { articleId });
      await this.articlesService.updateStatus(articleId, ArticleStatus.FAILED);
    }
  }

  private async runFullAnalysis(
    article: { id: string; title: string; url: string; author?: string | null; summaryFromFeed?: string | null },
    relevance: ArticleRelevance,
  ): Promise<void> {
    const articleId = article.id;

    try {
      const existingAnalysis = await this.analysisRepo.findOne({ where: { articleId } });

      if (existingAnalysis) {
        relevance.fullAnalysisId = existingAnalysis.id;
        await this.relevanceRepo.save(relevance);
        await this.articlesService.updateStatus(articleId, ArticleStatus.ANALYZED);
        return;
      }

      const result = await this.callOpenAI(article);
      const finalScore = Number(result.relevanceScore) * 0.6 + Number(result.qualityScore) * 0.4;

      const analysis = await this.analysisRepo.save(
        this.analysisRepo.create({
          articleId,
          shortSummary: result.shortSummary,
          whyItMatters: result.whyItMatters,
          practicalValue: result.practicalValue,
          tags: result.tags,
          matchedInterests: result.matchedInterests,
          relevanceScore: result.relevanceScore,
          qualityScore: result.qualityScore,
          finalScore: Math.round(finalScore * 100) / 100,
          deepDiveScore: result.deepDiveScore,
          complexityLevel: result.complexityLevel,
          shouldIncludeInDailyDigest: result.shouldIncludeInDailyDigest,
          shouldIncludeInWeeklyDigest: result.shouldIncludeInWeeklyDigest,
          shouldIncludeInDeepDiveDigest: result.shouldIncludeInDeepDiveDigest,
        }),
      );

      relevance.fullAnalysisId = analysis.id;
      await this.relevanceRepo.save(relevance);
      await this.articlesService.updateStatus(articleId, ArticleStatus.ANALYZED);

      this.logger.info('Full analysis complete', {
        articleId,
        relevance: result.relevanceScore,
        quality: result.qualityScore,
        include: result.shouldIncludeInDailyDigest,
      });
    } catch (err) {
      if ((err as any)?.code === '23505') {
        const existingAnalysis = await this.analysisRepo.findOne({ where: { articleId } });
        if (existingAnalysis) {
          relevance.fullAnalysisId = existingAnalysis.id;
          await this.relevanceRepo.save(relevance);
        }
        await this.articlesService.updateStatus(articleId, ArticleStatus.ANALYZED);
        return;
      }
      this.logger.error('Full analysis failed', err, { articleId });
      await this.articlesService.updateStatus(articleId, ArticleStatus.FAILED);
    }
  }

  private async callOpenAIPreAnalysis(
    title: string,
    summaryFromFeed: string | null,
  ): Promise<PreAnalysisResult> {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const interestsList = this.userInterests.join(', ');
    const systemPrompt = this.preAnalysisPromptTemplate.replace('{{USER_INTERESTS}}', interestsList);

    const userContent = [
      `Title: ${title}`,
      summaryFromFeed ? `Description: ${summaryFromFeed.slice(0, 500)}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
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
  }): Promise<FullAnalysisResult> {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const interestsList = this.userInterests.join(', ');
    const systemPrompt = this.systemPromptTemplate.replace('{{USER_INTERESTS}}', interestsList);

    const userContent = [
      `Title: ${article.title}`,
      `URL: ${article.url}`,
      article.author ? `Author: ${article.author}` : null,
      article.summaryFromFeed
        ? `Summary: ${article.summaryFromFeed.slice(0, 1000)}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as FullAnalysisResult;

    return {
      shortSummary: String(parsed.shortSummary ?? ''),
      whyItMatters: String(parsed.whyItMatters ?? ''),
      practicalValue: String(parsed.practicalValue ?? ''),
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
      matchedInterests: Array.isArray(parsed.matchedInterests) ? parsed.matchedInterests.map(String) : [],
      relevanceScore: Math.min(100, Math.max(0, Number(parsed.relevanceScore ?? 0))),
      qualityScore: Math.min(100, Math.max(0, Number(parsed.qualityScore ?? 0))),
      deepDiveScore: Math.min(100, Math.max(0, Number(parsed.deepDiveScore ?? 0))),
      complexityLevel: String(parsed.complexityLevel ?? 'basic'),
      shouldIncludeInDailyDigest: Boolean(parsed.shouldIncludeInDailyDigest),
      shouldIncludeInWeeklyDigest: Boolean(parsed.shouldIncludeInWeeklyDigest),
      shouldIncludeInDeepDiveDigest: Boolean(parsed.shouldIncludeInDeepDiveDigest),
    };
  }
}
