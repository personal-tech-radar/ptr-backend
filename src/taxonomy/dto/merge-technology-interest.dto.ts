import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MergeTechnologyInterestDto {
  @ApiProperty({
    description: 'ID of the TechnologyInterest that survives the merge',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  winnerId: string;

  @ApiProperty({
    description: 'ID of the TechnologyInterest that is soft-deleted and merged into the winner',
    example: '987e6543-e21b-12d3-a456-426614174999',
  })
  @IsUUID()
  loserId: string;
}
