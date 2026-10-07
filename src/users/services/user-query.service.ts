import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { validate as uuidValidate } from 'uuid';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { QueryUserDto } from '../dto/query-user.dto';
import { User } from '../entities/user.entity';
import { ADMIN_ACTIVITY_SQL, adminPeriod } from '../../common/util/admin-period.util';
import {
  PaginatedUserResponseDto,
  UserPeriodActivityDto,
  UserSelectedStreamDto,
  UserSelectedTaxonomyDto,
  toUserResponseDto,
} from '../dto/user-response.dto';
import { TechnologyInterestKind } from '../../taxonomy/entities/technology-interest.entity';

@Injectable()
export class UserQueryService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findById(id: string): Promise<User> {
    if (!uuidValidate(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }

    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email } });
  }

  // Unlike findByEmail, includes soft-deleted rows — used by AdminBootstrapService to detect
  // (and resurrect) a soft-deleted user occupying ADMIN_EMAIL instead of crashing on the
  // underlying plain (non-partial) unique constraint on email.
  async findByEmailIncludingDeleted(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email }, withDeleted: true });
  }

  // Backs DigestSweepService's per-15-minute cron sweep. Unpaginated by design — the sweep needs
  // the full eligible set to evaluate each user's own local send-time window, not a page of it.
  // emailVerifiedAt IS NOT NULL is a deliberate product-decision gate (MVP3 Phase 10, decision
  // #5) on top of the pre-existing onboarding/opt-in checks — a user must have verified their
  // email before receiving ANY digest.
  async findEligibleForDigestSweep(): Promise<User[]> {
    return this.userRepo
      .createQueryBuilder('user')
      .where('user.deletedAt IS NULL')
      .andWhere('user.onboardingCompletedAt IS NOT NULL')
      .andWhere('user.emailVerifiedAt IS NOT NULL')
      .andWhere('(user.dailyDigestEnabled = true OR user.weeklyDigestEnabled = true)')
      .getMany();
  }

  async findAll(query: QueryUserDto, now = new Date()): Promise<PaginatedResponseDto<User>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.userRepo.createQueryBuilder('user');
    if (query.includeDeleted) {
      qb.withDeleted();
    }
    if (query.email) {
      qb.andWhere('user.email ILIKE :email', { email: `%${query.email}%` });
    }
    if (query.registeredFrom)
      qb.andWhere('user.createdAt >= :registeredFrom', { registeredFrom: query.registeredFrom });
    if (query.registeredTo)
      qb.andWhere('user.createdAt < :registeredTo', { registeredTo: query.registeredTo });
    if (query.verified !== undefined) {
      qb.andWhere(
        query.verified ? 'user.emailVerifiedAt IS NOT NULL' : 'user.emailVerifiedAt IS NULL',
      );
    }
    if (query.onboardingCompleted !== undefined) {
      qb.andWhere(
        query.onboardingCompleted
          ? 'user.onboardingCompletedAt IS NOT NULL'
          : 'user.onboardingCompletedAt IS NULL',
      );
    }
    for (const [field, column, comparison] of [
      ['verifiedFrom', 'emailVerifiedAt', '>='],
      ['verifiedTo', 'emailVerifiedAt', '<'],
      ['onboardingFrom', 'onboardingCompletedAt', '>='],
      ['onboardingTo', 'onboardingCompletedAt', '<'],
    ] as const) {
      if (query[field])
        qb.andWhere(`user.${column} ${comparison} :${field}`, { [field]: query[field] });
    }
    if (query.activityPeriod || query.activityFrom || query.activityTo || query.eventType) {
      const period = adminPeriod(query.activityPeriod ?? '30d', now);
      const from = query.activityFrom ?? (query.activityPeriod ? period.from : new Date(0));
      const to = query.activityTo ?? period.to;
      qb.andWhere(
        `EXISTS (SELECT 1 FROM (${ADMIN_ACTIVITY_SQL}) activity JOIN articles a ON a.id=activity."articleId" AND a."deletedAt" IS NULL WHERE activity."userId"=user.id AND activity.at>=:activityFrom AND activity.at<:activityTo ${query.eventType ? 'AND activity.type=:eventType' : ''})`,
        { activityFrom: from, activityTo: to, eventType: query.eventType },
      );
    }

    const [data, total] = await qb
      .orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findAdminList(query: QueryUserDto): Promise<PaginatedUserResponseDto> {
    const now = new Date();
    const result = await this.findAll(query, now);
    const period = adminPeriod(query.activityPeriod ?? '7d', now);
    const activityWindow = {
      from: query.activityFrom
        ? new Date(query.activityFrom)
        : !query.activityPeriod && (query.activityTo || query.eventType)
          ? new Date(0)
          : period.from,
      to: query.activityTo ? new Date(query.activityTo) : period.to,
      semantics: period.semantics,
    };
    if (!result.data.length) return { ...result, activityWindow, data: [] };
    const ids = result.data.map((user) => user.id);
    type ActivityRow = Omit<UserPeriodActivityDto, 'active'> & { userId: string };
    type TaxonomyRow = UserSelectedTaxonomyDto & { userId: string };
    type StreamRow = UserSelectedStreamDto & { userId: string };
    const [activityRows, taxonomyRows, streamRows] = await Promise.all([
      this.userRepo.query<ActivityRow[]>(
        `WITH events AS (${ADMIN_ACTIVITY_SQL})
         SELECT events."userId",
                count(*)::int AS total,
                count(*) FILTER (WHERE events.type='open')::int AS opens,
                count(*) FILTER (WHERE events.type='save')::int AS saves,
                count(*) FILTER (WHERE events.type='useful')::int AS "usefulFeedback",
                count(*) FILTER (WHERE events.type='not_useful')::int AS "notUsefulFeedback"
         FROM events
         JOIN users user_record ON user_record.id=events."userId" AND user_record."deletedAt" IS NULL
         JOIN articles article ON article.id=events."articleId" AND article."deletedAt" IS NULL
         WHERE events."userId"=ANY($1::uuid[]) AND events.at >= $2 AND events.at < $3
         GROUP BY events."userId"`,
        [ids, activityWindow.from, activityWindow.to],
      ),
      this.userRepo.query<TaxonomyRow[]>(
        `SELECT selection."userId", taxonomy.id, taxonomy.name, taxonomy.kind
         FROM user_technology_interests selection
         JOIN technology_interests taxonomy ON taxonomy.id=selection."technologyInterestId"
           AND taxonomy."deletedAt" IS NULL
         WHERE selection."userId"=ANY($1::uuid[])
         ORDER BY taxonomy.name,taxonomy.id`,
        [ids],
      ),
      this.userRepo.query<StreamRow[]>(
        `SELECT selection."userId", stream.id, stream.key, stream.name
         FROM user_content_streams selection
         JOIN content_streams stream ON stream.id=selection."contentStreamId"
         WHERE selection."userId"=ANY($1::uuid[])
         ORDER BY stream."sortOrder",stream.id`,
        [ids],
      ),
    ]);
    const activityByUser = new Map(activityRows.map((row) => [row.userId, row]));
    const emptyActivity: UserPeriodActivityDto = {
      active: false,
      total: 0,
      opens: 0,
      saves: 0,
      usefulFeedback: 0,
      notUsefulFeedback: 0,
    };
    return {
      ...result,
      activityWindow,
      data: result.data.map((user) => {
        const row = activityByUser.get(user.id);
        const selectedTaxonomy = taxonomyRows.filter((selection) => selection.userId === user.id);
        return {
          ...toUserResponseDto(user),
          periodActivity: row
            ? {
                active: row.total > 0,
                total: row.total,
                opens: row.opens,
                saves: row.saves,
                usefulFeedback: row.usefulFeedback,
                notUsefulFeedback: row.notUsefulFeedback,
              }
            : { ...emptyActivity },
          selectedTechnologies: selectedTaxonomy
            .filter((selection) => selection.kind === TechnologyInterestKind.TECHNOLOGY)
            .map(({ id, name, kind }) => ({ id, name, kind })),
          selectedInterests: selectedTaxonomy
            .filter((selection) => selection.kind === TechnologyInterestKind.INTEREST)
            .map(({ id, name, kind }) => ({ id, name, kind })),
          selectedStreams: streamRows
            .filter((selection) => selection.userId === user.id)
            .map(({ id, key, name }) => ({ id, key, name })),
        };
      }),
    };
  }
}
