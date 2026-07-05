# Changelog

All significant changes to this project are recorded here.
Each entry is tagged with the branch it was made on.

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
