import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { htmlPage } from '../../common/http/html-page.util';
import { PermanentArticleActionService } from '../services/permanent-article-action.service';

@ApiTags('Email Actions')
@Controller('email-action')
export class PermanentArticleActionController {
  constructor(private readonly actionService: PermanentArticleActionService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Apply a permanent article action from an email',
    description:
      'Public opaque-link endpoint used by digest emails for Save, Useful, and Not useful actions. The UUID identifies the user, article, and action without exposing them. Reusing a valid link is idempotent; Useful and Not useful replace the current explicit feedback value. The response is an HTML result page.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Permanent opaque email-action UUID' })
  @ApiProduces('text/html')
  @ApiResponse({ status: 200, description: 'HTML page describing the action result' })
  @Header('Content-Type', 'text/html')
  async execute(@Param('id') id: string): Promise<string> {
    try {
      const action = await this.actionService.execute(id);
      return htmlPage('Action saved', `Your ${action.replace('_', ' ')} preference was saved.`);
    } catch {
      return htmlPage('Link unavailable', 'This action link is invalid or no longer available.');
    }
  }
}
