import { Injectable } from '@nestjs/common';
import { ArticlesService } from '../articles/services/articles.service';
import { PublicArticlesService } from '../articles/services/public-articles.service';
import { PersonalArticleLinkService } from '../user-actions/services/personal-article-link.service';

@Injectable()
export class RedirectsService {
  constructor(
    private readonly articles: ArticlesService,
    private readonly publicArticles: PublicArticlesService,
    private readonly personalLinks: PersonalArticleLinkService,
  ) {}

  async resolvePersonal(uuid: string): Promise<string> {
    const { article } = await this.personalLinks.resolveAndRecordOpen(uuid);
    return article.url;
  }

  async resolvePublic(articleId: string): Promise<string> {
    const article = await this.publicArticles.findOne(articleId);
    await this.articles.incrementPublicClick(article.id);
    return article.originalUrl;
  }
}
