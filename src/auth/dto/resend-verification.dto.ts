import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

export class ResendVerificationDto {
  @ApiProperty({
    description: 'Email address used during registration',
    example: 'jane@example.com',
  })
  @IsEmail()
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  email: string;
}
