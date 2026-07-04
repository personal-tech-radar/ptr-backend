import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SourcesController } from './controllers/sources.controller';
import { Source } from './entities/source.entity';
import { UserSourcePreference } from './entities/user-source-preference.entity';
import { SourcesService } from './services/sources.service';
import { UserSourcePreferenceService } from './services/user-source-preference.service';

@Module({
  imports: [TypeOrmModule.forFeature([Source, UserSourcePreference])],
  controllers: [SourcesController],
  providers: [SourcesService, UserSourcePreferenceService],
  exports: [SourcesService, UserSourcePreferenceService],
})
export class SourcesModule {}
