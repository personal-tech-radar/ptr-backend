import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArticlesModule } from '../articles/articles.module';
import { Article } from '../articles/entities/article.entity';
import { UsersModule } from '../users/users.module';
import { SourcesModule } from '../sources/sources.module';
import { AdminOpensController } from './controllers/admin-opens.controller';
import { AdminSavedArticleController } from './controllers/admin-saved-article.controller';
import { SavedArticlesController } from './controllers/saved-articles.controller';
import { PersonalArticleLink } from './entities/personal-article-link.entity';
import { SavedArticle } from './entities/saved-article.entity';
import { PermanentArticleAction } from './entities/permanent-article-action.entity';
import { UserArticleOpening } from './entities/user-article-opening.entity';
import { PermanentArticleActionController } from './controllers/permanent-article-action.controller';
import { PermanentArticleActionService } from './services/permanent-article-action.service';
import { PersonalArticleLinkService } from './services/personal-article-link.service';
import { SavedArticleService } from './services/saved-article.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SavedArticle,
      PersonalArticleLink,
      PermanentArticleAction,
      UserArticleOpening,
      Article,
    ]),
    ArticlesModule,
    UsersModule,
    SourcesModule,
  ],
  controllers: [
    SavedArticlesController,
    AdminSavedArticleController,
    AdminOpensController,
    PermanentArticleActionController,
  ],
  providers: [SavedArticleService, PersonalArticleLinkService, PermanentArticleActionService],
  exports: [SavedArticleService, PersonalArticleLinkService, PermanentArticleActionService],
})
export class UserActionsModule {}
