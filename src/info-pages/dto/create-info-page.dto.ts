import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsJSON, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateInfoPageDto {
  @ApiProperty({ example: 'About Personal Tech Radar' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({
    description: 'Rich page content as a JSON document string stored in a text column.',
    example: '{"blocks":[{"type":"paragraph","data":{"text":"About the radar..."}}]}',
  })
  @IsString()
  @IsJSON()
  fullText: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
