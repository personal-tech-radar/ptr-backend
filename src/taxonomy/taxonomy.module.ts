import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueModule } from '../queue/queue.module';
import { AdminContentStreamsController } from './controllers/admin-content-streams.controller';
import { AdminTechnologyInterestsController } from './controllers/admin-technology-interests.controller';
import { AdminUserContentStreamsController } from './controllers/admin-user-content-streams.controller';
import { AdminUserTechnologyInterestsController } from './controllers/admin-user-technology-interests.controller';
import { ContentStreamController } from './controllers/content-stream.controller';
import { TechnologyInterestController } from './controllers/technology-interest.controller';
import { ContentStream } from './entities/content-stream.entity';
import { TaxonomySourceDiscoveryRequest } from './entities/taxonomy-source-discovery-request.entity';
import { TechnologyInterest } from './entities/technology-interest.entity';
import { UserContentStream } from './entities/user-content-stream.entity';
import { UserTechnologyInterest } from './entities/user-technology-interest.entity';
import { TaxonomySourceDiscoveryProcessor } from './processors/taxonomy-source-discovery.processor';
import { ContentStreamCommandService } from './services/content-stream-command.service';
import { ContentStreamQueryService } from './services/content-stream-query.service';
import { TechnologyInterestCommandService } from './services/technology-interest-command.service';
import { TechnologyInterestQueryService } from './services/technology-interest-query.service';
import { TechnologyInterestResolverService } from './services/technology-interest-resolver.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TechnologyInterest,
      ContentStream,
      UserTechnologyInterest,
      UserContentStream,
      // Not part of the spec'd forFeature list but required for
      // TaxonomySourceDiscoveryProcessor's repository injection (see that file).
      TaxonomySourceDiscoveryRequest,
    ]),
    QueueModule,
  ],
  controllers: [
    TechnologyInterestController,
    ContentStreamController,
    AdminTechnologyInterestsController,
    AdminContentStreamsController,
    AdminUserTechnologyInterestsController,
    AdminUserContentStreamsController,
  ],
  providers: [
    TechnologyInterestResolverService,
    TechnologyInterestCommandService,
    TechnologyInterestQueryService,
    ContentStreamQueryService,
    ContentStreamCommandService,
    TaxonomySourceDiscoveryProcessor,
  ],
  exports: [
    TechnologyInterestResolverService,
    TechnologyInterestCommandService,
    TechnologyInterestQueryService,
    ContentStreamQueryService,
    ContentStreamCommandService,
  ],
})
export class TaxonomyModule {}
