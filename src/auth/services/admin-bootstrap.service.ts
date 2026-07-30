import { Injectable, OnModuleInit } from '@nestjs/common';
import { LoggingService } from '../../common/logging/logging.service';
import { UserRole } from '../../users/entities/user.entity';
import { UserCommandService } from '../../users/services/user-command.service';
import { UserQueryService } from '../../users/services/user-query.service';
import { hashPassword } from '../utils/password-hash.util';

// Ensures a working admin account exists on every boot. ADMIN_EMAIL and ADMIN_PASSWORD are both
// required — fail-fast, mirroring JWT_SECRET/API_KEY's "throw on missing required secret" pattern
// (see getJwtSecret) rather than warning and skipping. A soft-deleted user occupying ADMIN_EMAIL
// is automatically resurrected as an admin so "the admin login always works" holds unconditionally
// across restarts, but an existing user's password hash is never touched either way.
@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  private readonly logger = new LoggingService(AdminBootstrapService.name);

  constructor(
    private readonly userCommandService: UserCommandService,
    private readonly userQueryService: UserQueryService,
  ) {}

  async onModuleInit(): Promise<void> {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (!email) {
      throw new Error('ADMIN_EMAIL environment variable is not configured.');
    }

    const password = process.env.ADMIN_PASSWORD;
    if (!password) {
      throw new Error('ADMIN_PASSWORD environment variable is not configured.');
    }

    const existing = await this.userQueryService.findByEmailIncludingDeleted(email);

    if (existing && !existing.deletedAt) {
      this.logger.info('Admin bootstrap: user already exists for ADMIN_EMAIL, skipping', {
        userId: existing.id,
      });
      return;
    }

    if (existing && existing.deletedAt) {
      const resurrected = await this.userCommandService.resurrectAsAdmin(existing.id);
      this.logger.info('Admin bootstrap: resurrected soft-deleted user as admin', {
        userId: resurrected.id,
      });
      return;
    }

    const passwordHash = await hashPassword(password);
    const admin = await this.userCommandService.create({
      email,
      passwordHash,
      displayName: 'Admin',
      timezone: 'UTC',
      role: UserRole.ADMIN,
      emailVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
    });
    this.logger.info('Admin bootstrap: admin account created', { userId: admin.id });
  }
}
