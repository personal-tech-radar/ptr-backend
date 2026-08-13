import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { validate as uuidValidate } from 'uuid';
import { LoggingService } from '../../common/logging/logging.service';
import { FeedCacheInvalidationService } from '../../feed/services/feed-cache-invalidation.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { User } from '../entities/user.entity';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
  timezone: string | null;
  emailVerifiedAt?: Date | null;
  onboardingCompletedAt?: Date | null;
}

@Injectable()
export class UserCommandService {
  private readonly logger = new LoggingService(UserCommandService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly feedCacheInvalidationService: FeedCacheInvalidationService,
  ) {}

  async create(input: CreateUserInput): Promise<User> {
    const existing = await this.userRepo.findOne({ where: { email: input.email } });
    if (existing) {
      throw new ConflictException(`A user with email ${input.email} already exists`);
    }

    const user = this.userRepo.create({
      email: input.email,
      passwordHash: input.passwordHash,
      displayName: input.displayName,
      timezone: input.timezone,
      emailVerifiedAt: input.emailVerifiedAt ?? null,
      onboardingCompletedAt: input.onboardingCompletedAt ?? null,
    });

    const saved = await this.userRepo.save(user);
    this.logger.info('User created', { id: saved.id });
    return saved;
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<User> {
    const user = await this.getOrFail(id);

    const feedAffectingChange =
      (dto.timezone !== undefined && dto.timezone !== user.timezone) ||
      (dto.level !== undefined && dto.level !== user.level);
    const profileChanged =
      (dto.displayName !== undefined && dto.displayName !== user.displayName) ||
      (dto.timezone !== undefined && dto.timezone !== user.timezone) ||
      (dto.githubUrl !== undefined && dto.githubUrl !== user.githubUrl) ||
      (dto.level !== undefined && dto.level !== user.level) ||
      (dto.dailyDigestEnabled !== undefined &&
        dto.dailyDigestEnabled !== user.dailyDigestEnabled) ||
      (dto.weeklyDigestEnabled !== undefined &&
        dto.weeklyDigestEnabled !== user.weeklyDigestEnabled);

    if (!profileChanged) {
      return user;
    }

    if (dto.displayName !== undefined) user.displayName = dto.displayName;
    if (dto.timezone !== undefined) user.timezone = dto.timezone;
    if (dto.githubUrl !== undefined) user.githubUrl = dto.githubUrl;
    if (dto.level !== undefined) user.level = dto.level;
    if (dto.dailyDigestEnabled !== undefined) {
      user.dailyDigestEnabled = dto.dailyDigestEnabled;
    }
    if (dto.weeklyDigestEnabled !== undefined) {
      user.weeklyDigestEnabled = dto.weeklyDigestEnabled;
    }

    const saved = await this.userRepo.save(user);
    this.logger.info('User profile updated', { id: saved.id });

    if (feedAffectingChange) {
      await this.feedCacheInvalidationService.invalidateForUser(id);
    }

    return saved;
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<User> {
    const user = await this.getOrFail(id);
    user.passwordHash = passwordHash;

    const saved = await this.userRepo.save(user);
    this.logger.info('User password updated', { id: saved.id });
    return saved;
  }

  async markEmailVerified(id: string): Promise<User> {
    const user = await this.getOrFail(id);
    user.emailVerifiedAt = new Date();

    const saved = await this.userRepo.save(user);
    this.logger.info('User email verified', { id: saved.id });
    return saved;
  }

  async softDelete(id: string): Promise<void> {
    if (!uuidValidate(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }

    const result = await this.userRepo.softDelete(id);
    if (!result.affected) {
      throw new NotFoundException(`User ${id} not found`);
    }

    this.logger.info('User soft-deleted', { id });
  }

  private async getOrFail(id: string): Promise<User> {
    if (!uuidValidate(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }

    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }
}
