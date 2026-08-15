import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsDateString, IsOptional, IsUUID, Matches } from 'class-validator';

export class PreviewFeedDto {
  @ApiPropertyOptional({
    description:
      'Existing technology/interest ids to preview against. Omit or leave empty for a neutral ' +
      '(non-penalized) tech/interest overlap score.',
    type: [String],
    example: ['123e4567-e89b-12d3-a456-426614174000'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  technologyInterestIds?: string[];

  @ApiProperty({
    description: 'Existing content stream ids to preview against. At least one is required.',
    type: [String],
    example: ['223e4567-e89b-12d3-a456-426614174000'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  contentStreamIds: string[];

  @ApiPropertyOptional({
    description: 'Earliest publication date (inclusive), YYYY-MM-DD, interpreted in UTC.',
    example: '2026-08-01',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true, strictSeparator: true })
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Latest publication date (inclusive), YYYY-MM-DD, interpreted in UTC.',
    example: '2026-08-14',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true, strictSeparator: true })
  dateTo?: string;
}
