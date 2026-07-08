import { Injectable } from '@nestjs/common';
import { LoggingService } from '../../common/logging/logging.service';
import { AiAnalysisService } from '../../ai-analysis/services/ai-analysis.service';
import { ArticlesService } from '../../articles/services/articles.service';
import { FeedFetcherService } from '../../feed-fetcher/services/feed-fetcher.service';
import { Digest } from '../entities/digest.entity';
import { DigestBuilderService } from './digest-builder.service';

@Injectable()
export class DigestBootstrapService {
  private readonly logger = new LoggingService(DigestBootstrapService.name);

  constructor(
    private readonly feedFetcherService: FeedFetcherService,
    private readonly articlesService: ArticlesService,
    private readonly aiAnalysisService: AiAnalysisService,
    private readonly digestBuilderService: DigestBuilderService,
  ) {}

  async buildDailyDigest(): Promise<Digest | null> {
    await this.feedFetcherService.fetchAllSources();
    await this.analyzePendingArticles();
    return this.digestBuilderService.buildDailyDigest();
  }

  async buildWeeklyDigest(): Promise<Digest | null> {
    await this.feedFetcherService.fetchAllSources();
    await this.analyzePendingArticles();
    return this.digestBuilderService.buildWeeklyDigest();
  }

  async buildDeepDiveWeeklyDigest(): Promise<Digest | null> {
    await this.feedFetcherService.fetchAllSources();
    await this.analyzePendingArticles();
    return this.digestBuilderService.buildDeepDiveWeeklyDigest();
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
