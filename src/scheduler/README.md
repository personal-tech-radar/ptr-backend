# Scheduler and processing pipeline

## Responsibility

`SchedulerService` is the only cron orchestrator. Every five minutes it schedules due ingestion,
digest sweeps, and technical-history cleanup. Heavy work runs in BullMQ processors.

## Ingestion

Intervals belong to streams: security 1 hour, industry pulse 2 hours, releases 3 hours, and
engineering experience plus expert opinions 12 hours. A multi-stream source produces one job using
the shortest interval and all due streams. Priorities are security, releases, industry pulse, then
the two long-form streams.

The primary ingestion queue uses deterministic source/time-bucket IDs, persisted attempts, and
idempotent article upserts. The browser queue is only an isolated Playwright sub-step. Analysis and
digest queues remain separate. Pre-analysis checks stream and taxonomy relevance; skipped articles
remain stored, while relevant articles continue to one global full-analysis row.

## Digests and timezones

The digest sweep evaluates 09:00 daily and Friday 14:00 weekly in each user's IANA timezone within
the five-minute window. Daily eligibility includes Saturday and Sunday. Local period keys and a
unique digest identity prevent duplicate generation across overlapping sweeps and restarts. Delivery
retries reuse the stored body and action identifiers.

Message links use the externally reachable `APP_URL` configured for the environment.

## Cache and retention

Each stream has a Redis version counter. Successful ingestion increments only completed streams;
public and personal per-stream keys include that version, and combined personal keys include all
selected versions plus the user profile version. Old entries expire by TTL.

BullMQ handles completed/failed job retention. Scheduled cleanup removes technical records older than
`TECHNICAL_HISTORY_RETENTION_DAYS`; articles, sources, final candidate outcomes, digests, openings,
saves, feedback, aggregates, health, and coverage remain business history.

## Extension points

Change source cadence in `ingestion-schedule.service.ts`, digest eligibility in the digest sweep
service, and retention policy in the cleanup service. Keep this five-minute orchestrator as the only
time-based coordinator.
