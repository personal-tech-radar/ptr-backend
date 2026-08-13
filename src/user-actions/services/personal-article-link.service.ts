import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { validate as uuidValidate } from 'uuid';
import { Article } from '../../articles/entities/article.entity';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { LoggingService } from '../../common/logging/logging.service';
import { AdminOpensResponseDto } from '../dto/admin-opens-response.dto';
import { AdminQueryOpensDto } from '../dto/admin-query-opens.dto';
import {
  PersonalArticleLink,
  PersonalArticleLinkContext,
} from '../entities/personal-article-link.entity';
import { UserSourcePreferenceService } from '../../sources/services/user-source-preference.service';
import { UserArticleOpening } from '../entities/user-article-opening.entity';

@Injectable()
export class PersonalArticleLinkService {
  private readonly logger = new LoggingService(PersonalArticleLinkService.name);

  constructor(
    @InjectRepository(PersonalArticleLink)
    private readonly linkRepo: Repository<PersonalArticleLink>,
    @InjectRepository(UserArticleOpening)
    private readonly openingRepo: Repository<UserArticleOpening>,
    @InjectRepository(Article)
    private readonly articleRepo: Repository<Article>,
    private readonly dataSource: DataSource,
    private readonly userSourcePreferenceService: UserSourcePreferenceService,
  ) {}

  // Reuse the permanent link for each user, article, and context.
  async findOrCreateLink(
    userId: string,
    articleId: string,
    context: PersonalArticleLinkContext,
  ): Promise<PersonalArticleLink> {
    const existing = await this.linkRepo.findOne({ where: { userId, articleId, context } });
    if (existing) {
      return existing;
    }

    try {
      const created = await this.linkRepo.save(
        this.linkRepo.create({ userId, articleId, context, digestId: null, originalUrl: null }),
      );
      this.logger.info('Personal article link created', { userId, articleId, context });
      return created;
    } catch (error) {
      // Concurrent race on the (userId, articleId, context) unique constraint.
      const existingAfterRace = await this.linkRepo.findOne({
        where: { userId, articleId, context },
      });
      if (existingAfterRace) {
        return existingAfterRace;
      }
      throw error;
    }
  }

  // Batch-create missing permanent links and return a complete article map.
  async findOrCreateLinksBatch(
    userId: string,
    articleIds: string[],
    context: PersonalArticleLinkContext,
  ): Promise<Map<string, string>> {
    const uniqueArticleIds = [...new Set(articleIds)];
    if (uniqueArticleIds.length === 0) return new Map();

    const existing = await this.linkRepo.find({
      where: { userId, articleId: In(uniqueArticleIds), context },
    });
    const result = new Map<string, string>(existing.map((link) => [link.articleId, link.id]));

    const missingIds = uniqueArticleIds.filter((id) => !result.has(id));
    if (missingIds.length === 0) return result;

    try {
      const created = await this.linkRepo.save(
        missingIds.map((articleId) =>
          this.linkRepo.create({ userId, articleId, context, digestId: null, originalUrl: null }),
        ),
      );
      for (const link of created) {
        result.set(link.articleId, link.id);
      }
      this.logger.info('Personal article links batch-created', {
        userId,
        context,
        createdCount: created.length,
      });
    } catch {
      // Recover links created concurrently before retrying individual misses.
      const refetched = await this.linkRepo.find({
        where: { userId, articleId: In(missingIds), context },
      });
      for (const link of refetched) {
        result.set(link.articleId, link.id);
      }

      const stillMissing = missingIds.filter((id) => !result.has(id));
      for (const articleId of stillMissing) {
        const link = await this.findOrCreateLink(userId, articleId, context);
        result.set(articleId, link.id);
      }
    }

    return result;
  }

  // Persist opening effects once under a row lock.
  async resolveAndRecordOpen(linkId: string): Promise<{ article: Article }> {
    if (!uuidValidate(linkId)) {
      throw new NotFoundException(`Personal article link ${linkId} not found`);
    }

    const link = await this.linkRepo.findOne({ where: { id: linkId }, relations: ['article'] });
    if (!link) {
      throw new NotFoundException(`Personal article link ${linkId} not found`);
    }

    if (!link.firstOpenedAt) {
      await this.dataSource.transaction(async (manager) => {
        const linkRepo = manager.getRepository(PersonalArticleLink);
        const openingRepo = manager.getRepository(UserArticleOpening);
        const locked = await linkRepo.findOne({
          where: { id: linkId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!locked || locked.firstOpenedAt) return;
        const insert = await openingRepo
          .createQueryBuilder()
          .insert()
          .values({ userId: locked.userId, articleId: locked.articleId })
          .orIgnore()
          .execute();
        if ((insert.identifiers?.length ?? 0) === 0) return;
        locked.firstOpenedAt = new Date();
        await linkRepo.save(locked);
        await manager
          .getRepository(Article)
          .increment({ id: locked.articleId }, 'personalTrackedOpenCount', 1);
        await this.userSourcePreferenceService.applySignal(
          locked.userId,
          link.article.sourceId,
          'opened',
          manager,
        );
      });
      this.logger.info('Personal article link first opened', { linkId });
    }

    return { article: link.article };
  }

  // Admin listing uses declared user and article relations.
  async findAllAdmin(
    query: AdminQueryOpensDto,
  ): Promise<PaginatedResponseDto<AdminOpensResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.linkRepo
      .createQueryBuilder('link')
      .innerJoinAndSelect('link.user', 'user')
      .innerJoinAndSelect('link.article', 'article');

    if (query.email) {
      qb.andWhere('user.email ILIKE :email', { email: `%${query.email}%` });
    }
    if (query.context) {
      qb.andWhere('link.context = :context', { context: query.context });
    }
    if (query.opened === true) {
      qb.andWhere('link.firstOpenedAt IS NOT NULL');
    } else if (query.opened === false) {
      qb.andWhere('link.firstOpenedAt IS NULL');
    }

    const [rows, total] = await qb
      .orderBy('link.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: rows.map((row) => this.toAdminResponseDto(row)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private toAdminResponseDto(entity: PersonalArticleLink): AdminOpensResponseDto {
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
      context: entity.context,
      opened: entity.firstOpenedAt !== null,
      firstOpenedAt: entity.firstOpenedAt,
      createdAt: entity.createdAt,
    };
  }
}
