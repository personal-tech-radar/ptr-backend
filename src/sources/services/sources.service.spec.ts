import { BadRequestException } from '@nestjs/common';
import { SourcesService } from './sources.service';
import { CreateSourceDto } from '../dto/create-source.dto';
import { SourceCategory, SourceType } from '../entities/source.entity';
import { WebDiscoveryMethod } from '../entities/web-source-config.entity';

describe('SourcesService', () => {
  let service: SourcesService;

  const mockQueryBuilder = {
    withDeleted: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  };

  const mockSourceRepo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  };
  const mockWebSourceConfigRepo = {
    update: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
  };
  const mockSourceDiscoveryService = {
    discoverEntryPoints: jest.fn(),
  };
  const mockSourceStructureAiService = {
    suggestAndValidate: jest.fn(),
  };
  const mockManager = {
    create: jest.fn((_entity: unknown, data: unknown) => data),
    save: jest.fn((_entity: unknown, data: unknown) =>
      Promise.resolve({ id: 'generated-id', ...(data as object) }),
    ),
  };
  const mockDataSource = {
    transaction: jest.fn((cb: (manager: unknown) => unknown) => cb(mockManager)),
  };

  const webSourceDto: CreateSourceDto = {
    name: 'Example Blog',
    url: 'https://example.com',
    type: SourceType.WEB,
    category: SourceCategory.ENGINEERING_DEEP_DIVES,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSourceRepo.findOne.mockResolvedValue(null);
    mockWebSourceConfigRepo.find.mockResolvedValue([]);

    mockSourceStructureAiService.suggestAndValidate.mockResolvedValue(null);

    service = new SourcesService(
      mockSourceRepo as any,
      mockWebSourceConfigRepo as any,
      mockSourceDiscoveryService as any,
      mockSourceStructureAiService as any,
      mockDataSource as any,
    );
  });

  describe('create (web source)', () => {
    it('persists both the Source and WebSourceConfig in a single transaction when discovery succeeds', async () => {
      mockSourceDiscoveryService.discoverEntryPoints.mockResolvedValue({
        success: true,
        method: WebDiscoveryMethod.SITEMAP,
        entryUrls: ['https://example.com/post-1'],
        sitemapUrl: 'https://example.com/sitemap.xml',
        confidence: 'high',
      });

      const result = await service.create(webSourceDto);

      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      // Both writes go through the same transactional manager, not the module-level repos.
      expect(mockManager.save).toHaveBeenCalledTimes(2);
      expect(result.id).toBe('generated-id');
      expect(result.webConfig).toMatchObject({
        sourceId: 'generated-id',
        preferredDiscoveryMethod: WebDiscoveryMethod.SITEMAP,
        sitemapUrl: 'https://example.com/sitemap.xml',
      });
    });

    it('rejects with a clear error and never opens a transaction when discovery fails', async () => {
      mockSourceDiscoveryService.discoverEntryPoints.mockResolvedValue({
        success: false,
        method: null,
        entryUrls: [],
        confidence: 'low',
        reason: 'no usable sitemap or feed found',
      });

      await expect(service.create(webSourceDto)).rejects.toThrow(BadRequestException);

      // AI structural fallback is offered a chance before giving up.
      expect(mockSourceStructureAiService.suggestAndValidate).toHaveBeenCalledWith(
        webSourceDto.url,
        expect.objectContaining({ entryUrls: [webSourceDto.url] }),
        'no usable sitemap or feed found',
      );
      // No orphaned Source row is possible: the transaction is never entered.
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('uses the AI-validated recipe when deterministic discovery fails but the AI fallback validates one', async () => {
      mockSourceDiscoveryService.discoverEntryPoints.mockResolvedValue({
        success: false,
        method: null,
        entryUrls: [],
        confidence: 'low',
        reason: 'no usable sitemap or feed found',
      });
      mockSourceStructureAiService.suggestAndValidate.mockResolvedValue({
        validated: true,
        result: {
          success: true,
          method: WebDiscoveryMethod.CHEERIO,
          entryUrls: ['https://example.com/post-1'],
          articleLinkSelector: '.post h2 a',
          confidence: 'medium',
        },
      });

      const result = await service.create(webSourceDto);

      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(result.webConfig).toMatchObject({
        preferredDiscoveryMethod: WebDiscoveryMethod.CHEERIO,
        articleLinkSelector: '.post h2 a',
      });
    });
  });

  describe('updateWebSourceConfigRecipe', () => {
    it('updates the recipe fields and bumps lastValidatedAt', async () => {
      await service.updateWebSourceConfigRecipe('source-1', {
        preferredDiscoveryMethod: WebDiscoveryMethod.CHEERIO,
        articleLinkSelector: '.listing',
      });

      expect(mockWebSourceConfigRepo.update).toHaveBeenCalledWith(
        { sourceId: 'source-1' },
        expect.objectContaining({
          preferredDiscoveryMethod: WebDiscoveryMethod.CHEERIO,
          articleLinkSelector: '.listing',
          lastValidatedAt: expect.any(Date) as unknown as Date,
        }),
      );
    });
  });

  describe('findAll', () => {
    it('paginates with default params', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([
        [{ id: 'source-1', type: SourceType.RSS }],
        1,
      ]);

      const result = await service.findAll({});

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
      expect(mockQueryBuilder.withDeleted).not.toHaveBeenCalled();
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
      expect(result.data).toEqual([{ id: 'source-1', type: SourceType.RSS }]);
    });

    it('applies type, category, and enabled filters', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({
        type: SourceType.RSS,
        category: SourceCategory.AI_ENGINEERING,
        enabled: true,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('source.type = :type', {
        type: SourceType.RSS,
      });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('source.category = :category', {
        category: SourceCategory.AI_ENGINEERING,
      });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('source.enabled = :enabled', {
        enabled: true,
      });
    });

    it('only includes soft-deleted sources when includeDeleted is explicitly true', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ includeDeleted: true });

      expect(mockQueryBuilder.withDeleted).toHaveBeenCalledTimes(1);
    });

    it('attaches web configs only for web-type sources in the current page', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([
        [
          { id: 'source-1', type: SourceType.WEB },
          { id: 'source-2', type: SourceType.RSS },
        ],
        2,
      ]);
      mockWebSourceConfigRepo.find.mockResolvedValue([
        { sourceId: 'source-1', sitemapUrl: 'https://example.com/sitemap.xml' },
      ]);

      const result = await service.findAll({});

      expect(mockWebSourceConfigRepo.find).toHaveBeenCalledWith({
        where: { sourceId: expect.anything() as unknown },
      });
      expect(result.data[0]).toMatchObject({
        id: 'source-1',
        webConfig: { sourceId: 'source-1', sitemapUrl: 'https://example.com/sitemap.xml' },
      });
      expect(result.data[1]).toMatchObject({ id: 'source-2', webConfig: undefined });
    });

    it('computes correct pagination math for a non-default page/limit', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 45]);

      const result = await service.findAll({ page: 3, limit: 10 });

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
      expect(result.meta).toEqual({ total: 45, page: 3, limit: 10, totalPages: 5 });
    });
  });
});
