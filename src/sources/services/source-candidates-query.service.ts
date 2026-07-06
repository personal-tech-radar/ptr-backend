import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { validate as uuidValidate } from 'uuid';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { SourceCandidateListQueryDto } from '../dto/source-candidate-list-query.dto';
import { SourceCandidate } from '../entities/source-candidate.entity';

@Injectable()
export class SourceCandidatesQueryService {
  constructor(
    @InjectRepository(SourceCandidate)
    private readonly candidateRepo: Repository<SourceCandidate>,
  ) {}

  async findAll(
    query: SourceCandidateListQueryDto,
  ): Promise<PaginatedResponseDto<SourceCandidate>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.candidateRepo.createQueryBuilder('candidate');
    if (query.status) {
      qb.andWhere('candidate.status = :status', { status: query.status });
    }

    const [data, total] = await qb
      .orderBy('candidate.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string): Promise<SourceCandidate> {
    if (!uuidValidate(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }

    const candidate = await this.candidateRepo.findOne({ where: { id } });
    if (!candidate) {
      throw new NotFoundException(`Source candidate ${id} not found`);
    }
    return candidate;
  }
}
