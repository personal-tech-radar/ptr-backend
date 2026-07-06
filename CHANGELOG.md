# Changelog

All significant changes to this project are recorded here.
Each entry is tagged with the branch it was made on.

---

## [dev/mvp-3] — 2026-07-06 — Phase 5: Seed Manifest v2 + Sync Command + Footer Statistics

### Added
- `config/sources.manifest.json` — versioned (v2) seed manifest replacing the old bare-array seed file; all 24 existing sources migrated into the new shape (`seedKey`, `seedUrl`, `discovery.mode`, etc.)
- `src/seeds/sync-sources.ts` / `npm run seed:sources:sync` (`--force` flag), backed by a new `SourceSyncService`: matches existing sources by normalized URL, always syncs declarative fields (name/category/discovery config), and only syncs operational fields (enabled/trustScore) with `--force`; runs discovery per entry's mode (auto/rss/web) through the existing `SourceDiscoveryService` chain; creates/updates a `SourceCandidate` (`needs_review`) instead of failing the run when discovery doesn't resolve cleanly, and continues past a single entry's failure; reads a legacy bare-array manifest as a fallback during the transition; validates each manifest entry's shape before use
- Digest email footer statistics — `feedSourcesActive`, `webSourcesActive`, `sourceCandidatesPending` (excluding rejected/promoted candidates) — alongside the existing pipeline-ingested/passed/analyzed stats block, in both HTML and plain-text email variants

### Updated
- README documents the sync command as the required post-deploy step, replacing implicit seeding, and flags that a fresh database now has zero sources until the sync command is run

### Removed
- `DigestBootstrapService.seedSourcesIfEmpty()` and its call sites in all three digest-build methods — sources are no longer implicitly created when the sources table is empty; the service's fetch-all + analyze-pending responsibilities for `/digests/trigger` are unchanged
- `config/sources.seed.json` and `src/seeds/seed.ts`/`npm run seed:sources` — fully replaced by the v2 manifest and sync command, not kept as a deprecated alias

---

## [dev/mvp-3] — 2026-07-06 — Phase 4: Source Candidates + Promotion

### Added
- `SourceCandidate` entity + migration: unique `normalizedUrl`, `domain`, nullable FK to the discovering `Article`, `status` (`pending`/`validated`/`rejected`/`promoted`/`needs_review`), `detectedType` (`rss`/`atom`/`web`), `proposedConfig` jsonb, `validationError`, `lastValidatedAt`
- `SourceCandidatesService` (idempotent create/upsert by normalized URL, promote, reject) and `SourceCandidatesQueryService` (paginated list with status filter, findOne)
- Promotion logic: reuses `SourceDiscoveryService` to discover structure, samples the entry URLs it found, runs pre-analysis only (never full analysis) via a new `AiAnalysisService.preAnalyzeArticle`, and promotes to a real enabled `Source` only when at least 2 sampled articles come back relevant; otherwise marks the candidate `needs_review`/`rejected` with a reason instead of silently discarding it. Creates a genuine `rss`/`atom` `Source` when the discovered feed URL was captured, falling back to a `web`-type `Source` (with `WebSourceConfig`) otherwise
- Admin endpoints `GET /source-candidates` (paginated, filterable by status), `GET /source-candidates/:id`, `POST /source-candidates/:id/promote`, `POST /source-candidates/:id/reject`, all `ApiKeyGuard`-protected
- `src/app.module.spec.ts` — minimal DI-graph bootstrap test catching module-wiring regressions, added because this phase introduced the codebase's first `forwardRef()` usage to break a new `SourcesModule` <-> `ArticlesModule`/`AiAnalysisModule` cycle

### Updated
- README documents source candidates, the promotion flow, and the new endpoints

### Fixed
- A promoted web-type source's `WebSourceConfig.entryUrls` was initially set to discovery's output (individual article permalinks) instead of the seed/listing URL, which would have permanently broken future re-discovery cycles for Cheerio/Playwright-promoted sources; corrected to seed with the candidate's own URL, matching the existing source-creation pattern
- Controller returned raw entities where response DTOs were declared; added a small mapper to close the gap

---

## [dev/mvp-3] — 2026-07-05 — Phase 3: Playwright + OpenAI Structural Fallback

