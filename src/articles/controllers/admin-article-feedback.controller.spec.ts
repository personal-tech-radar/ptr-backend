import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { HybridAuthGuard } from '../../auth/guards/hybrid-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../users/entities/user.entity';
import { AdminArticleFeedbackController } from './admin-article-feedback.controller';

// Metadata-level checks that the class-level guard chain (HybridAuthGuard + RolesGuard +
// @Roles('admin')) is wired up for the whole controller, following the guard-test pattern from
// src/articles/controllers/admin-articles.controller.spec.ts.
describe('AdminArticleFeedbackController guard wiring', () => {
  it('protects the whole controller with HybridAuthGuard + RolesGuard, admin only', () => {
    const guards: unknown = Reflect.getMetadata(GUARDS_METADATA, AdminArticleFeedbackController);
    expect(guards).toEqual([HybridAuthGuard, RolesGuard]);

    const requiredRoles: unknown = Reflect.getMetadata(ROLES_KEY, AdminArticleFeedbackController);
    expect(requiredRoles).toEqual([UserRole.ADMIN]);
  });
});
