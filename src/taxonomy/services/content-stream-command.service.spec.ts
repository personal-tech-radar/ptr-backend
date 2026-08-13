import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { ContentStreamCommandService } from './content-stream-command.service';
import { UpdateContentStreamDto } from '../dto/update-content-stream.dto';
import { ContentStream } from '../entities/content-stream.entity';

describe('ContentStreamCommandService', () => {
  let service: ContentStreamCommandService;

  const validId = '123e4567-e89b-12d3-a456-426614174000';

  const mockContentStreamRepo = {
    findOne: jest.fn(),
    save: jest.fn((data: Partial<ContentStream>) => Promise.resolve(data)),
  };

  const mockUserContentStreamRepo = {
    manager: {
      transaction: jest.fn((callback: (manager: unknown) => Promise<void>) =>
        callback(mockTransactionManager),
      ),
    },
  };

  const mockTransactionManager = {
    delete: jest.fn(),
    find: jest.fn(),
    create: jest.fn((_entity: unknown, data: unknown) => data),
    save: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ContentStreamCommandService(
      mockContentStreamRepo as any,
      mockUserContentStreamRepo as any,
    );
  });

  it('replaces deselected streams and inserts missing selections in one transaction', async () => {
    mockTransactionManager.find.mockResolvedValue([{ contentStreamId: 'cs-1' }]);

    await service.linkUserSelections('user-1', ['cs-1', 'cs-2', 'cs-2']);

    expect(mockUserContentStreamRepo.manager.transaction).toHaveBeenCalledTimes(1);
    expect(mockTransactionManager.delete).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ userId: 'user-1' }),
    );
    expect(mockTransactionManager.save).toHaveBeenCalledWith(expect.any(Function), [
      expect.objectContaining({ userId: 'user-1', contentStreamId: 'cs-2' }),
    ]);
  });

  it('does not insert duplicates when the requested selection already exists', async () => {
    mockTransactionManager.find.mockResolvedValue([{ contentStreamId: 'cs-1' }]);

    await service.linkUserSelections('user-1', ['cs-1']);

    expect(mockTransactionManager.save).not.toHaveBeenCalled();
  });

  describe('update', () => {
    it('throws BadRequestException for an invalid ID format', async () => {
      await expect(service.update('not-a-uuid', { name: 'Security' })).rejects.toThrow(
        BadRequestException,
      );
      expect(mockContentStreamRepo.findOne).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the entity does not exist', async () => {
      mockContentStreamRepo.findOne.mockResolvedValue(null);

      await expect(service.update(validId, { name: 'Security' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('updates the provided fields and saves', async () => {
      const entity = {
        id: validId,
        key: 'security',
        name: 'Security',
        description: null,
        sortOrder: 1,
        enabled: true,
      } as ContentStream;
      mockContentStreamRepo.findOne.mockResolvedValue(entity);

      const result = await service.update(validId, { name: 'Security News', enabled: false });

      expect(result.name).toBe('Security News');
      expect(result.enabled).toBe(false);
      expect(result.key).toBe('security');
      expect(mockContentStreamRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Security News', enabled: false }),
      );
    });

    // Regression guard: Object.assign(entity, dto) used to blindly copy every declared DTO
    // property onto the entity, including properties absent from the request body — which
    // class-transformer still materializes as own-enumerable `undefined` fields under this
    // project's ES2023 class-field semantics. That silently wiped out real values already loaded
    // by findOne (see the ContentStreamCommandService.update doc comment). This test fails against
    // that old Object.assign-based implementation and passes against the targeted
    // conditional-assignment fix.
    it('preserves untouched fields on a partial update instead of blanking them to undefined', async () => {
      const entity = {
        id: validId,
        key: 'security',
        name: 'Security',
        description: 'Existing description',
        sortOrder: 3,
        enabled: true,
      } as ContentStream;
      mockContentStreamRepo.findOne.mockResolvedValue(entity);

      // Built via plainToInstance (not a plain object literal) to reproduce what the global
      // ValidationPipe actually hands the service: a class-transformer instance where every
      // declared DTO field is an own-enumerable property, `undefined` for anything omitted from
      // the request body — the exact shape that broke Object.assign(entity, dto).
      const dto = plainToInstance(UpdateContentStreamDto, { enabled: false });

      const result = await service.update(validId, dto);

      expect(result.enabled).toBe(false);
      expect(result.name).toBe('Security');
      expect(result.description).toBe('Existing description');
      expect(result.sortOrder).toBe(3);
    });

    it('clears the description when the request body explicitly sets it to null', async () => {
      const entity = {
        id: validId,
        key: 'security',
        name: 'Security',
        description: 'Existing description',
        sortOrder: 3,
        enabled: true,
      } as ContentStream;
      mockContentStreamRepo.findOne.mockResolvedValue(entity);

      const dto = plainToInstance(UpdateContentStreamDto, { description: null });

      const result = await service.update(validId, dto);

      expect(result.description).toBeNull();
      expect(result.name).toBe('Security');
      expect(result.sortOrder).toBe(3);
      expect(result.enabled).toBe(true);
    });
  });
});
