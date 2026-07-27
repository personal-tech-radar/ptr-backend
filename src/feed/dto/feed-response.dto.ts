import { ApiProperty } from '@nestjs/swagger';
import { FeedDayGroupDto } from './feed-day-group.dto';

export class FeedResponseDto {
  @ApiProperty({
    description:
      'One group per day in the requested range (most recent first), including days with zero ' +
      'matching articles as an empty group — so a client can render the full calendar range ' +
      'without recomputing it from beforeDate/days itself.',
    type: [FeedDayGroupDto],
  })
  days: FeedDayGroupDto[];
}
