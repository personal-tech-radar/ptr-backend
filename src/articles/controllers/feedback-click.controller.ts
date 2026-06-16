import { Controller, Get, Header, Param, Query, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ArticleFeedbackType } from '../entities/article-feedback.entity';
import { ArticleFeedbackService } from '../services/article-feedback.service';

@ApiExcludeController()
@Controller('articles')
export class FeedbackClickController {
  constructor(private readonly articleFeedbackService: ArticleFeedbackService) {}

  @Get(':id/feedback/click')
  @Header('Content-Type', 'text/html')
  async handleFeedbackClick(
    @Param('id') id: string,
    @Query('type') type: string,
    @Query('token') token: string,
  ): Promise<string> {
    const expectedToken = process.env.FEEDBACK_TOKEN;
    if (!expectedToken || token !== expectedToken) {
      throw new UnauthorizedException('Invalid feedback token');
    }

    const feedbackType =
      type === ArticleFeedbackType.USEFUL
        ? ArticleFeedbackType.USEFUL
        : type === ArticleFeedbackType.NOT_USEFUL
          ? ArticleFeedbackType.NOT_USEFUL
          : null;

    if (!feedbackType) {
      return htmlPage('Invalid feedback type', 'Unknown feedback type. Please use the links from your digest email.');
    }

    await this.articleFeedbackService.upsertFeedback(id, feedbackType);

    const label = feedbackType === ArticleFeedbackType.USEFUL ? '👍 Marked as useful' : '👎 Marked as not for me';
    return htmlPage('Feedback saved', `${label} — source ranking updated. You can close this tab.`);
  }
}

function htmlPage(title: string, message: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f9fafb;}
.card{text-align:center;padding:40px;background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.1);}
h1{font-size:18px;color:#111827;margin:0 0 8px;}p{font-size:14px;color:#6b7280;margin:0;}</style>
</head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}
