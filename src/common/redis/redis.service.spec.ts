import { RedisService } from './redis.service';
import { LoggingService } from '../logging/logging.service';

const mockLoggingService = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as LoggingService;

describe('RedisService', () => {
  let service: RedisService;
  let mockClient: { scan: jest.Mock; del: jest.Mock };

  beforeEach(() => {
    service = new RedisService(mockLoggingService);
    mockClient = {
      scan: jest.fn(),
      del: jest.fn(),
    };
    // onModuleInit isn't invoked in this unit test — the ioredis client is stubbed directly.
    (service as unknown as { client: typeof mockClient }).client = mockClient;
  });

  describe('delByPattern', () => {
    it('deletes all matching keys across a multi-page SCAN', async () => {
      mockClient.scan
        .mockResolvedValueOnce(['5', ['feed:user1:a', 'feed:user1:b']])
        .mockResolvedValueOnce(['0', ['feed:user1:c']]);
      mockClient.del.mockResolvedValueOnce(2).mockResolvedValueOnce(1);

      const result = await service.delByPattern('feed:user1:*');

      expect(mockClient.scan).toHaveBeenCalledTimes(2);
      expect(mockClient.scan).toHaveBeenNthCalledWith(
        1,
        '0',
        'MATCH',
        'feed:user1:*',
        'COUNT',
        100,
      );
      expect(mockClient.scan).toHaveBeenNthCalledWith(
        2,
        '5',
        'MATCH',
        'feed:user1:*',
        'COUNT',
        100,
      );
      expect(mockClient.del).toHaveBeenNthCalledWith(1, 'feed:user1:a', 'feed:user1:b');
      expect(mockClient.del).toHaveBeenNthCalledWith(2, 'feed:user1:c');
      expect(result).toBe(3);
    });

    it('is a clean no-op when no keys match', async () => {
      mockClient.scan.mockResolvedValueOnce(['0', []]);

      const result = await service.delByPattern('feed:nomatch:*');

      expect(mockClient.scan).toHaveBeenCalledTimes(1);
      expect(mockClient.del).not.toHaveBeenCalled();
      expect(result).toBe(0);
    });

    it('does not call DEL for a page with zero matches mid-scan', async () => {
      mockClient.scan
        .mockResolvedValueOnce(['3', []])
        .mockResolvedValueOnce(['0', ['feed:user1:only']]);
      mockClient.del.mockResolvedValueOnce(1);

      const result = await service.delByPattern('feed:user1:*');

      expect(mockClient.del).toHaveBeenCalledTimes(1);
      expect(result).toBe(1);
    });
  });
});
