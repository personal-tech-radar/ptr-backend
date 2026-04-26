import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoggingService } from '../../common/logging/logging.service';
import { ArticleAnalysis } from '../../ai-analysis/entities/article-analysis.entity';
import { ArticleStatus } from '../../articles/entities/article.entity';
import { Digest, DigestStatus, DigestType } from '../entities/digest.entity';
import { DigestItem } from '../entities/digest-item.entity';
import { DigestBuildConfig, ScoredCandidate } from '../digest.types';
import { AiDigestService } from './ai-digest.service';
import { DigestEmailItem, EmailTemplateService } from './email-template.service';

const DAILY_CONFIG: DigestBuildConfig = {
  lookbackHours: 24,
  minItems: 5,
  maxItems: 5,
  subjectSuffix: 'Daily Brief',
  recencyFreshHours: 12,
  recencyRecentHours: 24,
  includeFlag: 'shouldIncludeInDailyDigest',
};

const WEEKLY_CONFIG: DigestBuildConfig = {
  lookbackHours: 7 * 24,
  minItems: 10,
  maxItems: 10,
  subjectSuffix: 'Weekly Brief',
  recencyFreshHours: 24,
  recencyRecentHours: 72,
  includeFlag: 'shouldIncludeInWeeklyDigest',
};

const DEEP_DIVE_WEEKLY_CONFIG: DigestBuildConfig = {
  lookbackHours: 7 * 24,
  minItems: 10,
  maxItems: 10,
  subjectSuffix: 'Deep Dive Weekly',
  recencyFreshHours: 48,
  recencyRecentHours: 96,
  includeFlag: 'shouldIncludeInDeepDiveDigest',
};

@Injectable()
export class DigestBuilderService {
  private readonly logger = new LoggingService(DigestBuilderService.name);

  constructor(
    @InjectRepository(Digest)
    private readonly digestRepo: Repository<Digest>,
    @InjectRepository(DigestItem)
    private readonly digestItemRepo: Repository<DigestItem>,
    @InjectRepository(ArticleAnalysis)
    private readonly analysisRepo: Repository<ArticleAnalysis>,
    private readonly aiDigestService: AiDigestService,
    private readonly emailTemplateService: EmailTemplateService,
  ) {}

  async buildDailyDigest(): Promise<Digest | null> {
    return this.buildDigest(DigestType.DAILY, DAILY_CONFIG);
  }

  async buildWeeklyDigest(): Promise<Digest | null> {
    return this.buildDigest(DigestType.WEEKLY, WEEKLY_CONFIG);
  }

  async buildDeepDiveWeeklyDigest(): Promise<Digest | null> {
    return this.buildDigest(DigestType.DEEP_DIVE_WEEKLY, DEEP_DIVE_WEEKLY_CONFIG);
  }

  private async buildDigest(
    type: DigestType,
    config: DigestBuildConfig,
  ): Promise<Digest | null> {
    const now = new Date();
    const periodStart = new Date(
      now.getTime() - config.lookbackHours * 60 * 60 * 1000,
    );

    let candidates = await this.getAnalyzedCandidates(periodStart, config.includeFlag);

    if (candidates.length < config.minItems) {
      const fallback = await this.getRelaxedCandidates(periodStart);
      const existingIds = new Set(candidates.map((c) => c.articleId));
      const extra = fallback.filter((c) => !existingIds.has(c.articleId));
      candidates = [...candidates, ...extra];
    }

    if (candidates.length === 0) {
      this.logger.info(`No candidates for ${type} digest`);
      return null;
    }

    const scored: ScoredCandidate[] = candidates.map((analysis) => ({
      analysis,
      computedFinalScore: this.computeFinalScore(analysis, config),
    }));
    scored.sort((a, b) => b.computedFinalScore - a.computedFinalScore);

    const selected = this.selectWithDiversification(scored, config.maxItems);
    if (selected.length === 0) return null;

    const dateStr = now.toISOString().split('T')[0];
    const subject = `Personal Tech Radar — ${config.subjectSuffix} — ${dateStr}`;
    const intro = await this.aiDigestService.generateIntro(type, selected);

    const emailItems = this.toEmailItems(selected);
    const htmlBody = this.emailTemplateService.renderHtml(subject, intro, emailItems);
    const textBody = this.emailTemplateService.renderText(subject, intro, emailItems);

    const digest = await this.digestRepo.save(
      this.digestRepo.create({
        type,
        periodStart,
        periodEnd: now,
        subject,
        intro,
        htmlBody,
        textBody,
        status: DigestStatus.DRAFT,
        sentAt: null,
      }),
    );

    for (let i = 0; i < selected.length; i++) {
      await this.digestItemRepo.save(
        this.digestItemRepo.create({
          digestId: digest.id,
          articleId: selected[i].analysis.articleId,
          position: i + 1,
        }),
      );
    }

    this.logger.info(`${type} digest built`, {
      digestId: digest.id,
      itemCount: selected.length,
    });
    return digest;
  }

