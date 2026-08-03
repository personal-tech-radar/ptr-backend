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
  trackingUrl: 'https://app.example.com/track/1',
  originalUrl: 'https://example.com/articles/kafka-migration',
  openUrl: 'https://app.example.com/track/1',
  usefulUrl: 'https://app.example.com/action/useful',
  notUsefulUrl: 'https://app.example.com/action/not-useful',
  saveUrl: 'https://app.example.com/action/save',
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
      expect(html).toContain(item.originalUrl);
    });
  });

  describe('renderText', () => {
    it('includes the full long description without truncation', () => {
      const text = service.renderText('Subject', 'Intro text', [item]);

      expect(text).toContain(longSummary);
      expect(text).toContain(item.title);
      expect(text).toContain(item.sourceName);
      expect(text).toContain(item.trackingUrl);
    });
  });

  describe('whyItMatters rendering', () => {
    const dailyItem: DigestEmailItem = { ...item, whyItMatters: undefined };
    const weeklyItem: DigestEmailItem = { ...item, whyItMatters: 'It matters a lot.' };

    it('omits the whyItMatters block in HTML when not present (daily digest)', () => {
      const html = service.renderHtml('Subject', 'Intro text', [dailyItem]);

      expect(html).not.toContain('It matters a lot.');
    });

    it('includes the whyItMatters block in HTML when present (weekly digest)', () => {
      const html = service.renderHtml('Subject', 'Intro text', [weeklyItem]);

      expect(html).toContain('It matters a lot.');
    });

    it('omits the whyItMatters line in plain text when not present (daily digest)', () => {
      const text = service.renderText('Subject', 'Intro text', [dailyItem]);

      expect(text).not.toContain('It matters a lot.');
    });

    it('includes the whyItMatters line in plain text when present (weekly digest)', () => {
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
      sourcesProcessed: 8,
      publicationsProcessed: 12,
      publicationsIncluded: 4,
      degradedSources: 2,
      disabledSources: 1,
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
      expect(text).toContain(
        'Sources: 20 feed active · 3 web active · 2 degraded · 1 disabled · 7 candidates pending',
      );
    });

    it('omits the footer block entirely when no stats are provided', () => {
      const html = service.renderHtml('Subject', 'Intro text', [item]);
      const text = service.renderText('Subject', 'Intro text', [item]);

      expect(html).not.toContain('candidates pending');
      expect(text).not.toContain('candidates pending');
    });
  });

  describe('saveUrl rendering (personal digests)', () => {
    const saveUrl = 'https://app.example.com/email-action/opaque-save-action-id';
    const itemWithSaveUrl: DigestEmailItem = { ...item, saveUrl };

    it('renders a "Save for later" link in HTML when saveUrl is present', () => {
      const html = service.renderHtml('Subject', 'Intro text', [itemWithSaveUrl]);

      expect(html).toContain(saveUrl);
      expect(html).toContain('Save');
    });

    it('omits the save link in HTML when saveUrl is not present', () => {
      const html = service.renderHtml('Subject', 'Intro text', [item]);

      expect(html).not.toContain('Save for later');
    });

    it('renders a "Save for later" line in plain text when saveUrl is present', () => {
      const text = service.renderText('Subject', 'Intro text', [itemWithSaveUrl]);

      expect(text).toContain(`Save: ${saveUrl}`);
    });
  });

  describe('digest stream page links', () => {
    const streamLinks = [
      { name: 'Security', url: 'https://app.example.com/digest-stream/security-page-id' },
      { name: 'Industry pulse', url: 'https://app.example.com/digest-stream/industry-page-id' },
    ];

    it('renders every temporary stream page in HTML', () => {
      const html = service.renderHtml('Subject', 'Intro text', [item], undefined, streamLinks);

      expect(html).toContain('Browse by stream');
      for (const stream of streamLinks) {
        expect(html).toContain(stream.name);
        expect(html).toContain(stream.url);
      }
    });

    it('renders every temporary stream page in plain text', () => {
      const text = service.renderText('Subject', 'Intro text', [item], undefined, streamLinks);

      expect(text).toContain('Browse by stream');
      for (const stream of streamLinks) {
        expect(text).toContain(`${stream.name}: ${stream.url}`);
      }
    });
  });

  describe('feedback buttons (dropped for personal digests)', () => {
    it('never renders feedback buttons — the markup was removed entirely (decision #4)', () => {
      const html = service.renderHtml('Subject', 'Intro text', [item]);

      expect(html).not.toContain('👍');
      expect(html).not.toContain('👎');
      expect(html).not.toContain('feedback/click');
    });
  });
});
