import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository, UpdateResult } from 'typeorm';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { LoggingService } from '../../common/logging/logging.service';
import { ArticleFeedbackType } from '../../articles/entities/article-feedback.entity';
import { AdminQueryUserSourcePreferenceDto } from '../dto/admin-query-user-source-preference.dto';
import { UserSourcePreferenceResponseDto } from '../dto/user-source-preference-response.dto';
import { UserSourcePreference } from '../entities/user-source-preference.entity';
import { Source } from '../entities/source.entity';

// Additive smoothing: 6 phantom neutral votes so early feedback doesn't swing the adjustment to the clamp.
const ADJUSTMENT_PRIOR = 6;
const ADJUSTMENT_SCALE = 12;
const ADJUSTMENT_CLAMP = 8;
const SIGNAL_WEIGHTS = { useful: 4, notUseful: -4, saved: 2, opened: 1 } as const;

@Injectable()
export class UserSourcePreferenceService {
  private readonly logger = new LoggingService(UserSourcePreferenceService.name);

  constructor(
    @InjectRepository(UserSourcePreference)
    private readonly preferenceRepo: Repository<UserSourcePreference>,
    @InjectRepository(Source)
    private readonly sourceRepo: Repository<Source>,
  ) {}

  async findOrCreate(
    userId: string,
    sourceId: string,
    manager?: EntityManager,
  ): Promise<UserSourcePreference> {
    const repo = manager?.getRepository(UserSourcePreference) ?? this.preferenceRepo;
    const existing = await repo.findOne({
      where: { userId, sourceId },
      ...(manager ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (existing) return existing;

    const created = await repo.save(repo.create({ userId, sourceId }));
    this.logger.info('User source preference created', { userId, sourceId });
    return created;
  }

  // Apply only the delta when feedback replaces a previous value.
  async applyFeedback(
    userId: string,
    sourceId: string,
    feedbackType: ArticleFeedbackType,
    previousFeedbackType?: ArticleFeedbackType | null,
    manager?: EntityManager,
  ): Promise<UserSourcePreference> {
    const repo = manager?.getRepository(UserSourcePreference) ?? this.preferenceRepo;
    const preference = await this.findOrCreate(userId, sourceId, manager);

    if (!previousFeedbackType) {
      this.increment(preference, feedbackType);
    } else if (previousFeedbackType !== feedbackType) {
      this.decrement(preference, previousFeedbackType);
      this.increment(preference, feedbackType);
    }

    preference.feedbackAdjustment = this.computeAdjustment(preference);

    const saved = await repo.save(preference);
    await this.applyGlobalFeedback(sourceId, feedbackType, previousFeedbackType, manager);
    this.logger.info('User source preference updated from feedback', {
      userId,
      sourceId,
      usefulCount: saved.usefulCount,
      notUsefulCount: saved.notUsefulCount,
      feedbackAdjustment: saved.feedbackAdjustment,
    });
    return saved;
  }

  async applySignal(
    userId: string,
    sourceId: string,
    signal: 'saved' | 'opened',
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager?.getRepository(UserSourcePreference) ?? this.preferenceRepo;
    const preference = await this.findOrCreate(userId, sourceId, manager);
    if (signal === 'saved') preference.savedCount += 1;
    else preference.openedCount += 1;
    preference.feedbackAdjustment = this.computeAdjustment(preference);
    await repo.save(preference);
    await this.updateGlobalSignal(sourceId, signal, 1, manager);
  }

  async removeSignal(
    userId: string,
    sourceId: string,
    signal: 'saved' | 'opened',
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager?.getRepository(UserSourcePreference) ?? this.preferenceRepo;
    const preference = await this.findOrCreate(userId, sourceId, manager);
    if (signal === 'saved') preference.savedCount = Math.max(0, preference.savedCount - 1);
    else preference.openedCount = Math.max(0, preference.openedCount - 1);
    preference.feedbackAdjustment = this.computeAdjustment(preference);
    await repo.save(preference);
    await this.updateGlobalSignal(sourceId, signal, -1, manager);
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

  // Admin listing uses declared source and user relations.
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

  // Retag legacy preferences before the userId column becomes a UUID foreign key.
  async retagLegacyUser(fromUserId: string, toUserId: string): Promise<number> {
    let result: UpdateResult;
    try {
      result = await this.preferenceRepo.update({ userId: fromUserId }, { userId: toUserId });
    } catch (err: unknown) {
      if (this.hasErrorCode(err, '22P02')) {
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

  private hasErrorCode(error: unknown, code: string): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
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
      savedCount: entity.savedCount,
      openedCount: entity.openedCount,
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

  private computeAdjustment(preference: UserSourcePreference): number {
    const weighted =
      (preference.usefulCount ?? 0) * SIGNAL_WEIGHTS.useful +
      (preference.notUsefulCount ?? 0) * SIGNAL_WEIGHTS.notUseful +
      (preference.savedCount ?? 0) * SIGNAL_WEIGHTS.saved +
      (preference.openedCount ?? 0) * SIGNAL_WEIGHTS.opened;
    const magnitude =
      (preference.usefulCount ?? 0) * Math.abs(SIGNAL_WEIGHTS.useful) +
      (preference.notUsefulCount ?? 0) * Math.abs(SIGNAL_WEIGHTS.notUseful) +
      (preference.savedCount ?? 0) * SIGNAL_WEIGHTS.saved +
      (preference.openedCount ?? 0) * SIGNAL_WEIGHTS.opened;
    const raw = (weighted / (magnitude + ADJUSTMENT_PRIOR)) * ADJUSTMENT_SCALE;
    return Math.max(-ADJUSTMENT_CLAMP, Math.min(ADJUSTMENT_CLAMP, raw));
  }

  private async applyGlobalFeedback(
    sourceId: string,
    current: ArticleFeedbackType,
    previous?: ArticleFeedbackType | null,
    manager?: EntityManager,
  ): Promise<void> {
    if (previous === current) return;
    if (previous) {
      await this.updateGlobalSignal(
        sourceId,
        previous === ArticleFeedbackType.USEFUL ? 'useful' : 'notUseful',
        -1,
        manager,
      );
    }
    await this.updateGlobalSignal(
      sourceId,
      current === ArticleFeedbackType.USEFUL ? 'useful' : 'notUseful',
      1,
      manager,
    );
  }

  private async updateGlobalSignal(
    sourceId: string,
    signal: 'useful' | 'notUseful' | 'saved' | 'opened',
    delta: number,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager?.getRepository(Source) ?? this.sourceRepo;
    const source = await repo.findOne({
      where: { id: sourceId },
      ...(manager ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!source) return;
    const field = {
      useful: 'globalUsefulCount',
      notUseful: 'globalNotUsefulCount',
      saved: 'globalSavedCount',
      opened: 'globalOpenedCount',
    }[signal] as
      | 'globalUsefulCount'
      | 'globalNotUsefulCount'
      | 'globalSavedCount'
      | 'globalOpenedCount';
    source[field] = Math.max(0, source[field] + delta);
    const weighted =
      source.globalUsefulCount * SIGNAL_WEIGHTS.useful +
      source.globalNotUsefulCount * SIGNAL_WEIGHTS.notUseful +
      source.globalSavedCount * SIGNAL_WEIGHTS.saved +
      source.globalOpenedCount * SIGNAL_WEIGHTS.opened;
    const magnitude =
      source.globalUsefulCount * 4 +
      source.globalNotUsefulCount * 4 +
      source.globalSavedCount * 2 +
      source.globalOpenedCount;
    source.globalInteractionScore =
      Math.round((weighted / (magnitude + ADJUSTMENT_PRIOR)) * 10_000) / 100;
    await repo.save(source);
  }
}
