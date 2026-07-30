---
name: review-backend-change
description: Review a backend diff or implementation in this NestJS repository for concrete architecture, API-contract, migration, dependency, documentation, test, security, and scope violations. Use after regular or substantial backend changes and when explicitly asked for code review. Do not use for prose-only documentation review.
---

# Review a Backend Change

Inspect the actual diff and relevant neighboring code. Report defects, not style preferences.

## Architecture

- Keep entities in domain modules and migrations in `src/migrations/`.
- Keep `synchronize: false`.
- Inject TypeORM repositories directly.
- Keep controllers free of business logic and database access.
- Use database-generated UUIDs and TypeORM `Date` timestamp decorators.
- Use `@DeleteDateColumn` and TypeORM soft-delete behavior.
- Keep slow or hang-prone jobs isolated from unrelated work.

## API contracts

- Validate and trim inputs.
- Transform numeric query parameters explicitly.
- Preserve the standard pagination shape.
- Check success and error Swagger declarations.
- Flag removed or renamed fields, changed types, routes, or methods unless explicitly approved.

## Safety and maintenance

- Flag unauthorized dependencies or alternative HTTP clients.
- Verify migrations were generated, reviewed, and committed with entity changes.
- Verify required-secret handling fails safely.
- Check `README.md`, `.env.example`, `CHANGELOG.md`, and instructions when affected.
- Reject commented-out code, redundant framework tests, and explanatory clutter.
- Check focused tests for new behavior.
- Compare the implementation with the approved scope and definition of done.

## Output

List findings by severity with file and line references. Explain impact and the smallest appropriate correction. If there are no findings, say so directly.
