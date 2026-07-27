import { Controller, Get, Header, Param, Query, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { htmlPage } from '../../common/http/html-page.util';
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
      return htmlPage(
        'Invalid feedback type',
        'Unknown feedback type. Please use the links from your digest email.',
      );
    }

    await this.articleFeedbackService.upsertFeedback(id, feedbackType);

    const label =
      feedbackType === ArticleFeedbackType.USEFUL
        ? '👍 Marked as useful'
        : '👎 Marked as not for me';
    return htmlPage('Feedback saved', `${label} — source ranking updated. You can close this tab.`);
  }
}
