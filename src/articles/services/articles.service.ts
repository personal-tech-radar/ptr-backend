import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, Repository } from 'typeorm';
import { LoggingService } from '../../common/logging/logging.service';
import { ArticleListQueryDto } from '../dto/article-list-query.dto';
import { Article, ArticleStatus } from '../entities/article.entity';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';

export interface CreateArticleData {
  sourceId: string;
  title: string;
  url: string;
  urlHash: string;
  titleHash: string;
  author?: string | null;
  publishedAt?: Date | null;
  summaryFromFeed?: string | null;
  rawContent?: string | null;
  status?: ArticleStatus;
}

@Injectable()
export class ArticlesService {
  private readonly logger = new LoggingService(ArticlesService.name);

  constructor(
    @InjectRepository(Article)
    private readonly articleRepo: Repository<Article>,
  ) {}

  async findAll(query: ArticleListQueryDto): Promise<PaginatedResponseDto<Article>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: FindManyOptions<Article>['where'] = {};
    if (query.status) where['status'] = query.status;
    if (query.sourceId) where['sourceId'] = query.sourceId;

    const [data, total] = await this.articleRepo.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<Article> {
    const article = await this.articleRepo.findOne({
      where: { id },
      relations: ['source'],
    });
    if (!article) {
      throw new NotFoundException(`Article ${id} not found`);
    }
    return article;
  }

  async findByUrlHash(urlHash: string): Promise<Article | null> {
    return this.articleRepo.findOne({ where: { urlHash } });
  }

  async findByTitleHashInLastDays(
    titleHash: string,
    days: number,
  ): Promise<Article | null> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.articleRepo
      .createQueryBuilder('a')
      .where('a.titleHash = :titleHash', { titleHash })
      .andWhere('a.createdAt >= :since', { since })
      .getOne();
  }

  async create(data: CreateArticleData): Promise<Article> {
    const article = this.articleRepo.create(data);
    const saved = await this.articleRepo.save(article);
    return saved;
  }

  async updateStatus(id: string, status: ArticleStatus): Promise<void> {
    await this.articleRepo.update(id, { status });
  }

  async findPendingAnalysis(): Promise<Article[]> {
    return this.articleRepo.find({ where: { status: ArticleStatus.PENDING_ANALYSIS } });
  }
}
