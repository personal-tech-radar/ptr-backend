// Pure recency scoring, shared by DigestBuilderService's digest ranking and
// RelevanceScoringService's personal relevance scoring. Bucketed: fresh -> 100, recent -> 80,
// older or unknown publish date -> 50.
export function getRecencyScore(
  publishedAt: Date | null,
  freshHours: number,
  recentHours: number,
): number {
  if (!publishedAt) return 50;
  const ageHours = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
  if (ageHours <= freshHours) return 100;
  if (ageHours <= recentHours) return 80;
  return 50;
}
