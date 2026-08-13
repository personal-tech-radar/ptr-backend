import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token issued at login', example: 'a1b2c3...' })
  @IsString()
  @Transform(({ value }: { value: string }) => value?.trim())
  refreshToken: string;
}
