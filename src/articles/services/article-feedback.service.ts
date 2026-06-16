import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoggingService } from '../../common/logging/logging.service';
import { DEFAULT_USER_ID } from '../../ai-analysis/services/ai-analysis.service';
import { ArticleFeedback, ArticleFeedbackType } from '../entities/article-feedback.entity';
import { ArticlesService } from './articles.service';
import { Source } from '../../sources/entities/source.entity';

// Dampens early-signal volatility: 2 phantom neutral votes before real data arrives.
const SCORE_PRIOR = 2;

@Injectable()
export class ArticleFeedbackService {
  private readonly logger = new LoggingService(ArticleFeedbackService.name);

  constructor(
    @InjectRepository(ArticleFeedback)
    private readonly feedbackRepo: Repository<ArticleFeedback>,
    @InjectRepository(Source)
    private readonly sourceRepo: Repository<Source>,
    private readonly articlesService: ArticlesService,
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
    if (existing) {
      existing.type = type;
      result = await this.feedbackRepo.save(existing);
      this.logger.info('Article feedback updated', { articleId, userId, type });
    } else {
      result = await this.feedbackRepo.save(
        this.feedbackRepo.create({ articleId, userId, type }),
      );
      this.logger.info('Article feedback created', { articleId, userId, type });
    }

    await this.rescoreSource(article.sourceId);
    return result;
  }

  private async rescoreSource(sourceId: string): Promise<void> {
    const counts = await this.feedbackRepo
      .createQueryBuilder('f')
      .select('f.type', 'type')
      .addSelect('COUNT(*)', 'cnt')
      .innerJoin('f.article', 'a')
      .where('a.sourceId = :sourceId', { sourceId })
      .groupBy('f.type')
      .getRawMany<{ type: string; cnt: string }>();

    const useful = Number(counts.find((r) => r.type === ArticleFeedbackType.USEFUL)?.cnt ?? 0);
    const notUseful = Number(
      counts.find((r) => r.type === ArticleFeedbackType.NOT_USEFUL)?.cnt ?? 0,
    );
    const total = useful + notUseful;
    if (total === 0) return;

    const newScore = Math.max(
      0,
      Math.min(100, 50 + ((useful - notUseful) / (total + SCORE_PRIOR)) * 50),
    );

    await this.sourceRepo.update(sourceId, { trustScore: Math.round(newScore * 100) / 100 });
    this.logger.info('Source trust score updated from feedback', { sourceId, useful, notUseful, newScore });
  }
}
