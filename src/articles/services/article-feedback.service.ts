import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, UpdateResult } from 'typeorm';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { LoggingService } from '../../common/logging/logging.service';
import { UserSourcePreferenceService } from '../../sources/services/user-source-preference.service';
import { AdminArticleFeedbackResponseDto } from '../dto/admin-article-feedback-response.dto';
import { AdminQueryArticleFeedbackDto } from '../dto/admin-query-article-feedback.dto';
import { ArticleFeedback, ArticleFeedbackType } from '../entities/article-feedback.entity';
import { ArticlesService } from './articles.service';

@Injectable()
export class ArticleFeedbackService {
  private readonly logger = new LoggingService(ArticleFeedbackService.name);

  constructor(
    @InjectRepository(ArticleFeedback)
    private readonly feedbackRepo: Repository<ArticleFeedback>,
    private readonly dataSource: DataSource,
    private readonly articlesService: ArticlesService,
    private readonly userSourcePreferenceService: UserSourcePreferenceService,
  ) {}

  async upsertFeedback(
    articleId: string,
    type: ArticleFeedbackType,
    userId: string,
  ): Promise<ArticleFeedback> {
    const article = await this.articlesService.findOne(articleId);

    const result = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ArticleFeedback);
      const existing = await repo.findOne({
        where: { articleId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      const previousType = existing?.type ?? null;
      const feedback = existing ?? repo.create({ articleId, userId, type });
      feedback.type = type;
      const saved = await repo.save(feedback);
      await this.userSourcePreferenceService.applyFeedback(
        userId,
        article.sourceId,
        type,
        previousType,
        manager,
      );
      return saved;
    });
    this.logger.info('Article feedback stored', { articleId, userId, type });
    return result;
  }

  // Admin listing uses declared article and user relations.
  async findAllAdmin(
    query: AdminQueryArticleFeedbackDto,
  ): Promise<PaginatedResponseDto<AdminArticleFeedbackResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.feedbackRepo
      .createQueryBuilder('feedback')
      .innerJoinAndSelect('feedback.article', 'article')
      .innerJoinAndSelect('feedback.user', 'user');

    if (query.email) {
      qb.andWhere('user.email ILIKE :email', { email: `%${query.email}%` });
    }
    if (query.articleId) {
      qb.andWhere('feedback.articleId = :articleId', { articleId: query.articleId });
    }
    if (query.type) {
      qb.andWhere('feedback.type = :type', { type: query.type });
    }

    const total = await qb.clone().getCount();

    const entities = await qb
      .orderBy('feedback.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
    const data = entities.map((entity) => this.toAdminResponseDto(entity));

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // Retag legacy feedback before the userId column becomes a UUID foreign key.
  async retagLegacyUser(fromUserId: string, toUserId: string): Promise<number> {
    let result: UpdateResult;
    try {
      result = await this.feedbackRepo.update({ userId: fromUserId }, { userId: toUserId });
    } catch (err: unknown) {
      if (this.hasErrorCode(err, '22P02')) {
        this.logger.info(
          'Skipped legacy article feedback retag — userId column is no longer varchar, legacy literal cannot match',
          { fromUserId, toUserId },
        );
        return 0;
      }
      throw err;
    }
    const affected = result.affected ?? 0;
    if (affected > 0) {
      this.logger.info('Retagged legacy article feedback rows to real user', {
        fromUserId,
        toUserId,
        affected,
      });
    }
    return affected;
  }

  private hasErrorCode(error: unknown, code: string): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
  }

  private toAdminResponseDto(entity: ArticleFeedback): AdminArticleFeedbackResponseDto {
    return {
      id: entity.id,
      articleId: entity.articleId,
      articleTitle: entity.article.title,
      userId: entity.userId,
      userEmail: entity.user.email,
      type: entity.type,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
