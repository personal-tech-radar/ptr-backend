import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ArticleAnalysis } from '../../ai-analysis/entities/article-analysis.entity';
import { ArticleStream } from '../../ai-analysis/entities/article-stream.entity';
import { ArticleTechnologyInterest } from '../../ai-analysis/entities/article-technology-interest.entity';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { TechnologyInterestKind } from '../../taxonomy/entities/technology-interest.entity';
import { ArticleListQueryDto } from '../dto/article-list-query.dto';
import { PublicArticleResponseDto } from '../dto/public-article-response.dto';
import { ArticleStatus } from '../entities/article.entity';

const PUBLIC_CONTENT_MIN_QUALITY_SCORE = 50;

@Injectable()
export class PublicArticlesService {
  constructor(
    @InjectRepository(ArticleAnalysis) private readonly analyses: Repository<ArticleAnalysis>,
    @InjectRepository(ArticleTechnologyInterest)
    private readonly taxonomyLinks: Repository<ArticleTechnologyInterest>,
    @InjectRepository(ArticleStream) private readonly streamLinks: Repository<ArticleStream>,
  ) {}

  async findAll(
    query: ArticleListQueryDto,
  ): Promise<PaginatedResponseDto<PublicArticleResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.publicQuery();
    if (query.sourceId) qb.andWhere('a.sourceId = :sourceId', { sourceId: query.sourceId });
    const [rows, total] = await qb
      .orderBy('a.publishedAt', 'DESC', 'NULLS LAST')
      .addOrderBy('a.createdAt', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    const data = await this.mapMany(rows);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string): Promise<PublicArticleResponseDto> {
    const analysis = await this.publicQuery().andWhere('a.id = :id', { id }).getOne();
    if (!analysis) throw new NotFoundException(`Public article ${id} not found`);
    return (await this.mapMany([analysis]))[0];
  }

  private publicQuery() {
    return this.analyses
      .createQueryBuilder('analysis')
      .innerJoinAndSelect('analysis.article', 'a')
      .innerJoinAndSelect('a.source', 'source')
      .where('analysis.fullAnalysisAt IS NOT NULL')
      .andWhere('analysis.preScreenIsRelevant = true')
      .andWhere('a.status = :status', { status: ArticleStatus.ANALYZED })
      .andWhere('analysis.qualityScore >= :quality', { quality: PUBLIC_CONTENT_MIN_QUALITY_SCORE })
      .andWhere('a.deletedAt IS NULL')
      .andWhere('source.deletedAt IS NULL')
      .andWhere('EXISTS (SELECT 1 FROM article_streams ps WHERE ps."articleId" = a.id)');
  }

  async mapMany(rows: ArticleAnalysis[]): Promise<PublicArticleResponseDto[]> {
    const ids = rows.map((row) => row.articleId);
    if (!ids.length) return [];
    const [taxonomy, streams] = await Promise.all([
      this.taxonomyLinks.find({ where: { articleId: In(ids) }, relations: ['technologyInterest'] }),
      this.streamLinks.find({ where: { articleId: In(ids) }, relations: ['stream'] }),
    ]);
    return rows.map((analysis) => {
      const articleTaxonomy = taxonomy.filter((link) => link.articleId === analysis.articleId);
      const articleStreams = streams.filter((link) => link.articleId === analysis.articleId);
      const mapTaxonomy = (kind: TechnologyInterestKind) =>
        articleTaxonomy
          .filter((link) => link.technologyInterest.kind === kind)
          .map((link) => ({ id: link.technologyInterest.id, name: link.technologyInterest.name }));
      const mapStream = (link: ArticleStream) => ({
        id: link.stream.id,
        key: link.stream.key,
        name: link.stream.name,
      });
      const article = analysis.article;
      const primary = articleStreams.find((link) => link.isPrimary);
      return {
        id: article.id,
        title: article.title,
        originalUrl: article.url,
        publicRedirectUrl: `/go/articles/${article.id}`,
        source: { id: article.source.id, name: article.source.name, type: article.source.type },
        author: article.author,
        publishedAt: article.publishedAt,
        summary: analysis.shortSummary ?? article.summaryFromFeed,
        longSummary: analysis.longSummary ?? analysis.shortSummary ?? article.summaryFromFeed,
        technologies: mapTaxonomy(TechnologyInterestKind.TECHNOLOGY),
        interests: mapTaxonomy(TechnologyInterestKind.INTEREST),
        streams: articleStreams.map(mapStream),
        primaryStream: primary ? mapStream(primary) : null,
        complexity: analysis.complexityLevel,
        qualityScore: analysis.qualityScore === null ? null : Number(analysis.qualityScore),
        publicClickCount: article.publicClickCount,
        personalTrackedOpenCount: article.personalTrackedOpenCount,
        totalClickCount: article.publicClickCount + article.personalTrackedOpenCount,
        createdAt: article.createdAt,
        updatedAt: article.updatedAt,
      };
    });
  }
}
