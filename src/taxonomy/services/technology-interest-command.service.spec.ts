import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TechnologyInterestCommandService } from './technology-interest-command.service';
import { TechnologyInterestResolverService } from './technology-interest-resolver.service';
import { TechnologyInterest, TechnologyInterestKind } from '../entities/technology-interest.entity';
import { UserTechnologyInterest } from '../entities/user-technology-interest.entity';

describe('TechnologyInterestCommandService', () => {
  let service: TechnologyInterestCommandService;

  const validWinnerId = '123e4567-e89b-12d3-a456-426614174000';
  const validLoserId = '223e4567-e89b-12d3-a456-426614174000';

  const mockUserTechnologyInterestRepo = {
    findOne: jest.fn(),
    create: jest.fn((data: unknown) => data),
    save: jest.fn((data: Partial<UserTechnologyInterest>) => Promise.resolve(data)),
  };

  const mockResolverService = {
    resolve: jest.fn(),
  };

  const mockQueueService = {
    addTaxonomySourceDiscoveryJob: jest.fn(),
  };

  const mockManager = {
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    save: jest.fn((_entity: unknown, data: unknown) => Promise.resolve(data)),
  };

  const mockDataSource = {
    transaction: jest.fn((cb: (manager: unknown) => unknown) => cb(mockManager)),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TechnologyInterestCommandService(
      mockUserTechnologyInterestRepo as any,
      mockResolverService as any,
      mockQueueService as any,
      mockDataSource as any,
    );
  });

  describe('createOrReuse', () => {
    const entity = { id: 'ti-1' } as TechnologyInterest;

    it('links a reused (non-new) entity to the user without enqueueing a discovery job', async () => {
      mockResolverService.resolve.mockResolvedValue({ entity, created: false });
      mockUserTechnologyInterestRepo.findOne.mockResolvedValue(null);

      const result = await service.createOrReuse(
        'user-1',
        TechnologyInterestKind.TECHNOLOGY,
        'Node.js',
      );

      expect(result).toBe(entity);
      expect(mockUserTechnologyInterestRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', technologyInterestId: 'ti-1' }),
      );
      expect(mockQueueService.addTaxonomySourceDiscoveryJob).not.toHaveBeenCalled();
    });

    it('does not create a duplicate link when the user is already linked (upsert-ignore)', async () => {
      mockResolverService.resolve.mockResolvedValue({ entity, created: false });
      mockUserTechnologyInterestRepo.findOne.mockResolvedValue({ id: 'link-1' });

      await service.createOrReuse('user-1', TechnologyInterestKind.TECHNOLOGY, 'Node.js');

      expect(mockUserTechnologyInterestRepo.save).not.toHaveBeenCalled();
    });

    it('enqueues a discovery job only when a genuinely new entity was created', async () => {
      mockResolverService.resolve.mockResolvedValue({ entity, created: true });
      mockUserTechnologyInterestRepo.findOne.mockResolvedValue(null);

      await service.createOrReuse('user-1', TechnologyInterestKind.TECHNOLOGY, 'Zig');

      expect(mockQueueService.addTaxonomySourceDiscoveryJob).toHaveBeenCalledWith('ti-1');
    });
  });

  describe('merge', () => {
    it('throws BadRequestException for a malformed winnerId/loserId', async () => {
      await expect(service.merge('not-a-uuid', validLoserId)).rejects.toThrow(BadRequestException);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when winnerId equals loserId', async () => {
      await expect(service.merge(validWinnerId, validWinnerId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when the winner does not exist', async () => {
      mockManager.findOne.mockResolvedValueOnce(null);

      await expect(service.merge(validWinnerId, validLoserId)).rejects.toThrow(NotFoundException);
    });

    it('reassigns loser join rows to the winner', async () => {
      const winner = { id: validWinnerId } as TechnologyInterest;
      const loser = { id: validLoserId } as TechnologyInterest;
      const loserLink = { id: 'link-1', userId: 'user-1', technologyInterestId: validLoserId };

      mockManager.findOne
        .mockResolvedValueOnce(winner) // winner lookup
        .mockResolvedValueOnce(loser) // loser lookup
        .mockResolvedValueOnce(null); // winner-already-linked check for loserLink -> no collision
      mockManager.find.mockResolvedValue([loserLink]);

      const result = await service.merge(validWinnerId, validLoserId);

      expect(result).toBe(winner);
      expect(mockManager.update).toHaveBeenCalledWith(
        UserTechnologyInterest,
        { id: 'link-1' },
        { technologyInterestId: validWinnerId },
      );
      expect(mockManager.delete).not.toHaveBeenCalled();
    });

    it('deletes the loser join row instead of reassigning when the user already has the winner selected', async () => {
      const winner = { id: validWinnerId } as TechnologyInterest;
      const loser = { id: validLoserId } as TechnologyInterest;
      const loserLink = { id: 'link-1', userId: 'user-1', technologyInterestId: validLoserId };
      const winnerLink = { id: 'link-2', userId: 'user-1', technologyInterestId: validWinnerId };

      mockManager.findOne
        .mockResolvedValueOnce(winner)
        .mockResolvedValueOnce(loser)
        .mockResolvedValueOnce(winnerLink); // collision found
      mockManager.find.mockResolvedValue([loserLink]);

      await service.merge(validWinnerId, validLoserId);

      expect(mockManager.delete).toHaveBeenCalledWith(UserTechnologyInterest, { id: 'link-1' });
      expect(mockManager.update).not.toHaveBeenCalled();
    });

    it('soft-deletes the loser with mergedIntoId set to the winner', async () => {
      const winner = {
        id: validWinnerId,
        normalizedName: 'winner',
        aliases: [],
      } as unknown as TechnologyInterest;
      const loser = {
        id: validLoserId,
        normalizedName: 'loser',
        aliases: [],
      } as unknown as TechnologyInterest;

      mockManager.findOne.mockResolvedValueOnce(winner).mockResolvedValueOnce(loser);
      mockManager.find.mockResolvedValue([]);

      await service.merge(validWinnerId, validLoserId);

      expect(mockManager.save).toHaveBeenCalledWith(
        TechnologyInterest,
        expect.objectContaining({ id: validLoserId, mergedIntoId: validWinnerId }),
      );
      const savedLoser = mockManager.save.mock.calls[1][1] as TechnologyInterest;
      expect(savedLoser.deletedAt).toBeInstanceOf(Date);
    });

    it('folds the loser normalizedName and its own aliases into the winner before soft-deleting it', async () => {
      const winner = {
        id: validWinnerId,
        normalizedName: 'node.js',
        aliases: ['nodejs'],
      } as unknown as TechnologyInterest;
      const loser = {
        id: validLoserId,
        normalizedName: 'node js',
        aliases: ['nodejs', 'node-js'],
      } as unknown as TechnologyInterest;

      mockManager.findOne.mockResolvedValueOnce(winner).mockResolvedValueOnce(loser);
      mockManager.find.mockResolvedValue([]);

      await service.merge(validWinnerId, validLoserId);

      const savedWinner = mockManager.save.mock.calls[0][1] as TechnologyInterest;
      expect(savedWinner.id).toBe(validWinnerId);
      expect(savedWinner.aliases).toEqual(expect.arrayContaining(['nodejs', 'node js', 'node-js']));
      // deduped, not appended twice
      expect(savedWinner.aliases.filter((a) => a === 'nodejs')).toHaveLength(1);
    });

    it('propagates a failure from within the transaction so nothing partially commits', async () => {
      mockDataSource.transaction.mockImplementationOnce(() => {
        throw new Error('simulated DB failure');
      });

      await expect(service.merge(validWinnerId, validLoserId)).rejects.toThrow(
        'simulated DB failure',
      );
    });

    // Regression test for the bug found in code review: without folding the loser's
    // normalizedName into the winner's aliases, a later resolve() call for that exact name would
    // fall through every match tier (all of which exclude soft-deleted rows) to the `create`
    // branch and hit an uncaught unique-violation on (kind, normalizedName).
    it('lets a future resolve() for the loser former exact name reuse the winner instead of attempting a duplicate create', async () => {
      const winner = {
        id: validWinnerId,
        kind: TechnologyInterestKind.TECHNOLOGY,
        normalizedName: 'node.js',
        aliases: [],
        deletedAt: null,
      } as unknown as TechnologyInterest;
      const loser = {
        id: validLoserId,
        kind: TechnologyInterestKind.TECHNOLOGY,
        normalizedName: 'nodejs',
        aliases: [],
        deletedAt: null,
      } as unknown as TechnologyInterest;

      mockManager.findOne.mockResolvedValueOnce(winner).mockResolvedValueOnce(loser);
      mockManager.find.mockResolvedValue([]);

      await service.merge(validWinnerId, validLoserId);

      // Merge folded the loser's normalizedName into the winner's aliases.
      expect(winner.aliases).toEqual(['nodejs']);

      // Simulate resolve('nodejs') running after the merge: exact-match tier misses (the row for
      // "nodejs" is soft-deleted and excluded), alias-match tier now finds the winner because its
      // aliases contain "nodejs".
      const resolverRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        createQueryBuilder: jest.fn(() => ({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(winner),
        })),
        save: jest.fn(),
        create: jest.fn(),
      };
      const resolverService = new TechnologyInterestResolverService(resolverRepo as any);

      const result = await resolverService.resolve(TechnologyInterestKind.TECHNOLOGY, 'NodeJS');

      expect(result).toEqual({ entity: winner, created: false });
      expect(resolverRepo.create).not.toHaveBeenCalled();
      expect(resolverRepo.save).not.toHaveBeenCalled();
    });
  });
});
