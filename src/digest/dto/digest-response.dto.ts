import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { DigestStatus, DigestType } from '../entities/digest.entity';

export class DigestResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: DigestType })
  type: DigestType;

  @ApiProperty()
  periodStart: Date;

  @ApiProperty()
  periodEnd: Date;

  @ApiProperty()
  subject: string;

  @ApiProperty({ enum: DigestStatus })
  status: DigestStatus;

  @ApiPropertyOptional()
  sentAt: Date | null;

  @ApiProperty()
  createdAt: Date;
}

export class TriggerDigestDto {
  @ApiProperty({
    enum: DigestType,
    enumName: 'DigestType',
    description: 'Digest type to build and send. Options: daily, weekly, deep_dive_weekly',
  })
  @IsEnum(DigestType)
  type: DigestType;
}

export class ResendDigestResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  digestId: string;

  @ApiProperty()
  subject: string;

  @ApiPropertyOptional()
  message?: string;
}
