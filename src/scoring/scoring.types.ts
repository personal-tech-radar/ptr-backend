import {
  ArticleAnalysis,
  ArticleComplexityLevel,
} from '../ai-analysis/entities/article-analysis.entity';
import { ArticleFeedbackType } from '../articles/entities/article-feedback.entity';
import { UserLevel } from '../users/entities/user.entity';

export interface ScoringProfile {
  technologyInterestIds: string[];
  contentStreamIds: string[];
  level: UserLevel | null;
  // sourceId -> adjustment (existing ±8-range value from UserSourcePreference)
  sourcePreferenceAdjustments?: Map<string, number>;
  // articleId -> feedback type
  articleFeedback?: Map<string, ArticleFeedbackType>;
}

export interface ScorableArticle {
  // Caller must ensure `analysis.article` is loaded (sourceId, publishedAt needed).
  analysis: ArticleAnalysis;
  // Resolved from ArticleTechnologyInterest, pre-merged by caller.
  technologyInterestIds: string[];
  // mainStreamId + secondary ArticleStream ids, pre-merged by caller.
  streamIds: string[];
}

export interface ScoringConfig {
  weights: {
    techInterestOverlap: number;
    complexityMatch: number;
    qualityScore: number;
    recency: number;
  };
  recencyFreshHours: number;
  recencyRecentHours: number;
}

export interface ScoringResultBreakdown {
  techInterestOverlap: number;
  complexityMatch: number;
  qualityScore: number;
  recencyScore: number;
  sourcePreferenceAdjustment: number;
  directFeedbackAdjustment: number;
}

export interface ScoringResult {
  // false ONLY on content-stream mismatch — per-article feedback is a soft penalty, not a
  // hard exclusion (see RelevanceScoringService).
  eligible: boolean;
  score: number;
  breakdown: ScoringResultBreakdown;
}

// Reuses DigestBuilderService's DAILY_CONFIG recency window (12h fresh / 24h recent) as the
// default — the same values already used for the digest's own recency scoring.
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  weights: {
    techInterestOverlap: 0.45,
    complexityMatch: 0.2,
    qualityScore: 0.25,
    recency: 0.1,
  },
  recencyFreshHours: 12,
  recencyRecentHours: 24,
};

export const COMPLEXITY_MATCH_TABLE: Record<UserLevel, Record<ArticleComplexityLevel, number>> = {
  [UserLevel.JUNIOR]: {
    [ArticleComplexityLevel.BEGINNER]: 100,
    [ArticleComplexityLevel.INTERMEDIATE]: 70,
    [ArticleComplexityLevel.ADVANCED]: 30,
    [ArticleComplexityLevel.ARCHITECT]: 10,
  },
  [UserLevel.MIDDLE]: {
    [ArticleComplexityLevel.BEGINNER]: 60,
    [ArticleComplexityLevel.INTERMEDIATE]: 100,
    [ArticleComplexityLevel.ADVANCED]: 70,
    [ArticleComplexityLevel.ARCHITECT]: 30,
  },
  [UserLevel.SENIOR]: {
    [ArticleComplexityLevel.BEGINNER]: 20,
    [ArticleComplexityLevel.INTERMEDIATE]: 50,
    [ArticleComplexityLevel.ADVANCED]: 100,
    [ArticleComplexityLevel.ARCHITECT]: 90,
  },
};
