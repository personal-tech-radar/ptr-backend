import { ArticleAnalysis } from '../ai-analysis/entities/article-analysis.entity';
import { ScoringResult } from '../scoring/scoring.types';

// Mirrors ScoringModule's ScorableArticle/FeedCandidate shape (see feed.types.ts) — the personal
// digest builder scores candidates through the exact same RelevanceScoringService engine as
// Feed/Public Preview.
export interface PersonalDigestCandidate {
  analysis: ArticleAnalysis;
  technologyInterestIds: string[];
  streamIds: string[];
}

export interface PersonalDigestScoredCandidate {
  candidate: PersonalDigestCandidate;
  result: ScoringResult;
}

export interface PersonalDigestConfig {
  // Ascending fallback windows (hours) — the narrowest window is tried first; if the eligible
  // candidate count is still under articleLimit, the next (wider) window is tried, mirroring the
  // old DigestBuilderService's DAILY_FALLBACK_WINDOWS behavior, generalized to weekly too.
  fallbackWindowsHours: number[];
  articleLimit: number;
  subjectSuffix: string;
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

// No live producer as of MVP3 Phase 10 — personal digests deliberately omit this pipeline-health
// footer (see EmailTemplateService/PersonalDigestBuilderService). Kept as a type since
// EmailTemplateService's renderHtml/renderText still accept it as an optional param for any
// future ops-facing digest variant.
export interface DigestStats {
  windowHours: number;
  articlesIngested: number;
  articlesPassedPreanalysis: number;
  articlesAnalyzed: number;
  totalArticlesInDb: number;
  totalSourcesActive: number;
  feedSourcesActive: number;
  webSourcesActive: number;
  sourceCandidatesPending: number;
}
