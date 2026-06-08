# Personal Tech Radar — Backend

A NestJS service that automatically curates a daily engineering digest. It fetches articles from RSS/Atom feeds and GitHub release pages, runs a two-stage AI analysis pipeline optimised for token usage, and delivers a clean email digest via Resend.

![C4 Context Diagram](./diagram/context/c4-context.png)

**How it works:**

1. A cron job fires every hour and dispatches a `fetch-all-sources` BullMQ job.
2. The feed fetcher downloads each enabled source, parses RSS/Atom/GitHub releases, and saves all new articles to PostgreSQL. Duplicates are detected by URL hash; near-duplicates by title hash within 7 days. Articles older than 78 hours are stored but not queued for analysis.
3. Each fresh article (≤ 78 h old, not a duplicate) triggers an `analyze-article` job. Analysis runs in two stages:
   - **Pre-analysis** — a lightweight OpenAI call using only the article title and feed description. Returns `isPotentiallyRelevant` + a one-sentence reason. The result is saved as an `ArticleRelevance` record (per user). This stage acts as a cheap relevance gate and avoids spending tokens on full analysis for clearly irrelevant content.
   - **Full analysis** — runs only when `preAnalysisIsRelevant = true`. Calls OpenAI with the full article context, produces `relevanceScore`, `qualityScore`, scoring flags, and a digest summary. Stored in `ArticleAnalysis` (shared across users). The `ArticleRelevance` record is updated with a `fullAnalysisId` link. Full analysis is reused if it already exists for the article.
4. A second cron job fires daily (default 07:00 UTC) and dispatches `build-daily-digest`. The digest builder selects only articles with a relevant `ArticleRelevance` record (`preAnalysisIsRelevant = true`) and attempts to find at least `DAILY_DIGEST_ARTICLES_LIMIT` (default 3) using a time-window fallback: 24 h → 48 h → 72 h. Articles already included in any previously built or sent digest are excluded. Ranking: relevance × 0.45 + quality × 0.30 + source trust × 0.15 + recency × 0.10. Source/category diversification is applied and up to `DAILY_DIGEST_ARTICLES_LIMIT` items are selected. Build metadata is stored in `buildDebug`.
5. The digest is saved as a draft, then the email is rendered and sent through Resend. The digest status is updated to `sent`.
6. At any time, `POST /digests/daily/resend-latest` re-sends the most recently built digest without rebuilding it.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 11 (Express) |
| Language | TypeScript 5.7 |
| Database | PostgreSQL + TypeORM 0.3 |
| Cache / Queues | Redis + BullMQ |
| AI Analysis | OpenAI API |
| Email | Resend SDK |
| Feed Parsing | rss-parser |
| Scheduler | @nestjs/schedule |
| Validation | class-validator + class-transformer |
| Documentation | Swagger / OpenAPI (`/docs`) |
| Auth | API key guard (`X-API-KEY` header) |

---

## Project Structure

```
src/
├── common/
│   ├── database/          # TypeORM module + DataSource for migrations
│   ├── redis/             # Global RedisService
│   ├── s3/                # Global S3StorageService
│   ├── http/              # HttpService — fetch wrapper with retry/backoff
│   ├── error/             # Global exception filter + ErrorResponseDto
│   ├── logging/           # LoggingService (thin NestJS Logger wrapper)
│   ├── guards/            # ApiKeyGuard
│   └── dto/               # PaginatedResponseDto
├── config/
│   └── user-interests.yaml  # AI analysis interest profile
├── sources/               # Source CRUD — RSS/Atom/GitHub feeds
├── articles/              # Article storage and querying
├── feed-fetcher/          # Fetches and parses feeds, creates articles
├── ai-analysis/           # OpenAI article analysis, ArticleAnalysis entity
├── digest/                # Digest building, scoring, email body generation
├── mail/                  # Resend email delivery
├── queue/                 # BullMQ setup and QueueService
├── scheduler/             # Cron jobs: fetch hourly, digest daily
├── health/                # GET /health
├── seeds/                 # Seed script for initial sources
└── migrations/            # TypeORM migration files
```

