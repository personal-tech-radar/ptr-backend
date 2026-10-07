import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { AdminQueryDigestDto } from '../dto/admin-query-digest.dto';
import {
  DigestResponseDto,
  toDigestResponseDto,
  toDigestDetailResponseDto,
} from '../dto/digest-response.dto';
import { load } from 'cheerio';
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
    qb.loadRelationCountAndMap('digest.articleCount', 'digest.items');

    if (query.type) {
      qb.andWhere('digest.type = :type', { type: query.type });
    }
    if (query.status) {
      qb.andWhere('digest.status = :status', { status: query.status });
    }
    if (query.email) {
      qb.andWhere('(user.email ILIKE :email OR digest.actualRecipientEmail ILIKE :email)', {
        email: `%${query.email}%`,
      });
    }
    if (query.deliveryMode)
      qb.andWhere('digest.deliveryMode = :deliveryMode', { deliveryMode: query.deliveryMode });
    if (query.createdFrom)
      qb.andWhere('digest.createdAt >= :createdFrom', { createdFrom: query.createdFrom });
    if (query.createdTo)
      qb.andWhere('digest.createdAt < :createdTo', { createdTo: query.createdTo });
    if (query.updatedFrom)
      qb.andWhere('digest.updatedAt >= :updatedFrom', { updatedFrom: query.updatedFrom });
    if (query.updatedTo)
      qb.andWhere('digest.updatedAt < :updatedTo', { updatedTo: query.updatedTo });
    if (query.sentFrom) qb.andWhere('digest.sentAt >= :sentFrom', { sentFrom: query.sentFrom });
    if (query.sentTo) qb.andWhere('digest.sentAt < :sentTo', { sentTo: query.sentTo });

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

  async findAdminDetail(id: string) {
    const digest = await this.digestRepo.findOne({
      where: { id },
      relations: ['items', 'items.article', 'user', 'streamPages', 'streamPages.stream'],
      withDeleted: true,
      order: { items: { position: 'ASC' } },
    });
    if (!digest || digest.deletedAt) throw new NotFoundException(`Digest ${id} not found`);
    digest.items = digest.items.filter((item) => !item.deletedAt);
    const descriptions = new Map<number, string>();
    const html = load(digest.htmlBody);
    html('a').each((_index, element) => {
      const anchor = html(element);
      const position = /^(\d+)\.\s/.exec(anchor.text());
      const paragraphs = anchor.parent().children('p');
      if (position && paragraphs.length)
        descriptions.set(Number(position[1]), paragraphs.first().text());
    });
    return toDigestDetailResponseDto(digest, descriptions);
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
