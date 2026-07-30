import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserSourcePreferenceResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({
    description:
      'Raw user identifier as stored on the preference row — still the legacy DEFAULT_USER_ID ' +
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

  @ApiProperty({ example: '987e6543-e21b-12d3-a456-426614174999' })
  sourceId: string;

  @ApiProperty({ example: 'The New Stack' })
  sourceName: string;

  @ApiProperty({ example: 3 })
  usefulCount: number;

  @ApiProperty({ example: 1 })
  notUsefulCount: number;

  @ApiProperty({ example: 2.5 })
  feedbackAdjustment: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
