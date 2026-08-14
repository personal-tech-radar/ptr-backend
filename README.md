# Personal Tech Radar Backend

NestJS backend for a multi-user technology radar. PostgreSQL stores users, the global taxonomy,
sources, globally analyzed articles, interactions, and digests. Redis provides BullMQ queues,
versioned feed caches, and exporter-neutral internal counters.

## Architecture

- `auth` and `users`: registration, verification, user JWT/refresh authentication, password
  recovery, onboarding, profiles, and soft deletion.
- `administrators`: separate administrator persistence, short-lived administrator JWTs, bootstrap,
  password rotation, logout revocation, and administrator management.
- `taxonomy`: one `TechnologyInterest` catalog with a `technology`/`interest` discriminator and
  exactly five system streams.
- `sources`: one discovery/onboarding coordinator, source identity resolution, candidates,
  coverage, health, and administration.
- `feed-fetcher` and `ai-analysis`: global ingestion, pre-analysis, and one-time full analysis.
  The Playwright queue is an isolated slow sub-step of this same logical pipeline.
- `scoring`, `feed`, and `public-feed`: deterministic personalization and versioned Redis caches.
- `scheduler`, `queue`, and `digest`: one five-minute orchestrator and separate ingestion,
  analysis, browser, discovery, and digest workers.
- `user-actions`: saved articles, first-open tracking, and permanent email actions.
- `common/metrics`: low-cardinality internal counters backed by Redis and structured logs. It is
  deliberately exporter-neutral; Prometheus is not part of MVP3.

Detailed operational designs:

- [Source discovery and onboarding](src/sources/README.md)
- [Scheduler and processing pipeline](src/scheduler/README.md)
- [Users and profiles](src/users/README.md)
- [Taxonomy](src/taxonomy/README.md)
- [Ingestion](src/feed-fetcher/README.md)
- [AI analysis](src/ai-analysis/README.md)
- [Personal feed](src/feed/README.md)
- [Digests](src/digest/README.md)
- [Redirects and tracking](src/redirects/README.md)
- [User article actions](src/user-actions/README.md)
- [Info pages](src/info-pages/README.md)
- [Production bootstrap migration](docs/production-bootstrap.md)

`APP_URL` is the externally reachable origin embedded in email, tracking, action, and digest-page
links. Local development commonly uses `http://localhost:3300`; staging and production must set
their reachable HTTPS origin. Localhost works only when the recipient can reach that environment.
`FRONT_APP_URL` is the frontend origin used for email verification and password-reset links. Set it
to the frontend's externally reachable origin (for example, `https://app.example.com`); it falls
back to `APP_URL` when omitted.

The unified scheduler runs every five minutes. Daily digests are due every calendar day at 09:00
in each user's timezone; weekly digests are due Friday at 14:00. Both verified email and completed
onboarding are required for normal scheduled delivery.

## Accounts and onboarding

Registration requires email, password, and display name. Onboarding requires an IANA browser
timezone, experience level (`junior`, `middle`, or
`senior`), selected streams, and at least one technology or interest; GitHub URL is optional.
Ordinary users are limited to five technologies and five interests. Administrator assignment may exceed
those limits. Users may log in and complete onboarding before verifying their email. Personal
feeds and scheduled digests require both verified email and completed onboarding. Before
onboarding, timezone is null; onboarding persists the browser-provided IANA timezone.

Users update display name, timezone, experience level, an optional HTTPS `github.com` profile URL,
and daily/weekly digest opt-ins through `PATCH /users/me`. Digest delivery times remain fixed and
are not editable. Re-submitting onboarding synchronizes (replaces) the user's taxonomy and stream
selections rather than accumulating deselected streams.
An identical onboarding payload is a no-op for persistence and feed-cache versioning; effective
taxonomy and stream selections are compared as sets. Personal feed `beforeDate`, `dateFrom`, and
`dateTo` accept only real calendar dates in exact `YYYY-MM-DD` form; explicit ranges are inclusive,
interpreted in the user's timezone, and limited by `FEED_MAX_DAYS`. Oversized JSON responses use HTTP 413 with
`PAYLOAD_TOO_LARGE`, while an exhausted discovery quota uses HTTP 429 with
`DISCOVERY_LIMIT_REACHED`.

The local Docker verification stack exposes its in-memory mail-capture API at
`http://localhost:3400/api/messages`. Filter by recipient with `?to=user@example.com`. It retains
the Resend-compatible text and HTML payloads for live verification and password-reset tests;
production mail delivery is unchanged, and message bodies are never written to application logs.

