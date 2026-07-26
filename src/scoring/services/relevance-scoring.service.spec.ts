import {
  ArticleAnalysis,
  ArticleComplexityLevel,
} from '../../ai-analysis/entities/article-analysis.entity';
import { ArticleFeedbackType } from '../../articles/entities/article-feedback.entity';
import { UserLevel } from '../../users/entities/user.entity';
import { DEFAULT_SCORING_CONFIG, ScorableArticle, ScoringProfile } from '../scoring.types';
import { RelevanceScoringService } from './relevance-scoring.service';

function makeAnalysis(overrides: Partial<ArticleAnalysis> = {}): ArticleAnalysis {
  return {
    id: 'aa-1',
    articleId: 'a-1',
    qualityScore: 70,
    complexityLevel: ArticleComplexityLevel.INTERMEDIATE,
    article: {
      id: 'a-1',
      sourceId: 'src-1',
      publishedAt: new Date(),
    },
    ...overrides,
  } as ArticleAnalysis;
}

function makeArticle(overrides: Partial<ScorableArticle> = {}): ScorableArticle {
  return {
    analysis: makeAnalysis(),
    technologyInterestIds: ['ti-1'],
    streamIds: ['stream-1'],
    ...overrides,
  };
}

function makeProfile(overrides: Partial<ScoringProfile> = {}): ScoringProfile {
  return {
    technologyInterestIds: ['ti-1'],
    contentStreamIds: ['stream-1'],
    level: UserLevel.MIDDLE,
    ...overrides,
  };
}

