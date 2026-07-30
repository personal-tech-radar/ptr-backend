---
name: manage-typeorm-migration
description: Plan, generate, inspect, apply, revert, or verify TypeORM migrations for entity and schema changes in this repository. Use whenever an entity, relation, index, table, or database column changes. Do not use for data-only seed synchronization.
---

# Manage a TypeORM Migration

## Rules

- Keep `synchronize: false` everywhere.
- Generate migrations with the TypeORM CLI.
- Do not handwrite or manually edit migrations unless explicitly required by a case the generator cannot safely express.
- Fix entity definitions and regenerate incorrect output.
- Require both `up` and `down`.
- Commit entity and migration changes together.

## Workflow

1. Make the entity change.
2. Run `npm run migration:generate -- src/migrations/DescriptiveName`.
3. Review the generated migration for unintended drops, coercions, defaults, and constraints.
4. Verify `down` reverses `up`.
5. Run `npm run migration:show`.
6. Apply locally with `npm run migration:run`.
7. Inspect the resulting schema.
8. Revert locally when reversal behavior needs verification.

Production commands require a successful build and explicit authorization.

## Risk

- Add nullable columns or new tables directly when safe.
- For non-null columns on populated tables, add nullable, backfill, then constrain.
- Remove columns through staged deployment when data loss matters.
- Treat type changes as compatibility migrations.
- For large indexes, assess blocking risk and use an explicitly approved specialized migration when concurrency is needed.
- Separate schema and data migrations unless atomicity requires combining them.
