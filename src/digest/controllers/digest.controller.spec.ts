// jsdom/@mozilla/readability are mocked at the module boundary, same as
// digest-bootstrap.service.spec.ts: jsdom v29's dependency tree is ESM-only several levels deep
// and isn't loadable under this project's Jest/ts-jest setup (pre-existing test-infra gap).
// DigestController reaches jsdom transitively (via DigestBootstrapService's real import chain,
// used here purely as a DI token type), never calls it directly.
jest.mock('jsdom', () => ({ JSDOM: jest.fn() }));
jest.mock('@mozilla/readability', () => ({ Readability: jest.fn() }));

import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { HybridAuthGuard } from '../../auth/guards/hybrid-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../users/entities/user.entity';
import { DigestType } from '../entities/digest.entity';
import { DigestController } from './digest.controller';

// Metadata-level checks that the class-level guard chain (HybridAuthGuard + RolesGuard +
// @Roles('admin')) is wired up for the whole controller, following the guard-test pattern from
// src/taxonomy/controllers/technology-interest.controller.spec.ts.
describe('DigestController guard wiring', () => {
  it('protects the whole controller with HybridAuthGuard + RolesGuard, admin only', () => {
    const guards: unknown = Reflect.getMetadata(GUARDS_METADATA, DigestController);
    expect(guards).toEqual([HybridAuthGuard, RolesGuard]);

    const requiredRoles: unknown = Reflect.getMetadata(ROLES_KEY, DigestController);
    expect(requiredRoles).toEqual([UserRole.ADMIN]);
  });
});

describe('DigestController.triggerDigest', () => {
  let controller: DigestController;

  const user = { id: 'user-1', email: 'user@example.com', emailVerifiedAt: new Date() };
  const digest = { id: 'digest-1', subject: 'Subject' };

  const mockDigestBootstrapService = {
    buildDailyDigest: jest.fn(),
    buildWeeklyDigest: jest.fn(),
  };
  const mockDigestQueryService = { markSent: jest.fn() };
  const mockUserQueryService = { findById: jest.fn() };
  const mockMailService = { sendDigest: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserQueryService.findById.mockResolvedValue(user);

    controller = new DigestController(
      mockDigestBootstrapService as any,
      mockDigestQueryService as any,
      mockUserQueryService as any,
      mockMailService as any,
    );
  });

  it('resolves the user, builds a fresh daily digest, and sends it to that user only', async () => {
    mockDigestBootstrapService.buildDailyDigest.mockResolvedValue(digest);

    const result = await controller.triggerDigest({ userId: 'user-1', type: DigestType.DAILY });

    expect(mockUserQueryService.findById).toHaveBeenCalledWith('user-1');
    expect(mockDigestBootstrapService.buildDailyDigest).toHaveBeenCalledWith('user-1');
    expect(mockMailService.sendDigest).toHaveBeenCalledWith(digest, user.email);
    expect(mockDigestQueryService.markSent).toHaveBeenCalledWith('digest-1');
    expect(result).toEqual({
      success: true,
      digestId: 'digest-1',
      subject: 'Subject',
      message: 'Fresh daily digest built and sent',
    });
  });

  it('propagates NotFoundException from user resolution without building or sending', async () => {
    mockUserQueryService.findById.mockRejectedValue(new NotFoundException('User not found'));

    await expect(
      controller.triggerDigest({ userId: 'missing', type: DigestType.DAILY }),
    ).rejects.toThrow(NotFoundException);
    expect(mockDigestBootstrapService.buildDailyDigest).not.toHaveBeenCalled();
    expect(mockMailService.sendDigest).not.toHaveBeenCalled();
  });

  // findById already excludes soft-deleted rows by default (TypeORM's @DeleteDateColumn
  // behavior on User.deletedAt) and throws NotFoundException for them — the same code path
  // covered by the "propagates NotFoundException from user resolution" test above. No separate
  // soft-delete test is needed at this (mocked-service) level.
  it('rejects a user who has not verified their email, without building or sending', async () => {
    mockUserQueryService.findById.mockResolvedValue({ ...user, emailVerifiedAt: null });

    await expect(
      controller.triggerDigest({ userId: 'user-1', type: DigestType.DAILY }),
    ).rejects.toThrow(ForbiddenException);
    expect(mockDigestBootstrapService.buildDailyDigest).not.toHaveBeenCalled();
    expect(mockDigestBootstrapService.buildWeeklyDigest).not.toHaveBeenCalled();
    expect(mockMailService.sendDigest).not.toHaveBeenCalled();
    expect(mockDigestQueryService.markSent).not.toHaveBeenCalled();
  });

  it('throws NotFoundException and sends nothing when the builder finds no eligible candidates', async () => {
    mockDigestBootstrapService.buildWeeklyDigest.mockResolvedValue(null);

    await expect(
      controller.triggerDigest({ userId: 'user-1', type: DigestType.WEEKLY }),
    ).rejects.toThrow(NotFoundException);
    expect(mockMailService.sendDigest).not.toHaveBeenCalled();
    expect(mockDigestQueryService.markSent).not.toHaveBeenCalled();
  });
});
