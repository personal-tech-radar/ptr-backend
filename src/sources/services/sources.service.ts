import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoggingService } from '../../common/logging/logging.service';
import { CreateSourceDto } from '../dto/create-source.dto';
import { UpdateSourceDto } from '../dto/update-source.dto';
import { Source } from '../entities/source.entity';

@Injectable()
export class SourcesService {
  private readonly logger = new LoggingService(SourcesService.name);

  constructor(
    @InjectRepository(Source)
    private readonly sourceRepo: Repository<Source>,
  ) {}

  async create(dto: CreateSourceDto): Promise<Source> {
    const existing = await this.sourceRepo.findOne({ where: { url: dto.url } });
    if (existing) {
      throw new ConflictException('Source with this URL already exists');
    }
    const source = this.sourceRepo.create(dto);
    const saved = await this.sourceRepo.save(source);
    this.logger.info('Source created', { id: saved.id, name: saved.name });
    return saved;
  }

  async findAll(): Promise<Source[]> {
    return this.sourceRepo.find();
  }

  async findOne(id: string): Promise<Source> {
    const source = await this.sourceRepo.findOne({ where: { id } });
    if (!source) {
      throw new NotFoundException(`Source ${id} not found`);
    }
    return source;
  }

  async update(id: string, dto: UpdateSourceDto): Promise<Source> {
    const source = await this.findOne(id);
    Object.assign(source, dto);
    return this.sourceRepo.save(source);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.sourceRepo.softDelete(id);
    this.logger.info('Source soft-deleted', { id });
  }

  async findAllEnabled(): Promise<Source[]> {
    return this.sourceRepo.find({ where: { enabled: true } });
  }

  async updateLastChecked(id: string): Promise<void> {
    await this.sourceRepo.update(id, { lastCheckedAt: new Date() });
  }
}
