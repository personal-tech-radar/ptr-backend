import { ArticleAnalysis } from '../ai-analysis/entities/article-analysis.entity';
import { ScoringResult } from '../scoring/scoring.types';

// Extends ScoringModule's ScorableArticle with the one extra bit the feed's capping/distribution
// algorithm needs: whether this candidate must always be included regardless of stream
// eligibility (true only for the saved=true path — see coder.md decision on the 30-day-floor
// exemption and stream-eligibility override for saved articles).
export interface FeedCandidate {
  analysis: ArticleAnalysis;
  technologyInterestIds: string[];
  streamIds: string[];
  alwaysInclude: boolean;
}

export interface FeedScoredCandidate {
  candidate: FeedCandidate;
  result: ScoringResult;
}
