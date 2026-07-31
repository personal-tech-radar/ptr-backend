import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    private readonly articlesService: ArticlesService,
    private readonly userSourcePreferenceService: UserSourcePreferenceService,
  ) {}

  async upsertFeedback(
    articleId: string,
    type: ArticleFeedbackType,
    userId: string,
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

  // Flattened, admin-only listing across all users' article feedback. userId is a real FK to
  // User (see ArticleFeedback entity, MVP3 Phase 11) — the join is a declared relation, and
  // userEmail is guaranteed to resolve for every row.
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

  // One-off MVP3 Phase 11 data migration: retags every article_feedbacks row still holding a
  // legacy userId literal (fromUserId) to the new real per-user identity (toUserId). Idempotent
  // across two scenarios: (1) no matching rows left — a normal no-op update, and (2) the
  // LinkArticleFeedbackAndUserSourcePreferencesToUsers migration has already converted userId to
  // a uuid column — the legacy string literal can no longer match anything, and Postgres rejects
  // it at bind time (22P02) before any row could be touched, which we treat the same as "0 rows
  // matched" rather than an error. Must run before that migration converts userId to a uuid FK
  // column, which fails loudly if any row still holds a non-uuid string.
  // See LegacyUserSyncService (src/users/services/legacy-user-sync.service.ts), the sole caller.
  async retagLegacyUser(fromUserId: string, toUserId: string): Promise<number> {
    let result;
    try {
      result = await this.feedbackRepo.update({ userId: fromUserId }, { userId: toUserId });
    } catch (err) {
      if (err?.code === '22P02') {
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
