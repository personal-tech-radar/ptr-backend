import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { QueueModule } from '../queue/queue.module';
import { SchedulerService } from './services/scheduler.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SourceCoverage } from '../sources/entities/source-coverage.entity';
import { Source } from '../sources/entities/source.entity';
import { ContentStream } from '../taxonomy/entities/content-stream.entity';
import { IngestionScheduleService } from './services/ingestion-schedule.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    QueueModule,
    TypeOrmModule.forFeature([SourceCoverage, Source, ContentStream]),
  ],
  providers: [SchedulerService, IngestionScheduleService],
})
export class SchedulerModule {}
