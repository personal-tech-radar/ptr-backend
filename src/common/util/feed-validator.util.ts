import RssParser from 'rss-parser';

const FEED_FETCH_TIMEOUT_MS = 15000;
const FEED_USER_AGENT = 'Mozilla/5.0 (compatible; PersonalTechRadar/1.0)';

export type FeedValidationFailureReason = 'unreachable' | 'http_error' | 'parse_error' | 'empty';

export interface FeedValidationSuccess {
  ok: true;
  feed: RssParser.Output<Record<string, unknown>>;
  rawText: string;
}

export interface FeedValidationFailure {
  ok: false;
  reason: FeedValidationFailureReason;
  message: string;
  httpStatus?: number;
  cause?: unknown;
}

export type FeedValidationResult = FeedValidationSuccess | FeedValidationFailure;

/**
 * Fetches a URL and validates it as an RSS/Atom feed with at least one item.
 * Shared by SourcesService.create (existing rss/atom/github_release source validation)
 * and SourceDiscoveryService (RSS/Atom discovery step) so both go through the same
 * fetch + parse implementation instead of duplicating it.
 */
export async function fetchAndValidateFeed(url: string): Promise<FeedValidationResult> {
  let responseText: string;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': FEED_USER_AGENT },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status !== 200) {
      return {
        ok: false,
        reason: 'http_error',
        message: `Feed URL returned HTTP ${response.status}`,
        httpStatus: response.status,
      };
    }

    responseText = await response.text();
  } catch (err) {
    return { ok: false, reason: 'unreachable', message: 'Feed URL is unreachable', cause: err };
  }

  const parser = new RssParser();
  let feed: RssParser.Output<Record<string, unknown>>;
  try {
    feed = await parser.parseString(responseText);
  } catch (err) {
    return {
      ok: false,
      reason: 'parse_error',
      message: 'Feed URL could not be parsed as RSS/Atom',
      cause: err,
    };
  }

  if (!feed.items || feed.items.length === 0) {
    return { ok: false, reason: 'empty', message: 'Feed URL contains no items' };
  }

  return { ok: true, feed, rawText: responseText };
}
