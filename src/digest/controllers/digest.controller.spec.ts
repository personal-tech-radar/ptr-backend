// jsdom/@mozilla/readability are mocked at the module boundary, same as
// digest-bootstrap.service.spec.ts: jsdom v29's dependency tree is ESM-only several levels deep
// and isn't loadable under this project's Jest/ts-jest setup (pre-existing test-infra gap).
// DigestController reaches jsdom transitively (via DigestBootstrapService's real import chain,
// used here purely as a DI token type), never calls it directly.
jest.mock('jsdom', () => ({ JSDOM: jest.fn() }));
jest.mock('@mozilla/readability', () => ({ Readability: jest.fn() }));

import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { HybridAuthGuard } from '../../auth/guards/hybrid-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../users/entities/user.entity';
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
