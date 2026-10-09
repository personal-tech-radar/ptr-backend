import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { InfoPageDocumentDto } from './info-page-document.dto';

export class CreateInfoPageDto {
  @ApiProperty({ example: 'About Personal Tech Radar' })
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({
    description: 'Editor.js OutputData JSON. Supported blocks are headers and paragraphs.',
    type: InfoPageDocumentDto,
    example: {
      time: 1700000000000,
      blocks: [
        { id: 'section-1', type: 'header', data: { text: 'Section title', level: 2 } },
        {
          id: 'paragraph-1',
          type: 'paragraph',
          data: { text: 'Text with an <a href="https://example.com">optional link</a>.' },
        },
      ],
      version: '2.x',
    },
  })
  @IsObject()
  @ValidateNested()
  @Type(() => InfoPageDocumentDto)
  fullText: InfoPageDocumentDto;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
