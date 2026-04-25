# Skill: backend-review-checklist

Use this skill as the review checklist when running the `code-reviewer` agent. Work through each section and report only actual violations.

---

## Architecture

- [ ] Entities are in `src/<domain>/entities/`. Not in `common/`, not inline.
- [ ] Migrations are in `src/migrations/`. Not inside domain folders.
- [ ] No `synchronize: true` anywhere in any environment.
- [ ] No repository layer. TypeORM `Repository<Entity>` injected directly into services.
- [ ] No business logic in controllers. Controllers delegate to services only.
- [ ] Services use CRUD naming: `create`, `findAll`, `findOne`, `update`, `remove`.
- [ ] Paginated queries use `createQueryBuilder` with `.skip()`, `.take()`, `.getManyAndCount()`.
- [ ] Paginated results returned as `{ data, meta }` with the fixed `meta` shape.
- [ ] Soft deletes via `deletedAt: number | null`. All queries filter `deletedAt IS NULL`.
- [ ] Timestamps are Unix milliseconds (`number`), not `Date` objects.
- [ ] `LoggingService` is instantiated via `useFactory: () => new LoggingService('ContextName')` in the module providers, not injected as a shared singleton.

---

## Controller Thinness

- [ ] Controller methods contain no `if`/`else` beyond auth/routing needs.
- [ ] No database imports or TypeORM usage in controllers.
- [ ] No env variable reads in controllers.
- [ ] No inline validation or business rule evaluation in controllers.

---

## API Contract Consistency

- [ ] Input DTOs use `class-validator` decorators with correct types.
- [ ] Numeric query params use `@Type(() => Number)` and `@IsInt()`.
- [ ] String user inputs trimmed via `@Transform(({ value }) => value?.trim())`.
- [ ] Query DTOs have `page` (default `1`) and `limit` (default `20`), both with `@Min(1)`.
- [ ] All DTO fields have `@ApiProperty` with `description` and `example`.
- [ ] All controller routes have `@ApiOperation`, `@ApiResponse` for each success status.
- [ ] All error responses (400, 401, 403, 404, 409) declared with `@ApiResponse({ type: ErrorResponseDto })`.
- [ ] `@ApiBadRequestResponse({ type: ErrorResponseDto })` applied at controller level.
- [ ] No breaking changes: no removed fields, no renamed fields, no changed field types, no changed routes or methods.

---

## Dependency Hygiene

- [ ] No new packages in `package.json` without explicit instruction.
- [ ] No alternative HTTP client introduced (axios, got, node-fetch). Only `HttpService`.
- [ ] No new global module-level side effects outside established `common/` modules.

---

## Migration Discipline

- [ ] No handwritten migration files present without explicit instruction.
- [ ] No manually edited generated migration files without explicit instruction.
- [ ] All new entities have a corresponding migration in `src/migrations/`.
- [ ] Entity file and migration file committed together.

---

## Documentation Freshness

- [ ] `README.md` updated if: new domain added, behavior changed, new env variable introduced.
- [ ] `.env.example` updated for every new environment variable, with description and safe default.
- [ ] Relevant agent or skill file updated if a new pattern or convention was established.

---

## Comment Quality

- [ ] No multi-line comment blocks that exceed the code they describe.
- [ ] No JSDoc or docstrings on standard CRUD methods.
- [ ] Comments present only where code alone cannot convey intent.
- [ ] No commented-out code.

---

## Test Coverage

- [ ] New service has a co-located `.spec.ts` file.
- [ ] Standard CRUD scenarios covered: happy path, not-found, invalid ID, create, conflict (if applicable), update, soft-delete.
- [ ] Mocks are minimal: repository + logging service only.
- [ ] No tests for behavior the framework guarantees (e.g., `ValidationPipe` input rejection).

---

## Output Format

```
VIOLATIONS:
- <file>:<line> — <what is wrong and why>

OK: <categories with no issues>
```

Report only violations. If none, write: `No violations found.`