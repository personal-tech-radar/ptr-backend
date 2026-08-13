import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { QueueService } from '../../queue/services/queue.service';
import { Article, ArticleStatus } from '../entities/article.entity';

@Injectable()
export class ArticleAnalysisRetryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly queueService: QueueService,
  ) {}

  async retry(articleId: string): Promise<void> {
    let preparedJobId: string | null = null;
    let created = false;
    let previousStatus: ArticleStatus | null = null;

    try {
      await this.dataSource.transaction(async (manager) => {
        const article = await manager.findOne(Article, {
          where: { id: articleId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!article) throw new NotFoundException(`Article ${articleId} not found`);
        previousStatus = article.status;

        const prepared = await this.queueService.prepareAnalyzeArticleRetry(articleId);
        preparedJobId = prepared.jobId;
        created = prepared.created;

        // This transition is committed only after BullMQ confirms a retained executable job or
        // creates a delayed recoverable job. A transaction rollback preserves the prior status.
        article.status = ArticleStatus.PENDING_ANALYSIS;
        await manager.save(Article, article);
      });
    } catch (error) {
      if (created && preparedJobId) {
        await this.queueService.compensatePreparedArticleAnalysisRetry(preparedJobId);
      }
      throw error;
    }

    if (!preparedJobId) throw new Error('Article-analysis retry was not prepared');
    // Promotion is an acceleration, not the recoverability boundary: if it fails, the delayed
    // job remains executable after its bounded delay and the committed pending state is truthful.
    try {
      await this.queueService.activatePreparedArticleAnalysisRetry(preparedJobId);
    } catch (error) {
      if (!(await this.queueService.hasArticleAnalysisRetryJob(preparedJobId))) {
        await this.dataSource.transaction(async (manager) => {
          const article = await manager.findOne(Article, {
            where: { id: articleId },
            lock: { mode: 'pessimistic_write' },
          });
          if (article && article.status === ArticleStatus.PENDING_ANALYSIS && previousStatus) {
            article.status = previousStatus;
            await manager.save(Article, article);
          }
        });
      }
      throw error;
    }
  }
}
