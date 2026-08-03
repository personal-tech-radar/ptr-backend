# Queue

## Purpose

`QueueService` is the single BullMQ boundary for job creation and operational actions. Processors
remain in their owning domains; this module owns queue names, deterministic IDs, retry coordination,
and concurrency settings.

## Queues

- `feed-fetch`: source ingestion and technical-history cleanup.
- `article-analysis`: global pre-analysis and full analysis.
- `digest`: sweeps, generation, delivery, and resend.
- `web-source-browser-fetch`: isolated Playwright work.
- `taxonomy-source-discovery`: AI proposals and candidate processing.

Browser and taxonomy queues are isolated worker pools, not alternate domain pipelines.

## Idempotency and retries

Source and sweep jobs use time buckets. Article analysis and taxonomy discovery use bounded entity
IDs. Retry preparation removes terminal retained jobs, refuses active duplicates, and creates delayed
work before the database status is promoted. PostgreSQL and Redis are coordinated but are not one ACID
transaction.

Digest payloads retain the logical period while sanitizing it for BullMQ job-ID rules. Terminal
retained jobs are removed before a new job for the same period is added.

## Operations

`AdminJobsController` exposes failed-job inspection and safe cancellation of pending work. Arbitrary
queue-history deletion is unavailable. Processors must keep business transitions idempotent because a
worker may retry after partial external delivery.
