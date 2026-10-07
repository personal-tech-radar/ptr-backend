import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class UserAnalyticsQueryDto {
  @ApiPropertyOptional({ enum: ['24h', '7d', '30d'], default: '7d' })
  @IsOptional()
  @IsIn(['24h', '7d', '30d'])
  period: '24h' | '7d' | '30d' = '7d';
}
