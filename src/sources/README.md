# Source discovery and onboarding

`SourceCandidatesService` is the single onboarding coordinator. Authenticated URL submission,
new-technology discovery, and new-interest discovery all persist a `SourceCandidate` and enqueue
the same deterministic candidate job. They reuse URL identity, HTTP retry, RSS validation, sitemap,
Cheerio, content extraction, Playwright fallback, and AI structural fallback components.

## Entry points and applicability

- `POST /source-discovery/sources` accepts a URL from a signed-in user and reports accepted,
  existing active/degraded/disabled, already rejected, invalid, or terminal rejection outcomes.
- A genuinely new technology queues one discovery job for all five streams.
- A genuinely new interest queues one discovery job only for industry pulse, engineering
  experience, and expert opinions/practices. Releases and security are never interest coverage.

The proposal LLM returns up to three `{ name, url, expectedSourceType, streamKey,
relevanceReason }` candidates per applicable stream. It proposes only; the coordinator validates.
Selecting an existing taxonomy row creates no discovery job and consumes no quota.

## Candidate lifecycle

A candidate is `pending` while queued, then terminally `active` or `rejected`. Rejection stores a
specific code and reason. There is no manual-review or quality-threshold state. Validation requires
an accessible supported source, successful publication fetch/extraction, at least one sample that
matches the originating taxonomy and stream, and no distinct equivalent source. Existing equivalent
sources are reused and receive only the missing provenance relationship.

Identity precedence is repository coordinates, canonical/feed/redirect URLs, normalized URL, then
domain plus meaningful exact path. Domain alone never merges unrelated platform sections.
Relationships record source, originating taxonomy row, stream, origin, and timestamps; article
analysis never expands them.

Manifest synchronization and candidate promotion use the same transactional identity resolver.
It takes a PostgreSQL advisory transaction lock derived from the normalized canonical identity,
reloads any winner, and creates only when no equivalent exists. The database URL uniqueness
constraint remains the final invariant. A losing candidate attaches its coverage provenance to the
winner; provisional sampling sources and articles are deleted after promotion or terminal failure.

## Limits, retries, and idempotency

Ordinary users may select five technologies and five interests. A database-backed rolling 24-hour
quota atomically reserves at most ten combined new-taxonomy/source-submission discovery operations.
Known selections and known URLs do not reserve quota. PostgreSQL advisory transaction locking makes
concurrent reservation safe. BullMQ job IDs use taxonomy or candidate identity to prevent duplicate
concurrent work. One taxonomy discovery request row records the logical operation and moves through
`queued`, `running`, and `completed` or `failed`; BullMQ retries increment attempt metadata on that
same row. Administrator retry explicitly replaces retained completed/failed deterministic history,
prepares delayed executable work before committing the queued state, and compensates queue work if
the PostgreSQL transaction fails. Provider failures are converted to safe domain errors before
BullMQ persists failed history. Existing HTTP and queue retry policies are reused; no second retry
loop exists.

## Health and coverage

One exhausted ingestion job is one logical attempt. Failures 1–2 remain active, failure 3 becomes
degraded, and failure 6 becomes disabled. Success restores active with zero failures. Disabled
sources are never scheduled automatically and can be recovered through admin validation/activation.

Admin coverage is paginated and filterable by taxonomy kind/entity, stream, source status, active
count, and zero-active coverage. Results count active, degraded, and disabled sources. Interest
coverage excludes release and security streams by construction.
