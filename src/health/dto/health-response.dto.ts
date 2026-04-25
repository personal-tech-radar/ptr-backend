import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'nestjs-app' })
  appName: string;

  @ApiProperty({ example: 'production' })
  environment: string;

  @ApiProperty({ example: 123.456 })
  uptime: number;
}