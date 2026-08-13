import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { LoggingService } from '../../common/logging/logging.service';
import {
  QUEUE_TAXONOMY_SOURCE_DISCOVERY,
  TAXONOMY_SOURCE_DISCOVERY_QUEUE_CONCURRENCY,
} from '../../queue/services/queue.service';
import {
  TaxonomySourceDiscoveryRequest,
  TaxonomySourceDiscoveryStatus,
} from '../entities/taxonomy-source-discovery-request.entity';
import { TechnologyInterest, TechnologyInterestKind } from '../entities/technology-interest.entity';
import { ContentStream } from '../entities/content-stream.entity';
import { SourceCandidatesService } from '../../sources/services/source-candidates.service';
import { TaxonomySourceProposalService } from '../../sources/services/taxonomy-source-proposal.service';
import { SourceDiscoveryOrigin } from '../../sources/entities/source-candidate.entity';
import { MetricsService } from '../../common/metrics/metrics.service';
import { SanitizedProviderError } from '../../common/error/sanitized-provider.error';
import { sanitizeLogText } from '../../common/logging/logging.service';

// Proposes sources with the LLM and delegates validation and activation to the shared coordinator.
@Processor(QUEUE_TAXONOMY_SOURCE_DISCOVERY, {
  concurrency: TAXONOMY_SOURCE_DISCOVERY_QUEUE_CONCURRENCY,
})
export class TaxonomySourceDiscoveryProcessor extends WorkerHost {
  private readonly logger = new LoggingService(TaxonomySourceDiscoveryProcessor.name);

  constructor(
    @InjectRepository(TaxonomySourceDiscoveryRequest)
    private readonly discoveryRequestRepo: Repository<TaxonomySourceDiscoveryRequest>,
    @InjectRepository(TechnologyInterest)
    private readonly taxonomyRepo: Repository<TechnologyInterest>,
    @InjectRepository(ContentStream)
    private readonly streamRepo: Repository<ContentStream>,
    private readonly proposalService: TaxonomySourceProposalService,
    private readonly candidateService: SourceCandidatesService,
    private readonly metricsService: MetricsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    await this.metricsService.observeQueueLag(
      QUEUE_TAXONOMY_SOURCE_DISCOVERY,
      Math.max(0, Date.now() - job.timestamp),
    );

    if (job.name === 'process-source-candidate') {
      const { candidateId } = job.data as { candidateId: string };
      try {
        await this.candidateService.promote(candidateId);
      } catch (error) {
        if (!this.isFinalAttempt(job)) throw error;
        await this.candidateService.rejectProcessingFailure(candidateId, error);
      }
      return;
    }

    if (job.name !== 'discover-taxonomy-sources') {
      this.logger.warn(`Unknown job name: ${job.name}`);
      return;
    }

    const { technologyInterestId } = job.data as { technologyInterestId: string };
    const taxonomy = await this.taxonomyRepo.findOne({ where: { id: technologyInterestId } });
    if (!taxonomy) return;

    const applicableKeys =
      taxonomy.kind === TechnologyInterestKind.TECHNOLOGY
        ? [
            'releases_and_changes',
            'security',
            'industry_pulse',
            'engineering_experience',
            'expert_opinions_and_practices',
          ]
        : ['industry_pulse', 'engineering_experience', 'expert_opinions_and_practices'];
    const streams = await this.streamRepo
      .createQueryBuilder('stream')
      .where('stream.key IN (:...keys)', { keys: applicableKeys })
      .getMany();

    const request = await this.markRunning(technologyInterestId);
    try {
      await this.metricsService.increment('discovery_jobs_total', { kind: taxonomy.kind });

      for (const stream of streams) {
        const proposals = await this.proposalService.propose(
          taxonomy.name,
          taxonomy.kind,
          stream.key,
        );
        for (const proposal of proposals) {
          const candidate = await this.candidateService.create({
            url: proposal.url,
            origin:
              taxonomy.kind === TechnologyInterestKind.TECHNOLOGY
                ? SourceDiscoveryOrigin.TECHNOLOGY
                : SourceDiscoveryOrigin.INTEREST,
            technologyInterestId: taxonomy.id,
            contentStreamId: stream.id,
            proposedName: proposal.name,
            expectedSourceType: proposal.expectedSourceType,
            relevanceReason: proposal.reason,
          });
          try {
            await this.candidateService.promote(candidate.id);
          } catch (error) {
            if (!this.isFinalAttempt(job)) throw error;
            await this.candidateService.rejectProcessingFailure(candidate.id, error);
          }
        }
      }

      request.status = TaxonomySourceDiscoveryStatus.COMPLETED;
      request.completedAt = new Date();
      request.failedAt = null;
      request.lastError = null;
      await this.discoveryRequestRepo.save(request);

      this.logger.info('Taxonomy source discovery completed', {
        technologyInterestId,
        requestId: request.id,
        streamCount: streams.length,
      });
    } catch (error) {
      const safeError = this.safeWorkerError(error, technologyInterestId);
      request.status = this.isFinalAttempt(job)
        ? TaxonomySourceDiscoveryStatus.FAILED
        : TaxonomySourceDiscoveryStatus.QUEUED;
      request.failedAt = this.isFinalAttempt(job) ? new Date() : null;
      request.lastError = safeError.message;
      await this.discoveryRequestRepo.save(request);
      throw safeError;
    }
  }

  private async markRunning(technologyInterestId: string): Promise<TaxonomySourceDiscoveryRequest> {
    return this.discoveryRequestRepo.manager.transaction(async (manager) => {
      let request = await manager.findOne(TaxonomySourceDiscoveryRequest, {
        where: { technologyInterestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request) {
        request = manager.create(TaxonomySourceDiscoveryRequest, { technologyInterestId });
      }
      request.status = TaxonomySourceDiscoveryStatus.RUNNING;
      request.attemptCount = (request.attemptCount ?? 0) + 1;
      request.lastAttemptAt = new Date();
      return manager.save(TaxonomySourceDiscoveryRequest, request);
    });
  }

  private safeWorkerError(error: unknown, taxonomyId: string): Error {
    if (error instanceof SanitizedProviderError) {
      return new SanitizedProviderError({ ...error.context, taxonomyId });
    }
    if (error instanceof Error) {
      const safe = new Error(sanitizeLogText(error.message));
      safe.name = error.name;
      return safe;
    }
    return new Error('Taxonomy source discovery failed');
  }

  private isFinalAttempt(job: Job): boolean {
    return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
  }
}
