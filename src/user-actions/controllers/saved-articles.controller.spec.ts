import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SavedArticlesController } from './saved-articles.controller';

// Metadata-level check that JwtAuthGuard is applied to the whole controller, following the
// existing guard-test precedent (see technology-interest.controller.spec.ts).
describe('SavedArticlesController guard wiring', () => {
  it('protects every /saved-articles route with JwtAuthGuard', () => {
    const guards: unknown = Reflect.getMetadata(GUARDS_METADATA, SavedArticlesController);
    expect(guards).toEqual([JwtAuthGuard]);
  });
});
