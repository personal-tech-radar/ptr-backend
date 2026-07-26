import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ description: 'Email verification token', example: 'a1b2c3...' })
  @IsString()
  @Transform(({ value }: { value: string }) => value?.trim())
  token: string;
}
