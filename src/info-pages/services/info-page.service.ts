import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InfoPage } from '../entities/info-page.entity';
import { CreateInfoPageDto } from '../dto/create-info-page.dto';
import { UpdateInfoPageDto } from '../dto/update-info-page.dto';
import { QueryInfoPageDto } from '../dto/query-info-page.dto';

@Injectable()
export class InfoPageService {
  constructor(@InjectRepository(InfoPage) private readonly repository: Repository<InfoPage>) {}

  async listPublic(query: QueryInfoPageDto) {
    return this.list(query, true);
  }

  async findPublic(id: string): Promise<InfoPage> {
    const page = await this.repository.findOne({ where: { id, isActive: true } });
    if (!page) throw new NotFoundException('Info page not found');
    return page;
  }

  async listAdmin(query: QueryInfoPageDto) {
    return this.list(query, false);
  }

  async findAdmin(id: string): Promise<InfoPage> {
    const page = await this.repository.findOne({ where: { id } });
    if (!page) throw new NotFoundException('Info page not found');
    return page;
  }

  create(dto: CreateInfoPageDto): Promise<InfoPage> {
    return this.repository.save(
      this.repository.create({
        title: dto.title.trim(),
        fullText: dto.fullText,
        isActive: dto.isActive ?? true,
      }),
    );
  }

  async update(id: string, dto: UpdateInfoPageDto): Promise<InfoPage> {
    const page = await this.findAdmin(id);
    if (dto.title !== undefined) page.title = dto.title.trim();
    if (dto.fullText !== undefined) page.fullText = dto.fullText;
    if (dto.isActive !== undefined) page.isActive = dto.isActive;
    return this.repository.save(page);
  }

  async remove(id: string): Promise<void> {
    await this.findAdmin(id);
    await this.repository.softDelete(id);
  }

  private async list(query: QueryInfoPageDto, publicOnly: boolean) {
    const qb = this.repository.createQueryBuilder('page').where('page.deletedAt IS NULL');
    if (publicOnly) qb.andWhere('page.isActive = true');
    else if (query.isActive !== undefined)
      qb.andWhere('page.isActive = :isActive', { isActive: query.isActive });
    const [data, total] = await qb
      .orderBy('page.updatedAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return {
      data: data.map((item) => ({
        id: item.id,
        title: item.title,
        isActive: item.isActive,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}
