import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, IsTimeZone, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ description: 'Email address', example: 'jane.doe@example.com' })
  @IsEmail()
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  email: string;

  @ApiProperty({ description: 'Password', example: 'Str0ngPassw0rd!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ description: 'Display name', example: 'Jane Doe', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  @Transform(({ value }: { value: string }) => value?.trim())
  displayName: string;

  @ApiProperty({ description: 'IANA timezone string', example: 'Europe/Berlin' })
  @IsTimeZone()
  @Transform(({ value }: { value: string }) => value?.trim())
  timezone: string;
}
