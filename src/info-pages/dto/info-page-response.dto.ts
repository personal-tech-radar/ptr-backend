import { ApiProperty } from '@nestjs/swagger';
import { InfoPageDocumentDto } from './info-page-document.dto';

export class InfoPageResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ description: 'Editor.js OutputData JSON.', type: InfoPageDocumentDto })
  fullText: InfoPageDocumentDto;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class InfoPageListItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
