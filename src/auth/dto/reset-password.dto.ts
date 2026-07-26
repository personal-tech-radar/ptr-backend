import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Password reset token', example: 'a1b2c3...' })
  @IsString()
  @Transform(({ value }: { value: string }) => value?.trim())
  token: string;

  @ApiProperty({ description: 'New password', example: 'NewStr0ngPassw0rd!', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
