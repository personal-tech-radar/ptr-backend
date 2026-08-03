import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { QueueService } from '../../queue/services/queue.service';
import { DiscoveryOperationType } from '../entities/discovery-quota-record.entity';
import {
  SourceCandidate,
  SourceCandidateStatus,
  SourceDiscoveryOrigin,
} from '../entities/source-candidate.entity';
import { SourceStatus } from '../entities/source.entity';
import { SourceSubmissionOutcome, SourceSubmissionResponseDto } from '../dto/submit-source.dto';
import { DiscoveryQuotaService } from './discovery-quota.service';
import { SourceCandidatesService } from './source-candidates.service';
import { SourceIdentityService } from './source-identity.service';

@Injectable()
export class SourceSubmissionService {
  constructor(
    @InjectRepository(SourceCandidate)
    private readonly candidateRepo: Repository<SourceCandidate>,
    private readonly identityService: SourceIdentityService,
    private readonly quotaService: DiscoveryQuotaService,
    private readonly candidateService: SourceCandidatesService,
    private readonly queueService: QueueService,
  ) {}

  async submit(userId: string, url: string): Promise<SourceSubmissionResponseDto> {
    const identity = this.identityService.resolve(url);
    const source = await this.identityService.findEquivalent(identity.normalizedUrl);
    if (source) {
      const outcome =
        source.status === SourceStatus.ACTIVE
          ? SourceSubmissionOutcome.ACTIVE
          : source.status === SourceStatus.DEGRADED
            ? SourceSubmissionOutcome.DEGRADED
            : SourceSubmissionOutcome.DISABLED;
      return { outcome, sourceId: source.id };
    }

    const existingCandidate = await this.candidateRepo.findOne({
      where: { normalizedUrl: identity.normalizedUrl },
    });
    if (existingCandidate?.status === SourceCandidateStatus.REJECTED) {
      return {
        outcome: SourceSubmissionOutcome.REJECTED,
        candidateId: existingCandidate.id,
        reason: existingCandidate.validationError ?? undefined,
      };
    }
    if (existingCandidate) {
      return { outcome: SourceSubmissionOutcome.ACCEPTED, candidateId: existingCandidate.id };
    }

    const idempotencyKey = createHash('sha256').update(identity.normalizedUrl).digest('hex');
    await this.quotaService.reserve(userId, DiscoveryOperationType.SOURCE_URL, idempotencyKey);
    const candidate = await this.candidateService.create({
      url: identity.normalizedUrl,
      origin: SourceDiscoveryOrigin.USER_SUBMISSION,
      submittedByUserId: userId,
    });
    await this.queueService.addProcessSourceCandidateJob(candidate.id);
    return { outcome: SourceSubmissionOutcome.ACCEPTED, candidateId: candidate.id };
  }
}
