import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoggingService } from '../../common/logging/logging.service';
import { ArticleListQueryDto } from '../dto/article-list-query.dto';
import { Article, ArticleStatus, ContentExtractionMethod } from '../entities/article.entity';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ArticleAnalysis } from '../../ai-analysis/entities/article-analysis.entity';
import { ArticleStream } from '../../ai-analysis/entities/article-stream.entity';
import { ArticleTechnologyInterest } from '../../ai-analysis/entities/article-technology-interest.entity';
import { TechnologyInterestKind } from '../../taxonomy/entities/technology-interest.entity';
import {
  AdminArticleDetailResponseDto,
  AdminArticleListItemDto,
  ArticleStreamResponseDto,
  toAdminAnalysisDto,
} from '../dto/admin-article-detail-response.dto';

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
  contentExtractionMethod?: ContentExtractionMethod;
  contentExtractionConfig?: Record<string, unknown> | null;
  contentFetchedAt?: Date | null;
}

@Injectable()
export class ArticlesService {
  private readonly logger = new LoggingService(ArticlesService.name);

  constructor(
    @InjectRepository(Article)
    private readonly articleRepo: Repository<Article>,
    @InjectRepository(ArticleAnalysis) private readonly analysisRepo: Repository<ArticleAnalysis>,
    @InjectRepository(ArticleStream) private readonly articleStreamRepo: Repository<ArticleStream>,
    @InjectRepository(ArticleTechnologyInterest)
    private readonly articleTaxonomyRepo: Repository<ArticleTechnologyInterest>,
  ) {}

