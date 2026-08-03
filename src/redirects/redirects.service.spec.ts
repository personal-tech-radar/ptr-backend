import { RedirectsService } from './redirects.service';

describe('RedirectsService', () => {
  const articles = { incrementPublicClick: jest.fn() };
  const publicArticles = { findOne: jest.fn() };
  const personalLinks = { resolveAndRecordOpen: jest.fn() };
  let service: RedirectsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RedirectsService(
      articles as never,
      publicArticles as never,
      personalLinks as never,
    );
  });

  it('resolves a personal UUID to the original article URL', async () => {
    personalLinks.resolveAndRecordOpen.mockResolvedValue({
      article: { url: 'https://example.com/a' },
    });
    await expect(service.resolvePersonal('uuid')).resolves.toBe('https://example.com/a');
  });

  it('increments only the public counter before redirecting public content', async () => {
    publicArticles.findOne.mockResolvedValue({
      id: 'article-1',
      originalUrl: 'https://example.com/a',
    });
    await expect(service.resolvePublic('article-1')).resolves.toBe('https://example.com/a');
    expect(articles.incrementPublicClick).toHaveBeenCalledWith('article-1');
    expect(personalLinks.resolveAndRecordOpen).not.toHaveBeenCalled();
  });
});
