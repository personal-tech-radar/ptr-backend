# Ingestion

## Purpose and architecture

Ingestion fetches each global source once, persists publications idempotently, and queues analysis.
`FeedFetcherService` coordinates RSS/Atom and web fetchers; source health transitions are recorded by
the sources service.

## Queues and data flow

The primary feed-fetch queue receives one source/time-bucket job with all due streams. Web extraction
may delegate hang-prone rendering to the isolated browser queue, then rejoins the same pipeline.
Articles are upserted by URL hash and sent to the separate analysis queue.

## Invariants and extension

Only one ingestion job runs per source, internal HTTP retries count as one logical attempt, and a
successful attempt resets source health. Add protocols to the existing coordinator rather than
creating a parallel ingestion path.
