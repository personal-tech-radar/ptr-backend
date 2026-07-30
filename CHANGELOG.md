# Changelog

All significant changes to this project are recorded here.
Each entry is tagged with the branch it was made on.

---

## [feature/mvp3-p9-admin-bootstrap] — 2026-07-30

### Added
- Admin Bootstrap (MVP3 Part 1, Phase 9 of 11) — on every startup, the app now ensures an admin account exists for `ADMIN_EMAIL`/`ADMIN_PASSWORD`. Both are required; the app now fails to boot if either is missing, the same as any other required credential. An existing admin's password is never reset by this process. If the configured admin email was previously soft-deleted, it's automatically restored (without touching its existing password) rather than left disabled

---

## [feature/mvp3-p8c-admin-read-only] — 2026-07-29

### Added
- Admin API, part 3 of 3 (MVP3 Part 1, Phase 8c of 11) — the last of three admin API deliveries, view-only. Admins can now list digests (with full item detail), saved articles, and article-open history, all filterable and paginated. This completes the Admin API in full

### Known limitations
- The new article-feedback and per-source-preference admin listings will show an empty user email for every existing row today, since neither table has ever recorded a real per-user identity — both still only carry the single legacy placeholder user from before accounts existed. This resolves automatically once existing feedback and preference data is linked to real accounts, planned for a later phase

---

## [feature/mvp3-p8b-admin-taxonomy-streams] — 2026-07-29

### Added
- Admin API, part 2 of 3 (MVP3 Part 1, Phase 8b of 11) — admins can now view and edit technologies/interests (`/admin/technology-interests`) and content streams (`/admin/content-streams`), including entries hidden from the public listings (merged-away technologies, disabled streams). Editing is limited to their display fields; a technology's kind and a stream's key can never be changed, only its name, description, or similar metadata
- Two more listings, `/admin/user-technology-interests` and `/admin/user-content-streams`, let an admin look up which technologies, interests, and streams a given user (by email) has selected

### Fixed
- Renaming a technology or interest to match one that had already been merged away under a different entry was silently allowed to violate a uniqueness rule instead of returning a clear conflict error. Editing now checks against merged/removed entries too, not just active ones
- Partially updating a content stream (for example, only disabling it) could return incorrect data for the fields left out of that request — a previously-set description could come back as empty even though it was still saved correctly underneath. Responses now always reflect the true current state

---

## [fix/feed-saved-boolean-filter] — 2026-07-28

### Fixed
- `GET /feed?saved=false` was silently behaving like `saved=true`, the same false-filter bug already fixed on the admin sources/users filters in Phase 8a. This was the third and last place it existed in the codebase; a search confirmed no other instance remains

---

## [feature/mvp3-p8a-admin-core] — 2026-07-27

### Added
- Admin API, part 1 of 3 (MVP3 Part 1, Phase 8a of 11) — new admin-only endpoints for managing users (`/admin/users`) and articles (`/admin/articles`): paginated listing with filters, single-record lookup, and soft delete. Filtering by email is supported for users
- Admin endpoints require the `admin` role, either via a logged-in admin's token or the existing API key, so existing ops and automation tooling keeps working unchanged while gaining real per-admin JWT access

### Updated
- Sources, source candidates, and the digest-trigger endpoint now also require the admin role instead of just the API key, completing a guard migration that was intentionally deferred back in Phase 1
- `GET /sources` now returns a paginated, filterable result instead of a plain list — a breaking change to that endpoint's response shape, for anyone calling it directly

### Fixed
- Explicitly requesting `enabled=false` or `includeDeleted=false` on the new admin filters was silently returning the opposite of what was asked, due to a NestJS/class-transformer interaction that corrupted the value before it reached our own filter logic. Omitted filters and `=true` were unaffected

### Known limitations
- The same false-filter bug fixed above also exists on the already-shipped personal feed's `saved` filter (`GET /feed?saved=false`) — out of scope for this phase since that file wasn't touched here, flagged for a small standalone follow-up fix

---

## [feature/mvp3-p7-public-feed-preview] — 2026-07-27

### Added
- Public Feed + Anonymous Preview (MVP3 Part 1, Phase 7 of 11) — `GET /public/feed`, a fully open, no-registration-required feed of already-analyzed articles that meet a minimum quality bar and belong to at least one content stream, sorted strictly by publish date with no personalization
- `POST /public/feed/preview` — lets a visitor see what a personalized feed would look like by supplying technologies, interests, and streams directly in the request, without creating an account or any database row. Scored using the same relevance engine as the real personal feed, against articles from the last 30 days
- Both endpoints cache their results in Redis; article links in the public feed point straight at the original source, since there's no visitor identity to attach a personal redirect to

