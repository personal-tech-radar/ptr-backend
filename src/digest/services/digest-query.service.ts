import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { AdminQueryDigestDto } from '../dto/admin-query-digest.dto';
import { DigestResponseDto, toDigestResponseDto } from '../dto/digest-response.dto';
import { Digest, DigestStatus } from '../entities/digest.entity';

@Injectable()
export class DigestQueryService {
  constructor(
    @InjectRepository(Digest)
    private readonly digestRepo: Repository<Digest>,
  ) {}

  async findById(id: string): Promise<Digest> {
    const digest = await this.digestRepo.findOne({ where: { id } });
    if (!digest) {
      throw new NotFoundException(`Digest ${id} not found`);
    }
    return digest;
  }

  async findAll(query: AdminQueryDigestDto): Promise<PaginatedResponseDto<DigestResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.digestRepo.createQueryBuilder('digest');

    if (query.type) {
      qb.andWhere('digest.type = :type', { type: query.type });
    }
    if (query.status) {
      qb.andWhere('digest.status = :status', { status: query.status });
    }

    const [digests, total] = await qb
      .orderBy('digest.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: digests.map(toDigestResponseDto),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findByIdWithItems(id: string): Promise<Digest> {
    const digest = await this.digestRepo.findOne({
      where: { id },
      relations: ['items', 'items.article'],
    });
    if (!digest) {
      throw new NotFoundException(`Digest ${id} not found`);
    }
    return digest;
  }

  async findLatestBuiltOrSent(): Promise<Digest> {
    const digest = await this.digestRepo.findOne({
      where: { status: In([DigestStatus.DRAFT, DigestStatus.SENT]) },
      order: { createdAt: 'DESC' },
    });
    if (!digest) {
      throw new NotFoundException('No built or sent digest found');
    }
    return digest;
  }

  async markSent(digestId: string): Promise<void> {
    await this.digestRepo.update(digestId, {
      status: DigestStatus.SENT,
      sentAt: new Date(),
    });
  }

  async markFailed(digestId: string): Promise<void> {
    await this.digestRepo.update(digestId, { status: DigestStatus.FAILED });
  }
}
