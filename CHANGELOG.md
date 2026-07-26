# Changelog

All significant changes to this project are recorded here.
Each entry is tagged with the branch it was made on.

---

## [chore/curate-phase1-auth-convention] — 2026-07-26

### Updated
- `CLAUDE.md` — new Architectural Rules entry: fail fast on a missing required secret/credential rather than silently defaulting, generalizing the existing `ApiKeyGuard` behavior into an explicit rule
- `auth-oauth-module-pattern` skill — captures the persisted/hashed/revocable refresh-token pattern (rotation on use, revocation on logout and password reset) and the approved auth dependency stack (`@nestjs/passport`, `@nestjs/jwt`, `passport`, `passport-jwt`, `passport-local`, `bcrypt`) established while building MVP3 Part 1's Phase 1 (Auth Foundation, PR #11); corrects a stale `isActive`-based validation description to match the actual soft-delete-based check
- Filed a GitHub issue on the upstream `nestjs-project-template` repo proposing the same conventions for adoption there (proposal only)

---

## [fix/seed-sync-prod-script] — 2026-07-09

### Fixed
- `npm run seed:sources:sync` has never been runnable in production: it requires `ts-node` against the raw `src/seeds/sync-sources.ts`, but the production Docker image only ships compiled `dist/`, never `src/` — confirmed directly from a real production log (`Cannot find module './sync-sources.ts'`) after the first post-MVP3 deploy. Added `seed:sources:sync:prod`, mirroring the existing `migration:run`/`migration:run:prod` split: it runs the already-compiled `dist/seeds/sync-sources.js` directly with plain `node`, no `ts-node` or `src/` needed. Verified against a real Postgres instance (`created`/`updated`/`failed` counts matched the dev-script run exactly). README's post-deploy instructions updated to use the new `:prod` script.

---

## [fix/ci-mailservice-di-test] — 2026-07-08

### Fixed
- Production deploy CI's "Run Tests" job, which failed because `app.module.spec.ts`'s full DI-graph compile eagerly instantiates `MailService`, whose constructor throws when `RESEND_API_KEY` is unset — true in CI (no env vars set) but masked locally by a real key in `.env`. The test now sets a scoped dummy placeholder for that var around its own DI-graph assertion, mirroring the existing save/restore `process.env` pattern used elsewhere in the test suite, without touching `MailService`'s production behavior or the CI workflow config.

### Updated
- `feature-implementation-workflow.puml`/`.png` moved from the repo root into `diagram/workflow/`, alongside the existing `diagram/context/` C4 diagram; README link updated to match
- `diagram/context/c4-context.puml`/`.png` (C4 container view) updated to reflect the MVP2 and MVP3 architecture: two-stage `AiAnalysis` (pre-analysis relevance gate + full analysis), `WebSourceFetcher`/`SourceDiscovery` (sitemap/RSS/Cheerio/Playwright/AI-suggestion fallback chain, self-healing recipe), the isolated `web-source-browser-fetch` Playwright queue, per-user feedback-driven digest ranking, and the expanded Postgres schema

## [dev/claude-template-sync-2] — 2026-07-08

### Added
- `coder` agent, synced from upstream, merging the former `backend-architect`, `api-contracts`, and `migrations` agents into a single full-stack implementation role — corrected against upstream's stale entity guidance to match this project's actual conventions (`@PrimaryGeneratedColumn('uuid')`, `@CreateDateColumn`/`@UpdateDateColumn`/`@DeleteDateColumn`)
- `qa-runner` agent, synced from upstream and corrected for this project's real stack (no MinIO/S3, `node:20-alpine`, required `migration:run` step)
- `docker-compose.test.yml` — a local verification stack (Postgres + Redis, no MinIO) for `qa-runner`, boot-verified end-to-end (all 5 migrations ran, app started, `GET /health` returned 200)
- `docker-local-verification` skill documenting the env var, host-port, and dotenv/bind-mount findings from that verification
- Four hooks in `.claude/settings.json` synced from upstream — auto-lint on save, a confirmation guard before hand-editing generated migrations, a block on force-push/amend, and a build+test gate before push — plus a permission allowlist for recurring read-only/build commands
- A "Plan Conformance" section in the `backend-review-checklist` skill
- `feature-implementation-workflow.puml` and its rendered PNG, embedded in README

### Updated
- `team-lead` agent — absorbed the former `changelog` agent's responsibilities directly, now routes runtime-relevant changes through `qa-runner` and adds an explicit commit/push approval checkpoint before writing the changelog
- `template-maintainer` agent — absorbed the former `template-curator` agent's responsibilities, now pushes new conventions upstream by filing a GitHub issue for human review instead of drafting a file change directly
- `repo-publisher` agent — added its own human commit/push approval gate, separate from `team-lead`'s pre-publish approval question
- `CLAUDE.md` and `README.md` — delivery workflow, agent table, and orchestration diagram updated for the new agent set; `CLAUDE.md`'s "Never Touch Without Explicit Request" section gained a `docker-compose.test.yml` carve-out owned by `qa-runner`
- `.claude/template-sync-state.json` — bumped to the new upstream commit reviewed/applied, with per-file adoption/divergence notes

### Removed
- `backend-architect`, `api-contracts`, and `migrations` agents (replaced by `coder`)
- `changelog` agent (folded into `team-lead`)
- `template-curator` agent (folded into `template-maintainer`)

---

## [dev/mvp-3] — 2026-07-08

