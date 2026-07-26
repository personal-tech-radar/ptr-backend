import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';

export class AuthTokensResponseDto {
  @ApiProperty({ description: 'Short-lived JWT access token' })
  accessToken: string;

  @ApiProperty({ description: 'Long-lived, persisted, revocable refresh token' })
  refreshToken: string;

  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;
}
