import { ApiProperty } from '@nestjs/swagger';

export class UserSourcePreferenceResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

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
