import { ApiProperty } from '@nestjs/swagger';
import { ArticleFeedbackType } from '../entities/article-feedback.entity';

// Distinct from the self-service ArticleFeedbackResponseDto (article-feedback-response.dto.ts) —
// this shape adds the admin-only articleTitle/userEmail fields and is used exclusively by
// AdminArticleFeedbackController.
export class AdminArticleFeedbackResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: '987e6543-e21b-12d3-a456-426614174999' })
  articleId: string;

  @ApiProperty({ example: 'How we cut p99 latency in half' })
  articleTitle: string;

  @ApiProperty({
    description: 'User id, a real FK to the users table.',
    example: '111e4567-e89b-12d3-a456-426614174000',
  })
  userId: string;

  @ApiProperty({
    description: 'Email of the user identified by userId, resolved via a real joined relation.',
    example: 'jane@example.com',
  })
  userEmail: string;

  @ApiProperty({ enum: ArticleFeedbackType })
  type: ArticleFeedbackType;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
