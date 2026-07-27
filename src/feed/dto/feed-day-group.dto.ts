import { ApiProperty } from '@nestjs/swagger';
import { FeedArticleItemDto } from './feed-article-item.dto';

export class FeedDayGroupDto {
  @ApiProperty({
    description: 'Local calendar date (user timezone), YYYY-MM-DD',
    example: '2026-07-24',
  })
  date: string;

  @ApiProperty({
    description: 'Articles for this day, ranked by score descending, capped per the feed algorithm',
    type: [FeedArticleItemDto],
  })
  articles: FeedArticleItemDto[];
}
