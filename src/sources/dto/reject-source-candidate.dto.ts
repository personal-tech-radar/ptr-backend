import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectSourceCandidateDto {
  @ApiPropertyOptional({ description: 'Reason for manual rejection', example: 'Paywalled site' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
