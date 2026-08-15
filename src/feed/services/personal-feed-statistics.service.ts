import { Injectable } from '@nestjs/common';
import { PipelineStatisticsDto } from '../../public-feed/dto/pipeline-statistics.dto';
import { PublicFeedStatisticsService } from '../../public-feed/services/public-feed-statistics.service';
import { QueryFeedDto } from '../dto/query-feed.dto';
import { FeedQueryService } from './feed-query.service';

@Injectable()
export class PersonalFeedStatisticsService {
  constructor(
    private readonly feedQueryService: FeedQueryService,
    private readonly publicFeedStatisticsService: PublicFeedStatisticsService,
  ) {}

  async get(userId: string, query: QueryFeedDto = {}): Promise<PipelineStatisticsDto> {
    const feed = await this.feedQueryService.getFeed(userId, query);
    const selectedForRadar = feed.days.reduce((total, day) => total + day.articles.length, 0);
    return this.publicFeedStatisticsService.get(selectedForRadar);
  }
}
