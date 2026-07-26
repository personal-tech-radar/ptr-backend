import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { validate as uuidValidate } from 'uuid';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { QueryUserDto } from '../dto/query-user.dto';
import { User } from '../entities/user.entity';

@Injectable()
export class UserQueryService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findById(id: string): Promise<User> {
    if (!uuidValidate(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }

    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email } });
  }

  // For future admin use (see coder.md) — no controller route exposes this in this phase.
  async findAll(query: QueryUserDto): Promise<PaginatedResponseDto<User>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [data, total] = await this.userRepo
      .createQueryBuilder('user')
      .orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
