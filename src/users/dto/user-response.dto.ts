import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User, UserLevel, UserRole } from '../entities/user.entity';

export class UserResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  email: string;

  @ApiProperty({ example: 'Jane Doe' })
  displayName: string;

  @ApiProperty({ example: 'Europe/Berlin', description: 'IANA timezone string' })
  timezone: string;

  @ApiProperty({ enum: UserRole, example: UserRole.USER })
  role: UserRole;

  @ApiPropertyOptional({ example: 'https://github.com/janedoe', nullable: true })
  githubUrl: string | null;

  @ApiPropertyOptional({ enum: UserLevel, nullable: true })
  level: UserLevel | null;

  @ApiProperty({ example: false })
  dailyDigestEnabled: boolean;

  @ApiProperty({ example: false })
  weeklyDigestEnabled: boolean;

  @ApiPropertyOptional({ nullable: true, description: 'When the email was verified' })
  emailVerifiedAt: Date | null;

  @ApiPropertyOptional({ nullable: true, description: 'When onboarding was completed' })
  onboardingCompletedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

// Never spreads the entity directly — passwordHash must never leak into a response.
export function toUserResponseDto(user: User): UserResponseDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    timezone: user.timezone,
    role: user.role,
    githubUrl: user.githubUrl,
    level: user.level,
    dailyDigestEnabled: user.dailyDigestEnabled,
    weeklyDigestEnabled: user.weeklyDigestEnabled,
    emailVerifiedAt: user.emailVerifiedAt,
    onboardingCompletedAt: user.onboardingCompletedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
