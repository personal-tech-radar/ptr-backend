import { Module } from '@nestjs/common';
import { ArticlesModule } from '../articles/articles.module';
import { UserActionsModule } from '../user-actions/user-actions.module';
import { RedirectsController } from './redirects.controller';
import { RedirectsService } from './redirects.service';

@Module({
  imports: [ArticlesModule, UserActionsModule],
  controllers: [RedirectsController],
  providers: [RedirectsService],
})
export class RedirectsModule {}
