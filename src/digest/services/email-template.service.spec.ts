import { Test, TestingModule } from '@nestjs/testing';
import { DigestStats } from '../digest.types';
import { DigestEmailItem, EmailTemplateService } from './email-template.service';

const longSummary =
  'This article walks through how a mid-sized engineering team migrated their monolithic ' +
  'order-processing service to an event-driven architecture built on Kafka, covering the ' +
  'rationale behind the change, the phased rollout strategy used to avoid downtime, and the ' +
  'specific consumer-group rebalancing issues they hit along the way. It explains how the ' +
  'team introduced an outbox pattern to keep database writes and event publication consistent, ' +
  'why they chose to keep a thin compatibility shim around the old REST endpoints during the ' +
  'transition, and how they measured the impact on latency and failure isolation once the ' +
  'migration was complete. For anyone responsible for backend architecture or infrastructure, ' +
  'it offers a concrete, decision-by-decision account of trade-offs involved in moving a ' +
  'production system toward asynchronous, event-driven communication.';

const item: DigestEmailItem = {
  position: 1,
  title: 'Migrating to event-driven architecture with Kafka',
  sourceName: 'Engineering Blog',
  shortSummary: longSummary,
  whyItMatters: 'It matters because event-driven systems are increasingly common in production.',
  url: 'https://example.com/articles/kafka-migration',
  matchedInterests: ['distributed systems', 'architecture'],
};

describe('EmailTemplateService', () => {
  let service: EmailTemplateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailTemplateService],
    }).compile();

    service = module.get(EmailTemplateService);
  });

  describe('renderHtml', () => {
    it('includes the full long description without truncation', () => {
      const html = service.renderHtml('Subject', 'Intro text', [item]);

      expect(html).toContain(longSummary);
      expect(html).toContain(item.title);
      expect(html).toContain(item.sourceName);
      expect(html).toContain(item.url);
    });
  });

  describe('renderText', () => {
    it('includes the full long description without truncation', () => {
      const text = service.renderText('Subject', 'Intro text', [item]);

      expect(text).toContain(longSummary);
      expect(text).toContain(item.title);
      expect(text).toContain(item.sourceName);
      expect(text).toContain(item.url);
    });
  });

  describe('whyItMatters rendering', () => {
    const dailyItem: DigestEmailItem = { ...item, whyItMatters: undefined };
    const weeklyItem: DigestEmailItem = { ...item, whyItMatters: 'It matters a lot.' };

    it('omits the whyItMatters block in HTML when not present (daily digest)', () => {
      const html = service.renderHtml('Subject', 'Intro text', [dailyItem]);

      expect(html).not.toContain('It matters a lot.');
    });

    it('includes the whyItMatters block in HTML when present (weekly/deep-dive digest)', () => {
      const html = service.renderHtml('Subject', 'Intro text', [weeklyItem]);

      expect(html).toContain('It matters a lot.');
    });

    it('omits the whyItMatters line in plain text when not present (daily digest)', () => {
      const text = service.renderText('Subject', 'Intro text', [dailyItem]);

      expect(text).not.toContain('It matters a lot.');
    });

    it('includes the whyItMatters line in plain text when present (weekly/deep-dive digest)', () => {
      const text = service.renderText('Subject', 'Intro text', [weeklyItem]);

      expect(text).toContain('It matters a lot.');
    });
  });

  describe('footer statistics block', () => {
    const stats: DigestStats = {
      windowHours: 24,
      articlesIngested: 12,
      articlesPassedPreanalysis: 5,
      articlesAnalyzed: 4,
      totalArticlesInDb: 500,
      totalSourcesActive: 23,
      feedSourcesActive: 20,
      webSourcesActive: 3,
      sourceCandidatesPending: 7,
    };

    it('renders the feed/web/candidate counts in HTML alongside the existing pipeline stats block', () => {
      const html = service.renderHtml('Subject', 'Intro text', [item], stats);

      // Existing pipeline block (pre-MVP3-phase-5) must still be present, not replaced.
      expect(html).toContain('12');
      expect(html).toContain('passed pre-analysis');
      expect(html).toContain('500');

      // New footer block, sitting alongside it.
      expect(html).toContain('20');
      expect(html).toContain('feed active');
      expect(html).toContain('3');
      expect(html).toContain('web active');
      expect(html).toContain('7');
      expect(html).toContain('candidates pending');
    });

    it('renders the feed/web/candidate counts in the plain-text variant alongside the existing pipeline stats', () => {
      const text = service.renderText('Subject', 'Intro text', [item], stats);

      expect(text).toContain('DB: 500 total articles · 23 active sources');
      expect(text).toContain('Sources: 20 feed active · 3 web active · 7 candidates pending');
    });

    it('omits the footer block entirely when no stats are provided', () => {
      const html = service.renderHtml('Subject', 'Intro text', [item]);
      const text = service.renderText('Subject', 'Intro text', [item]);

      expect(html).not.toContain('candidates pending');
      expect(text).not.toContain('candidates pending');
    });
  });
});
