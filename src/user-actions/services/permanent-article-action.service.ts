import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ArticleFeedbackType } from '../../articles/entities/article-feedback.entity';
import { ArticleFeedbackService } from '../../articles/services/article-feedback.service';
import {
  PermanentArticleAction,
  PermanentArticleActionType,
} from '../entities/permanent-article-action.entity';
import { SavedArticleService } from './saved-article.service';

@Injectable()
export class PermanentArticleActionService {
  constructor(
    @InjectRepository(PermanentArticleAction)
    private readonly actionRepo: Repository<PermanentArticleAction>,
    private readonly savedArticleService: SavedArticleService,
    private readonly feedbackService: ArticleFeedbackService,
  ) {}

  async findOrCreateBatch(
    userId: string,
    articleIds: string[],
  ): Promise<Map<string, Record<PermanentArticleActionType, string>>> {
    const ids = [...new Set(articleIds)];
    const existing = await this.actionRepo.find({ where: { userId, articleId: In(ids) } });
    const required = ids.flatMap((articleId) =>
      Object.values(PermanentArticleActionType).map((type) => ({ articleId, type })),
    );
    const existingKeys = new Set(existing.map((action) => `${action.articleId}:${action.type}`));
    const missing = required.filter((item) => !existingKeys.has(`${item.articleId}:${item.type}`));
    if (missing.length > 0) {
      try {
        await this.actionRepo.save(
          missing.map((item) => this.actionRepo.create({ userId, ...item })),
        );
      } catch {
        // A concurrent generator may have created the same permanent rows.
      }
    }
    const all = await this.actionRepo.find({ where: { userId, articleId: In(ids) } });
    const result = new Map<string, Record<PermanentArticleActionType, string>>();
    for (const articleId of ids) {
      result.set(articleId, {} as Record<PermanentArticleActionType, string>);
    }
    for (const action of all) result.get(action.articleId)![action.type] = action.id;
    return result;
  }

  buildUrl(id: string): string {
    return `${(process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')}/email-action/${id}`;
  }

  async execute(id: string): Promise<PermanentArticleActionType> {
    const action = await this.actionRepo.findOne({ where: { id } });
    if (!action) throw new NotFoundException('Email action not found');
    if (action.type === PermanentArticleActionType.SAVE) {
      await this.savedArticleService.create(action.userId, action.articleId);
    } else {
      await this.feedbackService.upsertFeedback(
        action.articleId,
        action.type === PermanentArticleActionType.USEFUL
          ? ArticleFeedbackType.USEFUL
          : ArticleFeedbackType.NOT_USEFUL,
        action.userId,
      );
    }
    action.lastUsedAt = new Date();
    await this.actionRepo.save(action);
    return action.type;
  }
}
