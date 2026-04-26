import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import RssParser = require('rss-parser');
import { LoggingService } from '../../common/logging/logging.service';
import { ArticleStatus } from '../../articles/entities/article.entity';
import { ArticlesService } from '../../articles/services/articles.service';
import { SourcesService } from '../../sources/services/sources.service';
import { QueueService } from '../../queue/queue.service';

type FeedItem = RssParser.Item & {
  'content:encoded'?: string;
  summary?: string;
};

@Injectable()
export class FeedFetcherService {
  private readonly logger = new LoggingService(FeedFetcherService.name);
  private readonly parser = new RssParser({
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; PersonalTechRadar/1.0; +https://personalradar.dev)',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*',
    },
    requestOptions: {
      rejectUnauthorized: false,
    },
    customFields: {
      item: [['content:encoded', 'content:encoded']],
    },
  });

  constructor(
    private readonly sourcesService: SourcesService,
    private readonly articlesService: ArticlesService,
    private readonly queueService: QueueService,
  ) {}

  async fetchAllSources(): Promise<void> {
    const sources = await this.sourcesService.findAllEnabled();
    this.logger.info(`Fetching ${sources.length} enabled sources`);
    await Promise.allSettled(sources.map((s) => this.fetchSource(s.id)));
  }

  async fetchSource(sourceId: string): Promise<void> {
    const source = await this.sourcesService.findOne(sourceId);
    this.logger.info(`Fetching source: ${source.name}`, { url: source.url });

    try {
      const feed = await this.parser.parseURL(source.url);
      let newCount = 0;

      for (const item of feed.items ?? []) {
        try {
          const created = await this.processItem(source.id, item as FeedItem);
          if (created) newCount++;
        } catch (err) {
          this.logger.error(
            `Failed to process item from ${source.name}`,
            err,
            { title: (item as FeedItem).title },
          );
        }
      }

      await this.sourcesService.updateLastChecked(sourceId);
      this.logger.info(`Finished fetching ${source.name}`, { newCount });
    } catch (err) {
      this.logger.error(`Failed to fetch source ${source.name}`, err);
    }
  }

  private async processItem(
    sourceId: string,
    item: FeedItem,
  ): Promise<boolean> {
    const url = item.link ?? item.guid ?? '';
    if (!url || !item.title) return false;

    const urlHash = createHash('sha256').update(url).digest('hex');
    const titleHash = createHash('sha256')
      .update(item.title.trim())
      .digest('hex');

    const existing = await this.articlesService.findByUrlHash(urlHash);
    if (existing) return false;

    const titleDuplicate = await this.articlesService.findByTitleHashInLastDays(
      titleHash,
      7,
    );

    const publishedAt = item.isoDate
      ? new Date(item.isoDate)
      : item.pubDate
        ? new Date(item.pubDate)
        : null;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const isTooOld = !publishedAt || publishedAt < sevenDaysAgo;

    if (isTooOld) {
      await this.articlesService.create({
        sourceId,
        title: item.title.trim(),
        url,
        urlHash,
        titleHash,
        author: (item as any).creator ?? (item as any).author ?? null,
        publishedAt,
        summaryFromFeed:
          (item as any).summary ??
          item.contentSnippet ??
          null,
        rawContent:
          (item as any)['content:encoded'] ?? item.content ?? null,
        status: ArticleStatus.SKIPPED,
      });
      return true;
    }

    const summaryFromFeed =
      (item as any).summary ??
      item.contentSnippet ??
      null;

    const rawContent =
      (item as any)['content:encoded'] ?? item.content ?? null;

    const status = titleDuplicate
      ? ArticleStatus.DUPLICATE
      : ArticleStatus.NEW;

    const article = await this.articlesService.create({
      sourceId,
      title: item.title.trim(),
      url,
      urlHash,
      titleHash,
      author: (item as any).creator ?? (item as any).author ?? null,
      publishedAt,
      summaryFromFeed,
      rawContent,
      status,
    });

    if (status === ArticleStatus.NEW) {
      await this.articlesService.updateStatus(
        article.id,
        ArticleStatus.PENDING_ANALYSIS,
      );
      await this.queueService.addAnalyzeArticleJob(article.id);
    }

    return true;
  }
}
