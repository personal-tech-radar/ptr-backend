import { Injectable } from '@nestjs/common';
import { ArticleComplexityLevel } from '../../ai-analysis/entities/article-analysis.entity';
import { getRecencyScore } from '../../common/util/recency-score.util';
import { UserLevel } from '../../users/entities/user.entity';
import {
  COMPLEXITY_MATCH_TABLE,
  DEFAULT_SCORING_CONFIG,
  ScorableArticle,
  ScoringConfig,
  ScoringProfile,
  ScoringResult,
  ScoringResultBreakdown,
} from '../scoring.types';

const EMPTY_BREAKDOWN: ScoringResultBreakdown = {
  technologyMatch: 0,
  interestMatch: 0,
  complexityMatch: 0,
  qualityScore: 0,
  recencyScore: 0,
  sourcePreferenceAdjustment: 0,
};

// Scoring is pure; callers resolve database inputs before invoking it.
@Injectable()
export class RelevanceScoringService {
  computeScore(
    article: ScorableArticle,
    profile: ScoringProfile,
    config: ScoringConfig = DEFAULT_SCORING_CONFIG,
  ): ScoringResult {
    // Stream mismatch excludes an article; interactions affect only source adjustment.
    const eligible = article.streamIds.some((id) => profile.contentStreamIds.includes(id));
    if (!eligible) {
      return { eligible: false, score: 0, breakdown: { ...EMPTY_BREAKDOWN } };
    }

    const technologyMatch = this.computeTaxonomyOverlap(
      article.technologyIds ?? article.technologyInterestIds,
      profile.technologyIds ?? profile.technologyInterestIds,
    );
    const interestMatch = this.computeTaxonomyOverlap(
      article.interestIds ?? [],
      profile.interestIds ?? [],
    );
    const complexityMatch = this.computeComplexityMatch(
      profile.level,
      article.analysis.complexityLevel,
    );
    const qualityScore = article.analysis.qualityScore ?? 50;
    const recencyScore = getRecencyScore(
      article.analysis.article.publishedAt,
      config.recencyFreshHours,
      config.recencyRecentHours,
    );

    const coreScore =
      technologyMatch * config.weights.technologyMatch +
      interestMatch * config.weights.interestMatch +
      complexityMatch * config.weights.complexityMatch +
      qualityScore * config.weights.qualityScore +
      recencyScore * config.weights.recency;

    const sourcePreferenceAdjustment =
      profile.sourcePreferenceAdjustments?.get(article.analysis.article.sourceId) ?? 0;

    // Keep the bounded source adjustment additive to the weighted base score.
    const score = coreScore + sourcePreferenceAdjustment;

    return {
      eligible: true,
      score,
      breakdown: {
        technologyMatch,
        interestMatch,
        complexityMatch,
        qualityScore,
        recencyScore,
        sourcePreferenceAdjustment,
      },
    };
  }

  private computeTaxonomyOverlap(articleIds: string[], profileIds: string[]): number {
    // Untagged articles receive a neutral taxonomy score.
    if (articleIds.length === 0) return 50;
    const matchCount = articleIds.filter((id) => profileIds.includes(id)).length;
    if (matchCount === 0) return 0;
    if (matchCount === 1) return 60;
    if (matchCount === 2) return 80;
    return 100;
  }

  private computeComplexityMatch(
    level: UserLevel | null,
    complexityLevel: ArticleComplexityLevel | null,
  ): number {
    if (!level || !complexityLevel) return 50;
    return COMPLEXITY_MATCH_TABLE[level]?.[complexityLevel] ?? 50;
  }
}
