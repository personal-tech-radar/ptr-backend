import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current password', example: 'Str0ngPassw0rd!' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ description: 'New password', example: 'NewStr0ngPassw0rd!', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
