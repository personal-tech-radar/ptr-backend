import { Module } from '@nestjs/common';
import { ArticlesModule } from '../articles/articles.module';
import { UserActionsModule } from '../user-actions/user-actions.module';
import { RedirectsController } from './controllers/redirects.controller';
import { RedirectsService } from './services/redirects.service';

@Module({
  imports: [ArticlesModule, UserActionsModule],
  controllers: [RedirectsController],
  providers: [RedirectsService],
})
export class RedirectsModule {}
