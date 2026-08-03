import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { validate as uuidValidate } from 'uuid';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { QueryUserDto } from '../dto/query-user.dto';
import { User } from '../entities/user.entity';

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

  async findAll(query: QueryUserDto): Promise<PaginatedResponseDto<User>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.userRepo.createQueryBuilder('user');
    if (query.includeDeleted) {
      qb.withDeleted();
    }
    if (query.email) {
      qb.andWhere('user.email ILIKE :email', { email: `%${query.email}%` });
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
}
