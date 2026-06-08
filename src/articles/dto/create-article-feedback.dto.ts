import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ArticleFeedbackType } from '../entities/article-feedback.entity';

export class CreateArticleFeedbackDto {
  @ApiProperty({
    enum: ArticleFeedbackType,
    example: ArticleFeedbackType.USEFUL,
  })
  @IsEnum(ArticleFeedbackType)
  type: ArticleFeedbackType;
}
