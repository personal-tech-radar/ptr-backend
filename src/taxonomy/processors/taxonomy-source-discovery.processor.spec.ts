import { TaxonomySourceDiscoveryProcessor } from './taxonomy-source-discovery.processor';
import { TaxonomySourceDiscoveryStatus } from '../entities/taxonomy-source-discovery-request.entity';

describe('TaxonomySourceDiscoveryProcessor', () => {
  let processor: TaxonomySourceDiscoveryProcessor;
  const mockDiscoveryRequestRepo = {
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new TaxonomySourceDiscoveryProcessor(mockDiscoveryRequestRepo as any);
  });

  it('creates and saves a discovery request row for a discover-technology-source job', async () => {
    // The mocked repo's create() stands in for what TypeORM would produce, including the
    // column-level default for `status`; requestedAt is now auto-set by @CreateDateColumn() on
    // insert, so it's deliberately not part of the args passed to create() here.
    const created = {
      technologyInterestId: 'tech-1',
      status: TaxonomySourceDiscoveryStatus.PENDING_MANUAL_REVIEW,
    };
    mockDiscoveryRequestRepo.create.mockReturnValue(created);
    mockDiscoveryRequestRepo.save.mockResolvedValue({ id: 'req-1', ...created });

    await processor.process({
      name: 'discover-technology-source',
      data: { technologyInterestId: 'tech-1' },
    } as any);

    expect(mockDiscoveryRequestRepo.create).toHaveBeenCalledWith({
      technologyInterestId: 'tech-1',
    });
    expect(mockDiscoveryRequestRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        technologyInterestId: 'tech-1',
        status: TaxonomySourceDiscoveryStatus.PENDING_MANUAL_REVIEW,
      }),
    );
  });

  it('warns and does nothing for an unknown job name', async () => {
    await processor.process({ name: 'not-a-real-job', data: {} } as any);

    expect(mockDiscoveryRequestRepo.create).not.toHaveBeenCalled();
    expect(mockDiscoveryRequestRepo.save).not.toHaveBeenCalled();
  });
});
