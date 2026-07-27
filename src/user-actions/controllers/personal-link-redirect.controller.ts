import { Controller, Get, HttpStatus, Param, Redirect } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { PersonalArticleLinkService } from '../services/personal-article-link.service';

@ApiExcludeController()
@Controller('go')
export class PersonalLinkRedirectController {
  constructor(private readonly personalArticleLinkService: PersonalArticleLinkService) {}

  // Pure redirect endpoint — no HTML result page, unlike save-from-email. An unresolved linkId
  // propagates as a standard JSON 404 via NotFoundException.
  @Get(':linkId')
  @Redirect()
  async goToArticle(@Param('linkId') linkId: string): Promise<{ url: string; statusCode: number }> {
    const { article } = await this.personalArticleLinkService.resolveAndRecordOpen(linkId);
    return { url: article.url, statusCode: HttpStatus.FOUND };
  }
}
