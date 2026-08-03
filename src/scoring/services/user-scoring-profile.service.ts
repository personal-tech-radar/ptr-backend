import { Injectable } from '@nestjs/common';
import { LoggingService } from '../../common/logging/logging.service';
import { UserSourcePreferenceService } from '../../sources/services/user-source-preference.service';
import { ContentStreamQueryService } from '../../taxonomy/services/content-stream-query.service';
import { TechnologyInterestQueryService } from '../../taxonomy/services/technology-interest-query.service';
import { TechnologyInterestKind } from '../../taxonomy/entities/technology-interest.entity';
import { UserQueryService } from '../../users/services/user-query.service';
import { ScoringProfile } from '../scoring.types';

@Injectable()
export class UserScoringProfileService {
  private readonly logger = new LoggingService(UserScoringProfileService.name);

  constructor(
    private readonly technologyInterestQueryService: TechnologyInterestQueryService,
    private readonly contentStreamQueryService: ContentStreamQueryService,
    private readonly userSourcePreferenceService: UserSourcePreferenceService,
    private readonly userQueryService: UserQueryService,
  ) {}

  async buildProfile(userId: string, candidateSourceIds: string[]): Promise<ScoringProfile> {
    const [technologyInterests, contentStreams, user, sourcePreferenceAdjustments] =
      await Promise.all([
        this.technologyInterestQueryService.findSelectedByUser(userId),
        this.contentStreamQueryService.findSelectedByUser(userId),
        this.userQueryService.findById(userId),
        this.userSourcePreferenceService.getAdjustmentsForSources(userId, candidateSourceIds),
      ]);

    this.logger.info('Built user scoring profile', {
      userId,
      technologyInterestCount: technologyInterests.length,
      contentStreamCount: contentStreams.length,
    });

    return {
      technologyInterestIds: technologyInterests.map((ti) => ti.id),
      technologyIds: technologyInterests
        .filter((ti) => ti.kind === TechnologyInterestKind.TECHNOLOGY)
        .map((ti) => ti.id),
      interestIds: technologyInterests
        .filter((ti) => ti.kind === TechnologyInterestKind.INTEREST)
        .map((ti) => ti.id),
      contentStreamIds: contentStreams.map((cs) => cs.id),
      level: user.level,
      sourcePreferenceAdjustments,
    };
  }
}
