import { ArticleStatus } from '../entities/article.entity';
import { ArticleAnalysisRetryService } from './article-analysis-retry.service';

describe('ArticleAnalysisRetryService', () => {
  const article = { id: 'article-1', status: ArticleStatus.FAILED };
  const manager = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(async (work: (value: typeof manager) => Promise<void>) => work(manager)),
  };
  const queue = {
    prepareAnalyzeArticleRetry: jest.fn(),
    activatePreparedArticleAnalysisRetry: jest.fn(),
    compensatePreparedArticleAnalysisRetry: jest.fn(),
    hasArticleAnalysisRetryJob: jest.fn(),
  };
  let service: ArticleAnalysisRetryService;

  beforeEach(() => {
    jest.clearAllMocks();
    article.status = ArticleStatus.FAILED;
    manager.findOne.mockResolvedValue(article);
    manager.save.mockResolvedValue(article);
    queue.prepareAnalyzeArticleRetry.mockResolvedValue({
      jobId: 'article-article-1',
      created: true,
      state: 'delayed',
    });
    queue.activatePreparedArticleAnalysisRetry.mockResolvedValue(undefined);
    queue.compensatePreparedArticleAnalysisRetry.mockResolvedValue(undefined);
    queue.hasArticleAnalysisRetryJob.mockResolvedValue(true);
    service = new ArticleAnalysisRetryService(dataSource as never, queue as never);
  });

  it('marks the article pending only after executable work is prepared, then activates it', async () => {
    await service.retry(article.id);

    expect(queue.prepareAnalyzeArticleRetry).toHaveBeenCalledWith(article.id);
    expect(manager.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: ArticleStatus.PENDING_ANALYSIS }),
    );
    expect(queue.activatePreparedArticleAnalysisRetry).toHaveBeenCalledWith('article-article-1');
  });

  it('leaves the previous state unchanged when enqueue preparation fails', async () => {
    queue.prepareAnalyzeArticleRetry.mockRejectedValue(new Error('Redis unavailable'));

    await expect(service.retry(article.id)).rejects.toThrow('Redis unavailable');
    expect(manager.save).not.toHaveBeenCalled();
    expect(article.status).toBe(ArticleStatus.FAILED);
  });

  it('compensates a newly prepared job when the PostgreSQL save fails', async () => {
    manager.save.mockRejectedValue(new Error('database failure'));

    await expect(service.retry(article.id)).rejects.toThrow('database failure');
    expect(queue.compensatePreparedArticleAnalysisRetry).toHaveBeenCalledWith('article-article-1');
  });

  it('does not remove shared executable work when a repeated retry database update fails', async () => {
    queue.prepareAnalyzeArticleRetry.mockResolvedValue({
      jobId: 'article-article-1',
      created: false,
      state: 'waiting',
    });
    manager.save.mockRejectedValue(new Error('database failure'));

    await expect(service.retry(article.id)).rejects.toThrow('database failure');
    expect(queue.compensatePreparedArticleAnalysisRetry).not.toHaveBeenCalled();
  });

  it('reuses an existing executable retry without creating duplicate state', async () => {
    queue.prepareAnalyzeArticleRetry.mockResolvedValue({
      jobId: 'article-article-1',
      created: false,
      state: 'active',
    });

    await service.retry(article.id);

    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(queue.compensatePreparedArticleAnalysisRetry).not.toHaveBeenCalled();
  });

  it('restores the previous status if prepared work disappears before activation', async () => {
    queue.activatePreparedArticleAnalysisRetry.mockRejectedValue(new Error('job missing'));
    queue.hasArticleAnalysisRetryJob.mockResolvedValue(false);

    await expect(service.retry(article.id)).rejects.toThrow('job missing');

    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
    expect(manager.save).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ status: ArticleStatus.FAILED }),
    );
  });
});