  computeFinalScore(analysis: ArticleAnalysis, config: DigestBuildConfig): number {
    const relevance = Number(analysis.relevanceScore);
    const quality = Number(analysis.qualityScore);
    const trust = Number(analysis.article?.source?.trustScore ?? 50);
    const recency = this.getRecencyScore(
      analysis.article?.publishedAt ?? null,
      config,
    );
    return relevance * 0.45 + quality * 0.3 + trust * 0.15 + recency * 0.1;
  }

  getRecencyScore(publishedAt: Date | null, config: DigestBuildConfig): number {
    if (!publishedAt) return 50;
    const ageHours = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
    if (ageHours <= config.recencyFreshHours) return 100;
    if (ageHours <= config.recencyRecentHours) return 80;
    return 50;
  }

  selectWithDiversification(
    scored: ScoredCandidate[],
    max: number,
  ): ScoredCandidate[] {
    const selected: ScoredCandidate[] = [];
    const sourceCount = new Map<string, number>();
    const categoryCount = new Map<string, number>();
    const skipped: ScoredCandidate[] = [];

    for (const candidate of scored) {
      if (selected.length >= max) break;
      const sourceId = candidate.analysis.article?.sourceId ?? '';
      const category = candidate.analysis.article?.source?.category ?? '';
      const src = sourceCount.get(sourceId) ?? 0;
      const cat = categoryCount.get(category) ?? 0;
      if (src >= 2) continue;
      if (cat >= 2) { skipped.push(candidate); continue; }
      selected.push(candidate);
      sourceCount.set(sourceId, src + 1);
      categoryCount.set(category, cat + 1);
    }

    for (const candidate of skipped) {
      if (selected.length >= max) break;
      const sourceId = candidate.analysis.article?.sourceId ?? '';
      if ((sourceCount.get(sourceId) ?? 0) >= 2) continue;
      selected.push(candidate);
      sourceCount.set(sourceId, (sourceCount.get(sourceId) ?? 0) + 1);
    }

    return selected;
  }

  private toEmailItems(selected: ScoredCandidate[]): DigestEmailItem[] {
    return selected.map((c, i) => ({
      position: i + 1,
      title: c.analysis.article.title,
      sourceName: c.analysis.article.source?.name ?? '',
      shortSummary: c.analysis.shortSummary,
      whyItMatters: c.analysis.whyItMatters,
      url: c.analysis.article.url,
      matchedInterests: c.analysis.matchedInterests,
    }));
  }

  private async getAnalyzedCandidates(
    periodStart: Date,
    includeFlag: string,
  ): Promise<ArticleAnalysis[]> {
    return this.analysisRepo
      .createQueryBuilder('aa')
      .innerJoinAndSelect('aa.article', 'a')
      .innerJoinAndSelect('a.source', 's')
      .where('aa.deletedAt IS NULL')
      .andWhere('a.deletedAt IS NULL')
      .andWhere('s.deletedAt IS NULL')
      .andWhere(`aa.${includeFlag} = :flag`, { flag: true })
      .andWhere('aa.relevanceScore >= :minRelevance', { minRelevance: 60 })
      .andWhere('aa.qualityScore >= :minQuality', { minQuality: 50 })
      .andWhere('a.status = :status', { status: ArticleStatus.ANALYZED })
      .andWhere('a.publishedAt >= :periodStart', { periodStart })
      .andWhere("a.title != ''")
      .andWhere("a.url != ''")
      .getMany();
  }

  private async getRelaxedCandidates(periodStart: Date): Promise<ArticleAnalysis[]> {
    return this.analysisRepo
      .createQueryBuilder('aa')
      .innerJoinAndSelect('aa.article', 'a')
      .innerJoinAndSelect('a.source', 's')
      .where('aa.deletedAt IS NULL')
      .andWhere('a.deletedAt IS NULL')
      .andWhere('s.deletedAt IS NULL')
      .andWhere('aa.relevanceScore >= :minRelevance', { minRelevance: 40 })
      .andWhere('aa.qualityScore >= :minQuality', { minQuality: 30 })
      .andWhere('a.status = :status', { status: ArticleStatus.ANALYZED })
      .andWhere('a.publishedAt >= :periodStart', { periodStart })
      .andWhere("a.title != ''")
      .andWhere("a.url != ''")
      .orderBy('aa.relevanceScore', 'DESC')
      .getMany();
  }
}