### Fixed
- `SourceDiscoveryService.isLikelyArticleUrl()` — a bare `segments.length >= 2` fallback let almost any URL through regardless of its other heuristics, misclassifying non-article site sections (careers pages, product pages, client pages, team bio pages, generic service pages) as candidate articles during sitemap and Cheerio-link-based discovery. Found via real QA against a live site. Fixed by removing the bare fallback entirely, tightening the slug heuristic to require a 3+-word (not just long) last path segment, and adding a denylist of common non-article top-level site-section names (careers, clients, products, services, team, pricing, jobs) matched exactly against the first path segment. Added test coverage modeled on the real false positives, including a regression test for the removed bare-fallback bug and tests proving the denylist and tightened slug heuristic are each independently necessary
- README's description of the sitemap candidate-URL filter corrected to match — no longer describes "path depth" as a filtering signal

### Added
- 22 new sources to `config/sources.manifest.json` (`discovery.mode: "web"`), each real-tested via live `POST /sources` discovery (not mocked) before being added: 7 in `ai_engineering` (Anthropic Engineering, OpenAI Research News, Huyen Chip, Eugene Yan, LangChain Blog, LlamaIndex Blog, Databricks Blog), 5 in `backend_architecture_infra` (Thoughtworks Radar, High Scalability, AWS Architecture Blog, Google SRE, MongoDB Engineering), 10 in `engineering_deep_dives` (The Pragmatic Engineer, Uber Engineering, Shopify Engineering, Spotify Engineering, Figma Engineering, Reddit Engineering, Salesforce Engineering, Zalando Engineering, Airbnb Engineering, Pinterest Engineering). Verified end-to-end against a real Postgres instance via `npm run seed:sources:sync` (46 created, 0 failed)
- Of 44 originally-considered candidate URLs, 10 were exact duplicates of existing manifest entries (skipped silently), 1 was excluded as not a real article/blog source (`notebooklm.google.com/notebook/learning-guide` — a single shared notebook page), 1 was excluded as a content-duplicate of the existing `infoq-architecture` entry (`infoq.com/architecture-design/`), and 8 were excluded because live discovery genuinely failed even after exhausting the full deterministic chain plus a real Playwright launch: LinkedIn (`linkedin.com/blog/engineering`, `engineering.linkedin.com/blog`), Meta Engineering (`engineering.atmeta.com` — already covered by the existing `meta-engineering` entry at `engineering.fb.com`), Atlassian, Booking.com, Square, Instacart, DoorDash
- 9 new sources to `config/sources.manifest.json` (`discovery.mode: "web"`), each real-tested via live `POST /sources` discovery (not mocked) before being added: `hashicorp-blog` (backend_architecture_infra), `datadog-engineering` (backend_architecture_infra), `planetscale-blog` (backend_architecture_infra), `vercel-blog` (node_typescript_nestjs), `deno-blog` (node_typescript_nestjs), `sentry-blog` (engineering_deep_dives), `canva-engineering` (engineering_deep_dives), `pinecone-blog` (ai_engineering), `weights-and-biases-blog` (ai_engineering). Verified end-to-end against a real Postgres instance via `npm run seed:sources:sync` (9 created, 46 updated, 0 failed; total manifest now 55 sources)
- Of 10 originally-considered candidate URLs, 1 was excluded because live discovery genuinely failed even after exhausting the full deterministic chain plus a real Playwright launch: Etsy's "Code as Craft" blog

---

## [dev/mvp-3] — 2026-07-06 — Phase 6: Whole-Branch Integration Pass (final)

Closing entry for the 6-phase MVP3 effort ("Web Sources and Source Growth"); see the five phase entries below for the full substance.

### Fixed
- Critical cross-phase bug: `SourceCandidatesService.promote()` (Phase 4) left its sample `Article` rows — including the ones that justified promotion — permanently stuck at `NEW` status after promotion, because both fetchers dedup on `urlHash` and silently skip URLs that already have an `Article` row. The newly-enabled source could never actually get those articles into a digest. Fixed by hard-deleting the sample articles on successful promotion so the next real fetch cycle cleanly re-ingests them through the normal pending-analysis path
- `source-structure-ai.service.ts` (Phase 3): `JSON.parse` on the OpenAI response was implicitly `any`; narrowed to `unknown` through a `Record<string, unknown>` guard, no behavior change

### Verified
- Whole-branch `npm run build` and `npm run test` pass (19 suites, 187 tests) across all 5 phases combined
- `npm run lint --fix` reformatted ~40 pre-existing files unrelated to any MVP3 phase (including committed migrations); discarded rather than committed, per this repo's migration policy and since it was unrelated cosmetic drift

### Added (template-level)
- `seed-data-sync-pattern` skill generalizing Phase 5's versioned-manifest + idempotent-sync-command pattern for any domain needing reference/seed data

### Updated (template-level)
- `integration-pattern` skill gained an "Escalating Fallback Chains" section generalizing the deterministic-first/self-healing/AI-suggestion-requires-revalidation pattern from Phases 2-3
- `CLAUDE.md` gained a BullMQ stack entry, a rule to isolate slow background work in its own bounded queue (generalizing Phase 3's Playwright queue), and a "Seed / Reference Data" section
- `backend-architect` agent's stale manual-uuid/bigint-timestamp entity guidance corrected to match this codebase's actual `@PrimaryGeneratedColumn('uuid')`/`@CreateDateColumn`/`@UpdateDateColumn` convention (in use since Phase 1)

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
