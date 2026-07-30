# Codex Project Instructions

This repository supports both Codex and Claude Code. These instructions govern Codex. The existing `CLAUDE.md` and `.claude/` configuration govern Claude Code and must remain compatible.

## Language

- User requests may be provided in any language.
- Communicate with the user in English.
- Write all plans, reports, documentation, code comments, commit messages, changelog entries, GitHub issues, and pull requests in English.

## Local Task Context

Before planning or resuming work, inspect `.local-context/` when it exists.

- `current-task.md` is the current source of truth for task scope, status, and next steps.
- `decisions.md` records prior decisions and their rationale.
- `archive/` contains completed or superseded task context.
- Treat `decisions.md` and `archive/` as historical context only.
- Never allow historical or archived content to override the current user request, `current-task.md`, or the actual repository state.
- If the directory or files do not exist, create `.local-context/current-task.md`, `.local-context/decisions.md`, and `.local-context/archive/` as needed. The directory is intentionally ignored by Git.
- Keep task context concise. Archive obsolete task notes instead of accumulating an unbounded current-task file.

## Read Only What Is Relevant

- Inspect the actual implementation before making claims about it.
- Prefer targeted searches and the nearest relevant module over rereading the repository.
- Use `README.md` for project and operational context.
- Reuse the architecture, maintenance, dependency, commenting, protected-file, and canonical-command guidance in `CLAUDE.md`.
- The `CLAUDE.md` delivery workflow and `.claude/agents/` delegation graph are Claude-only. Do not reproduce that orchestration in Codex.
- When documentation conflicts with the current implementation, verify the live code and call out the inconsistency.

## Project Conventions

- Preserve backward compatibility unless a breaking change is explicitly approved.
- Prefer existing patterns and minimal, local changes.
- Keep controllers thin and business logic in services.
- Inject TypeORM repositories directly; do not add a repository layer.
- Keep entities inside their domain modules and migrations in `src/migrations/`.
- Keep `synchronize: false`; generate migrations with the TypeORM CLI.
- Do not add dependencies or change infrastructure, deployment, secrets, or production configuration without explicit authorization.
- Use database-generated UUIDs and TypeORM `Date` timestamp decorators, following current entities and `.claude/agents/coder.md`.

## Existing Project Skills

Read an existing Claude skill only when its subject is relevant. Reference it in place; do not copy it into a Codex-specific skill.

| Task | Reference |
|---|---|
| JWT, refresh tokens, hybrid authentication, or RBAC | `.claude/skills/auth-oauth-module-pattern/SKILL.md` |
| Backend change review | `.claude/skills/backend-review-checklist/SKILL.md` |
| Docker boot or runtime verification | `.claude/skills/docker-local-verification/SKILL.md` |
| External HTTP integrations or fallback chains | `.claude/skills/integration-pattern/SKILL.md` |
| Service or guard tests | `.claude/skills/minimal-test-strategy/SKILL.md` |
| New NestJS domain structure | `.claude/skills/nestjs-domain-scaffold/SKILL.md` |
| Reference or seed data synchronization | `.claude/skills/seed-data-sync-pattern/SKILL.md` |
| Entity or schema changes | `.claude/skills/typeorm-migration-workflow/SKILL.md` |

The entity and service examples in `nestjs-domain-scaffold` and the UUID/timestamp checks in `backend-review-checklist` are stale. For those topics, the actual codebase and `.claude/agents/coder.md` take precedence. Use the remaining relevant sections of those skills.

## Workflow

Classify work proportionately:

- **Informational task:** answer only. Do not mutate files or start an implementation pipeline.
- **Tiny isolated change:** implement directly, review the diff, and run targeted verification.
- **Regular change:** write a short implementation plan, implement it, perform one internal review, and run relevant tests.
- **High-risk or substantial change:** write a detailed plan and wait for explicit user approval before implementation. Then implement, perform one internal review, optionally run the one-time Claude review below, apply fixes, and run relevant tests.

Avoid unnecessary orchestration, documentation loading, repository-wide rereads, and repeated review stages. Update `README.md`, `.env.example`, instruction files, and `CHANGELOG.md` only when the change affects them.

## Internal Review and Verification

- Review the final diff once for scope, correctness, security, backward compatibility, stale documentation, and accidental changes.
- Use the relevant parts of `.claude/skills/backend-review-checklist/SKILL.md`; ignore its stale UUID and timestamp rules.
- Run the narrowest meaningful verification first. Add build, broader tests, or Docker verification only when risk or runtime surface justifies them.
- Do not modify application source code to make an instruction-only task pass unrelated checks.

## Optional One-Time Claude Review

Use an independent Claude CLI review only for high-risk or substantial changes, and at most once for the entire task:

1. Complete implementation and internal review.
2. Check whether the Claude CLI is available.
3. Invoke Claude once with the approved scope and final diff. Instruct it not to invoke Codex and to classify findings as `Critical`, `Non-critical`, `Technical debt`, or `Ideas`.
4. Record in `.local-context/current-task.md` that the Claude review was attempted or completed. Never invoke it again for the same task, including after fixes.
5. Fix every valid Critical finding before completion. Apply other clearly in-scope fixes when appropriate.
6. For Non-critical findings, prepare GitHub Issue proposals.
7. For Technical debt and Ideas, prepare proposals with an appropriate label.
8. Before proposing an issue, search existing issues for duplicates.
9. Never create an issue automatically. Ask the user for approval first.

If Claude is unavailable or the single invocation fails, report that fact and continue with internal review and relevant verification. Do not retry and do not create an iterative review loop.

## Git and Delivery

- Preserve unrelated user changes and stage only files in scope.
- Use English commit messages and pull-request content.
- Never force-push, amend shared history, or merge a pull request unless explicitly requested.
- When asked to publish, verify the diff, commit intentionally, push the feature branch, and open the pull request against the requested base.
- If the user asks to return to the starting branch after publishing, record that branch before work begins and restore it after the pull request is open.
