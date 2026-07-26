import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { validate as uuidValidate } from 'uuid';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { QueryTechnologyInterestDto } from '../dto/query-technology-interest.dto';
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
}
