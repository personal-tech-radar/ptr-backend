# Changelog

All significant changes to this project are recorded here.
Each entry is tagged with the branch it was made on.

---

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

## [dev/mvp-2] — 2026-07-04

### Added
- `team-lead`, `system-analyst`, `template-maintainer`, and `changelog` agents, synced from the upstream `nestjs-project-template` delivery-workflow update — establishes a role-based delivery pipeline (classify → plan → implement → review → changelog → publish)
- `.claude/settings.json` — `SessionStart` hook that has `team-lead` run one `template-maintainer` proposal-mode audit per session
- `.claude/template-sync-state.json` — bookmark tracking the last upstream commit reviewed/applied against this project's Claude instructions

### Updated
- `CLAUDE.md` — added a "Delivery Workflow" section defining `team-lead` as the workflow owner and the allowed agent delegation paths
- `README.md` — added a "Claude Agent Workflow" section documenting all agents and the delegation flow
- `repo-publisher` agent — now runs `changelog` before committing a significant change
