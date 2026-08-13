import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, MoreThanOrEqual } from 'typeorm';
import {
  DiscoveryOperationType,
  DiscoveryQuotaRecord,
} from '../entities/discovery-quota-record.entity';

const DISCOVERY_LIMIT = 10;

@Injectable()
export class DiscoveryQuotaService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async reserve(
    userId: string,
    operationType: DiscoveryOperationType,
    idempotencyKey: string,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId]);
      const existing = await manager.findOne(DiscoveryQuotaRecord, {
        where: { userId, idempotencyKey },
      });
      if (existing) return false;

      const count = await manager.count(DiscoveryQuotaRecord, {
        where: {
          userId,
          createdAt: MoreThanOrEqual(new Date(Date.now() - 24 * 60 * 60 * 1000)),
        },
      });
      if (count >= DISCOVERY_LIMIT) {
        throw new HttpException(
          {
            message:
              'Discovery limit reached: at most ten operations are allowed in a rolling 24-hour period',
            errorCode: 'DISCOVERY_LIMIT_REACHED',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      await manager.save(
        DiscoveryQuotaRecord,
        manager.create(DiscoveryQuotaRecord, { userId, operationType, idempotencyKey }),
      );
      return true;
    });
  }
}
