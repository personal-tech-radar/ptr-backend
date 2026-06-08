import { ApiProperty } from '@nestjs/swagger';
import { ArticleFeedbackType } from '../entities/article-feedback.entity';

export class ArticleFeedbackResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  articleId: string;

  @ApiProperty()
  userId: string;

  @ApiProperty({ enum: ArticleFeedbackType })
  type: ArticleFeedbackType;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
