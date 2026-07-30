import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { LoggingService } from '../../common/logging/logging.service';
import { DEFAULT_USER_ID } from '../constants/default-user.constant';
import { UserSourcePreferenceService } from '../../sources/services/user-source-preference.service';
import { User } from '../../users/entities/user.entity';
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

  // Flattened, admin-only listing across all users' article feedback. userId has no real FK to
  // User (see ArticleFeedback entity) — every existing row today carries the legacy
  // DEFAULT_USER_ID literal, not a real user id — so the join to User is a best-effort id cast
  // rather than a declared relation, and userEmail is expected to be null until Phase 11.
  async findAllAdmin(
    query: AdminQueryArticleFeedbackDto,
  ): Promise<PaginatedResponseDto<AdminArticleFeedbackResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.feedbackRepo
      .createQueryBuilder('feedback')
      .innerJoinAndSelect('feedback.article', 'article')
      .leftJoin(User, 'user', 'user.id::text = feedback.userId')
      .addSelect(['user.email']);

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

    const { entities, raw } = await qb
      .orderBy('feedback.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getRawAndEntities();

    const data = entities.map((entity, index) =>
      this.toAdminResponseDto(entity, raw[index] as { user_email?: string | null }),
    );

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private toAdminResponseDto(
    entity: ArticleFeedback,
    raw: { user_email?: string | null },
  ): AdminArticleFeedbackResponseDto {
    return {
      id: entity.id,
      articleId: entity.articleId,
      articleTitle: entity.article.title,
      userId: entity.userId,
      userEmail: raw.user_email ?? null,
      type: entity.type,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
