import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { HybridAuthGuard } from '../../auth/guards/hybrid-auth.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../users/entities/user.entity';
import { TechnologyInterestController } from './technology-interest.controller';

// getMetadata's return type is untyped by design (it reads arbitrary reflect-metadata) and the
// route handlers below are only ever referenced for reflection, never invoked, so `this` binding
// doesn't apply here — narrow, explained disables rather than fighting the rule (mirrors the
// existing precedent in src/queue/queue.service.spec.ts).
/* eslint-disable @typescript-eslint/unbound-method */

// Metadata-level checks that the merge endpoint's admin guard chain (HybridAuthGuard +
// RolesGuard + @Roles('admin')) is actually wired up, following the existing guard-test pattern
// from Phase 1 (src/auth/guards/*.spec.ts) — those tests cover the guards' own logic in
// isolation; this covers that the controller applies them where the spec requires.
describe('TechnologyInterestController guard wiring', () => {
  it('protects POST /technology-interests/merge with HybridAuthGuard + RolesGuard, admin only', () => {
    const guards: unknown = Reflect.getMetadata(
      GUARDS_METADATA,
      TechnologyInterestController.prototype.merge,
    );
    expect(guards).toEqual([HybridAuthGuard, RolesGuard]);

    const requiredRoles: unknown = Reflect.getMetadata(
      ROLES_KEY,
      TechnologyInterestController.prototype.merge,
    );
    expect(requiredRoles).toEqual([UserRole.ADMIN]);
  });

  it('protects GET /technology-interests with JwtAuthGuard only, not the admin guards', () => {
    const guards: unknown = Reflect.getMetadata(
      GUARDS_METADATA,
      TechnologyInterestController.prototype.findAll,
    );
    expect(guards).toEqual([JwtAuthGuard]);
  });
});
