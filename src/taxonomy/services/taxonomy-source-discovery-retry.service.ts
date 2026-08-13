import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { QueueService } from '../../queue/services/queue.service';
import {
  TaxonomySourceDiscoveryRequest,
  TaxonomySourceDiscoveryStatus,
} from '../entities/taxonomy-source-discovery-request.entity';
import { TechnologyInterest } from '../entities/technology-interest.entity';

@Injectable()
export class TaxonomySourceDiscoveryRetryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly queueService: QueueService,
  ) {}

  async retry(technologyInterestId: string): Promise<void> {
    let preparedJobId: string | null = null;
    let created = false;
    let previousStatus: TaxonomySourceDiscoveryStatus | null = null;

    try {
      await this.dataSource.transaction(async (manager) => {
        const taxonomy = await manager.findOne(TechnologyInterest, {
          where: { id: technologyInterestId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!taxonomy) {
          throw new NotFoundException(`Technology/interest ${technologyInterestId} not found`);
        }
        let request = await manager.findOne(TaxonomySourceDiscoveryRequest, {
          where: { technologyInterestId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!request) {
          request = manager.create(TaxonomySourceDiscoveryRequest, { technologyInterestId });
        }
        previousStatus = request.status;
        const prepared =
          await this.queueService.prepareTaxonomySourceDiscoveryRetry(technologyInterestId);
        preparedJobId = prepared.jobId;
        created = prepared.created;
        request.status = TaxonomySourceDiscoveryStatus.QUEUED;
        request.retryCount = (request.retryCount ?? 0) + 1;
        request.failedAt = null;
        request.lastError = null;
        await manager.save(TaxonomySourceDiscoveryRequest, request);
      });
    } catch (error) {
      if (created && preparedJobId) {
        await this.queueService.compensatePreparedTaxonomySourceDiscoveryRetry(preparedJobId);
      }
      throw error;
    }

    if (!preparedJobId) throw new Error('Taxonomy source-discovery retry was not prepared');
    try {
      await this.queueService.activatePreparedTaxonomySourceDiscoveryRetry(preparedJobId);
    } catch (error) {
      if (!(await this.queueService.hasTaxonomySourceDiscoveryRetryJob(preparedJobId))) {
        await this.dataSource.transaction(async (manager) => {
          const request = await manager.findOne(TaxonomySourceDiscoveryRequest, {
            where: { technologyInterestId },
            lock: { mode: 'pessimistic_write' },
          });
          if (
            request &&
            request.status === TaxonomySourceDiscoveryStatus.QUEUED &&
            previousStatus
          ) {
            request.status = previousStatus;
            await manager.save(TaxonomySourceDiscoveryRequest, request);
          }
        });
      }
      throw error;
    }
  }
}
