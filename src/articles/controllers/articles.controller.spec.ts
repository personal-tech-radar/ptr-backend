import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { HybridAuthGuard } from '../../auth/guards/hybrid-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../users/entities/user.entity';
import { ArticlesController } from './articles.controller';

/* eslint-disable @typescript-eslint/unbound-method */

// Metadata-level checks confirming Decision A of MVP3 Phase 8a: findAll/findOne stay
// API-key-only (moved from class-level to method-level with zero behavior change), while
// addFeedback alone moves to the admin guard chain (HybridAuthGuard + RolesGuard + @Roles('admin')).
// Follows the guard-test pattern from src/taxonomy/controllers/technology-interest.controller.spec.ts.
describe('ArticlesController guard wiring', () => {
  it('does not apply any guard at the class level', () => {
    const guards: unknown = Reflect.getMetadata(GUARDS_METADATA, ArticlesController);
    expect(guards).toBeUndefined();
  });

  it('protects GET /articles with ApiKeyGuard only', () => {
    const guards: unknown = Reflect.getMetadata(
      GUARDS_METADATA,
      ArticlesController.prototype.findAll,
    );
    expect(guards).toEqual([ApiKeyGuard]);
  });

  it('protects GET /articles/:id with ApiKeyGuard only', () => {
    const guards: unknown = Reflect.getMetadata(
      GUARDS_METADATA,
      ArticlesController.prototype.findOne,
    );
    expect(guards).toEqual([ApiKeyGuard]);
  });

  it('protects POST /articles/:id/feedback with HybridAuthGuard + RolesGuard, admin only', () => {
    const guards: unknown = Reflect.getMetadata(
      GUARDS_METADATA,
      ArticlesController.prototype.addFeedback,
    );
    expect(guards).toEqual([HybridAuthGuard, RolesGuard]);

    const requiredRoles: unknown = Reflect.getMetadata(
      ROLES_KEY,
      ArticlesController.prototype.addFeedback,
    );
    expect(requiredRoles).toEqual([UserRole.ADMIN]);
  });
});
