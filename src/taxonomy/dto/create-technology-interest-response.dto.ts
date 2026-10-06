import { ApiProperty } from '@nestjs/swagger';
import { TechnologyInterestResponseDto } from './technology-interest-response.dto';

export class CreateTechnologyInterestResponseDto {
  @ApiProperty({ example: true })
  created: boolean;

  @ApiProperty({ example: 'Technology created and source discovery queued' })
  message: string;

  @ApiProperty({ type: TechnologyInterestResponseDto })
  taxonomy: TechnologyInterestResponseDto;
}
