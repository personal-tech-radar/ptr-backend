import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { DigestStatus, DigestType } from '../entities/digest.entity';

// Backs AdminDigestController's GET /admin/digests listing.
export class AdminQueryDigestDto {
  @ApiPropertyOptional({ description: 'Page number', example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', example: 20, minimum: 1, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({
    enum: DigestType,
    description: 'Filter by digest type',
    example: DigestType.DAILY,
  })
  @IsOptional()
  @IsEnum(DigestType)
  type?: DigestType;

  @ApiPropertyOptional({
    enum: DigestStatus,
    description: 'Filter by digest status',
    example: DigestStatus.SENT,
  })
  @IsOptional()
  @IsEnum(DigestStatus)
  status?: DigestStatus;

  @ApiPropertyOptional({
    description: 'Case-insensitive partial match filter on the recipient user email',
    example: 'jane',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  email?: string;
}