### Added
- Isolated `web-source-browser-fetch` BullMQ queue with its own concurrency and timeout, kept separate from the feed-fetch/article-analysis/digest queues so a slow or hung browser job never blocks them
- `PlaywrightFetchService`/`PlaywrightFetchProcessor` — headless Chromium fetching for web sources, gated behind `PLAYWRIGHT_ENABLED` (default off); source creation runs it inline with a hard timeout, while the recurring scheduled re-fetch enqueues to the new queue instead so a slow site never stalls the hourly fetch-all-sources cycle; both paths reuse the existing ingestion logic (dedup, publish-date resolution)
- Playwright wired into `SourceDiscoveryService` as the fallback after Cheerio link discovery fails, self-healing the persisted recipe on success the same way as the existing sitemap/Cheerio recipes
- `SourceStructureAiService` — OpenAI-based structural-discovery fallback, gated behind `SOURCE_DISCOVERY_AI_FALLBACK_ENABLED` (default off) and capped per day via a new Redis-backed atomic counter on `RedisService`; every AI-suggested selector/URL is re-validated deterministically and enforced through a branded type before it can ever be persisted as a source's recipe, and suggested entry URLs pass through the same host-allowlist and robots.txt checks as regular discovery
- robots.txt `Disallow`/`Allow` rule parsing and enforcement (longest-prefix-match) before any fetch or Playwright navigation, in addition to the existing `Sitemap:` directive support

### Updated
- Dockerfile base image switched from `node:20-alpine` to `node:20-bookworm-slim` (glibc required for Chromium) for both build and production stages; production stage installs Chromium via `npx playwright install --with-deps chromium`; kept as a single production image rather than a separate worker image
- README documents the new queue, the Playwright/AI discovery fallbacks, the new env vars, and which additional env vars need to be added to `docker-stack.yml` operationally

---

## [dev/mvp-3] — 2026-07-05

### Added
- New `web` source type: `WebSourceConfig` entity (one-to-one with `Source`) storing entry URLs, allowed/excluded path patterns, and the discovery/extraction method and selectors to use; new `Article` columns tracking how and when content was extracted; migrations for both
- `SourceDiscoveryService` — deterministic discovery fallback chain for web sources (robots.txt sitemap directive → common sitemap paths → existing RSS/Atom feed reuse → entry-page link discovery)
- `ContentExtractionService` — extraction ladder for article content and publish dates (JSON-LD → OpenGraph → Readability-based extraction → CSS selector fallback)
- `WebSourceFetcherService` — ingests web sources using their stored recipe first, falling back through the discovery chain and self-healing the recipe when a different method succeeds; resolves each article's publish date via a priority chain (sitemap lastmod → extracted date → ingestion time) instead of always stamping ingestion time
- Shared URL-normalization and feed-validation utilities, the latter extracted from `SourcesService` so the RSS/Atom path and the new discovery chain share one implementation

### Updated
- `FeedFetcherService` routes web sources to `WebSourceFetcherService`; the existing RSS/Atom path is unchanged
- `SourcesService.create` runs discovery and validation for web sources and persists their config in a single transaction; `findAll`/`findOne` attach web config in a batched query
- `CreateSourceDto`/`SourceResponseDto` extended with optional web config; source type is now immutable after creation to prevent orphaned config rows
- README documents the web source type, discovery/extraction chain, self-healing recipe, and the publish-date fallback limitation

---

## [dev/mvp-3] — 2026-07-04

### Added
- `UserSourcePreference` entity and migration tracking per-user, per-source useful/not-useful vote counts and a derived feedback adjustment (dampened formula, clamped to ±8); `UserSourcePreferenceService` handles first-time votes, re-saving the same vote, and flipping between useful/not-useful correctly
- `scoreBreakdown` column on digest items (migration), storing the base score, feedback adjustment, and final score per article for explainability

### Updated
- Digest scoring now adds each user's per-source feedback adjustment on top of the existing relevance/quality/trust/recency formula, fetched in a single batched query per digest build instead of per item
- Daily digest emails no longer include the "why it matters" paragraph; weekly and deep-dive digests still do
- README updated to describe the new feedback-driven ranking and digest scoring behavior

### Removed
- Feedback no longer rescores a source's `trustScore`; `trustScore` is now purely editorial and feedback only affects per-user digest ranking

---

## [dev/mvp-2] — 2026-07-04

### Added
- `team-lead`, `system-analyst`, `template-maintainer`, and `changelog` agents, synced from the upstream `nestjs-project-template` delivery-workflow update — establishes a role-based delivery pipeline (classify → plan → implement → review → changelog → publish)
- `.claude/settings.json` — `SessionStart` hook that has `team-lead` run one `template-maintainer` proposal-mode audit per session
- `.claude/template-sync-state.json` — bookmark tracking the last upstream commit reviewed/applied against this project's Claude instructions

### Updated
- `CLAUDE.md` — added a "Delivery Workflow" section defining `team-lead` as the workflow owner and the allowed agent delegation paths
- `README.md` — added a "Claude Agent Workflow" section documenting all agents and the delegation flow
- `repo-publisher` agent — now runs `changelog` before committing a significant change
