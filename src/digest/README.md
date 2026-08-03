# Digests

## Purpose and architecture

Digests reuse feed eligibility and deterministic scoring. `DigestSweepService` finds due users,
`DigestBootstrapService` and the personal builder persist immutable content/actions/statistics, and
`DigestProcessor` delivers stored content through `MailService`.

## Schedule and queue flow

Daily delivery is every calendar day at 09:00 local with two articles per stream; weekly is Friday
at 14:00 with three. The five-minute scheduler enqueues deterministic BullMQ work. Delivery retries
reuse the same digest and permanent action identifiers.

## Invariants and extension

Email verification, completed onboarding, and the matching opt-in are mandatory. Empty results are
stored as `skipped_empty` and not sent; one article appears once under its primary stream. `APP_URL`
must be reachable by recipients. Extend rendering without changing stored selection identity.
