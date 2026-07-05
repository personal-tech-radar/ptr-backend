import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '../common/http/http.module';
import { SourcesController } from './controllers/sources.controller';
import { Source } from './entities/source.entity';
import { UserSourcePreference } from './entities/user-source-preference.entity';
import { WebSourceConfig } from './entities/web-source-config.entity';
import { ContentExtractionService } from './services/content-extraction.service';
import { PlaywrightFetchService } from './services/playwright-fetch.service';
import { SourceDiscoveryService } from './services/source-discovery.service';
import { SourceStructureAiService } from './services/source-structure-ai.service';
import { SourcesService } from './services/sources.service';
import { UserSourcePreferenceService } from './services/user-source-preference.service';

@Module({
  imports: [TypeOrmModule.forFeature([Source, UserSourcePreference, WebSourceConfig]), HttpModule],
  controllers: [SourcesController],
  providers: [
    SourcesService,
    UserSourcePreferenceService,
    SourceDiscoveryService,
    ContentExtractionService,
    PlaywrightFetchService,
    SourceStructureAiService,
  ],
  exports: [
    SourcesService,
    UserSourcePreferenceService,
    SourceDiscoveryService,
    ContentExtractionService,
    PlaywrightFetchService,
  ],
})
export class SourcesModule {}
