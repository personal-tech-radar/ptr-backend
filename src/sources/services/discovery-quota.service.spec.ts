import { HttpException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DiscoveryOperationType } from '../entities/discovery-quota-record.entity';
import { DiscoveryQuotaService } from './discovery-quota.service';

describe('DiscoveryQuotaService', () => {
  const manager = {
    query: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    create: jest.fn((_entity: unknown, value: unknown): unknown => value),
    save: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn((callback: (value: typeof manager) => Promise<unknown>) =>
      callback(manager),
    ),
  };
  const service = new DiscoveryQuotaService(dataSource as unknown as DataSource);

  beforeEach(() => {
    jest.clearAllMocks();
    manager.findOne.mockResolvedValue(null);
    manager.query.mockResolvedValueOnce(undefined);
    manager.count.mockResolvedValue(0);
  });

  it('atomically reserves a combined discovery operation', async () => {
    await expect(
      service.reserve('user', DiscoveryOperationType.SOURCE_URL, 'url:example'),
    ).resolves.toBe(true);
    expect(manager.query).toHaveBeenNthCalledWith(1, 'SELECT pg_advisory_xact_lock(hashtext($1))', [
      'user',
    ]);
    expect(manager.save).toHaveBeenCalledTimes(1);
  });

  it('does not consume quota twice for the same idempotency key', async () => {
    manager.findOne.mockResolvedValue({ id: 'existing' });
    await expect(
      service.reserve('user', DiscoveryOperationType.TECHNOLOGY, 'taxonomy:node'),
    ).resolves.toBe(false);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects the eleventh rolling-day operation', async () => {
    manager.count.mockResolvedValue(10);
    const result = service.reserve('user', DiscoveryOperationType.INTEREST, 'taxonomy:systems');
    await expect(result).rejects.toBeInstanceOf(HttpException);
    await expect(result).rejects.toMatchObject({
      status: 429,
      response: {
        message:
          'Discovery limit reached: at most ten operations are allowed in a rolling 24-hour period',
        errorCode: 'DISCOVERY_LIMIT_REACHED',
      },
    });
  });
});
