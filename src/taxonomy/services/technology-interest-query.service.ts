import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { validate as uuidValidate } from 'uuid';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { AdminQueryTechnologyInterestDto } from '../dto/admin-query-technology-interest.dto';
import { QueryTechnologyInterestDto } from '../dto/query-technology-interest.dto';
import { QueryUserTechnologyInterestDto } from '../dto/query-user-technology-interest.dto';
import { UserTechnologyInterestResponseDto } from '../dto/user-technology-interest-response.dto';
import { TechnologyInterest } from '../entities/technology-interest.entity';
import { UserTechnologyInterest } from '../entities/user-technology-interest.entity';
import { normalizeTechnologyInterestName } from '../util/normalize-technology-interest-name.util';

@Injectable()
export class TechnologyInterestQueryService {
  constructor(
    @InjectRepository(TechnologyInterest)
    private readonly technologyInterestRepo: Repository<TechnologyInterest>,
    @InjectRepository(UserTechnologyInterest)
    private readonly userTechnologyInterestRepo: Repository<UserTechnologyInterest>,
  ) {}

  async findAll(
    query: QueryTechnologyInterestDto,
  ): Promise<PaginatedResponseDto<TechnologyInterest>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.technologyInterestRepo.createQueryBuilder('ti').where('ti.deletedAt IS NULL');

    if (query.kind) {
      qb.andWhere('ti.kind = :kind', { kind: query.kind });
    }

    if (query.q) {
      const normalized = normalizeTechnologyInterestName(query.q);
      qb.andWhere('(ti.normalizedName ILIKE :q OR ti.aliases @> :qAlias::jsonb)', {
        q: `%${normalized}%`,
        qAlias: JSON.stringify([normalized]),
      });
    }

    const [data, total] = await qb
      .orderBy('ti.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string): Promise<TechnologyInterest> {
    if (!uuidValidate(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }

    const entity = await this.technologyInterestRepo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`Technology/interest ${id} not found`);
    }
    return entity;
  }

  async findByIds(ids: string[]): Promise<TechnologyInterest[]> {
    if (ids.length === 0) return [];
    return this.technologyInterestRepo.find({ where: { id: In(ids) } });
  }

  async findSelectedByUser(userId: string): Promise<TechnologyInterest[]> {
    const links = await this.userTechnologyInterestRepo.find({ where: { userId } });
    if (links.length === 0) return [];
    return this.findByIds(links.map((link) => link.technologyInterestId));
  }

  // Same shape as findAll, but for the admin listing: conditionally includes soft-deleted
  // (merged-away) rows via `.withDeleted()` instead of the hardcoded `deletedAt IS NULL` filter
  // the public endpoint always applies.
  async findAllForAdmin(
    query: AdminQueryTechnologyInterestDto,
  ): Promise<PaginatedResponseDto<TechnologyInterest>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.technologyInterestRepo.createQueryBuilder('ti');
    if (query.includeDeleted) {
      qb.withDeleted();
    } else {
      qb.where('ti.deletedAt IS NULL');
    }

    if (query.kind) {
      qb.andWhere('ti.kind = :kind', { kind: query.kind });
    }

    const [data, total] = await qb
      .orderBy('ti.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // Flattened, joined listing of every user's technology/interest selections (admin only) — joins
  // via the entity relations already defined on UserTechnologyInterest (`user`,
  // `technologyInterest`), so no separate User repository injection is needed in this module.
  async findAllUserSelections(
    query: QueryUserTechnologyInterestDto,
  ): Promise<PaginatedResponseDto<UserTechnologyInterestResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.userTechnologyInterestRepo
      .createQueryBuilder('uti')
      .innerJoinAndSelect('uti.user', 'user')
      .innerJoinAndSelect('uti.technologyInterest', 'ti');

    if (query.email) {
      qb.andWhere('user.email ILIKE :email', { email: `%${query.email}%` });
    }

    const [links, total] = await qb
      .orderBy('uti.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const data = links.map((link) => ({
      userId: link.userId,
      userEmail: link.user.email,
      technologyInterestId: link.technologyInterestId,
      technologyInterestName: link.technologyInterest.name,
      technologyInterestKind: link.technologyInterest.kind,
      createdAt: link.createdAt,
    }));

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
