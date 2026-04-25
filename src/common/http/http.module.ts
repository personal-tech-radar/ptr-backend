import { Module } from '@nestjs/common';
import { HttpService } from './http.service';
import { LoggingService } from '../logging/logging.service';

@Module({
  providers: [
    HttpService,
    {
      provide: LoggingService,
      useFactory: () => new LoggingService('HttpService'),
    },
  ],
  exports: [HttpService],
})
export class HttpModule {}