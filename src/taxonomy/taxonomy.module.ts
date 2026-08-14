import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueModule } from '../queue/queue.module';
import { DiscoveryQuotaRecord } from '../sources/entities/discovery-quota-record.entity';
import { DiscoveryQuotaService } from '../sources/services/discovery-quota.service';
import { AdminContentStreamsController } from './controllers/admin-content-streams.controller';
import { AdminTechnologyInterestsController } from './controllers/admin-technology-interests.controller';
import { AdminUserContentStreamsController } from './controllers/admin-user-content-streams.controller';
import { AdminUserTechnologyInterestsController } from './controllers/admin-user-technology-interests.controller';
import { ContentStreamController } from './controllers/content-stream.controller';
import { TechnologyInterestController } from './controllers/technology-interest.controller';
import { PublicTaxonomyController } from './controllers/public-taxonomy.controller';
import { ContentStream } from './entities/content-stream.entity';
import { TaxonomySourceDiscoveryRequest } from './entities/taxonomy-source-discovery-request.entity';
import { TechnologyInterest } from './entities/technology-interest.entity';
import { UserContentStream } from './entities/user-content-stream.entity';
import { UserTechnologyInterest } from './entities/user-technology-interest.entity';
import { ContentStreamCommandService } from './services/content-stream-command.service';
import { ContentStreamQueryService } from './services/content-stream-query.service';
import { TechnologyInterestCommandService } from './services/technology-interest-command.service';
import { TechnologyInterestQueryService } from './services/technology-interest-query.service';
import { TechnologyInterestResolverService } from './services/technology-interest-resolver.service';
import { TaxonomySourceDiscoveryRetryService } from './services/taxonomy-source-discovery-retry.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TechnologyInterest,
      ContentStream,
      UserTechnologyInterest,
      UserContentStream,
      // Required by the discovery processor.
      TaxonomySourceDiscoveryRequest,
      DiscoveryQuotaRecord,
    ]),
    QueueModule,
  ],
  controllers: [
    TechnologyInterestController,
    PublicTaxonomyController,
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
    DiscoveryQuotaService,
    TaxonomySourceDiscoveryRetryService,
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
