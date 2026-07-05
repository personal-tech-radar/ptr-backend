const TRACKING_PARAM_PATTERNS = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^msclkid$/i,
  /^mc_[ce]id$/i,
  /^igshid$/i,
  /^ref_?src$/i,
  /^ref$/i,
  /^spm$/i,
];

function isTrackingParam(key: string): boolean {
  return TRACKING_PARAM_PATTERNS.some((pattern) => pattern.test(key));
}

function stripTrailingSlash(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.replace(/\/+$/, '') || '/';
  }
  return pathname;
}

/**
 * Normalizes an article URL for dedup/comparison purposes:
 * prefers `canonicalUrl` when present, strips tracking params and fragments,
 * lowercases the hostname, and drops a trailing slash.
 * Returns the original (untrimmed) `rawUrl` unchanged if it cannot be parsed as a URL.
 */
export function normalizeUrl(rawUrl: string, canonicalUrl?: string | null): string {
  const source = canonicalUrl?.trim() || rawUrl;

  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return rawUrl;
  }

  url.hostname = url.hostname.toLowerCase();
  url.hash = '';

  const params = new URLSearchParams(url.search);
  for (const key of Array.from(params.keys())) {
    if (isTrackingParam(key)) {
      params.delete(key);
    }
  }
  params.sort();
  const query = params.toString();
  url.search = query ? `?${query}` : '';

  url.pathname = stripTrailingSlash(url.pathname);

  return url.toString();
}
