/* eslint-disable @typescript-eslint/require-await */
import { PublicArticlesService } from './public-articles.service';
import { TechnologyInterestKind } from '../../taxonomy/entities/technology-interest.entity';

describe('PublicArticlesService', () => {
  it('maps renderable public metadata and counters without internal processing fields', async () => {
    const analyses = {};
    const taxonomyLinks = {
      find: jest.fn(async () => [
        {
          articleId: 'article-1',
          technologyInterest: {
            id: 'technology-1',
            name: 'NestJS',
            kind: TechnologyInterestKind.TECHNOLOGY,
          },
        },
      ]),
    };
    const streamLinks = {
      find: jest.fn(async () => [
        {
          articleId: 'article-1',
          isPrimary: true,
          stream: { id: 'stream-1', key: 'security', name: 'Security' },
        },
      ]),
    };
    const service = new PublicArticlesService(
      analyses as never,
      taxonomyLinks as never,
      streamLinks as never,
    );
    const article = {
      id: 'article-1',
      title: 'Safe NestJS APIs',
      url: 'https://publisher.example/article',
      source: { id: 'source-1', name: 'Publisher', type: 'rss' },
      author: 'Author',
      publishedAt: new Date('2026-08-01T10:00:00Z'),
      summaryFromFeed: 'Fallback',
      publicClickCount: 4,
      personalTrackedOpenCount: 3,
      createdAt: new Date('2026-08-01T11:00:00Z'),
      updatedAt: new Date('2026-08-01T12:00:00Z'),
      urlHash: 'internal-hash',
      status: 'analyzed',
    };

    const [result] = await service.mapMany([
      {
        articleId: article.id,
        article,
        shortSummary: 'Expanded public summary',
        longSummary: 'Detailed article-page summary',
        complexityLevel: 'advanced',
        qualityScore: 88,
      } as never,
    ]);

    expect(result).toMatchObject({
      id: 'article-1',
      originalUrl: 'https://publisher.example/article',
      publicRedirectUrl: '/go/articles/article-1',
      summary: 'Expanded public summary',
      longSummary: 'Detailed article-page summary',
      technologies: [{ id: 'technology-1', name: 'NestJS' }],
      streams: [{ id: 'stream-1', key: 'security', name: 'Security' }],
      primaryStream: { id: 'stream-1', key: 'security', name: 'Security' },
      publicClickCount: 4,
      personalTrackedOpenCount: 3,
      totalClickCount: 7,
    });
    expect(result).not.toHaveProperty('urlHash');
    expect(result).not.toHaveProperty('status');
  });
});
