import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContentStream } from '../entities/content-stream.entity';

export class ContentStreamResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: 'releases_and_changes' })
  key: string;

  @ApiProperty({ example: 'Releases and changes' })
  name: string;

  @ApiPropertyOptional({ nullable: true, example: null })
  description: string | null;

  @ApiProperty({ example: 0 })
  sortOrder: number;

  @ApiProperty({ example: true })
  enabled: boolean;
}

export function toContentStreamResponseDto(entity: ContentStream): ContentStreamResponseDto {
  return {
    id: entity.id,
    key: entity.key,
    name: entity.name,
    description: entity.description,
    sortOrder: entity.sortOrder,
    enabled: entity.enabled,
  };
}
