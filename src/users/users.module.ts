import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './controllers/users.controller';
import { User } from './entities/user.entity';
import { UserCommandService } from './services/user-command.service';
import { UserQueryService } from './services/user-query.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UserCommandService, UserQueryService],
  exports: [UserCommandService, UserQueryService],
})
export class UsersModule {}
