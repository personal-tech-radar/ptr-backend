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

---

## Migration Policy

Migrations are generated exclusively via the TypeORM CLI. Do not handwrite or manually edit migration files without explicit instruction.

Dev commands use `src/common/database/data-source.ts`. Prod commands use `dist/common/database/data-source-prod.js`.

For the full workflow, use the `typeorm-migration-workflow` skill.

---

## Testing Philosophy

- Do not aim for 100% coverage. Tests must be minimal, sufficient, readable, and maintainable.
- For standard CRUD services, create a default test set automatically (happy path, not-found, invalid ID, conflict, soft-delete).
- For non-standard business logic, propose focused test cases and explain what each covers before writing.
- Mock the TypeORM repository and `LoggingService`. Do not mock the service under test.
- Tests live in `.spec.ts` files co-located with the file they test.

For test structure and implementation detail, use the `minimal-test-strategy` skill.

---

## Maintenance Rules

When you change the project in ways that affect behavior or structure:
- **`README.md`** — update when adding domains, changing behavior, or adding env variables.
- **`.env.example`** — add every new env variable with a description and a safe default.
- **Instruction files** — update `CLAUDE.md` and the relevant `.claude/agents/` or `.claude/skills/` file when a new pattern or convention is established.

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
- Deployment configuration (Dockerfile, Docker Compose, CI pipelines)
- Infrastructure-critical settings (CORS origins, throttler limits, production data sources)

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
