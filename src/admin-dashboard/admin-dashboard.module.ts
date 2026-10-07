import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdministratorsModule } from '../administrators/administrators.module';
import { Article } from '../articles/entities/article.entity';
import { Digest } from '../digest/entities/digest.entity';
import { SourceCandidate } from '../sources/entities/source-candidate.entity';
import { Source } from '../sources/entities/source.entity';
import { User } from '../users/entities/user.entity';
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { UserAnalyticsService } from '../users/services/user-analytics.service';

@Module({
  imports: [
    AdministratorsModule,
    TypeOrmModule.forFeature([User, Source, Article, SourceCandidate, Digest]),
  ],
  controllers: [AdminDashboardController],
  providers: [AdminDashboardService, UserAnalyticsService],
})
export class AdminDashboardModule {}
