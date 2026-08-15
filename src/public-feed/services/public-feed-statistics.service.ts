import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { ArticleAnalysis } from '../../ai-analysis/entities/article-analysis.entity';
import { Article } from '../../articles/entities/article.entity';
import { Source, SourceStatus } from '../../sources/entities/source.entity';
import { PipelineStatisticsDto } from '../dto/pipeline-statistics.dto';

const WINDOW_HOURS = 24;

@Injectable()
export class PublicFeedStatisticsService {
  constructor(
    @InjectRepository(Source)
    private readonly sourceRepo: Repository<Source>,
    @InjectRepository(Article)
    private readonly articleRepo: Repository<Article>,
    @InjectRepository(ArticleAnalysis)
    private readonly analysisRepo: Repository<ArticleAnalysis>,
  ) {}

  async get(selectedForRadar: number | null = null): Promise<PipelineStatisticsDto> {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - WINDOW_HOURS * 60 * 60 * 1000);
    const [activeSources, articlesCollected, articlesAnalyzed] = await Promise.all([
      this.sourceRepo.count({ where: { status: SourceStatus.ACTIVE } }),
      this.articleRepo.count({ where: { createdAt: Between(periodStart, periodEnd) } }),
      this.analysisRepo.count({ where: { fullAnalysisAt: Between(periodStart, periodEnd) } }),
    ]);

    return {
      period: 'Last 24h',
      activeSources,
      articlesCollected,
      articlesAnalyzed,
      selectedForRadar,
    };
  }
}
