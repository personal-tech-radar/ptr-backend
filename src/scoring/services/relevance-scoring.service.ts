import { Injectable } from '@nestjs/common';
import { ArticleComplexityLevel } from '../../ai-analysis/entities/article-analysis.entity';
import { ArticleFeedbackType } from '../../articles/entities/article-feedback.entity';
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
  techInterestOverlap: 0,
  complexityMatch: 0,
  qualityScore: 0,
  recencyScore: 0,
  sourcePreferenceAdjustment: 0,
  directFeedbackAdjustment: 0,
};

// Pure/stateless — no repository injection. Callers (UserScoringProfileService and future
// consumers like the Personal Feed / Public Preview) resolve all DB-backed inputs first and
// pass them in as plain data.
@Injectable()
export class RelevanceScoringService {
  computeScore(
    article: ScorableArticle,
    profile: ScoringProfile,
    config: ScoringConfig = DEFAULT_SCORING_CONFIG,
  ): ScoringResult {
    // Content-stream mismatch is the ONLY hard exclusion. A "not_useful" article-level feedback
    // vote is deliberately NOT a hard exclusion — see directFeedbackAdjustment below.
    const eligible = article.streamIds.some((id) => profile.contentStreamIds.includes(id));
    if (!eligible) {
      return { eligible: false, score: 0, breakdown: { ...EMPTY_BREAKDOWN } };
    }

    const techInterestOverlap = this.computeTechInterestOverlap(
      article.technologyInterestIds,
      profile.technologyInterestIds,
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
      techInterestOverlap * config.weights.techInterestOverlap +
      complexityMatch * config.weights.complexityMatch +
      qualityScore * config.weights.qualityScore +
      recencyScore * config.weights.recency;

    const sourcePreferenceAdjustment =
      profile.sourcePreferenceAdjustments?.get(article.analysis.article.sourceId) ?? 0;
    const directFeedbackAdjustment = this.computeDirectFeedbackAdjustment(
      profile.articleFeedback?.get(article.analysis.articleId),
    );

    // Additive, not re-clamped after summing — same convention as DigestBuilderService's
    // finalScore = baseScore + feedbackAdjustment.
    const score = coreScore + sourcePreferenceAdjustment + directFeedbackAdjustment;

    return {
      eligible: true,
      score,
      breakdown: {
        techInterestOverlap,
        complexityMatch,
        qualityScore,
        recencyScore,
        sourcePreferenceAdjustment,
        directFeedbackAdjustment,
      },
    };
  }

  private computeTechInterestOverlap(articleIds: string[], profileIds: string[]): number {
    // Article has no tagged tech/interests at all -> neutral, not penalized.
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

  private computeDirectFeedbackAdjustment(feedbackType?: ArticleFeedbackType): number {
    if (feedbackType === ArticleFeedbackType.USEFUL) return 8;
    if (feedbackType === ArticleFeedbackType.NOT_USEFUL) return -8;
    return 0;
  }
}
