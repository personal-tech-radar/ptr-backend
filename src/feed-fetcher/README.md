# Ingestion

## Purpose and architecture

Ingestion fetches each global source once, persists publications idempotently, and queues analysis.
`FeedFetcherService` coordinates RSS/Atom and web fetchers; source health transitions are recorded by
the sources service.

## Queues and data flow

The primary feed-fetch queue receives one source/time-bucket job with all due streams. Web extraction
may delegate hang-prone rendering to the isolated browser queue, then rejoins the same pipeline.
Articles are upserted by URL hash and sent to the separate analysis queue. RSS/Atom dates and
structured web dates are preserved; malformed or absent dates remain null instead of being replaced
with ingestion time. Undated or stale web publications are retained but are not queued for analysis.

## Invariants and extension

Only one ingestion job runs per source, internal HTTP retries count as one logical attempt, and a
successful attempt resets source health. Add protocols to the existing coordinator rather than
creating a parallel ingestion path.
