import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import * as path from 'path';
import { LoggingService } from '../../common/logging/logging.service';
import { AiAnalysisService } from '../../ai-analysis/services/ai-analysis.service';
import { ArticlesService } from '../../articles/services/articles.service';
import { FeedFetcherService } from '../../feed-fetcher/services/feed-fetcher.service';
import { SourcesService } from '../../sources/services/sources.service';
import { Digest } from '../entities/digest.entity';
import { DigestBuilderService } from './digest-builder.service';

@Injectable()
export class DigestBootstrapService {
  private readonly logger = new LoggingService(DigestBootstrapService.name);

  constructor(
    private readonly sourcesService: SourcesService,
    private readonly feedFetcherService: FeedFetcherService,
    private readonly articlesService: ArticlesService,
    private readonly aiAnalysisService: AiAnalysisService,
    private readonly digestBuilderService: DigestBuilderService,
  ) {}

  async buildDailyDigest(): Promise<Digest | null> {
    await this.seedSourcesIfEmpty();
    await this.feedFetcherService.fetchAllSources();
    await this.analyzePendingArticles();
    return this.digestBuilderService.buildDailyDigest();
  }

  async buildWeeklyDigest(): Promise<Digest | null> {
    await this.seedSourcesIfEmpty();
    await this.feedFetcherService.fetchAllSources();
    await this.analyzePendingArticles();
    return this.digestBuilderService.buildWeeklyDigest();
  }

  async buildDeepDiveWeeklyDigest(): Promise<Digest | null> {
    await this.seedSourcesIfEmpty();
    await this.feedFetcherService.fetchAllSources();
    await this.analyzePendingArticles();
    return this.digestBuilderService.buildDeepDiveWeeklyDigest();
  }

  private async seedSourcesIfEmpty(): Promise<void> {
    const existing = await this.sourcesService.findAll();
    if (existing.length > 0) return;

    this.logger.info('No sources found, seeding from config/sources.seed.json');
    const filePath = path.join(process.cwd(), 'config', 'sources.seed.json');
    const seeds: any[] = JSON.parse(readFileSync(filePath, 'utf8'));

    for (const seed of seeds) {
      try {
        await this.sourcesService.create(seed);
      } catch {
        // skip duplicates
      }
    }
    this.logger.info('Sources seeded', { count: seeds.length });
  }

  private async analyzePendingArticles(): Promise<void> {
    const pending = await this.articlesService.findPendingAnalysis();
    if (pending.length === 0) return;

    this.logger.info(`Analyzing ${pending.length} pending articles`);
    for (const article of pending) {
      try {
        await this.aiAnalysisService.analyzeArticle(article.id);
      } catch (err) {
        this.logger.error(`Failed to analyze article ${article.id}`, err);
      }
    }
  }
}
