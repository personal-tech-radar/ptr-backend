import { BadRequestException } from '@nestjs/common';
import { SourcesService } from './sources.service';
import { CreateSourceDto } from '../dto/create-source.dto';
import { SourceCategory, SourceType } from '../entities/source.entity';
import { WebDiscoveryMethod } from '../entities/web-source-config.entity';

describe('SourcesService', () => {
  let service: SourcesService;

  const mockSourceRepo = {
    findOne: jest.fn(),
  };
  const mockWebSourceConfigRepo = {
    update: jest.fn(),
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
});
