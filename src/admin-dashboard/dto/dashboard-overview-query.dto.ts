import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class DashboardOverviewQueryDto {
  @ApiPropertyOptional({ enum: ['24h', '7d', '30d'], default: '24h' })
  @IsOptional()
  @IsIn(['24h', '7d', '30d'])
  period: '24h' | '7d' | '30d' = '24h';
}
