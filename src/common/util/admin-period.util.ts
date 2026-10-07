export type AdminPeriod = '24h' | '7d' | '30d';

export function adminPeriod(value: AdminPeriod, now = new Date()) {
  return {
    value,
    from: new Date(now.getTime() - { '24h': 1, '7d': 7, '30d': 30 }[value] * 86_400_000),
    to: now,
    dauFrom: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
    wauFrom: new Date(now.getTime() - 7 * 86_400_000),
    mauFrom: new Date(now.getTime() - 30 * 86_400_000),
    semantics:
      'UTC; from inclusive, to exclusive. DAU current UTC day; WAU/MAU rolling 7/30 days. Activity: first user/article opens, retained saves, latest explicit feedback. Removed saves and prior feedback/open events are unavailable.',
  };
}

// Shared retained-event definition for aggregates and drill-downs.
export const ADMIN_ACTIVITY_SQL = `
  SELECT o."userId", o."articleId", o."openedAt" AS at, 'open' AS type FROM user_article_openings o
  UNION ALL SELECT s."userId", s."articleId", s."createdAt", 'save' FROM saved_articles s
  UNION ALL SELECT f."userId", f."articleId", f."updatedAt", f.type::text FROM article_feedbacks f
  WHERE f.type IN ('useful', 'not_useful')`;
