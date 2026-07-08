# CLAUDE.md — NestJS Backend Template

This repository is a production-ready NestJS backend template. Services built from it share the same architecture, module conventions, and infrastructure wiring. Follow established patterns; do not invent new ones.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 11 (Express) |
| Language | TypeScript 5.7 |
| Database | PostgreSQL + TypeORM 0.3 |
| Cache | Redis (ioredis) |
| Object Storage | S3-compatible (AWS SDK v3) |
| Background jobs | BullMQ (Redis-backed queues) |
| HTTP client | Native `fetch` wrapper (`HttpService`) |
| Validation | class-validator + class-transformer |
| Documentation | Swagger / OpenAPI (`/docs`) |
| Auth | API key guard (`X-API-KEY` header) |

---

## Project Structure

```
src/
├── common/
│   ├── database/      # TypeORM module + DataSource files for migrations
│   ├── redis/         # Global RedisService
│   ├── s3/            # Global S3StorageService
│   ├── http/          # HttpService — fetch wrapper with retry/backoff
│   ├── error/         # Global exception filter + ErrorResponseDto
│   ├── logging/       # LoggingService (thin NestJS Logger wrapper)
│   ├── guards/        # ApiKeyGuard
│   └── dto/           # Shared DTOs: PaginatedResponseDto
├── health/            # GET /health — thin domain module example
├── migrations/        # TypeORM migration files (shared root)
├── app.module.ts
└── main.ts
```

Domain modules live at `src/<domain>/` and contain `controllers/`, `services/`, `dto/`, `entities/`.

---

## Architectural Rules

- **No repository layer.** Inject TypeORM `Repository<Entity>` directly into services.
- **Entities live in their domain module** at `src/<domain>/entities/`. Never in `common/`.
- **Migrations live in `src/migrations/`** (shared root), not inside domain folders.
- **Controllers must stay thin.** No business logic, no database access. Delegate to services.
- **Business logic and orchestration belong in services.**
- **Global modules** (`RedisModule`, `S3Module`) are available everywhere. `HttpModule` must be imported per feature module.
- **CRUD method naming:** `create`, `findAll`, `findOne`, `update`, `remove`.
- **`synchronize: false`** always. Schema changes via migrations only.
- For complex domains, split services into `command`, `query`, and `domain` services.
- Prefer existing patterns over new abstractions. Prefer minimal and local changes.
- **Isolate slow, resource-heavy, or hang-prone background work in its own BullMQ queue** — separate from the domain's regular processing queue(s) — with an explicit concurrency limit. A single stuck job (headless browser automation, a long-running third-party call) must never be able to block unrelated work. See `src/queue/queue.service.ts` (`web-source-browser-fetch` queue) for a worked example.

---

## Migration Policy

Migrations are generated exclusively via the TypeORM CLI. Do not handwrite or manually edit migration files without explicit instruction.

Dev commands use `src/common/database/data-source.ts`. Prod commands use `dist/common/database/data-source-prod.js`.

For the full workflow, use the `typeorm-migration-workflow` skill.

---

## Seed / Reference Data

If a domain needs reference or seed data (lookup lists, initial records an operator curates over time), ship it as a versioned manifest and sync it via an explicit, idempotent CLI command — never as an implicit "seed if the table is empty" check in application bootstrap.

For the full pattern (manifest shape, matching strategy, declarative-vs-operational field handling, CLI structure), use the `seed-data-sync-pattern` skill.

---

## Testing Philosophy

- Do not aim for 100% coverage. Tests must be minimal, sufficient, readable, and maintainable.
- For standard CRUD services, create a default test set automatically (happy path, not-found, invalid ID, conflict, soft-delete).
- For non-standard business logic, propose focused test cases and explain what each covers before writing.
- Mock the TypeORM repository and `LoggingService`. Do not mock the service under test.
- Tests live in `.spec.ts` files co-located with the file they test.

For test structure and implementation detail, use the `minimal-test-strategy` skill.

---

## Delivery Workflow

`team-lead` is the single owner of the delivery workflow. All substantive development requests enter through it — never invoke `system-analyst`, a specialist agent, or `repo-publisher` directly for work that has real behavioral, architectural, or contract impact.

Allowed delegation direction only:

