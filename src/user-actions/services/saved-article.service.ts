import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { LoggingService } from '../../common/logging/logging.service';
import { ArticlesService } from '../../articles/services/articles.service';
import { AdminQuerySavedArticleDto } from '../dto/admin-query-saved-article.dto';
import { AdminSavedArticleResponseDto } from '../dto/admin-saved-article-response.dto';
import {
  SavedArticleResponseDto,
  toSavedArticleResponseDto,
} from '../dto/saved-article-response.dto';
import { SavedArticle } from '../entities/saved-article.entity';

@Injectable()
export class SavedArticleService {
  private readonly logger = new LoggingService(SavedArticleService.name);

  constructor(
    @InjectRepository(SavedArticle)
    private readonly savedArticleRepo: Repository<SavedArticle>,
    private readonly articlesService: ArticlesService,
  ) {}

  // Find-or-create: saving an already-saved article is not an error, it just returns the
  // existing row (idempotent from the caller's perspective).
  async create(userId: string, articleId: string): Promise<SavedArticle> {
    await this.articlesService.findOne(articleId); // throws NotFoundException if missing

    const existing = await this.findJoined(userId, articleId);
    if (existing) {
      return existing;
    }

    try {
      await this.savedArticleRepo.save(this.savedArticleRepo.create({ userId, articleId }));
    } catch (error) {
      // Concurrent double-save race on the (userId, articleId) unique constraint — treat as
      // find-or-create rather than surfacing a conflict.
      const existingAfterRace = await this.findJoined(userId, articleId);
      if (existingAfterRace) {
        return existingAfterRace;
      }
      throw error;
    }

    this.logger.info('Article saved', { userId, articleId });
    return (await this.findJoined(userId, articleId)) as SavedArticle;
  }

  // Idempotent: unsaving an article that isn't currently saved is a no-op, not an error.
  async remove(userId: string, articleId: string): Promise<void> {
    await this.savedArticleRepo.delete({ userId, articleId });
    this.logger.info('Article unsaved', { userId, articleId });
  }

  async findAll(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponseDto<SavedArticleResponseDto>> {
    const [rows, total] = await this.savedArticleRepo
      .createQueryBuilder('savedArticle')
      .innerJoinAndSelect('savedArticle.article', 'article')
      .where('savedArticle.userId = :userId', { userId })
      .orderBy('savedArticle.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: rows.map(toSavedArticleResponseDto),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private findJoined(userId: string, articleId: string): Promise<SavedArticle | null> {
    return this.savedArticleRepo.findOne({ where: { userId, articleId }, relations: ['article'] });
  }

  // Flattened, admin-only listing across all users' saved articles. userId/articleId are real
  // FKs here (unlike ArticleFeedback/UserSourcePreference), so this is a plain join — no cast
  // trick, no separate raw-select handling needed.
  async findAllAdmin(
    query: AdminQuerySavedArticleDto,
  ): Promise<PaginatedResponseDto<AdminSavedArticleResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.savedArticleRepo
      .createQueryBuilder('savedArticle')
      .innerJoinAndSelect('savedArticle.user', 'user')
      .innerJoinAndSelect('savedArticle.article', 'article');

    if (query.email) {
      qb.andWhere('user.email ILIKE :email', { email: `%${query.email}%` });
    }
    if (query.articleId) {
      qb.andWhere('savedArticle.articleId = :articleId', { articleId: query.articleId });
    }

    const [rows, total] = await qb
      .orderBy('savedArticle.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: rows.map((row) => this.toAdminResponseDto(row)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private toAdminResponseDto(entity: SavedArticle): AdminSavedArticleResponseDto {
    return {
      id: entity.id,
      userId: entity.userId,
      userEmail: entity.user.email,
      articleId: entity.articleId,
      article: {
        id: entity.article.id,
        sourceId: entity.article.sourceId,
        title: entity.article.title,
        url: entity.article.url,
        urlHash: entity.article.urlHash,
        author: entity.article.author,
        publishedAt: entity.article.publishedAt,
        summaryFromFeed: entity.article.summaryFromFeed,
        status: entity.article.status,
        createdAt: entity.article.createdAt,
        updatedAt: entity.article.updatedAt,
      },
      savedAt: entity.createdAt,
    };
  }
}
