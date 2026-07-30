import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
    description:
      'Raw user identifier as stored on the feedback row — still the legacy DEFAULT_USER_ID ' +
      'literal for every existing row until Phase 11 introduces a real per-user write path.',
    example: 'default_user',
  })
  userId: string;

  @ApiPropertyOptional({
    description:
      'Email of the user matching userId, resolved via a best-effort id cast. Null when userId ' +
      'does not correspond to a real user row (expected for all rows today, see userId).',
    example: 'jane@example.com',
    nullable: true,
  })
  userEmail: string | null;

  @ApiProperty({ enum: ArticleFeedbackType })
  type: ArticleFeedbackType;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