The fixed streams are `releases_and_changes`, `security`, `industry_pulse`,
`engineering_experience`, and `expert_opinions_and_practices`.

## Global analysis and personalization

Every publication is stored globally. Pre-analysis accepts an article only when it matches at
least one supported stream and at least one catalog technology or interest. A rejected pre-analysis
is retained with `skipped` status. Full LLM analysis runs globally at most once and stores quality,
taxonomy, streams, primary stream, normalized difficulty (`beginner`, `intermediate`, `advanced`),
short and long summaries, and release/security metadata. `shortSummary` is used in feeds and
digests; `longSummary` is a grounded three-paragraph article-page explanation. Existing analyses
were backfilled from their short summaries by migration. Historical `architect` difficulty values
migrate to `advanced`.

For enrichment, the model receives the current taxonomy catalog and article content where available.
Signals resolve to existing canonical technology/interest entries or aliases, with bounded similarity
used only to match near spellings. No new taxonomy entry is silently created by article analysis.
Valid publication dates are preserved; malformed or missing dates remain null and old or undated web
articles are retained for audit but are not queued for analysis.

Personal feed and digest ranking use one deterministic formula:

```text
score = 0.25 × quality
      + 0.25 × technologyMatch
      + 0.20 × interestMatch
      + 0.20 × difficultyMatch
      + 0.10 × freshness
      + personalSourceAdjustment
```

Taxonomy match scores are 0 for no match, 60 for one, 80 for two, and 100 for three or more;
an untagged dimension is neutral at 50. Difficulty uses this matrix:

| User level | beginner | intermediate | advanced |
| ---------- | -------: | -----------: | -------: |
| junior     |      100 |           70 |       30 |
| middle     |       60 |          100 |       70 |
| senior     |       20 |           50 |      100 |

Freshness retains the existing buckets: 100 through 12 hours, 60 through 24 hours, then 20.
Stream selection is an eligibility rule, not a score bonus.

Interactions affect ranking only through their source. Signal weights are useful `+4`, not useful
`-4`, saved `+2`, and opened `+1`. With a neutral prior of 6, the personal source adjustment is:

```text
clamp(-8, 8, weightedSignals / (absoluteWeightedSignals + 6) × 12)
```

There is no direct article-feedback term, inferred taxonomy preference, time decay, or mandatory
user-by-article relevance table. Global source aggregates use the same relative weights for admin
operations; they never disable a source or reorder the public feed.

## Feeds and caches

`GET /feed` is authenticated, localized into calendar-day groups, and supports stream, technology,
interest, source, date, and saved filters. `GET /public/feed` requires the public-content API key
and remains ordered strictly by publication date. `POST /public/feed/preview` is anonymous and
scores a pre-registration selection without creating a user.

Information pages are managed through `/admin/info-pages` and exposed publicly through API-key-only
`GET /info-pages` routes. Their `fullText` is a text column containing an editor-neutral JSON
document string; the migration seeds editable examples for Legal Notice, Privacy Policy, and
Cookies Policy.

`GET /public/feed/statistics` exposes API-key-only rolling pipeline statistics for the last 24
hours: active sources, collected articles, and fully analyzed articles. `POST /public/feed/preview`
returns the same `meta` statistics plus `selectedForRadar`, calculated for the submitted preview
profile.

Pre-registration clients can load the read-only API-key catalogs from `GET /public/technology-interests`
and `GET /public/content-streams`. User selection and create-or-reuse behavior remains available
only through authenticated onboarding/profile endpoints.

Analyzed articles with a genuinely absent or malformed publication date remain public-eligible for
backward compatibility, but dated articles always sort first. Undated rows use `createdAt DESC`,
then article ID descending, so pagination and cached/uncached ordering remain deterministic.

## Access boundaries and public content

The API has four non-interchangeable access mechanisms:

| Access                        | Endpoints                                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| No credentials                | health, registration/verification/login/refresh/logout/password recovery, public preview, opaque redirects, email actions, digest stream pages |
| `X-API-KEY` only              | `GET /articles`, `GET /articles/:id`, `GET /public/feed`                                                                                       |
| User bearer JWT only          | profile/onboarding, taxonomy selection, personal feed, saved articles, feedback, source submission                                             |
| Administrator bearer JWT only | every `/admin/**` route                                                                                                                        |

Public article DTOs contain renderable analysis metadata, source, taxonomy, streams, original and
public-redirect URLs, and separate public-click/personal-open counters. They omit processing,
queue, debug, private scoring, saved, feedback, and identity state. The public feed uses the same
analyzed/stream/quality eligibility and strict publication-date ordering.

