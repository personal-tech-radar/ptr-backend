import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { validate as uuidValidate } from 'uuid';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { QueryUserContentStreamDto } from '../dto/query-user-content-stream.dto';
import { UserContentStreamResponseDto } from '../dto/user-content-stream-response.dto';
import { ContentStream } from '../entities/content-stream.entity';
import { UserContentStream } from '../entities/user-content-stream.entity';

// Content streams are read-only via the API in this phase (fixed set, no public
// create/update/delete) — see coder.md and the CreateTaxonomyTables migration's seed insert.
@Injectable()
export class ContentStreamQueryService {
  constructor(
    @InjectRepository(ContentStream)
    private readonly contentStreamRepo: Repository<ContentStream>,
    @InjectRepository(UserContentStream)
    private readonly userContentStreamRepo: Repository<UserContentStream>,
  ) {}

  async findAll(enabledOnly = true): Promise<ContentStream[]> {
    const qb = this.contentStreamRepo.createQueryBuilder('cs').orderBy('cs.sortOrder', 'ASC');
    if (enabledOnly) {
      qb.andWhere('cs.enabled = true');
    }
    return qb.getMany();
  }

  async findOne(id: string): Promise<ContentStream> {
    if (!uuidValidate(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }

    const entity = await this.contentStreamRepo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`Content stream ${id} not found`);
    }
    return entity;
  }

  async findByIds(ids: string[]): Promise<ContentStream[]> {
    if (ids.length === 0) return [];
    return this.contentStreamRepo.find({ where: { id: In(ids) } });
  }

  // Read-only lookup by the fixed catalog key (e.g. 'security') — used by AiAnalysisService to
  // resolve the LLM's mainStreamKey/secondaryStreamKeys output against the real ContentStream rows.
  async findByKey(key: string): Promise<ContentStream | null> {
    return this.contentStreamRepo.findOne({ where: { key } });
  }

  async findSelectedByUser(userId: string): Promise<ContentStream[]> {
    const links = await this.userContentStreamRepo.find({ where: { userId } });
    if (links.length === 0) return [];
    return this.findByIds(links.map((link) => link.contentStreamId));
  }

  // Flattened, joined listing of every user's content-stream selections (admin only) — joins via
  // the entity relations already defined on UserContentStream (`user`, `contentStream`), so no
  // separate User repository injection is needed in this module.
  async findAllUserSelections(
    query: QueryUserContentStreamDto,
  ): Promise<PaginatedResponseDto<UserContentStreamResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.userContentStreamRepo
      .createQueryBuilder('ucs')
      .innerJoinAndSelect('ucs.user', 'user')
      .innerJoinAndSelect('ucs.contentStream', 'cs');

    if (query.email) {
      qb.andWhere('user.email ILIKE :email', { email: `%${query.email}%` });
    }

    const [links, total] = await qb
      .orderBy('ucs.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const data = links.map((link) => ({
      userId: link.userId,
      userEmail: link.user.email,
      contentStreamId: link.contentStreamId,
      contentStreamKey: link.contentStream.key,
      contentStreamName: link.contentStream.name,
      createdAt: link.createdAt,
    }));

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
