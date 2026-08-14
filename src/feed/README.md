# Personal feed

## Purpose and architecture

The personal feed scores globally analyzed articles against the authenticated user's profile and
groups them by local calendar date. `FeedQueryService` owns selection; the shared relevance-scoring
service is also used by digests.

## Data flow and cache

Selected streams are eligibility gates. Technology, interest, difficulty, quality, freshness, and
the bounded personal source adjustment form the deterministic score documented in the main README.
Redis keys combine the user's profile version with relevant per-stream versions; TTL removes
unreachable entries after invalidation.

## Invariants and extension

No per-user LLM call or mandatory user/article relevance row is allowed. Results never cross user
cache identities, and returned external links use permanent tracking redirects. Add filters in the
query DTO, database candidate query, and cache-key normalization together.

`GET /feed/statistics` returns the rolling last-24-hour pipeline counters plus
`selectedForRadar` calculated from the authenticated user's personalized feed. It accepts the
same feed filters and requires a verified email and completed onboarding.
