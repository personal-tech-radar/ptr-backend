import { ArticleAnalysis } from '../ai-analysis/entities/article-analysis.entity';

export interface ScoredCandidate {
  analysis: ArticleAnalysis;
  computedFinalScore: number;
  baseScore?: number;
  feedbackAdjustment?: number;
}

export interface DigestBuildConfig {
  lookbackHours: number;
  minItems: number;
  maxItems: number;
  subjectSuffix: string;
  recencyFreshHours: number;
  recencyRecentHours: number;
  includeFlag:
    | 'shouldIncludeInDailyDigest'
    | 'shouldIncludeInWeeklyDigest'
    | 'shouldIncludeInDeepDiveDigest';
}

export interface DigestBuildAttempt {
  windowHours: number;
  candidatesFound: number;
  eligibleFound: number;
}

export interface DigestBuildDebug {
  requestedItemCount: number;
  fallbackUsed: boolean;
  attempts: DigestBuildAttempt[];
  finalWindowHours: number;
  finalSelectedCount: number;
}

export interface DigestStats {
  windowHours: number;
  articlesIngested: number;
  articlesPassedPreanalysis: number;
  articlesAnalyzed: number;
  totalArticlesInDb: number;
  totalSourcesActive: number;
}

export interface DigestItemScoreBreakdown {
  baseScore: number;
  feedbackAdjustment: number;
  finalScore: number;
}
