import {
  ArticleAnalysis,
  ArticleComplexityLevel,
} from '../../ai-analysis/entities/article-analysis.entity';
import { UserLevel } from '../../users/entities/user.entity';
import { ScorableArticle, ScoringProfile } from '../scoring.types';
import { RelevanceScoringService } from './relevance-scoring.service';

const article = (overrides: Partial<ScorableArticle> = {}): ScorableArticle => ({
  analysis: {
    qualityScore: 80,
    complexityLevel: ArticleComplexityLevel.ADVANCED,
    article: { id: 'article', sourceId: 'source', publishedAt: new Date() },
  } as ArticleAnalysis,
  technologyInterestIds: [],
  technologyIds: ['technology'],
  interestIds: ['interest'],
  streamIds: ['stream'],
  ...overrides,
});

const profile = (overrides: Partial<ScoringProfile> = {}): ScoringProfile => ({
  technologyInterestIds: [],
  technologyIds: ['technology'],
  interestIds: ['interest'],
  contentStreamIds: ['stream'],
  level: UserLevel.SENIOR,
  ...overrides,
});

describe('RelevanceScoringService', () => {
  const service = new RelevanceScoringService();

  it('makes selected streams a hard eligibility rule', () => {
    expect(service.computeScore(article(), profile({ contentStreamIds: ['other'] }))).toEqual({
      eligible: false,
      score: 0,
      breakdown: {
        technologyMatch: 0,
        interestMatch: 0,
        complexityMatch: 0,
        qualityScore: 0,
        recencyScore: 0,
        sourcePreferenceAdjustment: 0,
      },
    });
  });

  it('scores technologies and interests separately and adds only bounded source influence', () => {
    const result = service.computeScore(
      article({ interestIds: ['unrelated'] }),
      profile({ sourcePreferenceAdjustments: new Map([['source', 3]]) }),
    );
    expect(result.breakdown.technologyMatch).toBe(60);
    expect(result.breakdown.interestMatch).toBe(0);
    expect(result.breakdown.sourcePreferenceAdjustment).toBe(3);
    expect(result.score).toBeCloseTo(15 + 0 + 20 + 20 + 10 + 3);
  });

  it('maps senior advanced to the strongest difficulty match', () => {
    expect(service.computeScore(article(), profile()).breakdown.complexityMatch).toBe(100);
  });
});
