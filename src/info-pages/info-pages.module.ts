import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InfoPage } from './entities/info-page.entity';
import { InfoPageService } from './services/info-page.service';
import { InfoPageController } from './controllers/info-page.controller';
import { AdminInfoPageController } from './controllers/admin-info-page.controller';

@Module({
  imports: [TypeOrmModule.forFeature([InfoPage])],
  controllers: [InfoPageController, AdminInfoPageController],
  providers: [InfoPageService],
})
export class InfoPagesModule {}
