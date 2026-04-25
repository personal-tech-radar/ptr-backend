import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { S3StorageService } from './s3-storage.service';
import { LoggingService } from '../logging/logging.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    S3StorageService,
    {
      provide: LoggingService,
      useFactory: () => new LoggingService('S3StorageService'),
    },
  ],
  exports: [S3StorageService],
})
export class S3Module {}