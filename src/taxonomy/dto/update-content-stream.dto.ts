import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

// Deliberately no `key` field — key is immutable once created (see
// ContentStreamCommandService.update). Sending it in the request body is rejected with 400 by the
// global ValidationPipe's `forbidNonWhitelisted`, since it would not be a whitelisted property.
export class UpdateContentStreamDto {
  @ApiPropertyOptional({ description: 'Display name', example: 'Releases and changes' })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value?.trim())
  name?: string;

  @ApiPropertyOptional({
    description: 'Description shown to users',
    nullable: true,
    example: 'New releases, changelogs, and breaking changes.',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string | null }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  description?: string | null;

  @ApiPropertyOptional({ description: 'Display order', example: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Whether this stream is offered to users', example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
