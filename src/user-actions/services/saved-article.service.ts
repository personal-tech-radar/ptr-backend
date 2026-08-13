import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
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
import { UserSourcePreferenceService } from '../../sources/services/user-source-preference.service';
import { Article } from '../../articles/entities/article.entity';

@Injectable()
export class SavedArticleService {
  private readonly logger = new LoggingService(SavedArticleService.name);

  constructor(
    @InjectRepository(SavedArticle)
    private readonly savedArticleRepo: Repository<SavedArticle>,
    private readonly dataSource: DataSource,
    private readonly articlesService: ArticlesService,
    private readonly userSourcePreferenceService: UserSourcePreferenceService,
  ) {}

  // Saving an existing article returns the existing row.
  async create(userId: string, articleId: string): Promise<SavedArticle> {
    const article = await this.articlesService.findOne(articleId);
    const existing = await this.findJoined(userId, articleId);
    if (existing) {
      return existing;
    }
    let result: SavedArticle;
    try {
      result = await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(SavedArticle);
        const current = await this.findJoined(userId, articleId, manager);
        if (current) return current;
        await repo.save(repo.create({ userId, articleId }));
        await this.userSourcePreferenceService.applySignal(
          userId,
          article.sourceId,
          'saved',
          manager,
        );
        return (await this.findJoined(userId, articleId, manager)) as SavedArticle;
      });
    } catch (error) {
      const winner = await this.findJoined(userId, articleId);
      if (winner) return winner;
      throw error;
    }
    this.logger.info('Article saved', { userId, articleId });
    return result;
  }

  // Removing a missing save is an idempotent no-op.
  async remove(userId: string, articleId: string): Promise<void> {
    const removed = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(SavedArticle);
      const existing = await repo.findOne({
        where: { userId, articleId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!existing) return false;
      const article = await manager.getRepository(Article).findOneByOrFail({ id: articleId });
      await repo.remove(existing);
      await this.userSourcePreferenceService.removeSignal(
        userId,
        article.sourceId,
        'saved',
        manager,
      );
      return true;
    });
    if (!removed) return;
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

  private findJoined(
    userId: string,
    articleId: string,
    manager?: EntityManager,
  ): Promise<SavedArticle | null> {
    const repo = manager?.getRepository(SavedArticle) ?? this.savedArticleRepo;
    return repo.findOne({ where: { userId, articleId }, relations: ['article'] });
  }

  // Admin listing uses declared user and article relations.
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
