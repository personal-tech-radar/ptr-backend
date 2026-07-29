import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Deliberately no `kind` field — kind is immutable once created (see
// TechnologyInterestCommandService.update). Sending it in the request body is rejected with 400 by
// the global ValidationPipe's `forbidNonWhitelisted`, since it would not be a whitelisted property.
export class UpdateTechnologyInterestDto {
  @ApiPropertyOptional({ description: 'Canonical display name', example: 'Node.js' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: string }) => value?.trim())
  name?: string;

  @ApiPropertyOptional({
    description: 'Alternate names that resolve to this technology/interest',
    example: ['nodejs', 'node'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aliases?: string[];
}
