import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { LoggingService } from '../../common/logging/logging.service';
import { ArticleFeedbackType } from '../../articles/entities/article-feedback.entity';
import { AdminQueryUserSourcePreferenceDto } from '../dto/admin-query-user-source-preference.dto';
import { UserSourcePreferenceResponseDto } from '../dto/user-source-preference-response.dto';
import { UserSourcePreference } from '../entities/user-source-preference.entity';

// Additive smoothing: 6 phantom neutral votes so early feedback doesn't swing the adjustment to the clamp.
const ADJUSTMENT_PRIOR = 6;
const ADJUSTMENT_SCALE = 12;
const ADJUSTMENT_CLAMP = 8;

@Injectable()
export class UserSourcePreferenceService {
  private readonly logger = new LoggingService(UserSourcePreferenceService.name);

  constructor(
    @InjectRepository(UserSourcePreference)
    private readonly preferenceRepo: Repository<UserSourcePreference>,
  ) {}

  async findOrCreate(userId: string, sourceId: string): Promise<UserSourcePreference> {
    const existing = await this.preferenceRepo.findOne({ where: { userId, sourceId } });
    if (existing) return existing;

    const created = await this.preferenceRepo.save(
      this.preferenceRepo.create({ userId, sourceId }),
    );
    this.logger.info('User source preference created', { userId, sourceId });
    return created;
  }

  // previousFeedbackType is the type being replaced (undefined/null on first-time feedback).
  // Only the delta between old and new type is applied, so a vote flip moves exactly one
  // count from one bucket to the other instead of incrementing both.
  async applyFeedback(
    userId: string,
    sourceId: string,
    feedbackType: ArticleFeedbackType,
    previousFeedbackType?: ArticleFeedbackType | null,
  ): Promise<UserSourcePreference> {
    const preference = await this.findOrCreate(userId, sourceId);

    if (!previousFeedbackType) {
      this.increment(preference, feedbackType);
    } else if (previousFeedbackType !== feedbackType) {
      this.decrement(preference, previousFeedbackType);
      this.increment(preference, feedbackType);
    }

    preference.feedbackAdjustment = this.computeAdjustment(
      preference.usefulCount,
      preference.notUsefulCount,
    );

    const saved = await this.preferenceRepo.save(preference);
    this.logger.info('User source preference updated from feedback', {
      userId,
      sourceId,
      usefulCount: saved.usefulCount,
      notUsefulCount: saved.notUsefulCount,
      feedbackAdjustment: saved.feedbackAdjustment,
    });
    return saved;
  }

  async getAdjustment(userId: string, sourceId: string): Promise<number> {
    const preference = await this.preferenceRepo.findOne({ where: { userId, sourceId } });
    return Number(preference?.feedbackAdjustment ?? 0);
  }

  async getAdjustmentsForSources(
    userId: string,
    sourceIds: string[],
  ): Promise<Map<string, number>> {
    const uniqueIds = [...new Set(sourceIds)].filter((id) => !!id);
    if (uniqueIds.length === 0) return new Map();

    const preferences = await this.preferenceRepo.find({
      where: { userId, sourceId: In(uniqueIds) },
    });

    return new Map(preferences.map((p) => [p.sourceId, Number(p.feedbackAdjustment)]));
  }

  // Flattened, admin-only listing across all users' source preferences. userId is a real FK to
  // User (see UserSourcePreference entity, MVP3 Phase 11) — the join is a declared relation, and
  // userEmail is guaranteed to resolve for every row.
  async findAllAdmin(
    query: AdminQueryUserSourcePreferenceDto,
  ): Promise<PaginatedResponseDto<UserSourcePreferenceResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.preferenceRepo
      .createQueryBuilder('pref')
      .innerJoinAndSelect('pref.source', 'source')
      .innerJoinAndSelect('pref.user', 'user');

    if (query.email) {
      qb.andWhere('user.email ILIKE :email', { email: `%${query.email}%` });
    }
    if (query.sourceId) {
      qb.andWhere('pref.sourceId = :sourceId', { sourceId: query.sourceId });
    }

    const total = await qb.clone().getCount();

    const entities = await qb
      .orderBy('pref.updatedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
    const data = entities.map((entity) => this.toResponseDto(entity));

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // One-off MVP3 Phase 11 data migration: retags every user_source_preferences row still holding
  // a legacy userId literal (fromUserId) to the new real per-user identity (toUserId). Idempotent
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
      result = await this.preferenceRepo.update({ userId: fromUserId }, { userId: toUserId });
    } catch (err) {
      if (err?.code === '22P02') {
        this.logger.info(
          'Skipped legacy user source preference retag — userId column is no longer varchar, legacy literal cannot match',
          { fromUserId, toUserId },
        );
        return 0;
      }
      throw err;
    }
    const affected = result.affected ?? 0;
    if (affected > 0) {
      this.logger.info('Retagged legacy user source preference rows to real user', {
        fromUserId,
        toUserId,
        affected,
      });
    }
    return affected;
  }

  private toResponseDto(entity: UserSourcePreference): UserSourcePreferenceResponseDto {
    return {
      id: entity.id,
      userId: entity.userId,
      userEmail: entity.user.email,
      sourceId: entity.sourceId,
      sourceName: entity.source.name,
      usefulCount: entity.usefulCount,
      notUsefulCount: entity.notUsefulCount,
      feedbackAdjustment: Number(entity.feedbackAdjustment),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private increment(preference: UserSourcePreference, type: ArticleFeedbackType): void {
    if (type === ArticleFeedbackType.USEFUL) {
      preference.usefulCount += 1;
    } else {
      preference.notUsefulCount += 1;
    }
  }

  private decrement(preference: UserSourcePreference, type: ArticleFeedbackType): void {
    if (type === ArticleFeedbackType.USEFUL) {
      preference.usefulCount = Math.max(0, preference.usefulCount - 1);
    } else {
      preference.notUsefulCount = Math.max(0, preference.notUsefulCount - 1);
    }
  }

  private computeAdjustment(usefulCount: number, notUsefulCount: number): number {
    const raw =
      ((usefulCount - notUsefulCount) / (usefulCount + notUsefulCount + ADJUSTMENT_PRIOR)) *
      ADJUSTMENT_SCALE;
    return Math.max(-ADJUSTMENT_CLAMP, Math.min(ADJUSTMENT_CLAMP, raw));
  }
}
