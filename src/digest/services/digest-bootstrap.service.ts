import { Injectable } from '@nestjs/common';
import { LoggingService } from '../../common/logging/logging.service';
import { AiAnalysisService } from '../../ai-analysis/services/ai-analysis.service';
import { ArticlesService } from '../../articles/services/articles.service';
import { FeedFetcherService } from '../../feed-fetcher/services/feed-fetcher.service';
import { UserQueryService } from '../../users/services/user-query.service';
import { Digest, DigestType } from '../entities/digest.entity';
import { PersonalDigestBuilderService } from './personal-digest-builder.service';

@Injectable()
export class DigestBootstrapService {
  private readonly logger = new LoggingService(DigestBootstrapService.name);

  constructor(
    private readonly feedFetcherService: FeedFetcherService,
    private readonly articlesService: ArticlesService,
    private readonly aiAnalysisService: AiAnalysisService,
    private readonly personalDigestBuilderService: PersonalDigestBuilderService,
    private readonly userQueryService: UserQueryService,
  ) {}

  async buildDailyDigest(userId: string): Promise<Digest | null> {
    await this.feedFetcherService.fetchAllSources();
    await this.analyzePendingArticles();
    const user = await this.userQueryService.findById(userId);
    return this.personalDigestBuilderService.buildForUser(user, DigestType.DAILY);
  }

  async buildWeeklyDigest(userId: string): Promise<Digest | null> {
    await this.feedFetcherService.fetchAllSources();
    await this.analyzePendingArticles();
    const user = await this.userQueryService.findById(userId);
    return this.personalDigestBuilderService.buildForUser(user, DigestType.WEEKLY);
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
