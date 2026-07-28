// jsdom/@mozilla/readability are mocked at the module boundary, same as
// content-extraction.service.spec.ts and source-candidates.service.spec.ts: jsdom v29's
// dependency tree is ESM-only several levels deep and isn't loadable under this project's
// Jest/ts-jest setup (pre-existing test-infra gap). SourceCandidatesController reaches jsdom
// transitively (via SourceCandidatesService's real import chain, used here purely as a DI token
// type), never calls it directly.
jest.mock('jsdom', () => ({ JSDOM: jest.fn() }));
jest.mock('@mozilla/readability', () => ({ Readability: jest.fn() }));

import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { HybridAuthGuard } from '../../auth/guards/hybrid-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../users/entities/user.entity';
import { SourceCandidatesController } from './source-candidates.controller';

// Metadata-level checks that the class-level guard chain (HybridAuthGuard + RolesGuard +
// @Roles('admin')) is wired up for the whole controller, following the guard-test pattern from
// src/taxonomy/controllers/technology-interest.controller.spec.ts.
describe('SourceCandidatesController guard wiring', () => {
  it('protects the whole controller with HybridAuthGuard + RolesGuard, admin only', () => {
    const guards: unknown = Reflect.getMetadata(GUARDS_METADATA, SourceCandidatesController);
    expect(guards).toEqual([HybridAuthGuard, RolesGuard]);

    const requiredRoles: unknown = Reflect.getMetadata(ROLES_KEY, SourceCandidatesController);
    expect(requiredRoles).toEqual([UserRole.ADMIN]);
  });
});
