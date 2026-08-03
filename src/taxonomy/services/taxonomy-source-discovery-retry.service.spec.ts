import { TaxonomySourceDiscoveryStatus } from '../entities/taxonomy-source-discovery-request.entity';
import { TaxonomySourceDiscoveryRetryService } from './taxonomy-source-discovery-retry.service';

describe('TaxonomySourceDiscoveryRetryService', () => {
  const taxonomy = { id: 'taxonomy-1' };
  const request = {
    technologyInterestId: 'taxonomy-1',
    status: TaxonomySourceDiscoveryStatus.FAILED,
    retryCount: 0,
    failedAt: new Date(),
    lastError: 'safe failure',
  };
  const manager = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
  const dataSource = { transaction: jest.fn() };
  const queue = {
    prepareTaxonomySourceDiscoveryRetry: jest.fn(),
    activatePreparedTaxonomySourceDiscoveryRetry: jest.fn(),
    compensatePreparedTaxonomySourceDiscoveryRetry: jest.fn(),
    hasTaxonomySourceDiscoveryRetryJob: jest.fn(),
  };
  let service: TaxonomySourceDiscoveryRetryService;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(request, {
      status: TaxonomySourceDiscoveryStatus.FAILED,
      retryCount: 0,
      failedAt: new Date(),
      lastError: 'safe failure',
    });
    manager.findOne.mockResolvedValueOnce(taxonomy).mockResolvedValueOnce(request);
    manager.create.mockReturnValue(request);
    manager.save.mockImplementation((_entity, value) => Promise.resolve(value));
    dataSource.transaction.mockImplementation(
      (work: (transactionManager: typeof manager) => Promise<unknown>) => work(manager),
    );
    queue.prepareTaxonomySourceDiscoveryRetry.mockResolvedValue({
      jobId: 'taxonomy-taxonomy-1',
      created: true,
      state: 'delayed',
    });
    queue.activatePreparedTaxonomySourceDiscoveryRetry.mockResolvedValue(undefined);
    queue.compensatePreparedTaxonomySourceDiscoveryRetry.mockResolvedValue(undefined);
    queue.hasTaxonomySourceDiscoveryRetryJob.mockResolvedValue(true);
    service = new TaxonomySourceDiscoveryRetryService(dataSource as never, queue as never);
  });

  it('commits queued retry state only after executable work is prepared', async () => {
    await service.retry('taxonomy-1');
    expect(request.status).toBe(TaxonomySourceDiscoveryStatus.QUEUED);
    expect(request.retryCount).toBe(1);
    expect(queue.activatePreparedTaxonomySourceDiscoveryRetry).toHaveBeenCalled();
  });

  it('does not change request state when enqueue preparation fails', async () => {
    queue.prepareTaxonomySourceDiscoveryRetry.mockRejectedValue(new Error('Redis unavailable'));
    await expect(service.retry('taxonomy-1')).rejects.toThrow('Redis unavailable');
    expect(manager.save).not.toHaveBeenCalled();
    expect(request.status).toBe(TaxonomySourceDiscoveryStatus.FAILED);
  });

  it('compensates newly created queue work when the database transaction fails', async () => {
    manager.save.mockRejectedValue(new Error('database failure'));
    await expect(service.retry('taxonomy-1')).rejects.toThrow('database failure');
    expect(queue.compensatePreparedTaxonomySourceDiscoveryRetry).toHaveBeenCalledWith(
      'taxonomy-taxonomy-1',
    );
  });

  it('reuses existing executable work without creating a duplicate execution', async () => {
    queue.prepareTaxonomySourceDiscoveryRetry.mockResolvedValue({
      jobId: 'taxonomy-taxonomy-1',
      created: false,
      state: 'active',
    });
    await service.retry('taxonomy-1');
    expect(queue.compensatePreparedTaxonomySourceDiscoveryRetry).not.toHaveBeenCalled();
  });

  it('restores the previous state if prepared work disappears', async () => {
    queue.activatePreparedTaxonomySourceDiscoveryRetry.mockRejectedValue(new Error('missing'));
    queue.hasTaxonomySourceDiscoveryRetryJob.mockResolvedValue(false);
    manager.findOne
      .mockReset()
      .mockResolvedValueOnce(taxonomy)
      .mockResolvedValueOnce(request)
      .mockResolvedValueOnce(request);

    await expect(service.retry('taxonomy-1')).rejects.toThrow('missing');
    expect(request.status).toBe(TaxonomySourceDiscoveryStatus.FAILED);
    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
  });
});