### Known limitations
- Neither new endpoint has rate limiting yet, consistent with every other endpoint in this app today — a known, deliberately deferred gap pending a future cross-cutting throttling pass across the whole API, not specific to this phase

---

## [feature/mvp3-p6-personal-feed-api] — 2026-07-27

### Added
- Personal Feed API (MVP3 Part 1, Phase 6 of 11) — `GET /feed`, a JWT-protected, onboarding-gated feed of a user's personally-scored articles, grouped by their local calendar day. Supports filtering by content stream, technology, interest, source, date range, and a saved-only mode
- Results are capped and distributed to keep any one content stream from crowding out the others: up to 50 articles per stream per day, up to 100 per day overall when no stream filter is applied, up to 50 when filtering to a single stream
- The feed is built entirely from already-analyzed data in the database (no LLM calls at read time) and cached in Redis; the cache is invalidated automatically whenever a user changes their onboarding selections or profile level
- Every article link in a feed response goes through Phase 5's permanent redirect mechanism instead of the raw article URL
- `saved=true` mode is exempt from the platform's usual 30-day freshness floor — a user's own saved articles stay findable regardless of age

### Known limitations
- Re-onboarding to change selected content streams is still additive-only, same underlying limitation already documented for technology/interest selections in Phase 2 — deselecting a stream doesn't currently remove it from a user's profile. Phase 2's entry flagged this as worth revisiting once Personal Feed needed removal semantics; Personal Feed itself doesn't currently need it (it reads whatever is stored), but this is now the natural trigger point to fix it
- Cache invalidation after new articles are ingested relies on the cache's short TTL rather than an immediate, targeted invalidation — a deliberate simplification consistent with the spec's own "simple full invalidation is acceptable" guidance

---

## [feature/mvp3-p5-user-actions-on-articles] — 2026-07-27

### Added
- User Actions on Articles (MVP3 Part 1, Phase 5 of 11) — users can now save/unsave/list articles for later (`/saved-articles`, JWT-protected). Unsaving something not currently saved is a no-op, not an error
- A permanent, backend-redirect link mechanism (`GET /go/:linkId`) that records a user's first open of an article exactly once, along with the context it was opened from (feed, daily/weekly/deep-dive digest) — repeat visits redirect correctly but never re-record. This is the mechanism the upcoming Personal Feed and Personal Digest Delivery phases will render article links through; nothing calls it yet in this phase, which is expected groundwork
- An unauthenticated, HMAC-signed "save from email" link for future digest/feed emails — idempotent, and always shows a simple HTML result page (saved, invalid link, already-gone article) rather than a raw error, since it's meant to be clicked straight from an email client

### Updated
- The small HTML-page helper used by the existing feedback-click email link is now shared with the new save-from-email link, instead of living as a private copy inside one controller

---

## [feature/mvp3-p4-personal-relevance-scoring] — 2026-07-26

### Added
- Personal Relevance Scoring (MVP3 Part 1, Phase 4 of 11) — a deterministic, no-LLM scoring service (`ScoringModule`) that computes how relevant a globally-analyzed article is to a specific user, purely from data already in the database. No new schema, no endpoint yet — this is groundwork consumed by the upcoming Personal Feed and Public Preview phases
- Scoring weighs technology/interest overlap, a complexity-level-to-experience-level match table, article quality, and recency; a user's selected content streams are a mandatory filter — an article outside them scores zero. Per-article "useful"/"not useful" feedback and a user's per-source preference both nudge the score up or down but never exclude an article outright
- The full formula and every coefficient are documented in README, per policy

### Updated
- `DigestBuilderService`'s recency-scoring logic extracted into a shared utility so the digest pipeline and the new personal-scoring service compute freshness the same way, without duplicating the logic (purely internal refactor, no behavior change)

---

## [feature/mvp3-p3-global-article-analysis-rework] — 2026-07-26

