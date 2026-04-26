import { ArticleAnalysis } from '../ai-analysis/entities/article-analysis.entity';

export interface ScoredCandidate {
  analysis: ArticleAnalysis;
  computedFinalScore: number;
}

export interface DigestBuildConfig {
  lookbackHours: number;
  minItems: number;
  maxItems: number;
  subjectSuffix: string;
  recencyFreshHours: number;
  recencyRecentHours: number;
  includeFlag: 'shouldIncludeInDailyDigest' | 'shouldIncludeInWeeklyDigest' | 'shouldIncludeInDeepDiveDigest';
}
