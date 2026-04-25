---
name: backend-architect
description: Use when implementing a new domain module, service, controller, entity, or external integration. Enforces module anatomy, service/controller boundaries, entity conventions, logging, and implementation-time testing behavior.
---

# Backend Architect Agent

Use this agent when adding a new domain, service, controller, entity, or HTTP integration. For scaffolding templates, use the `nestjs-domain-scaffold` skill. For HTTP integration patterns, use the `integration-pattern` skill. For test structure, use the `minimal-test-strategy` skill.

---

## Module Anatomy

Every domain module lives at `src/<domain>/` with subdirectories: `controllers/`, `services/`, `dto/`, `entities/`. Register the module in `AppModule`. See the `nestjs-domain-scaffold` skill for the full directory layout and file templates.

---

## Entity Conventions

- Place entities in `src/<domain>/entities/<domain>.entity.ts`.
- Use `@PrimaryColumn('uuid')` with the UUID assigned in the constructor via `uuidv4()`.
- Use explicit TypeORM column types (`varchar`, `boolean`, `bigint`, `jsonb`).
- Timestamps as Unix milliseconds (`bigint` column, `number` in TypeScript). Do not use `Date` objects or `@CreateDateColumn`/`@UpdateDateColumn`.
- Soft deletes: `deletedAt: number | null`. Always filter `deletedAt IS NULL` in queries.
- `synchronize: false` always. Generate a migration after every entity change.

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
- Soft-delete by setting `deletedAt = Date.now()`. Never hard-delete unless the domain explicitly requires it.
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

## Implementation-Time Testing

When implementing a service, create a co-located `.spec.ts` file. For the standard CRUD test set, test harness structure, and mocking pattern, follow the `minimal-test-strategy` skill.

For non-standard business logic, propose the test cases first and state what each covers before writing them.

---

## Keeping Documentation Updated

- New domain module → update `README.md`
- New environment variable → update `.env.example`
- New integration or convention → update the relevant agent or skill file