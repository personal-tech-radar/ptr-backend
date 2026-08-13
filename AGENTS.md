# Codex Project Instructions

This repository supports both Codex and Claude Code. These instructions govern Codex. `CLAUDE.md` and `.claude/` govern Claude Code; do not load or modify them unless explicitly in scope.

## Language

- User requests may be provided in any language.
- Communicate with the user in English.
- Write plans, reports, documentation, comments, commit messages, changelog entries, issues, and pull requests in English.

## Task Context

Before planning or resuming work, inspect `.local-context/` when present.

- Treat `current-task.md` as the active source of truth.
- Treat `decisions.md` and `archive/` as historical context only.
- The current request and actual repository state override all local context.
- Create the ignored context structure when useful and absent.
- Keep current context concise and archive obsolete notes.

## Working Principles

- Inspect relevant implementation before making claims or changes.
- Prefer targeted searches, neighboring modules, and current code over broad repository reads.
- Preserve backward compatibility unless a breaking change is explicitly approved.
- Prefer minimal, local changes and established patterns.
- Preserve unrelated user changes.

## Architecture

- Keep controllers thin; business logic belongs in services.
- Inject TypeORM `Repository<Entity>` directly. Do not add a repository layer.
- Keep entities in `src/<domain>/entities/` and migrations in `src/migrations/`.
- Use `@PrimaryGeneratedColumn('uuid')` and TypeORM `Date` timestamp decorators.
- Use `@DeleteDateColumn` and repository `softDelete`; hard-delete only when explicitly required.
- Keep `synchronize: false`; generate migrations with the TypeORM CLI.
- Use the existing `HttpService` for external HTTP calls.
- Keep paginated responses shaped as `{ data, meta: { total, page, limit, totalPages } }`.
- Isolate slow or hang-prone work in a dedicated BullMQ queue with explicit concurrency.
- Fail fast when required secrets are missing; never use insecure literal fallbacks.

## Scope and Maintenance

- Do not add dependencies without explicit approval.
- Do not change `.env`, deployment, production infrastructure, CORS, throttling, or production data sources unless explicitly requested.
- Update `README.md` for user-visible, domain, or operational changes.
- Add new environment variables to `.env.example`.
- Update `CHANGELOG.md` for significant changes.
- Prefer concise one-line comments that explain intent. Put longer design rationale in the relevant module README instead of narrative source comments.

## Workflow

- Informational task: answer only.
- Tiny isolated change: implement, review the diff, and run targeted verification.
- Regular change: write a short plan, implement, internally review once, and run relevant tests.
- High-risk or substantial change: provide a detailed plan and wait for approval; then implement, internally review once, optionally run the one-time Claude review, apply fixes, and run relevant tests.

Avoid unnecessary orchestration, document loading, repository-wide rereads, and repeated reviews.

## Review and Verification

- Review the final diff for scope, correctness, security, compatibility, documentation, and accidental changes.
- Run the narrowest meaningful verification first.
- Add build, broader tests, or Docker verification only when justified by the changed runtime surface.
- Do not modify application code to satisfy unrelated checks during instruction-only work.

## One-Time Claude Review

For high-risk or substantial work only:

1. Complete implementation and internal review.
2. Invoke Claude CLI at most once with the approved scope and final diff.
3. Tell Claude not to invoke Codex and to classify findings as `Critical`, `Non-critical`, `Technical debt`, or `Ideas`.
4. Record the attempt in `.local-context/current-task.md`; never retry for the same task.
5. Fix valid Critical findings before completion.
6. Search for duplicate issues before preparing proposals for other findings.
7. Never create issues without user approval.

If the invocation is unavailable or fails, report it and continue without retrying.

## Delivery

Before finishing every implementation iteration, create or update a Markdown report in the
ignored `./reports/` directory. Record completed and incomplete work, verification commands and
exact results, encountered problems, unresolved risks, and the final working-tree status. Reports
are local handoff artifacts and must never be staged or committed.

- Stage only intended changes.
- Never force-push, bypass hooks, amend shared history, or merge a pull request unless explicitly requested.
- Use English commit and pull-request content.
- Push a feature branch and open a pull request against the requested base.
- Restore the starting branch only when requested.
