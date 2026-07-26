import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { LoggingService } from '../../common/logging/logging.service';
import {
  QUEUE_TAXONOMY_SOURCE_DISCOVERY,
  TAXONOMY_SOURCE_DISCOVERY_QUEUE_CONCURRENCY,
} from '../../queue/queue.service';
import { TaxonomySourceDiscoveryRequest } from '../entities/taxonomy-source-discovery-request.entity';

// Deliberately a stub: no real keyword-based web search exists or is approved yet (needs a new
// external dependency/API choice — a separate future decision, see coder.md's out-of-scope
// list). This just records one request row per job for manual follow-up, isolated on its own
// queue (mirrors PlaywrightFetchProcessor) so a future real search integration can never stall
// feed-fetch/article-analysis/digest.
@Processor(QUEUE_TAXONOMY_SOURCE_DISCOVERY, {
  concurrency: TAXONOMY_SOURCE_DISCOVERY_QUEUE_CONCURRENCY,
})
export class TaxonomySourceDiscoveryProcessor extends WorkerHost {
  private readonly logger = new LoggingService(TaxonomySourceDiscoveryProcessor.name);

  constructor(
    @InjectRepository(TaxonomySourceDiscoveryRequest)
    private readonly discoveryRequestRepo: Repository<TaxonomySourceDiscoveryRequest>,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'discover-technology-source') {
      this.logger.warn(`Unknown job name: ${job.name}`);
      return;
    }

    const { technologyInterestId } = job.data as { technologyInterestId: string };

    const request = this.discoveryRequestRepo.create({ technologyInterestId });
    const saved = await this.discoveryRequestRepo.save(request);

    this.logger.info('Taxonomy source discovery requested (stub, pending manual review)', {
      technologyInterestId,
      requestId: saved.id,
    });
  }
}
