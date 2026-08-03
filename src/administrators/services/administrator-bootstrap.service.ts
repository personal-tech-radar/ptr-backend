import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoggingService } from '../../common/logging/logging.service';
import { hashPassword } from '../../auth/utils/password-hash.util';
import { Administrator } from '../entities/administrator.entity';

@Injectable()
export class AdministratorBootstrapService implements OnModuleInit {
  private readonly logger = new LoggingService(AdministratorBootstrapService.name);
  constructor(
    @InjectRepository(Administrator) private readonly repository: Repository<Administrator>,
  ) {}

  async onModuleInit(): Promise<void> {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be configured.');
    if (await this.repository.findOne({ where: { email } })) return;
    const administrator = await this.repository.save(
      this.repository.create({
        email,
        passwordHash: await hashPassword(password),
        tokenVersion: 0,
        lastLoginAt: null,
        createdByAdminId: null,
      }),
    );
    this.logger.info('Administrator bootstrap completed', { administratorId: administrator.id });
  }
}
