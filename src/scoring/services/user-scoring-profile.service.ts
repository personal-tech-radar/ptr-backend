import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  ArticleFeedback,
  ArticleFeedbackType,
} from '../../articles/entities/article-feedback.entity';
import { LoggingService } from '../../common/logging/logging.service';
import { UserSourcePreferenceService } from '../../sources/services/user-source-preference.service';
import { ContentStreamQueryService } from '../../taxonomy/services/content-stream-query.service';
import { TechnologyInterestQueryService } from '../../taxonomy/services/technology-interest-query.service';
import { UserQueryService } from '../../users/services/user-query.service';
import { ScoringProfile } from '../scoring.types';

@Injectable()
export class UserScoringProfileService {
  private readonly logger = new LoggingService(UserScoringProfileService.name);

  constructor(
    @InjectRepository(ArticleFeedback)
    private readonly articleFeedbackRepo: Repository<ArticleFeedback>,
    private readonly technologyInterestQueryService: TechnologyInterestQueryService,
    private readonly contentStreamQueryService: ContentStreamQueryService,
    private readonly userSourcePreferenceService: UserSourcePreferenceService,
    private readonly userQueryService: UserQueryService,
  ) {}

  async buildProfile(
    userId: string,
    candidateSourceIds: string[],
    candidateArticleIds: string[],
  ): Promise<ScoringProfile> {
    const [
      technologyInterests,
      contentStreams,
      user,
      sourcePreferenceAdjustments,
      articleFeedback,
    ] = await Promise.all([
      this.technologyInterestQueryService.findSelectedByUser(userId),
      this.contentStreamQueryService.findSelectedByUser(userId),
      this.userQueryService.findById(userId),
      this.userSourcePreferenceService.getAdjustmentsForSources(userId, candidateSourceIds),
      this.getArticleFeedback(userId, candidateArticleIds),
    ]);

    this.logger.info('Built user scoring profile', {
      userId,
      technologyInterestCount: technologyInterests.length,
      contentStreamCount: contentStreams.length,
    });

    return {
      technologyInterestIds: technologyInterests.map((ti) => ti.id),
      contentStreamIds: contentStreams.map((cs) => cs.id),
      level: user.level,
      sourcePreferenceAdjustments,
      articleFeedback,
    };
  }

  private async getArticleFeedback(
    userId: string,
    candidateArticleIds: string[],
  ): Promise<Map<string, ArticleFeedbackType>> {
    if (candidateArticleIds.length === 0) return new Map();

    const feedback = await this.articleFeedbackRepo.find({
      where: { userId, articleId: In(candidateArticleIds) },
    });

    return new Map(feedback.map((f) => [f.articleId, f.type]));
  }
}
