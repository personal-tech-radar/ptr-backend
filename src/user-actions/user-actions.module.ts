import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArticlesModule } from '../articles/articles.module';
import { UsersModule } from '../users/users.module';
import { AdminOpensController } from './controllers/admin-opens.controller';
import { AdminSavedArticleController } from './controllers/admin-saved-article.controller';
import { PersonalLinkRedirectController } from './controllers/personal-link-redirect.controller';
import { SaveFromEmailController } from './controllers/save-from-email.controller';
import { SavedArticlesController } from './controllers/saved-articles.controller';
import { PersonalArticleLink } from './entities/personal-article-link.entity';
import { SavedArticle } from './entities/saved-article.entity';
import { PersonalArticleLinkService } from './services/personal-article-link.service';
import { SaveLinkSignatureService } from './services/save-link-signature.service';
import { SavedArticleService } from './services/saved-article.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SavedArticle, PersonalArticleLink]),
    ArticlesModule,
    UsersModule,
  ],
  controllers: [
    SavedArticlesController,
    SaveFromEmailController,
    PersonalLinkRedirectController,
    AdminSavedArticleController,
    AdminOpensController,
  ],
  providers: [SavedArticleService, PersonalArticleLinkService, SaveLinkSignatureService],
  exports: [SavedArticleService, PersonalArticleLinkService, SaveLinkSignatureService],
})
export class UserActionsModule {}
