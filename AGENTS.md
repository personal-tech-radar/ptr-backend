# Codex Project Instructions

This repository supports both Codex and Claude Code. These instructions govern Codex. `CLAUDE.md` and `.claude/` govern Claude Code; do not load or modify them unless explicitly in scope.

Codex role definitions live in `.codex/agents/`, reusable project skills live in
`.agents/skills/`, and Codex session hooks and configuration live in `.codex/`.

## Language

- Communicate with the user in English, regardless of the request language.
- Write plans, reports, documentation, comments, commit messages, changelog entries, issues, and pull requests in English.

## Task Context

Before planning or resuming work, inspect `.local-context/` when present.

- Treat `current-task.md` as the active source of truth.
- Treat `decisions.md` and `archive/` as historical context only.
- The current request and actual repository state override all local context.
- Keep current context concise and archive obsolete notes.

## Working Principles

- Inspect relevant implementation before making claims or changes.
- Prefer targeted searches, neighboring modules, and current code over broad repository reads.
- Preserve backward compatibility unless a breaking change is explicitly approved.
- Prefer minimal, local changes and established PTR patterns.
- Preserve unrelated user changes.

## PTR Architecture

- Keep controllers thin; business logic belongs in services.
- Inject TypeORM `Repository<Entity>` directly. Do not add a repository layer.
- Keep entities in `src/<domain>/entities/` and migrations in `src/migrations/`.
- Use `@PrimaryGeneratedColumn('uuid')` and TypeORM `Date` timestamp decorators.
- Keep `synchronize: false`; generate migrations with the TypeORM CLI.
- Use `@DeleteDateColumn` and repository `softDelete`; hard-delete only when explicitly required.
- Use the existing `HttpService` for external HTTP calls.
- Keep paginated responses shaped as `{ data, meta: { total, page, limit, totalPages } }`.
- For complex domains, follow the command/query/domain split already used in `users` and `sources`.
- Treat `RedisModule`, `S3Module`, and `MetricsModule` as global modules; import `HttpModule` and `FeedCacheModule` per feature module.
- Routes use API-key authentication for machine clients, JWT Bearer tokens for users, and the administrator JWT strategy for admin routes. Use the existing guards and `@CurrentUser()` decorator.
- When a change affects a user's effective feed configuration, use the existing feed-cache invalidation service. Do not block a write path on unrelated background work.
- Isolate slow or hang-prone work in a dedicated BullMQ queue with explicit concurrency.
- Fail fast when required secrets are missing; never use insecure literal fallbacks.

## Scope and Maintenance

- Do not add dependencies without explicit approval.
- Do not change `.env`, deployment, production infrastructure, CORS, throttling, or production data sources unless explicitly requested.
- Add new environment variables to `.env.example`.
- Update `README.md` for user-visible, domain, or operational changes.
- Update `CHANGELOG.md` for significant changes when the delivery workflow reaches the publish stage.
- Update `AGENTS.md` when a durable Codex convention is established. Keep Claude-only conventions in `CLAUDE.md` or `.claude/`.
- Keep `.codex/` agent definitions and `.agents/skills/` instructions consistent with this file; update project-specific references when adapting reusable skills.
- Prefer concise one-line comments that explain intent. Put longer design rationale in relevant module documentation.

## Workflow

- Informational or investigative task: inspect and report; do not modify files unless requested.
- Tiny isolated change: implement, review the diff, and run targeted verification.
- Regular change: write a short plan, implement, internally review once, and run relevant tests.
- High-risk or substantial change: provide a detailed plan and wait for approval before implementation.
- Do not modify application code to satisfy unrelated checks during instruction-only work.

Avoid unnecessary orchestration, document loading, repository-wide rereads, and repeated reviews.

## Review and Verification

- Review the final diff for scope, correctness, security, compatibility, documentation, and accidental changes.
- Run the narrowest meaningful verification first.
- Add build, broader tests, or Docker verification when justified by the changed runtime surface.
- For instruction-only changes, verify referenced files and commands and run formatting or repository checks only when relevant.

## Delivery

Before finishing every implementation iteration, create or update a Markdown report in the
ignored `./reports/` directory. Record completed and incomplete work, verification commands and
exact results, encountered problems, unresolved risks, and the final working-tree status. Reports
are local handoff artifacts and must never be staged or committed.

- Stage only intended changes.
- Never commit, push, merge a branch or pull request, force-push, bypass hooks, or amend shared history without the user's explicit approval for that operation.
- Use English commit and pull-request content.
- Push a feature branch and open a pull request against the requested base only when requested.

## Canonical Commands

```bash
npm run start:dev
npm run build
npm run lint
npm run test
npm run test:e2e
npm run format

npm run migration:generate -- src/migrations/Name
npm run migration:run
npm run migration:revert
npm run migration:show
```