---

## Domain Modules

### SourcesModule
Manages feed sources. Admin CRUD endpoints protected by `X-API-KEY`. When a source is created (via `POST /sources` or the seed script), the URL is validated: the feed must return HTTP 200, parse as valid RSS/Atom, and contain at least one item. Sources that fail validation are rejected without being saved.

- `GET /sources` — list all active sources
- `POST /sources` — add a source (validates feed URL before saving)
- `PATCH /sources/:id` — update a source
- `DELETE /sources/:id` — soft-delete (sets `deletedAt`)

Source categories: `backend_architecture_infra`, `engineering_deep_dives`, `node_typescript_nestjs`, `ai_engineering`

### ArticlesModule
Stores articles fetched from sources.

- `GET /articles` — paginated list (filter by `status`, `sourceId`)
- `GET /articles/:id` — single article

Statuses: `new` → `pending_analysis` → `analyzed` | `duplicate` | `rejected` | `failed`

Articles are always stored on ingest. The 78 h analysis gate operates at queue time (in `FeedFetcherService`), not at storage time — old articles remain in the database with status `new`.

### FeedFetcherModule
Fetches RSS/Atom/GitHub release feeds using `rss-parser`. Deduplicates by `urlHash` (SHA-256 of URL). Articles with a matching `titleHash` from the last 7 days are saved as `duplicate`. New articles are dispatched to the `article-analysis` queue automatically.

### AiAnalysisModule
Two-stage pipeline to minimise token usage and prepare for multi-user relevance.

**Stage 1 — Pre-analysis** (`ArticleRelevance` table, per user):
- Input: article title + feed description only (no full content, no URL)
- Output: `isPotentiallyRelevant` (boolean) + `shortReason` (one sentence)
- Prompt: `config/ai-analysis/instructions/pre-analyze-article.txt`
- If `false`: article marked `ANALYZED`, pipeline stops for this user

**Stage 2 — Full analysis** (`ArticleAnalysis` table, shared across users):
- Runs only when `preAnalysisIsRelevant = true`
- Input: title, URL, author, feed summary
- Output: `relevanceScore`, `qualityScore`, `shouldIncludeInDailyDigest`, `shortSummary`, tags, etc.
- Prompt: `config/ai-analysis/instructions/analyze-article.txt`
- If `ArticleAnalysis` already exists for this article, it is reused (not recomputed)
- `ArticleRelevance.fullAnalysisId` is set after full analysis completes

User interests are loaded from `config/user-interests.yaml`. The default user ID is `default_user`; the schema supports multiple users via the `(articleId, userId)` unique constraint on `article_relevances`.

### DigestModule
Selects the best `DAILY_DIGEST_ARTICLES_LIMIT` articles (default 3) using a time-window fallback (24 h → 48 h → 72 h). Articles already present in any digest with status `draft` or `sent` are excluded. Ranking formula:

```
finalScore = relevanceScore × 0.45 + qualityScore × 0.30 + trustScore × 0.15 + recencyScore × 0.10
```

Recency: 100 (≤12h), 80 (≤24h), 50 (older). Diversification: max 2 articles per source, preferably max 2 per category.

Each built digest stores a `buildDebug` JSONB column with:
- `requestedItemCount` — minimum items required
- `fallbackUsed` — whether a wider window was needed
- `attempts[]` — per-window stats: `windowHours`, `candidatesFound`, `eligibleFound`
- `finalWindowHours` — the window that was ultimately used
- `finalSelectedCount` — actual items in the digest

- `POST /digests/daily/resend-latest` — resend latest built/sent digest via Resend

### MailModule
Sends digest emails via Resend SDK. Uses `DIGEST_FROM_EMAIL` and `DIGEST_TO_EMAIL` env vars.

### QueueModule
Three BullMQ queues backed by Redis:
- `feed-fetch` — `fetch-all-sources`, `fetch-source`
- `article-analysis` — `analyze-article`
- `digest` — `build-daily-digest`, `send-daily-digest`

