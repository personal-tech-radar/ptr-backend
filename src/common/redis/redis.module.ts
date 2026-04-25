import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisService } from './redis.service';
import { LoggingService } from '../logging/logging.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    RedisService,
    {
      provide: LoggingService,
      useFactory: () => new LoggingService('RedisService'),
    },
  ],
  exports: [RedisService],
})
export class RedisModule {}