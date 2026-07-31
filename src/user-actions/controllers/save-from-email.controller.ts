import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { validate as uuidValidate } from 'uuid';
import { ArticlesService } from '../../articles/services/articles.service';
import { htmlPage } from '../../common/http/html-page.util';
import { UserQueryService } from '../../users/services/user-query.service';
import { SaveFromEmailQueryDto } from '../dto/save-from-email-query.dto';
import { SaveLinkSignatureService } from '../services/save-link-signature.service';
import { SavedArticleService } from '../services/saved-article.service';

// Unguarded, token-based endpoint reached from an email link — always renders HTML, on both
// success and failure, never a raw JSON error/exception.
@ApiExcludeController()
@Controller('articles')
export class SaveFromEmailController {
  constructor(
    private readonly saveLinkSignatureService: SaveLinkSignatureService,
    private readonly userQueryService: UserQueryService,
    private readonly articlesService: ArticlesService,
    private readonly savedArticleService: SavedArticleService,
  ) {}

  @Get(':articleId/save-from-email')
  @Header('Content-Type', 'text/html')
  async saveFromEmail(
    @Param('articleId') articleId: string,
    @Query() query: SaveFromEmailQueryDto,
  ): Promise<string> {
    const { userId, signature } = query;

    if (
      !uuidValidate(userId) ||
      !this.saveLinkSignatureService.verify(userId, articleId, signature)
    ) {
      return htmlPage(
        'Link expired or invalid',
        'This save link is no longer valid. Please open the article from a recent email.',
      );
    }

    try {
      await this.userQueryService.findById(userId);
    } catch {
      return htmlPage('Link no longer available', 'We could not find the account for this link.');
    }

    try {
      await this.articlesService.findOne(articleId);
    } catch {
      return htmlPage('Article no longer available', 'This article is no longer available.');
    }

    await this.savedArticleService.create(userId, articleId);

    return htmlPage(
      'Article saved',
      'This article has been saved to your account. You can close this tab.',
    );
  }
}
