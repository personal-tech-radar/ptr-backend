import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoggingService } from '../../common/logging/logging.service';
import { DEFAULT_USER_ID } from '../../ai-analysis/services/ai-analysis.service';
import { UserSourcePreferenceService } from '../../sources/services/user-source-preference.service';
import { ArticleFeedback, ArticleFeedbackType } from '../entities/article-feedback.entity';
import { ArticlesService } from './articles.service';

@Injectable()
export class ArticleFeedbackService {
  private readonly logger = new LoggingService(ArticleFeedbackService.name);

  constructor(
    @InjectRepository(ArticleFeedback)
    private readonly feedbackRepo: Repository<ArticleFeedback>,
    private readonly articlesService: ArticlesService,
    private readonly userSourcePreferenceService: UserSourcePreferenceService,
  ) {}

  async upsertFeedback(
    articleId: string,
    type: ArticleFeedbackType,
    userId: string = DEFAULT_USER_ID,
  ): Promise<ArticleFeedback> {
    const article = await this.articlesService.findOne(articleId);

    const existing = await this.feedbackRepo.findOne({
      where: { articleId, userId },
    });
    let result: ArticleFeedback;
    let previousType: ArticleFeedbackType | null = null;
    if (existing) {
      previousType = existing.type;
      existing.type = type;
      result = await this.feedbackRepo.save(existing);
      this.logger.info('Article feedback updated', { articleId, userId, type });
    } else {
      result = await this.feedbackRepo.save(this.feedbackRepo.create({ articleId, userId, type }));
      this.logger.info('Article feedback created', { articleId, userId, type });
    }

    await this.userSourcePreferenceService.applyFeedback(
      userId,
      article.sourceId,
      type,
      previousType,
    );
    return result;
  }
}
