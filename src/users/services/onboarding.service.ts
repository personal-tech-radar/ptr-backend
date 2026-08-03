import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { validate as uuidValidate } from 'uuid';
import { LoggingService } from '../../common/logging/logging.service';
import { FeedCacheInvalidationService } from '../../feed/services/feed-cache-invalidation.service';
import { toContentStreamResponseDto } from '../../taxonomy/dto/content-stream-response.dto';
import { toTechnologyInterestResponseDto } from '../../taxonomy/dto/technology-interest-response.dto';
import { ContentStreamCommandService } from '../../taxonomy/services/content-stream-command.service';
import { ContentStreamQueryService } from '../../taxonomy/services/content-stream-query.service';
import { TechnologyInterestCommandService } from '../../taxonomy/services/technology-interest-command.service';
import { TechnologyInterestQueryService } from '../../taxonomy/services/technology-interest-query.service';
import { TechnologyInterestKind } from '../../taxonomy/entities/technology-interest.entity';
import { OnboardingDto } from '../dto/onboarding.dto';
import { UserTaxonomyResponseDto } from '../dto/user-taxonomy-response.dto';
import { User } from '../entities/user.entity';

@Injectable()
export class OnboardingService {
  private readonly logger = new LoggingService(OnboardingService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly technologyInterestCommandService: TechnologyInterestCommandService,
    private readonly technologyInterestQueryService: TechnologyInterestQueryService,
    private readonly contentStreamQueryService: ContentStreamQueryService,
    private readonly contentStreamCommandService: ContentStreamCommandService,
    private readonly feedCacheInvalidationService: FeedCacheInvalidationService,
  ) {}

  // Safely re-callable: doubles as "change my selections later", no separate endpoint needed.
  // Each relationship command retains its established transactional boundary. Effective sets
  // are compared before replacement so identical requests avoid writes and cache invalidation.
  async completeOnboarding(userId: string, dto: OnboardingDto): Promise<User> {
    const user = await this.getUserOrFail(userId);
    const [currentTechnologyInterests, currentContentStreams] = await Promise.all([
      this.technologyInterestQueryService.findSelectedByUser(userId),
      this.contentStreamQueryService.findSelectedByUser(userId),
    ]);

    const technologyCount = dto.technologyInterests.filter(
      (selection) => selection.kind === TechnologyInterestKind.TECHNOLOGY,
    ).length;
    const interestCount = dto.technologyInterests.filter(
      (selection) => selection.kind === TechnologyInterestKind.INTEREST,
    ).length;
    if (technologyCount > 5) {
      throw new BadRequestException('An ordinary user may select at most five technologies');
    }
    if (interestCount > 5) {
      throw new BadRequestException('An ordinary user may select at most five interests');
    }

    // (a) validate content stream selections reference existing, enabled streams FIRST — before
    // any technology/interest resolution or creation, so a request that's going to be rejected
    // outright never has the side effect of creating a technology-interest row along the way.
    const contentStreams = await this.contentStreamQueryService.findByIds(dto.contentStreamIds);
    const foundIds = new Set(contentStreams.map((cs) => cs.id));
    const missingIds = dto.contentStreamIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      throw new BadRequestException(`Unknown content stream id(s): ${missingIds.join(', ')}`);
    }
    const disabledIds = contentStreams.filter((cs) => !cs.enabled).map((cs) => cs.id);
    if (disabledIds.length > 0) {
      throw new BadRequestException(`Disabled content stream id(s): ${disabledIds.join(', ')}`);
    }

    // (b) resolve/create + link each technology/interest selection
    const selectedTechnologyInterestIds: string[] = [];
    for (const selection of dto.technologyInterests) {
      const selected = await this.technologyInterestCommandService.createOrReuse(
        userId,
        selection.kind,
        selection.name,
      );
      selectedTechnologyInterestIds.push(selected.id);
    }
    const taxonomyChanged = !sameSet(
      currentTechnologyInterests.map((item) => item.id),
      selectedTechnologyInterestIds,
    );
    const streamsChanged = !sameSet(
      currentContentStreams.map((stream) => stream.id),
      dto.contentStreamIds,
    );

    if (taxonomyChanged) {
      await this.technologyInterestCommandService.removeUnselected(
        userId,
        selectedTechnologyInterestIds,
      );
    }
    if (streamsChanged) {
      await this.contentStreamCommandService.linkUserSelections(userId, dto.contentStreamIds);
    }

    // (c) level/completion — only set onboardingCompletedAt if currently null (idempotent: a
    // re-call after completion updates level/selections but never un-sets the timestamp)
    const requestedGithubUrl = dto.githubUrl ?? null;
    const levelChanged = user.level !== dto.level;
    const timezoneChanged = user.timezone !== dto.timezone;
    const githubChanged = user.githubUrl !== requestedGithubUrl;
    const completionChanged = !user.onboardingCompletedAt;
    user.level = dto.level;
    user.timezone = dto.timezone;
    user.githubUrl = requestedGithubUrl;
    if (!user.onboardingCompletedAt) {
      user.onboardingCompletedAt = new Date();
    }
    const saved =
      levelChanged || timezoneChanged || githubChanged || completionChanged
        ? await this.userRepo.save(user)
        : user;

    // Covers 3 of the 6 feed-cache invalidation triggers in one call site (level, technology
    // interests, content streams all change together here) — see coder.md, no need to re-diff
    // which sub-selection actually changed.
    if (levelChanged || timezoneChanged || taxonomyChanged || streamsChanged || completionChanged) {
      await this.feedCacheInvalidationService.invalidateForUser(userId);
    }

    this.logger.info('User onboarding completed/updated', {
      userId,
      level: dto.level,
      technologyInterestCount: dto.technologyInterests.length,
      contentStreamCount: dto.contentStreamIds.length,
    });

    return saved;
  }

  async getUserTaxonomy(userId: string): Promise<UserTaxonomyResponseDto> {
    const user = await this.getUserOrFail(userId);

    const [technologyInterests, contentStreams] = await Promise.all([
      this.technologyInterestQueryService.findSelectedByUser(userId),
      this.contentStreamQueryService.findSelectedByUser(userId),
    ]);

    return {
      level: user.level,
      technologyInterests: technologyInterests.map(toTechnologyInterestResponseDto),
      contentStreams: contentStreams.map(toContentStreamResponseDto),
      onboardingCompletedAt: user.onboardingCompletedAt,
    };
  }

  private async getUserOrFail(id: string): Promise<User> {
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

function sameSet(left: string[], right: string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size && [...leftSet].every((value) => rightSet.has(value));
}