  async findAll(query: ArticleListQueryDto): Promise<PaginatedResponseDto<Article>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.articleRepo
      .createQueryBuilder('article')
      .leftJoinAndSelect('article.source', 'source');
    if (query.status) qb.andWhere('article.status = :status', { status: query.status });
    if (query.sourceId) qb.andWhere('article.sourceId = :sourceId', { sourceId: query.sourceId });
    if (query.sourceType)
      qb.andWhere('source.type = :sourceType', { sourceType: query.sourceType });
    if (query.sourceGroup)
      qb.andWhere('source.type IN (:...groupTypes)', {
        groupTypes: query.sourceGroup === 'feeds' ? ['rss', 'atom'] : [query.sourceGroup],
      });
    if (query.technologyInterestId)
      qb.innerJoin(
        'article_technology_interests',
        'ati',
        'ati."articleId" = article.id AND ati."technologyInterestId" = :technologyInterestId',
        { technologyInterestId: query.technologyInterestId },
      );
    if (query.streamId)
      qb.innerJoin(
        'article_streams',
        'article_stream',
        'article_stream."articleId" = article.id AND article_stream."streamId" = :streamId',
        { streamId: query.streamId },
      );
    if (query.receivedFrom)
      qb.andWhere('article.createdAt >= :receivedFrom', { receivedFrom: query.receivedFrom });
    if (query.receivedTo)
      qb.andWhere('article.createdAt < :receivedTo', { receivedTo: query.receivedTo });
    if (query.publishedFrom)
      qb.andWhere('article.publishedAt >= :publishedFrom', { publishedFrom: query.publishedFrom });
    if (query.publishedTo)
      qb.andWhere('article.publishedAt < :publishedTo', { publishedTo: query.publishedTo });
    if (query.q)
      qb.andWhere('(article.title ILIKE :q OR article.url ILIKE :q)', { q: `%${query.q}%` });
    const [data, total] = await qb
      .orderBy('article.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

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

  async findAdminList(
    query: ArticleListQueryDto,
  ): Promise<PaginatedResponseDto<AdminArticleListItemDto>> {
    const result = await this.findAll(query);
    if (!result.data.length) return { ...result, data: [] };
    const rows = await this.articleRepo.query<
      Array<{
        articleId: string;
        qualityScore: string | null;
        finalScore: string | null;
        streamId: string | null;
        streamKey: string | null;
        streamName: string | null;
      }>
    >(
      `SELECT analysis."articleId", analysis."qualityScore", analysis."finalScore",
              stream.id AS "streamId", stream.key AS "streamKey", stream.name AS "streamName"
       FROM article_analyses analysis
       LEFT JOIN content_streams stream ON stream.id=analysis."mainStreamId"
       WHERE analysis."deletedAt" IS NULL AND analysis."articleId"=ANY($1::uuid[])`,
      [result.data.map((article) => article.id)],
    );
    const byArticle = new Map(rows.map((row) => [row.articleId, row]));
    return {
      ...result,
      data: result.data.map((article) => {
        const row = byArticle.get(article.id);
        return this.toAdminListItem(article, {
          qualityScore: row?.qualityScore == null ? null : Number(row.qualityScore),
          finalScore: row?.finalScore == null ? null : Number(row.finalScore),
          primaryStream: row?.streamId
            ? {
                id: row.streamId,
                key: row.streamKey!,
                name: row.streamName!,
                isPrimary: true,
              }
            : null,
        });
      }),
    };
  }

  toAdminListItem(
    article: Article,
    analysis: {
      primaryStream: ArticleStreamResponseDto | null;
      qualityScore: number | null;
      finalScore: number | null;
    } = { primaryStream: null, qualityScore: null, finalScore: null },
  ): AdminArticleListItemDto {
    const {
      id,
      sourceId,
      title,
      url,
      urlHash,
      author,
      publishedAt,
      summaryFromFeed,
      status,
      createdAt,
      updatedAt,
      contentExtractionMethod,
      contentFetchedAt,
    } = article;
    return {
      id,
      sourceId,
      title,
      url,
      urlHash,
      author,
      publishedAt,
      summaryFromFeed,
      status,
      createdAt,
      updatedAt,
      contentExtractionMethod,
      contentFetchedAt,
      ...analysis,
      source: article.source
        ? {
            id: article.source.id,
            name: article.source.name,
            url: article.source.url,
            type: article.source.type,
          }
        : null,
    };
  }

  async findAdminDetail(id: string): Promise<AdminArticleDetailResponseDto> {
    const article = await this.findOne(id);
    const [analysis, streams, technologies] = await Promise.all([
      this.analysisRepo.findOne({ where: { articleId: id } }),
      this.articleStreamRepo.find({ where: { articleId: id }, relations: { stream: true } }),
      this.articleTaxonomyRepo.find({
        where: { articleId: id },
        relations: { technologyInterest: true },
      }),
    ]);
    const streamItems = streams
      .filter((row) => row.stream)
      .map((row) => ({
        id: row.stream.id,
        key: row.stream.key,
        name: row.stream.name,
        isPrimary: row.isPrimary,
      }));
    const list = this.toAdminListItem(article, {
      primaryStream: streamItems.find((row) => row.id === analysis?.mainStreamId) ?? null,
      qualityScore: analysis?.qualityScore == null ? null : Number(analysis.qualityScore),
      finalScore: analysis?.finalScore == null ? null : Number(analysis.finalScore),
    });
    return {
      ...list,
      rawContent: article.rawContent,
      contentExtractionConfig: article.contentExtractionConfig,
      analysis: toAdminAnalysisDto(analysis),
      technologies: technologies
        .filter((row) => row.technologyInterest?.kind === TechnologyInterestKind.TECHNOLOGY)
        .map((row) => ({
          id: row.technologyInterest.id,
          name: row.technologyInterest.name,
          kind: row.technologyInterest.kind,
        })),
      interests: technologies
        .filter((row) => row.technologyInterest?.kind === TechnologyInterestKind.INTEREST)
        .map((row) => ({
          id: row.technologyInterest.id,
          name: row.technologyInterest.name,
          kind: row.technologyInterest.kind,
        })),
      streams: streamItems,
    };
  }

  async incrementPublicClick(id: string): Promise<void> {
    await this.articleRepo.increment({ id }, 'publicClickCount', 1);
  }

  async findByUrlHash(urlHash: string): Promise<Article | null> {
    return this.articleRepo.findOne({ where: { urlHash } });
  }

  async findByTitleHashInLastDays(titleHash: string, days: number): Promise<Article | null> {
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

  // Genuine hard delete — bypasses the soft-delete `deletedAt` column entirely, unlike a CRUD
  // `remove`. Reserved for scratch rows that were never real ingestion (e.g.
  // SourceCandidatesService's promotion-sampling articles): a soft delete would leave the row's
  // unique urlHash still occupying the table, blocking that URL from ever being re-ingested
  // through the normal pipeline.
  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.articleRepo.delete(ids);
  }

  async remove(id: string): Promise<void> {
    const article = await this.articleRepo.findOne({ where: { id } });
    if (!article) {
      throw new NotFoundException(`Article ${id} not found`);
    }
    await this.articleRepo.softDelete(id);
    this.logger.info('Article soft-deleted', { id });
  }
}