describe('RelevanceScoringService', () => {
  let service: RelevanceScoringService;

  beforeEach(() => {
    service = new RelevanceScoringService();
  });

  describe('content-stream eligibility', () => {
    it('is ineligible with score 0 and a zeroed breakdown when no stream overlaps', () => {
      const article = makeArticle({ streamIds: ['stream-other'] });
      const profile = makeProfile({ contentStreamIds: ['stream-1'] });

      const result = service.computeScore(article, profile);

      expect(result.eligible).toBe(false);
      expect(result.score).toBe(0);
      expect(result.breakdown).toEqual({
        techInterestOverlap: 0,
        complexityMatch: 0,
        qualityScore: 0,
        recencyScore: 0,
        sourcePreferenceAdjustment: 0,
        directFeedbackAdjustment: 0,
      });
    });

    it('is eligible when the article main stream matches the profile', () => {
      const article = makeArticle({ streamIds: ['stream-1'] });
      const profile = makeProfile({ contentStreamIds: ['stream-1'] });

      const result = service.computeScore(article, profile);

      expect(result.eligible).toBe(true);
    });

    it('is eligible via a secondary-stream-only match', () => {
      const article = makeArticle({ streamIds: ['stream-main', 'stream-secondary'] });
      const profile = makeProfile({ contentStreamIds: ['stream-secondary'] });

      const result = service.computeScore(article, profile);

      expect(result.eligible).toBe(true);
    });
  });

  describe('direct article feedback (soft adjustment, not a hard exclusion)', () => {
    it('remains eligible with a not_useful vote and reduces the score by the penalty', () => {
      const article = makeArticle();
      const profileWithoutFeedback = makeProfile();
      const profileWithNotUseful = makeProfile({
        articleFeedback: new Map([['a-1', ArticleFeedbackType.NOT_USEFUL]]),
      });

      const baseline = service.computeScore(article, profileWithoutFeedback);
      const withPenalty = service.computeScore(article, profileWithNotUseful);

      expect(withPenalty.eligible).toBe(true);
      expect(withPenalty.score).toBeCloseTo(baseline.score - 8, 5);
      expect(withPenalty.breakdown.directFeedbackAdjustment).toBe(-8);
    });

    it('increases the score by the bonus on a useful vote', () => {
      const article = makeArticle();
      const profileWithoutFeedback = makeProfile();
      const profileWithUseful = makeProfile({
        articleFeedback: new Map([['a-1', ArticleFeedbackType.USEFUL]]),
      });

      const baseline = service.computeScore(article, profileWithoutFeedback);
      const withBonus = service.computeScore(article, profileWithUseful);

      expect(withBonus.score).toBeCloseTo(baseline.score + 8, 5);
      expect(withBonus.breakdown.directFeedbackAdjustment).toBe(8);
    });
  });

  describe('tech/interest overlap', () => {
    it('scores 0 when the article has tags but none match the profile', () => {
      const article = makeArticle({ technologyInterestIds: ['ti-unrelated'] });
      const profile = makeProfile({ technologyInterestIds: ['ti-1'] });

      const result = service.computeScore(article, profile);

      expect(result.breakdown.techInterestOverlap).toBe(0);
    });

    it('scores 50 (neutral) when the article has no tags at all', () => {
      const article = makeArticle({ technologyInterestIds: [] });
      const profile = makeProfile();

      const result = service.computeScore(article, profile);

      expect(result.breakdown.techInterestOverlap).toBe(50);
    });

    it('scores 60 for exactly one match', () => {
      const article = makeArticle({ technologyInterestIds: ['ti-1', 'ti-unrelated'] });
      const profile = makeProfile({ technologyInterestIds: ['ti-1'] });

      const result = service.computeScore(article, profile);

      expect(result.breakdown.techInterestOverlap).toBe(60);
    });

    it('scores 80 for exactly two matches', () => {
      const article = makeArticle({ technologyInterestIds: ['ti-1', 'ti-2'] });
      const profile = makeProfile({ technologyInterestIds: ['ti-1', 'ti-2'] });

      const result = service.computeScore(article, profile);

      expect(result.breakdown.techInterestOverlap).toBe(80);
    });

    it('scores 100 for three or more matches', () => {
      const article = makeArticle({ technologyInterestIds: ['ti-1', 'ti-2', 'ti-3'] });
      const profile = makeProfile({ technologyInterestIds: ['ti-1', 'ti-2', 'ti-3'] });

      const result = service.computeScore(article, profile);

      expect(result.breakdown.techInterestOverlap).toBe(100);
    });
  });

  describe('complexity match table', () => {
    it('junior x beginner -> 100', () => {
      const article = makeArticle({
        analysis: makeAnalysis({ complexityLevel: ArticleComplexityLevel.BEGINNER }),
      });
      const profile = makeProfile({ level: UserLevel.JUNIOR });

      expect(service.computeScore(article, profile).breakdown.complexityMatch).toBe(100);
    });

    it('senior x architect -> 90', () => {
      const article = makeArticle({
        analysis: makeAnalysis({ complexityLevel: ArticleComplexityLevel.ARCHITECT }),
      });
      const profile = makeProfile({ level: UserLevel.SENIOR });

      expect(service.computeScore(article, profile).breakdown.complexityMatch).toBe(90);
    });

    it('junior x architect (distant low pair) -> 10', () => {
      const article = makeArticle({
        analysis: makeAnalysis({ complexityLevel: ArticleComplexityLevel.ARCHITECT }),
      });
      const profile = makeProfile({ level: UserLevel.JUNIOR });

      expect(service.computeScore(article, profile).breakdown.complexityMatch).toBe(10);
    });

    it('null level and null complexity -> 50 (neutral)', () => {
      const article = makeArticle({ analysis: makeAnalysis({ complexityLevel: null }) });
      const profile = makeProfile({ level: null });

      expect(service.computeScore(article, profile).breakdown.complexityMatch).toBe(50);
    });
  });

  it('treats a null qualityScore as neutral (50)', () => {
    const article = makeArticle({ analysis: makeAnalysis({ qualityScore: null }) });
    const profile = makeProfile();

    expect(service.computeScore(article, profile).breakdown.qualityScore).toBe(50);
  });

  it('computes the exact documented weighted-sum formula for a realistic mixed input', () => {
    const publishedAt = new Date(Date.now() - 6 * 60 * 60 * 1000); // within fresh window -> 100
    const article = makeArticle({
      analysis: makeAnalysis({
        qualityScore: 80,
        complexityLevel: ArticleComplexityLevel.ADVANCED,
        article: { id: 'a-1', sourceId: 'src-1', publishedAt } as ArticleAnalysis['article'],
      }),
      technologyInterestIds: ['ti-1', 'ti-2'], // 2 matches -> 80
      streamIds: ['stream-1'],
    });
    const profile = makeProfile({
      technologyInterestIds: ['ti-1', 'ti-2'],
      contentStreamIds: ['stream-1'],
      level: UserLevel.SENIOR, // senior x advanced -> 100
      sourcePreferenceAdjustments: new Map([['src-1', 3]]),
      articleFeedback: new Map([['a-1', ArticleFeedbackType.USEFUL]]), // +8
    });

    const result = service.computeScore(article, profile, DEFAULT_SCORING_CONFIG);

    const expectedCore = 80 * 0.45 + 100 * 0.2 + 80 * 0.25 + 100 * 0.1;
    const expectedScore = expectedCore + 3 + 8;

    expect(result.eligible).toBe(true);
    expect(result.score).toBeCloseTo(expectedScore, 5);
    expect(result.breakdown).toEqual({
      techInterestOverlap: 80,
      complexityMatch: 100,
      qualityScore: 80,
      recencyScore: 100,
      sourcePreferenceAdjustment: 3,
      directFeedbackAdjustment: 8,
    });
  });
});