### SchedulerModule
Cron jobs registered dynamically from env vars:
- `FETCH_CRON` (default `0 * * * *`) — dispatch `fetch-all-sources` every hour
- `DIGEST_CRON` (default `0 7 * * *`) — dispatch `build-daily-digest` daily at 07:00 UTC

---

## Getting Started

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your DB, Redis, OpenAI, and Resend credentials
```

### 3. Generate and run database migrations

Migrations are generated by the TypeORM CLI — never hand-written. With a running PostgreSQL, generate one migration per domain:

```bash
npm run migration:generate -- src/migrations/CreateSources
npm run migration:generate -- src/migrations/CreateArticles
npm run migration:generate -- src/migrations/CreateArticleAnalyses
npm run migration:generate -- src/migrations/CreateDigests
npm run migration:generate -- src/migrations/CreateDigestItems
```

Then apply:
```bash
npm run migration:run
```

### 4. Seed initial sources
```bash
npm run seed:sources
```

### 5. Start in development mode
```bash
npm run start:dev
```

Swagger UI: `http://localhost:3000/docs`
Health check: `http://localhost:3000/health`

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `APP_NAME` | Application name | `ptr-backend` |
| `PORT` | HTTP port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USER` | PostgreSQL user | `postgres` |
| `DB_PASSWORD` | PostgreSQL password | — |
| `DB_NAME` | PostgreSQL database | `ptr` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis password | — |
| `API_KEY` | Admin API key for `X-API-KEY` header | — |
| `OPENAI_API_KEY` | OpenAI API key | — |
| `OPENAI_MODEL` | OpenAI model | `gpt-4o-mini` |
| `RESEND_API_KEY` | Resend API key | — |
| `DIGEST_FROM_EMAIL` | Sender email (verified in Resend) | — |
| `DIGEST_TO_EMAIL` | Digest recipient email | — |
| `DAILY_DIGEST_ARTICLES_LIMIT` | Number of articles included in the daily digest | `3` |
| `FETCH_CRON` | Cron for feed fetching | `0 * * * *` |
| `DIGEST_CRON` | Cron for daily digest | `0 7 * * *` |
| `CORS_ORIGINS` | Allowed origins (production) | — |
| `SWAGGER_SERVER_URL` | Swagger server URL (production) | — |

---

## Database Migrations

Migrations are generated by the TypeORM CLI by diffing entity definitions against the live database schema. Never hand-write migration files.

```bash
npm run migration:generate -- src/migrations/DescriptiveName   # Generate from entity diff
npm run migration:run                                           # Apply pending migrations
npm run migration:revert                                        # Revert last migration
npm run migration:show                                          # List migration status
```

Name migrations descriptively per domain: `CreateSources`, `CreateArticles`, `AddPublishedAtIndex`, etc.

Production: `npm run migration:run:prod` (requires `npm run build` first)

---

## Seeding Sources

```bash
npm run seed:sources
```

Seeds 18 pre-configured sources across 4 categories from `seeds/sources.seed.json`. Skips sources that already exist (by URL).

---

## Testing

```bash
npm run test          # Unit tests
npm run test:cov      # Coverage report
```

Unit tests cover `DigestBuilderService` scoring and diversification logic.

---

## Deployment

### GitHub Actions (manual trigger)

The workflow in `.github/workflows/deploy-prod.yml`:
1. Runs tests
2. Builds Docker image and pushes to Docker Hub with tags `prod` and `sha-<commit>`
3. Triggers Dokploy migration webhook
4. Waits 10 seconds
5. Triggers Dokploy backend deployment webhook

### Required GitHub Secrets

| Secret | Description |
|---|---|
| `DOCKERHUB_USERNAME` | Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub access token |
| `IMAGE_NAME` | Full image name (e.g. `username/ptr-backend`) |
| `DOKPLOY_BACKEND_MIGRATE_WEBHOOK_URL` | Dokploy webhook to run migrations |
| `DOKPLOY_BACKEND_WEBHOOK_URL` | Dokploy webhook to deploy backend |

### Production migration command (Dokploy)

Configure Dokploy's migration service to run:
```bash
node dist/main && npm run migration:run:prod
```
Or as a separate one-off container using the same image.
