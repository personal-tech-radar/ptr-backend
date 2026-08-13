import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class AdministratorLoginDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}

export class CreateAdministratorDto extends AdministratorLoginDto {}

export class ChangeAdministratorPasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class QueryAdministratorsDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive partial administrator email',
    example: 'admin@example.com',
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({
    description: 'Page number starting from 1',
    minimum: 1,
    default: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of administrator accounts per page',
    minimum: 1,
    maximum: 100,
    default: 20,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class AdministratorResponseDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  email: string;
  @ApiProperty({ nullable: true })
  lastLoginAt: Date | null;
  @ApiProperty({ nullable: true })
  createdByAdminId: string | null;
  @ApiProperty()
  createdAt: Date;
}

export class AdministratorTokenResponseDto {
  @ApiProperty()
  accessToken: string;
  @ApiProperty({ example: 'Bearer' })
  tokenType: 'Bearer';
  @ApiProperty({ example: 900 })
  expiresIn: number;
}