Administrator analysis retry uses the article's bounded deterministic BullMQ identity. Retained
completed or failed history is explicitly replaced; an executable retry is prepared before the
article's pending state commits, and a failed PostgreSQL transaction compensates newly prepared
queue work. PostgreSQL and Redis are coordinated recoverably rather than described as one ACID
transaction.

Taxonomy source-discovery retry follows the same recoverable coordination model. A unique request
row per taxonomy records lifecycle, attempt count, retry count, timestamps, and a sanitized terminal
error; provider credentials are never retained in BullMQ failure history.

Personal links use permanent `GET /r/:uuid` redirects. The first user/article opening increments
the personal counter and opened
source signal once. `GET /go/articles/:articleId` increments the public click counter on every
request without creating user interaction data. Counter increments do not invalidate feed caches.

Redis maintains a version for each stream and a version for each user's feed-affecting profile.
Per-stream keys depend on their stream version; combined keys depend on every selected stream
version. Successful ingestion increments only completed stream versions. Profile selection,
timezone-independent feed preferences, or experience-level changes increment the user version.
Old keys expire by TTL without enumerating all users.

## Digests

Daily digests are due every day at 09:00 local time. Weekly digests are due Friday at 14:00 local
time. Times are fixed. The scheduler evaluates users every five minutes with IANA-timezone/DST-safe
local periods.

Daily periods begin at the previous successful daily delivery and are capped at 24 hours. Weekly
periods begin at the previous successful weekly delivery and are capped at seven days. First
digests use those same maximum windows. A unique `(user, type, localPeriod)` identity makes
generation idempotent. Delivery retries resend the stored digest and permanent action UUIDs.

Daily selection allows two articles per selected primary stream; weekly allows three. Streams with
no result are omitted, an article appears once per digest, and opened/saved or previously delivered
articles remain eligible. Empty results persist as `skipped_empty` and are not emailed.

Both email types render one description paragraph, tracked title/publication/Open links, and
permanent JWT-free Save, Useful, and Not useful actions. Temporary UUID digest-stream pages expose
only selected articles and actions, never profile data. Digest statistics are immutable generation
snapshots.

Generated emails include a “Browse by stream” section linking to those temporary pages. The same
permanent page URLs are returned as `streamPages` by administrator digest list and detail
responses, allowing manual preview and troubleshooting without database access.

Interactive saved-article management is separate and requires a normal-user JWT:
`POST /saved-articles/:articleId`, `DELETE /saved-articles/:articleId`, and
`GET /saved-articles`. Digest emails use `GET /email-action/:id` with a permanent opaque UUID;
there is no user ID or reusable authentication secret in the URL.

## Source health and administration

Sources are `active`, `degraded`, or `disabled`. Three consecutive failed logical ingestion jobs
degrade an active source; three more disable it. Internal HTTP retries count as one logical attempt.
Success resets failures and restores active status. Disabled sources require admin recovery.

Administrators are not users. They authenticate through `/admin/auth/*` with a separate audience,
subject type, token version, strategy, and guard. All dashboard routes live under `/admin/**` and
provide paginated operations for users, articles, taxonomy, sources, candidates, coverage,
digests, interactions, and safe queue actions. API keys and user JWTs cannot authorize them.
Administrator digest triggers create stored preview deliveries using a target user's profile but
send only to the triggering administrator; preview delivery and resend never change the target
user's scheduled digest period.
Users never receive a global source-list endpoint. Users, sources, and articles are soft-deleted;
reference catalogs and business history are retained.

## Configuration

Copy `.env.example` to `.env`. Important values include PostgreSQL/Redis connectivity,
`OPENAI_API_KEY`, `RESEND_API_KEY`, JWT secrets, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and:

```dotenv
TECHNICAL_HISTORY_RETENTION_DAYS=30
```

The admin bootstrap and legacy-user migration are idempotent. Runtime user configuration comes
only from the database; the legacy manifest is a one-time migration input.

## Development

```bash
npm ci
npm run migration:run
npm run seed:sources:sync
npm run seed:legacy-user:sync
npm run start:dev
```

Verification:

```bash
npm test -- --runInBand
npm run test:e2e
npm run lint
npx tsc --noEmit
npm run build
```

Production startup after building:

```bash
npm run migration:run:prod
npm run start:prod
```

The migration is self-contained: it retags historical `default_user` interaction rows and bootstraps
the legacy user/catalog without Redis, queues, AI, or external requests. Run the source-sync command
only for a later manifest update; run the legacy-user sync only as an explicit repair for an older
database that predates this migration behavior.
