import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ArticleFeedbackType } from '../entities/article-feedback.entity';
import { ArticlesController } from './articles.controller';

/* eslint-disable @typescript-eslint/unbound-method */

// Metadata-level checks confirming Decision A of MVP3 Phase 8a (extended in Phase 11):
// findAll/findOne stay API-key-only (moved from class-level to method-level with zero behavior
// change), while addFeedback uses the user-only JwtAuthGuard because feedback submission requires
// a real authenticated user id, not a machine API-key client or administrator.
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

  it('protects POST /articles/:id/feedback with JwtAuthGuard for ordinary users', () => {
    const guards: unknown = Reflect.getMetadata(
      GUARDS_METADATA,
      ArticlesController.prototype.addFeedback,
    );
    expect(guards).toEqual([JwtAuthGuard]);
  });

  it('does not expose a feedback deletion operation', () => {
    expect(
      (ArticlesController.prototype as unknown as { removeFeedback?: unknown }).removeFeedback,
    ).toBeUndefined();
  });
});

describe('ArticlesController.addFeedback', () => {
  const mockPublicArticlesService = {};
  const mockArticleFeedbackService = { upsertFeedback: jest.fn() };

  it('passes the authenticated user id through to the service, not a default/placeholder', async () => {
    const controller = new ArticlesController(
      mockPublicArticlesService as never,
      mockArticleFeedbackService as never,
    );
    const currentUser = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'jane@example.com',
      emailVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
      subjectType: 'user' as const,
    };
    mockArticleFeedbackService.upsertFeedback.mockResolvedValue({ id: 'fb-1' });

    await controller.addFeedback('article-1', { type: ArticleFeedbackType.USEFUL }, currentUser);

    expect(mockArticleFeedbackService.upsertFeedback).toHaveBeenCalledWith(
      'article-1',
      ArticleFeedbackType.USEFUL,
      currentUser.id,
    );
  });
});
