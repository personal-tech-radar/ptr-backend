import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { validate as uuidValidate } from 'uuid';
import { Article } from '../../articles/entities/article.entity';
import { LoggingService } from '../../common/logging/logging.service';
import {
  PersonalArticleLink,
  PersonalArticleLinkContext,
} from '../entities/personal-article-link.entity';

@Injectable()
export class PersonalArticleLinkService {
  private readonly logger = new LoggingService(PersonalArticleLinkService.name);

  constructor(
    @InjectRepository(PersonalArticleLink)
    private readonly linkRepo: Repository<PersonalArticleLink>,
  ) {}

  // Always returns the same row/id for a given (userId, articleId, context) triple — this is a
  // permanent link, not minted fresh on every call.
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
        this.linkRepo.create({ userId, articleId, context }),
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

  // Idempotent first-open tracking: only the first resolve sets firstOpenedAt. A benign race
  // between near-simultaneous first opens is acceptable — no locking, no counter, no new row.
  async resolveAndRecordOpen(linkId: string): Promise<{ article: Article }> {
    if (!uuidValidate(linkId)) {
      throw new NotFoundException(`Personal article link ${linkId} not found`);
    }

    const link = await this.linkRepo.findOne({ where: { id: linkId }, relations: ['article'] });
    if (!link) {
      throw new NotFoundException(`Personal article link ${linkId} not found`);
    }

    if (!link.firstOpenedAt) {
      link.firstOpenedAt = new Date();
      await this.linkRepo.save(link);
      this.logger.info('Personal article link first opened', { linkId });
    }

    return { article: link.article };
  }
}
