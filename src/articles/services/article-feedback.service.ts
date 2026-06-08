import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoggingService } from '../../common/logging/logging.service';
import { DEFAULT_USER_ID } from '../../ai-analysis/services/ai-analysis.service';
import { ArticleFeedback, ArticleFeedbackType } from '../entities/article-feedback.entity';
import { ArticlesService } from './articles.service';

@Injectable()
export class ArticleFeedbackService {
  private readonly logger = new LoggingService(ArticleFeedbackService.name);

  constructor(
    @InjectRepository(ArticleFeedback)
    private readonly feedbackRepo: Repository<ArticleFeedback>,
    private readonly articlesService: ArticlesService,
  ) {}

  async upsertFeedback(
    articleId: string,
    type: ArticleFeedbackType,
    userId: string = DEFAULT_USER_ID,
  ): Promise<ArticleFeedback> {
    await this.articlesService.findOne(articleId);

    const existing = await this.feedbackRepo.findOne({
      where: { articleId, userId },
    });
    if (existing) {
      existing.type = type;
      const updated = await this.feedbackRepo.save(existing);
      this.logger.info('Article feedback updated', { articleId, userId, type });
      return updated;
    }

    const created = await this.feedbackRepo.save(
      this.feedbackRepo.create({ articleId, userId, type }),
    );
    this.logger.info('Article feedback created', { articleId, userId, type });
    return created;
  }
}
