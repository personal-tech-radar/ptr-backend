import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

    // Real FK join (Digest.userId -> users.id), not a cast-join trick — userId is a genuine uuid
    // column with a ManyToOne relation (see digest.entity.ts). leftJoin, not inner: userId is
    // nullable on the entity even though every row created going forward always has one.
    const qb = this.digestRepo
      .createQueryBuilder('digest')
      .leftJoinAndSelect('digest.user', 'user')
      .leftJoinAndSelect('digest.streamPages', 'streamPage')
      .leftJoinAndSelect('streamPage.stream', 'stream');

    if (query.type) {
      qb.andWhere('digest.type = :type', { type: query.type });
    }
    if (query.status) {
      qb.andWhere('digest.status = :status', { status: query.status });
    }
    if (query.email) {
      qb.andWhere('user.email ILIKE :email', { email: `%${query.email}%` });
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
      relations: ['items', 'items.article', 'user', 'streamPages', 'streamPages.stream'],
    });
    if (!digest) {
      throw new NotFoundException(`Digest ${id} not found`);
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
