import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class AdminEventFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() userId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() sourceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() technologyInterestId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() streamId?: string;
  @ApiPropertyOptional({
    description:
      'Event timestamp inclusive lower bound: first open, current save creation, or latest feedback update.',
  })
  @IsOptional()
  @IsDateString()
  occurredFrom?: string;
  @ApiPropertyOptional({ description: 'Event timestamp exclusive upper bound.' })
  @IsOptional()
  @IsDateString()
  occurredTo?: string;
}
