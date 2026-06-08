import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import RssParser = require('rss-parser');
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
    await this.validateFeedUrl(dto.url);
    const source = this.sourceRepo.create(dto);
    const saved = await this.sourceRepo.save(source);
    this.logger.info('Source created', { id: saved.id, name: saved.name });
    return saved;
  }

  private async validateFeedUrl(url: string): Promise<void> {
    let responseText: string;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PersonalTechRadar/1.0)' },
      });
      clearTimeout(timeout);

      if (response.status !== 200) {
        this.logger.error(`Feed validation failed: HTTP ${response.status}`, null, { url });
        throw new BadRequestException(`Feed URL returned HTTP ${response.status}`);
      }

      responseText = await response.text();
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error('Feed URL unreachable', err, { url });
      throw new BadRequestException('Feed URL is unreachable');
    }

    const parser = new RssParser();
    let feed: RssParser.Output<Record<string, unknown>>;
    try {
      feed = await parser.parseString(responseText);
    } catch (err) {
      this.logger.error('Feed URL could not be parsed as RSS/Atom', err, { url });
      throw new BadRequestException('Feed URL could not be parsed as RSS/Atom');
    }

    if (!feed.items || feed.items.length === 0) {
      this.logger.error('Feed URL contains no items', null, { url });
      throw new BadRequestException('Feed URL contains no items');
    }
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
