import { ApiProperty } from '@nestjs/swagger';
import { TechnologyInterestKind } from '../entities/technology-interest.entity';

export class UserTechnologyInterestResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  userId: string;

  @ApiProperty({ example: 'jane@example.com' })
  userEmail: string;

  @ApiProperty({ example: '987e6543-e21b-12d3-a456-426614174999' })
  technologyInterestId: string;

  @ApiProperty({ example: 'Node.js' })
  technologyInterestName: string;

  @ApiProperty({ enum: TechnologyInterestKind, example: TechnologyInterestKind.TECHNOLOGY })
  technologyInterestKind: TechnologyInterestKind;

  @ApiProperty()
  createdAt: Date;
}
