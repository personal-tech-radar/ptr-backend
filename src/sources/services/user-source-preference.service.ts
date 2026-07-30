import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { LoggingService } from '../../common/logging/logging.service';
import { ArticleFeedbackType } from '../../articles/entities/article-feedback.entity';
import { User } from '../../users/entities/user.entity';
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

  // Flattened, admin-only listing across all users' source preferences. userId has no real FK to
  // User (see UserSourcePreference entity) — every existing row today carries the legacy
  // DEFAULT_USER_ID literal, not a real user id — so the join to User is a best-effort id cast
  // rather than a declared relation, and userEmail is expected to be null until Phase 11.
  async findAllAdmin(
    query: AdminQueryUserSourcePreferenceDto,
  ): Promise<PaginatedResponseDto<UserSourcePreferenceResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.preferenceRepo
      .createQueryBuilder('pref')
      .innerJoinAndSelect('pref.source', 'source')
      .leftJoin(User, 'user', 'user.id::text = pref.userId')
      .addSelect(['user.email']);

    if (query.email) {
      qb.andWhere('user.email ILIKE :email', { email: `%${query.email}%` });
    }
    if (query.sourceId) {
      qb.andWhere('pref.sourceId = :sourceId', { sourceId: query.sourceId });
    }

    const total = await qb.clone().getCount();

    const { entities, raw } = await qb
      .orderBy('pref.updatedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getRawAndEntities();

    const data = entities.map((entity, index) =>
      this.toResponseDto(entity, raw[index] as { user_email?: string | null }),
    );

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private toResponseDto(
    entity: UserSourcePreference,
    raw: { user_email?: string | null },
  ): UserSourcePreferenceResponseDto {
    return {
      id: entity.id,
      userId: entity.userId,
      userEmail: raw.user_email ?? null,
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
