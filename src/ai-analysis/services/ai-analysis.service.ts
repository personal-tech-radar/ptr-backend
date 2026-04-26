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

interface AnalysisResult {
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

  constructor(
    @InjectRepository(ArticleAnalysis)
    private readonly analysisRepo: Repository<ArticleAnalysis>,
    private readonly articlesService: ArticlesService,
  ) {}

  onModuleInit(): void {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.loadUserInterests();
    this.loadSystemPrompt();
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
      const filePath = path.join(
        __dirname,
        '..',
        'instructions',
        'analyze-article.txt',
      );
      this.systemPromptTemplate = readFileSync(filePath, 'utf8');
    } catch (err) {
      this.logger.error('Failed to load analyze-article.txt', err);
      this.systemPromptTemplate = '';
    }
  }

  async analyzeArticle(articleId: string): Promise<void> {
    const article = await this.articlesService.findOne(articleId);

    const existing = await this.analysisRepo.findOne({ where: { articleId } });
    if (existing) {
      return;
    }

    try {
      const result = await this.callOpenAI(article);
      const finalScore =
        Number(result.relevanceScore) * 0.6 + Number(result.qualityScore) * 0.4;

      const analysis = this.analysisRepo.create({
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
      });
      await this.analysisRepo.save(analysis);
      await this.articlesService.updateStatus(articleId, ArticleStatus.ANALYZED);
      this.logger.info('Article analyzed', {
        articleId,
        relevance: result.relevanceScore,
        quality: result.qualityScore,
        include: result.shouldIncludeInDailyDigest,
      });
    } catch (err) {
      if ((err as any)?.code === '23505') {
        await this.articlesService.updateStatus(articleId, ArticleStatus.ANALYZED);
        return;
      }
      this.logger.error('Failed to analyze article', err, { articleId });
      await this.articlesService.updateStatus(articleId, ArticleStatus.FAILED);
    }
  }

  private async callOpenAI(article: {
    title: string;
    url: string;
    author?: string | null;
    summaryFromFeed?: string | null;
  }): Promise<AnalysisResult> {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const interestsList = this.userInterests.join(', ');
    const systemPrompt = this.systemPromptTemplate.replace(
      '{{USER_INTERESTS}}',
      interestsList,
    );

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
    const parsed = JSON.parse(raw) as AnalysisResult;

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
