import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiAnalysisModule } from '../ai-analysis/ai-analysis.module';
import { ArticlesModule } from '../articles/articles.module';
import { HttpModule } from '../common/http/http.module';
import { SourceCandidatesController } from './controllers/source-candidates.controller';
import { SourcesController } from './controllers/sources.controller';
import { SourceCandidate } from './entities/source-candidate.entity';
import { Source } from './entities/source.entity';
import { UserSourcePreference } from './entities/user-source-preference.entity';
import { WebSourceConfig } from './entities/web-source-config.entity';
import { ContentExtractionService } from './services/content-extraction.service';
import { PlaywrightFetchService } from './services/playwright-fetch.service';
import { SourceCandidatesQueryService } from './services/source-candidates-query.service';
import { SourceCandidatesService } from './services/source-candidates.service';
import { SourceDiscoveryService } from './services/source-discovery.service';
import { SourceStructureAiService } from './services/source-structure-ai.service';
import { SourceSyncService } from './services/source-sync.service';
import { SourcesService } from './services/sources.service';
import { UserSourcePreferenceService } from './services/user-source-preference.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Source, UserSourcePreference, WebSourceConfig, SourceCandidate]),
    HttpModule,
    // ArticlesModule already imports SourcesModule (UserSourcePreferenceService), so this new
    // edge — needed for ArticlesService, to create the minimal sample Article rows during
    // candidate promotion — closes a circular module dependency. forwardRef on both sides
    // (see ArticlesModule) defers resolution until both modules have finished registering.
    // AiAnalysisModule itself imports ArticlesModule, so it sits on the same require cycle
    // (SourcesModule -> AiAnalysisModule -> ArticlesModule -> SourcesModule) and needs the
    // same forwardRef treatment — without it, the class reference is still undefined here at
    // module-evaluation time.
    forwardRef(() => ArticlesModule),
    forwardRef(() => AiAnalysisModule),
  ],
  controllers: [SourcesController, SourceCandidatesController],
  providers: [
    SourcesService,
    UserSourcePreferenceService,
    SourceDiscoveryService,
    ContentExtractionService,
    PlaywrightFetchService,
    SourceStructureAiService,
    SourceCandidatesService,
    SourceCandidatesQueryService,
    SourceSyncService,
  ],
  exports: [
    SourcesService,
    UserSourcePreferenceService,
    SourceDiscoveryService,
    ContentExtractionService,
    PlaywrightFetchService,
    SourceSyncService,
  ],
})
export class SourcesModule {}