### Added
- Global Article Analysis Rework (MVP3 Part 1, Phase 3 of 11) — every article is now analyzed once, globally, instead of per user. The per-user `ArticleRelevance` pre-screen gate is gone; its role is now fields directly on `ArticleAnalysis` (`preScreenIsRelevant`/`preScreenReason`/`preScreenAt`, `fullAnalysisAt`)
- Real taxonomy-aware classification: `materialType`, a 4-level `complexityLevel` (beginner/intermediate/advanced/architect), `urgencyScore`, an `evergreen` flag, `breakingChanges`, loosely-shaped `releaseData`/`securityData`, and a resolved main content stream plus up to two secondary streams
- `ArticleTechnologyInterest` and `ArticleStream` join tables link each article to real entries from Phase 2's technology/interest and content-stream catalogs — resolved by exact/alias match only; a signal that doesn't match anything existing is dropped, never used to grow the catalog (that stays exclusively onboarding's job)
- `AiAnalysisService.analyzeArticle`/`preAnalyzeArticle` no longer take a `userId` — the whole pipeline is single-pass and shared across all users now

### Updated
- `DigestBuilderService`'s candidate-selection queries and pipeline stats now read directly off `ArticleAnalysis` instead of joining the removed `ArticleRelevance` table; digest emails render real resolved technology/interest names instead of the old freeform list
- `SourceCandidatesService`'s promotion flow, and the `ArticleAnalysis` → `Article` foreign key, now cascade correctly now that an analysis row is reliably created earlier in an article's lifecycle

### Removed
- `ArticleRelevance` entity and its table

### Known limitations
- `DigestBootstrapService`'s synchronous re-analysis sweep and the queued `article-analysis` BullMQ job can race on the same freshly-ingested article, each independently calling OpenAI for the same article. Pre-existing architecture, not introduced by this phase — surfaced during Phase 3's QA pass. No data corruption results (errors are caught cleanly either way), just a wasted duplicate LLM call under race conditions. Worth a dedicated fix later.
- `MailService.sendDigest` throws on a Resend failure instead of failing gracefully, which currently 500s `/digests/trigger` even though the digest itself is already correctly built and persisted in `DRAFT` status by that point. Pre-existing, unrelated to this phase's diff. Worth switching to a best-effort/non-fatal send so a mail-provider outage leaves a cleanly resendable draft instead of an opaque 500.

---

## [feature/mvp3-p2-profile-onboarding-taxonomy] — 2026-07-26

### Added
- Profile, Onboarding & Taxonomy (MVP3 Part 1, Phase 2 of 11) — combines what was originally three separate phases (Profile & Onboarding, Technologies & Interests, Content Streams) into one delivery to avoid modeling the same entities twice. New `TechnologyInterest` entity (single entity with a technology/interest discriminator), `ContentStream` reference table seeded with the five fixed system streams, and their per-user selection join tables
- Normalization and deduplication pipeline for technologies/interests: exact match, alias match, then Postgres `pg_trgm` similarity search before creating a new record, so near-duplicate entries (e.g. "Node.js" vs "node.js") resolve to the same row
- Admin endpoint to merge duplicate technologies/interests, folding the merged-away entry's name into the surviving entry's aliases so it remains resolvable afterward; soft-deletes rather than removes, per policy
- `POST /users/me/onboarding` (level, technology/interest, and content-stream selection) and `GET /users/me/taxonomy`; `level` also editable directly via `PATCH /users/me`
- Isolated `taxonomy-source-discovery` background queue that records a request for future source discovery whenever a genuinely new technology/interest is created (stub for now — real web-search-based discovery is a separate future decision)

### Updated
- `HybridAuthGuard`/`RolesGuard` (built in Phase 1) get their first real caller: the technology/interest merge endpoint

### Known limitations
- Onboarding is additive-only — re-submitting adds new selections but does not remove previously selected ones. Deferred intentionally since nothing downstream (Personal Feed, digest delivery) yet depends on removal working; revisit once one of those needs it

---

## [feature/mvp3-p1-auth-foundation] — 2026-07-26

### Added
- User accounts and authentication (MVP3 Part 1, Phase 1 of 13) — the first step in moving Personal Tech Radar from a single YAML-config-driven user to a multi-tenant platform. `User` entity (email, password, display name, timezone, role, GitHub URL, level and onboarding fields reserved for a later phase, soft delete)
- Registration by email/password with immediate timezone capture, email verification via a token-based link (kept intentionally separate from onboarding completion, which lands in a later phase), login issuing an access JWT plus a persisted/hashed/revocable refresh token, refresh-token rotation, logout, password recovery (forgot/reset) and in-session password change
- Profile self-service (`GET/PATCH/DELETE /users/me`), all deriving the target user exclusively from the authenticated JWT, never a client-supplied ID
- `HybridAuthGuard` (accepts either the existing API key or a JWT) and `RolesGuard`/`@Roles()` for `user`/`admin` roles — implemented and unit-tested now, applied to existing endpoints in a later Admin API phase
- New dependencies: `@nestjs/passport`, `@nestjs/jwt`, `passport`, `passport-jwt`, `passport-local`, `bcrypt` (password hashing)

### Updated
- `MailService` extended beyond digest-only sending to also deliver verification and password-reset emails, using the same best-effort/non-fatal-failure pattern as existing digest sends
- Swagger now documents a bearer-token security scheme alongside the existing API-key scheme, so the new JWT-protected routes are usable from `/docs`
- README documents the new auth/user modules, the registration-through-reset flow, and the new environment variables
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
