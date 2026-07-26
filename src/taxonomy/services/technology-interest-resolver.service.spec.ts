import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { TechnologyInterestResolverService } from './technology-interest-resolver.service';
import { TechnologyInterest, TechnologyInterestKind } from '../entities/technology-interest.entity';

describe('TechnologyInterestResolverService', () => {
  let service: TechnologyInterestResolverService;

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockQueryBuilder.getOne.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TechnologyInterestResolverService,
        { provide: getRepositoryToken(TechnologyInterest), useValue: mockRepository },
      ],
    }).compile();

    service = module.get<TechnologyInterestResolverService>(TechnologyInterestResolverService);
  });

  it('reuses an exact normalizedName match without querying alias/similarity', async () => {
    const existing = {
      id: 'ti-1',
      normalizedName: 'node.js',
      aliases: [],
    } as unknown as TechnologyInterest;
    mockRepository.findOne.mockResolvedValue(existing);

    const result = await service.resolve(TechnologyInterestKind.TECHNOLOGY, 'Node.js');

    expect(result).toEqual({ entity: existing, created: false });
    expect(mockRepository.createQueryBuilder).not.toHaveBeenCalled();
    expect(mockRepository.save).not.toHaveBeenCalled();
  });

  it('reuses an alias match when no exact match exists', async () => {
    mockRepository.findOne.mockResolvedValue(null);
    const aliasMatch = {
      id: 'ti-2',
      normalizedName: 'nodejs',
      aliases: ['node.js'],
    } as TechnologyInterest;
    mockQueryBuilder.getOne.mockResolvedValueOnce(aliasMatch);

    const result = await service.resolve(TechnologyInterestKind.TECHNOLOGY, 'node.js');

    expect(result).toEqual({ entity: aliasMatch, created: false });
    expect(mockRepository.save).not.toHaveBeenCalled();
  });

  it('reuses a similarity match above threshold and appends the input as a new alias', async () => {
    mockRepository.findOne.mockResolvedValue(null);
    const similarityMatch = {
      id: 'ti-3',
      normalizedName: 'nodejs',
      aliases: [],
    } as unknown as TechnologyInterest;
    mockQueryBuilder.getOne
      .mockResolvedValueOnce(null) // alias tier: no match
      .mockResolvedValueOnce(similarityMatch); // similarity tier: match
    mockRepository.save.mockImplementation((entity) => Promise.resolve(entity));

    const result = await service.resolve(TechnologyInterestKind.TECHNOLOGY, 'node js');

    expect(result.created).toBe(false);
    expect(result.entity.aliases).toContain('node js');
    expect(mockRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ aliases: ['node js'] }),
    );
  });

  it('does not duplicate an alias already present on a similarity match', async () => {
    mockRepository.findOne.mockResolvedValue(null);
    const similarityMatch = {
      id: 'ti-3',
      normalizedName: 'nodejs',
      aliases: ['node js'],
    } as unknown as TechnologyInterest;
    mockQueryBuilder.getOne.mockResolvedValueOnce(null).mockResolvedValueOnce(similarityMatch);

    const result = await service.resolve(TechnologyInterestKind.TECHNOLOGY, 'node js');

    expect(result.entity.aliases).toEqual(['node js']);
    expect(mockRepository.save).not.toHaveBeenCalled();
  });

  it('creates a new TechnologyInterest when no exact/alias/similarity match is found', async () => {
    mockRepository.findOne.mockResolvedValue(null);
    mockQueryBuilder.getOne.mockResolvedValue(null);
    const created = {
      id: 'ti-4',
      kind: TechnologyInterestKind.INTEREST,
      name: 'Observability',
      normalizedName: 'observability',
      aliases: [],
    } as unknown as TechnologyInterest;
    mockRepository.create.mockReturnValue(created);
    mockRepository.save.mockResolvedValue(created);

    const result = await service.resolve(TechnologyInterestKind.INTEREST, 'Observability');

    expect(result).toEqual({ entity: created, created: true });
    expect(mockRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: TechnologyInterestKind.INTEREST,
        name: 'Observability',
        normalizedName: 'observability',
        aliases: [],
      }),
    );
  });
});
