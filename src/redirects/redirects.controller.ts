import { Controller, Get, HttpStatus, Param, Redirect } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RedirectsService } from './redirects.service';

@ApiTags('Redirects')
@Controller()
export class RedirectsController {
  constructor(private readonly redirects: RedirectsService) {}

  @Get('r/:uuid')
  @Redirect()
  @ApiOperation({
    summary: 'Open an article through a personal tracking link',
    description:
      'Resolves a permanent opaque UUID, records only the first open for its user/article pair, applies the opened source signal once, and redirects to the original publisher URL. Repeated requests still redirect without duplicating personal interaction effects.',
  })
  @ApiParam({ name: 'uuid', format: 'uuid', description: 'Permanent opaque personal-link UUID' })
  @ApiResponse({ status: 302, description: 'Redirect to the original article URL' })
  @ApiResponse({ status: 404, description: 'Tracking link not found' })
  async personal(@Param('uuid') uuid: string) {
    return { url: await this.redirects.resolvePersonal(uuid), statusCode: HttpStatus.FOUND };
  }

  @Get('go/articles/:articleId')
  @Redirect()
  @ApiOperation({
    summary: 'Open a public article and record its click',
    description:
      'Increments the article public-click counter atomically and redirects to the original publisher URL. No user opening, personal source signal, or feed-cache invalidation is created.',
  })
  @ApiParam({ name: 'articleId', format: 'uuid', description: 'Public article ID' })
  @ApiResponse({ status: 302, description: 'Redirect to the original article URL' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async publicArticle(@Param('articleId') articleId: string) {
    return {
      url: await this.redirects.resolvePublic(articleId),
      statusCode: HttpStatus.FOUND,
    };
  }
}
