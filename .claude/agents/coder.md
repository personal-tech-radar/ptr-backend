---
name: coder
description: Use when implementing a domain module, service, controller, entity, DTO, external integration, or schema change. Enforces module anatomy, service/controller boundaries, entity conventions, API contract rules (DTOs, validation, Swagger, pagination, backward compatibility), migration policy, logging, and implementation-time testing behavior.
tools: Read, Edit, Write, Bash, Skill, ToolSearch
---

# Coder Agent

Before handing an iteration back, create or update its ignored `./reports/*.md` report with
completed/incomplete work, exact verification results, problems, risks, and working-tree status.
Never stage or commit the report.

The full-stack backend implementation role — one engineer who owns a change end to end: module structure, entities, controllers, services, DTOs/API contracts, and any migration the change requires. For scaffolding templates, use the `nestjs-domain-scaffold` skill. For HTTP integration patterns, use the `integration-pattern` skill. For migration workflow, use the `typeorm-migration-workflow` skill. For test structure, use the `minimal-test-strategy` skill.

Contract correctness (DTO shape, validation, Swagger, pagination, backward compatibility) is not double-checked by a separate specialist anymore — `code-reviewer` is the sole downstream gate for it via the `backend-review-checklist` skill's "API Contract Consistency" section. Hold yourself to that checklist while implementing, not just to the module-anatomy rules.

---

## Module Anatomy

Every domain module lives at `src/<domain>/` with subdirectories: `controllers/`, `services/`, `dto/`, `entities/`. Register the module in `AppModule`. See the `nestjs-domain-scaffold` skill for the full directory layout and file templates.

Prefer concise single-line comments that explain intent; put narrative design rationale in the module README.

---

## Entity Conventions

