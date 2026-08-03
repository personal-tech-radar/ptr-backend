jest.mock('jsdom', () => ({ JSDOM: jest.fn() }));
jest.mock('@mozilla/readability', () => ({ Readability: jest.fn() }));

import { SanitizedProviderError } from '../../common/error/sanitized-provider.error';
import { TaxonomySourceDiscoveryStatus } from '../entities/taxonomy-source-discovery-request.entity';
import { TechnologyInterestKind } from '../entities/technology-interest.entity';
import { TaxonomySourceDiscoveryProcessor } from './taxonomy-source-discovery.processor';

describe('TaxonomySourceDiscoveryProcessor', () => {
  const request = {
    id: 'request-1',
    technologyInterestId: 'taxonomy-1',
    status: TaxonomySourceDiscoveryStatus.QUEUED,
    attemptCount: 0,
    retryCount: 0,
    lastAttemptAt: null,
    completedAt: null,
    failedAt: null,
    lastError: null,
  };
  const manager = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const discoveryRepo = {
    manager: { transaction: jest.fn() },
    save: jest.fn(),
  };
  const taxonomyRepo = { findOne: jest.fn() };
  const streamRepo = { createQueryBuilder: jest.fn() };
  const proposalService = { propose: jest.fn() };
  const candidateService = {
    create: jest.fn(),
    promote: jest.fn(),
    rejectProcessingFailure: jest.fn(),
  };
  const metrics = { observeQueueLag: jest.fn(), increment: jest.fn() };
  let processor: TaxonomySourceDiscoveryProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(request, {
      status: TaxonomySourceDiscoveryStatus.QUEUED,
      attemptCount: 0,
      retryCount: 0,
      lastAttemptAt: null,
      completedAt: null,
      failedAt: null,
      lastError: null,
    });
    manager.findOne.mockResolvedValue(request);
    manager.create.mockReturnValue(request);
    manager.save.mockImplementation((_entity, value) => Promise.resolve(value));
    discoveryRepo.manager.transaction.mockImplementation(
      (work: (transactionManager: typeof manager) => Promise<unknown>) => work(manager),
    );
    discoveryRepo.save.mockImplementation((value) => Promise.resolve(value));
    taxonomyRepo.findOne.mockResolvedValue({
      id: 'taxonomy-1',
      name: 'OpenTelemetry',
      kind: TechnologyInterestKind.TECHNOLOGY,
    });
    streamRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ id: 'stream-1', key: 'releases_and_changes' }]),
    });
    proposalService.propose.mockResolvedValue([]);
    candidateService.promote.mockResolvedValue({ status: 'active' });
    processor = new TaxonomySourceDiscoveryProcessor(
      discoveryRepo as never,
      taxonomyRepo as never,
      streamRepo as never,
      proposalService as never,
      candidateService as never,
      metrics as never,
    );
  });

  it('routes source-candidate jobs through the shared onboarding service', async () => {
    await processor.process({
      name: 'process-source-candidate',
      data: { candidateId: 'candidate' },
      timestamp: Date.now(),
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as never);
    expect(candidateService.promote).toHaveBeenCalledWith('candidate');
  });

  it('transitions one logical request through running to completed', async () => {
    await processor.process(thisJob(0));

    expect(manager.create).not.toHaveBeenCalled();
    expect(request.attemptCount).toBe(1);
    expect(request.status).toBe(TaxonomySourceDiscoveryStatus.COMPLETED);
    expect(request.completedAt).toBeInstanceOf(Date);
  });

  it('reuses the same request across retries and marks only the exhausted attempt failed', async () => {
    proposalService.propose.mockRejectedValue(
      new SanitizedProviderError({
        provider: 'openai',
        status: 503,
        requestType: 'taxonomy-source-proposal',
        retryable: true,
      }),
    );

    await expect(processor.process(thisJob(0))).rejects.toThrow('provider=openai');
    expect(request.status).toBe(TaxonomySourceDiscoveryStatus.QUEUED);
    await expect(processor.process(thisJob(2))).rejects.toThrow('provider=openai');

    expect(request.attemptCount).toBe(2);
    expect(request.status).toBe(TaxonomySourceDiscoveryStatus.FAILED);
    expect(request.failedAt).toBeInstanceOf(Date);
    expect(request.lastError).toContain('taxonomy=taxonomy-1');
    expect(manager.create).not.toHaveBeenCalled();
  });

  it('throws only sanitized provider context to BullMQ', async () => {
    proposalService.propose.mockRejectedValue(
      Object.assign(new Error('Incorrect API key sk-old-secret-fragment'), { status: 401 }),
    );

    await processor.process(thisJob(2)).catch((error: Error) => {
      expect(error.message).not.toContain('sk-old-secret-fragment');
      expect(error.stack).not.toContain('sk-old-secret-fragment');
    });
    expect(request.lastError).not.toContain('sk-old-secret-fragment');
  });
});

function thisJob(attemptsMade: number) {
  return {
    name: 'discover-taxonomy-sources',
    data: { technologyInterestId: 'taxonomy-1', userId: 'user-1' },
    timestamp: Date.now(),
    attemptsMade,
    opts: { attempts: 3 },
  } as never;
}