```
team-lead → system-analyst → team-lead → specialist agents → code-reviewer → qa-runner (if runtime-relevant) → team-lead (commit approval, then changelog) → repo-publisher
team-lead → template-maintainer → team-lead → code-reviewer → team-lead (commit approval, then changelog) → repo-publisher
```

Rules:
- **Classification first.** `team-lead` sorts every request into informational/investigative, tiny isolated edit, substantive change, or template synchronization, and only routes substantive/template work through the full chain (see `.claude/agents/team-lead.md`).
- **`system-analyst` is planning-only.** It inspects the codebase, checks fit against architecture and conventions, and returns a plan. It never writes code, generates migrations, installs dependencies, commits, pushes, opens a PR, or invokes another agent.
- **No implementation before approval.** `team-lead` waits for explicit user approval of the `system-analyst` plan before invoking any implementation agent.
- **`template-maintainer` owns upstream sync analysis** against `https://github.com/mitersidorov/nestjs-project-template` — proposal mode (inspect/report only) unless `team-lead` invokes it in apply mode after explicit user approval. It never invokes `team-lead`, `system-analyst`, `repo-publisher`, or itself.
- **`repo-publisher` is always terminal** — last agent in any chain, never invokes another agent, never merges a pull request.
- **`team-lead` updates `CHANGELOG.md` itself**, after the user approves the change and immediately before publish, for every significant change — there is no separate changelog agent; documentation (including the changelog) is a team-lead responsibility.
- **Two human checkpoints before anything ships:** `team-lead` asks the user to approve the change *before* writing the changelog entry or invoking `repo-publisher`, and `repo-publisher` separately confirms with the user again right before it commits and pushes.
- **No recursion:** an agent must not invoke itself or its own parent, and a completed workflow stage is not re-run without a concrete unresolved finding.
- **Session start:** `team-lead` triggers exactly one `template-maintainer` proposal-mode audit per session (see the `SessionStart` hook in `.claude/settings.json`), before the first substantive request. The audit inspects and reports only — it never triggers implementation, review, changelog, commit, push, or PR creation on its own.

See `.claude/agents/team-lead.md`, `system-analyst.md`, and `template-maintainer.md` for full role detail.

---

## Maintenance Rules

When you change the project in ways that affect behavior or structure:
- **`README.md`** — update when adding domains, changing behavior, or adding env variables.
- **`.env.example`** — add every new env variable with a description and a safe default.
- **Instruction files** — update `CLAUDE.md` and the relevant `.claude/agents/` or `.claude/skills/` file when a new pattern or convention is established. Use the `template-maintainer` agent (curation direction) to judge whether a new pattern is specific to this service or belongs in the shared template instructions for every project built from it.

---

## Dependency Policy

- Do not add dependencies automatically.
- Suggest a well-supported dependency only when it clearly solves a real problem better than a custom implementation. Do not install it without explicit confirmation.
- Never alter `package.json`, `package-lock.json`, or infrastructure config (Docker, CI) without explicit instruction.

---

## Clean Code and Commenting

- Use clear naming so code reads without explanation.
- Write comments only where they add information the code cannot convey — non-obvious business rules, important architectural constraints.
- Do not write multi-line comment blocks that are larger than the code they describe.
- Do not add docstrings, JSDoc, or explanatory comments to standard CRUD code.
- Do not add error handling for scenarios the framework or internal contracts already prevent.

---

## Never Touch Without Explicit Request

- `.env` files and secrets
- Deployment configuration (Dockerfile, production Docker Compose, CI pipelines)
- Infrastructure-critical settings (CORS origins, throttler limits, production data sources)

**Exception:** `docker-compose.test.yml` is a local verification harness owned exclusively by `qa-runner`. It may create, run, and maintain this file and only this file — it is not deployment configuration and must never be confused with or promoted to a production compose file.

---

## Canonical Commands

```bash
npm run start:dev          # Development watch mode
npm run build              # Compile to dist/
npm run start:prod         # Run compiled build
npm run test               # Unit tests
npm run test:cov           # Coverage report
npm run test:e2e           # E2E tests
npm run lint               # ESLint with auto-fix
npm run format             # Prettier

npm run migration:generate -- src/migrations/Name
npm run migration:run
npm run migration:revert
npm run migration:show
```

Swagger UI: `http://localhost:3000/docs`
Health check: `GET /health`