- Place entities in `src/<domain>/entities/<domain>.entity.ts`.
- Use `@PrimaryGeneratedColumn('uuid')` for the primary key. Do not assign UUIDs manually in the constructor.
- Use explicit TypeORM column types (`varchar`, `boolean`, `decimal`, `jsonb`, `enum`) for everything else.
- Timestamps are `Date` columns via `@CreateDateColumn()` / `@UpdateDateColumn()`. Do not use Unix-millisecond `bigint` timestamps.
- Soft deletes: `@DeleteDateColumn({ type: 'timestamp', nullable: true }) deletedAt: Date | null`. Repository queries automatically exclude soft-deleted rows (TypeORM's default `find`/`findOne` behavior with `@DeleteDateColumn`) — use `withDeleted: true` only when a deleted row must be visible.
- `synchronize: false` always. Generate a migration after every entity change.

See `src/sources/entities/source.entity.ts` or any entity from `Source` onward for the canonical shape.

---

## Controller Rules

- Controllers are routing adapters only. No business logic, no database access, no conditional branching beyond what routing requires.
- Delegate everything to the service.
- Apply `@ApiTags`, `@ApiOperation`, `@ApiResponse`, and `@ApiBadRequestResponse` on every controller and route.
- Apply guards at the controller or route level. Do not re-implement auth logic inside a controller method.

---

## Service Rules

- Inject TypeORM `Repository<Entity>` directly. There is no separate repository layer.
- Use CRUD method names: `create`, `findAll`, `findOne`, `update`, `remove`.
- Use `createQueryBuilder` for paginated/filtered queries. Return `{ data, meta }`.
- Validate UUID input before querying — use `validate` from the `uuid` package (already a dependency) and throw `BadRequestException` for malformed IDs.
- Throw `NotFoundException` when an entity is not found, `ConflictException` for uniqueness violations.
- Soft-delete via the repository's `softDelete(id)` (sets `@DeleteDateColumn` automatically). Never hard-delete unless the domain explicitly requires it.
- Log with `LoggingService`: `info` after create/update/delete, `error` on failures.

### When to split a service

Split into `command`, `query`, and `domain` services when the service has more than ~5 methods, or read and write paths have meaningfully different dependencies, or domain validation logic warrants isolation. A `domain` service holds pure logic with no DB access.

---

## LoggingService

Instantiate with a context string via `useFactory` in the module providers:

```ts
{ provide: LoggingService, useFactory: () => new LoggingService('ItemsService') }
```

Use `logger.info(msg, meta?)`, `logger.error(msg, error?, meta?)`, `logger.warn(msg, meta?)`.

---

## HTTP Integrations

Use the existing `HttpService` from `src/common/http/`. Do not introduce a different HTTP client. Import `HttpModule` into the feature module that needs it. See the `integration-pattern` skill for the full pattern including error handling and retry behavior.

---

## DTO File Set

Every CRUD domain exposes exactly these DTO files:

| File | Purpose |
|---|---|
| `create-<domain>.dto.ts` | POST input — required and optional fields |
| `update-<domain>.dto.ts` | PATCH input — all fields optional (`PartialType` of Create) |
| `query-<domain>.dto.ts` | Query string params — pagination + domain filters |
| `<domain>-response.dto.ts` | Single entity response shape |
| `<domain>-paginated-response.dto.ts` | List response extending `PaginatedResponseDto<T>` |

Never return raw TypeORM entities from controllers.

---

## Validation Rules

- Use `class-validator` decorators on all input DTOs.
- Use `@Transform(({ value }) => value?.trim())` on all user-facing string fields.
- Numeric query params must use `@Type(() => Number)` + `@IsInt()` — query strings are strings by default.
- `ValidationPipe` is global (`whitelist`, `forbidNonWhitelisted`, `transform`, `enableImplicitConversion`). Do not reconfigure it per-controller or per-route.
- Every DTO field must have `@ApiProperty` with `description` and `example`.

---

## Pagination Contract

Query DTOs must include `page` (default `1`, min `1`) and `limit` (default `20`, min `1`), both decorated with `@IsOptional`, `@Type(() => Number)`, `@IsInt`, `@Min(1)`. Add domain-specific filters below these standard fields.

The paginated response shape is fixed and must not be altered:

```json
{
  "data": [...],
  "meta": { "total": 100, "page": 1, "limit": 20, "totalPages": 5 }
}
```

Extend `PaginatedResponseDto<T>` from `src/common/dto/paginated-response.dto.ts` for all list responses.

---

## Error Response Shape

`AppExceptionFilter` always returns:

```json
{ "statusCode": 404, "path": "/items/abc", "message": "...", "errorCode": "NOT_FOUND" }
```

`errorCode` is optional. Pass it via the exception response object when a machine-readable code is useful. Use `ErrorResponseDto` as the Swagger type on all error responses.

---

## Swagger Requirements

- Controller: `@ApiTags`, `@ApiBadRequestResponse({ type: ErrorResponseDto })`.
- Every route: `@ApiOperation({ summary: '...' })`, `@ApiResponse` for every success status, `@ApiResponse` for every error status (400, 401, 403, 404, 409).
- Auth-protected routes: `@ApiSecurity('api-key')` or `@ApiBearerAuth()` as appropriate.

---

## Backward Compatibility

- Do not remove or rename DTO fields.
- Do not change the type of a field in a breaking way.
- Do not change route paths or HTTP methods without explicit instruction.
- Adding new optional fields to requests or new fields to responses is safe.
- Flag any breaking change explicitly before proceeding.

---

## Migration Policy

Migrations come from the TypeORM CLI only. Do not handwrite or manually edit generated migration files unless explicitly asked. For the full workflow with checklists and safety notes, use the `typeorm-migration-workflow` skill.

**Entity placement:**
- Entities: `src/<domain>/entities/<domain>.entity.ts`. Never in `src/common/` or `src/migrations/`.
- TypeORM discovers entities via glob — `src/**/*.entity.ts` (dev), `dist/**/*.entity.js` (prod).
- `autoLoadEntities: true` in `DatabaseModule`. Do not manually register entities there.
- Register repositories in the domain module via `TypeOrmModule.forFeature([Entity])`.

**Core policy:**
- Generate migrations via CLI, not by hand.
- Do not edit generated migration files unless explicitly asked. If the output is wrong, fix the entity and regenerate.
- Every migration must implement both `up` and `down`.
- `synchronize: false` in all environments — both `DatabaseModule` and both data source files.

**Data source files** (do not alter without explicit instruction):

| File | Used by | Globs |
|---|---|---|
| `src/common/database/data-source.ts` | Dev CLI (ts-node) | `src/**/*.entity.ts`, `src/migrations/*.ts` |
| `src/common/database/data-source-prod.ts` | Prod CLI (compiled) | `dist/**/*.entity.js`, `dist/migrations/*.js` |

**Commands:**

```bash
npm run migration:generate -- src/migrations/DescriptiveName
npm run migration:run
npm run migration:revert
npm run migration:show

# Production (requires npm run build first) — never run without explicit instruction
npm run migration:run:prod
npm run migration:revert:prod
npm run migration:show:prod
```

Migration names must be descriptive: `CreatePublicationsTable`, `AddSlugToAuthors`, `AddFullTextSearch`.

---

## Implementation-Time Testing

When implementing a service, create a co-located `.spec.ts` file. For the standard CRUD test set, test harness structure, and mocking pattern, follow the `minimal-test-strategy` skill.

For non-standard business logic, propose the test cases first and state what each covers before writing them.

---

## Keeping Documentation Updated

- New domain module → update `README.md`
- New environment variable → update `.env.example`
- New integration or convention → update the relevant agent or skill file
