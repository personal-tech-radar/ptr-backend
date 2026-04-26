import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { LoggingService } from '../../common/logging/logging.service';
import { QUEUE_ARTICLE_ANALYSIS } from '../../queue/queue.service';
import { AiAnalysisService } from '../services/ai-analysis.service';

@Processor(QUEUE_ARTICLE_ANALYSIS)
export class ArticleAnalysisProcessor extends WorkerHost {
  private readonly logger = new LoggingService(ArticleAnalysisProcessor.name);

  constructor(private readonly aiAnalysisService: AiAnalysisService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'analyze-article') {
      await this.aiAnalysisService.analyzeArticle(job.data.articleId);
    } else {
      this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }
}
