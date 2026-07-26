import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { validate as uuidValidate } from 'uuid';
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

  async findSelectedByUser(userId: string): Promise<ContentStream[]> {
    const links = await this.userContentStreamRepo.find({ where: { userId } });
    if (links.length === 0) return [];
    return this.findByIds(links.map((link) => link.contentStreamId));
  }
}
