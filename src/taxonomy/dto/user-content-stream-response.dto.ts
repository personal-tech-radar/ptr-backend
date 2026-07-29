import { ApiProperty } from '@nestjs/swagger';

export class UserContentStreamResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  userId: string;

  @ApiProperty({ example: 'jane@example.com' })
  userEmail: string;

  @ApiProperty({ example: '987e6543-e21b-12d3-a456-426614174999' })
  contentStreamId: string;

  @ApiProperty({ example: 'releases_and_changes' })
  contentStreamKey: string;

  @ApiProperty({ example: 'Releases and changes' })
  contentStreamName: string;

  @ApiProperty()
  createdAt: Date;
}
