import { Injectable } from '@nestjs/common';
import { HealthResponseDto } from '../dto/health-response.dto';

@Injectable()
export class HealthService {
  getHealth(): HealthResponseDto {
    return {
      appName: process.env.APP_NAME || 'nestjs-app',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
    };
  }
}