import { createHash, randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  ArticleFeedback,
  ArticleFeedbackType,
} from '../src/articles/entities/article-feedback.entity';
import { Article, ArticleStatus } from '../src/articles/entities/article.entity';
import { ArticleFeedbackService } from '../src/articles/services/article-feedback.service';
import { ArticlesService } from '../src/articles/services/articles.service';
import { Source, SourceCategory, SourceStatus, SourceType } from '../src/sources/entities/source.entity';
import { UserSourcePreferenceService } from '../src/sources/services/user-source-preference.service';
import { UserSourcePreference } from '../src/sources/entities/user-source-preference.entity';
import {
  PersonalArticleLink,
  PersonalArticleLinkContext,
} from '../src/user-actions/entities/personal-article-link.entity';
import { SavedArticle } from '../src/user-actions/entities/saved-article.entity';
import { UserArticleOpening } from '../src/user-actions/entities/user-article-opening.entity';
import { PersonalArticleLinkService } from '../src/user-actions/services/personal-article-link.service';
import { SavedArticleService } from '../src/user-actions/services/saved-article.service';
import { User } from '../src/users/entities/user.entity';

describe('User interaction PostgreSQL transactions (e2e)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let savedService: SavedArticleService;
  let feedbackService: ArticleFeedbackService;
  let linkService: PersonalArticleLinkService;
  let preferenceService: UserSourcePreferenceService;
  let user: User;
  let source: Source;
  let article: Article;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST || 'localhost',
          port: Number(process.env.DB_PORT) || 5432,
          username: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres',
          database: process.env.DB_NAME || 'ptr',
          entities: [__dirname + '/../src/**/*.entity{.ts,.js}'],
          synchronize: false,
        }),
        TypeOrmModule.forFeature([
          User,
          Source,
          Article,
          SavedArticle,
          UserArticleOpening,
          PersonalArticleLink,
          ArticleFeedback,
          UserSourcePreference,
        ]),
      ],
      providers: [
        SavedArticleService,
        ArticleFeedbackService,
        PersonalArticleLinkService,
        UserSourcePreferenceService,
        {
          provide: ArticlesService,
          inject: [getRepositoryToken(Article)],
          useFactory: (repo: { findOne: Function }) => ({
            findOne: async (id: string) => {
              const found = await repo.findOne({ where: { id }, relations: ['source'] });
              if (!found) throw new Error(`Article ${id} not found`);
              return found;
            },
          }),
        },
      ],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    savedService = moduleRef.get(SavedArticleService);
    feedbackService = moduleRef.get(ArticleFeedbackService);
    linkService = moduleRef.get(PersonalArticleLinkService);
    preferenceService = moduleRef.get(UserSourcePreferenceService);

    const suffix = randomUUID();
    user = await dataSource.getRepository(User).save({
      email: `interaction-rollback-${suffix}@example.com`,
      passwordHash: '!integration-fixture!',
      displayName: 'Interaction rollback fixture',
      timezone: 'UTC',
      githubUrl: null,
      level: null,
      dailyDigestEnabled: false,
      weeklyDigestEnabled: false,
      emailVerifiedAt: null,
      onboardingCompletedAt: null,
      deletedAt: null,
    });
    source = await dataSource.getRepository(Source).save({
      name: `Interaction rollback ${suffix}`,
      url: `https://example.invalid/${suffix}`,
      canonicalUrl: `https://example.invalid/${suffix}`,
      feedUrl: null,
      type: SourceType.WEB,
      category: SourceCategory.ENGINEERING_DEEP_DIVES,
      enabled: false,
      status: SourceStatus.DISABLED,
      deletedAt: null,
    });
    article = await dataSource.getRepository(Article).save({
      sourceId: source.id,
      title: 'Interaction rollback fixture',
      url: `https://example.invalid/${suffix}/article`,
      urlHash: createHash('sha256').update(`${suffix}:url`).digest('hex'),
      titleHash: createHash('sha256').update(`${suffix}:title`).digest('hex'),
      author: null,
      publishedAt: new Date(),
      summaryFromFeed: null,
      rawContent: null,
      status: ArticleStatus.ANALYZED,
      contentExtractionConfig: null,
      contentFetchedAt: null,
      deletedAt: null,
    });
  });

  afterAll(async () => moduleRef.close());

  const failAfterAggregateWrite = async (manager?: EntityManager): Promise<never> => {
    await manager!.getRepository(Source).increment({ id: source.id }, 'globalSavedCount', 1);
    throw new Error('forced aggregate failure');
  };

  it('rolls back first opening and aggregate changes, then retries once successfully', async () => {
    const link = await linkService.findOrCreateLink(
      user.id,
      article.id,
      PersonalArticleLinkContext.FEED,
    );
    const spy = jest
      .spyOn(preferenceService, 'applySignal')
      .mockImplementation((_u, _s, _signal, manager) => failAfterAggregateWrite(manager));

    await expect(linkService.resolveAndRecordOpen(link.id)).rejects.toThrow(
      'forced aggregate failure',
    );
    expect(
      await dataSource.getRepository(UserArticleOpening).countBy({
        userId: user.id,
        articleId: article.id,
      }),
    ).toBe(0);
    expect((await dataSource.getRepository(Article).findOneByOrFail({ id: article.id })).personalTrackedOpenCount).toBe(0);
    expect((await dataSource.getRepository(Source).findOneByOrFail({ id: source.id })).globalSavedCount).toBe(0);

    spy.mockRestore();
    await linkService.resolveAndRecordOpen(link.id);
    await linkService.resolveAndRecordOpen(link.id);
    expect(
      await dataSource.getRepository(UserArticleOpening).countBy({ userId: user.id, articleId: article.id }),
    ).toBe(1);
  });

  it('rolls back save and aggregate changes, then retries once successfully', async () => {
    const spy = jest
      .spyOn(preferenceService, 'applySignal')
      .mockImplementation((_u, _s, _signal, manager) => failAfterAggregateWrite(manager));
    await expect(savedService.create(user.id, article.id)).rejects.toThrow('forced aggregate failure');
    expect(await dataSource.getRepository(SavedArticle).countBy({ userId: user.id, articleId: article.id })).toBe(0);
    spy.mockRestore();
    await savedService.create(user.id, article.id);
    await savedService.create(user.id, article.id);
    expect(await dataSource.getRepository(SavedArticle).countBy({ userId: user.id, articleId: article.id })).toBe(1);
  });

  it('rolls back unsave when aggregate adjustment fails', async () => {
    const spy = jest
      .spyOn(preferenceService, 'removeSignal')
      .mockImplementation((_u, _s, _signal, manager) => failAfterAggregateWrite(manager));
    await expect(savedService.remove(user.id, article.id)).rejects.toThrow('forced aggregate failure');
    expect(await dataSource.getRepository(SavedArticle).countBy({ userId: user.id, articleId: article.id })).toBe(1);
    spy.mockRestore();
    await savedService.remove(user.id, article.id);
    await savedService.remove(user.id, article.id);
    expect(await dataSource.getRepository(SavedArticle).countBy({ userId: user.id, articleId: article.id })).toBe(0);
  });

  it('rolls back feedback creation and permits one successful retry', async () => {
    const spy = jest
      .spyOn(preferenceService, 'applyFeedback')
      .mockImplementation((_u, _s, _type, _previous, manager) => failAfterAggregateWrite(manager));
    await expect(
      feedbackService.upsertFeedback(article.id, ArticleFeedbackType.USEFUL, user.id),
    ).rejects.toThrow('forced aggregate failure');
    expect(await dataSource.query('SELECT count(*)::int count FROM article_feedbacks WHERE "userId"=$1 AND "articleId"=$2', [user.id, article.id])).toEqual([{ count: 0 }]);
    spy.mockRestore();
    await feedbackService.upsertFeedback(article.id, ArticleFeedbackType.USEFUL, user.id);
  });

  it('rolls back feedback replacement without changing the effective value', async () => {
    const spy = jest
      .spyOn(preferenceService, 'applyFeedback')
      .mockImplementation((_u, _s, _type, _previous, manager) => failAfterAggregateWrite(manager));
    await expect(
      feedbackService.upsertFeedback(article.id, ArticleFeedbackType.NOT_USEFUL, user.id),
    ).rejects.toThrow('forced aggregate failure');
    const [row] = await dataSource.query(
      'SELECT type FROM article_feedbacks WHERE "userId"=$1 AND "articleId"=$2',
      [user.id, article.id],
    );
    expect(row.type).toBe(ArticleFeedbackType.USEFUL);
    spy.mockRestore();
    await feedbackService.upsertFeedback(article.id, ArticleFeedbackType.NOT_USEFUL, user.id);
    await feedbackService.upsertFeedback(article.id, ArticleFeedbackType.NOT_USEFUL, user.id);
  });
});
