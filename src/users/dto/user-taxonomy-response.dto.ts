import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContentStreamResponseDto } from '../../taxonomy/dto/content-stream-response.dto';
import { TechnologyInterestResponseDto } from '../../taxonomy/dto/technology-interest-response.dto';
import { UserLevel } from '../entities/user.entity';

export class UserTaxonomyResponseDto {
  @ApiPropertyOptional({ enum: UserLevel, nullable: true })
  level: UserLevel | null;

  @ApiProperty({ type: [TechnologyInterestResponseDto] })
  technologyInterests: TechnologyInterestResponseDto[];

  @ApiProperty({ type: [ContentStreamResponseDto] })
  contentStreams: ContentStreamResponseDto[];

  @ApiPropertyOptional({ nullable: true, description: 'When onboarding was completed' })
  onboardingCompletedAt: Date | null;
}
