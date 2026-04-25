---
name: migrations
description: Use when creating entities, changing the schema, or running migrations. Covers entity placement, CLI-only generation policy, data source files, and schema safety.
---

# Migrations Agent

Migrations come from the TypeORM CLI only. Do not handwrite or manually edit generated migration files unless explicitly asked. For the full workflow with checklists and safety notes, use the `typeorm-migration-workflow` skill.

---

## Entity Placement

- Entities: `src/<domain>/entities/<domain>.entity.ts`. Never in `src/common/` or `src/migrations/`.
- TypeORM discovers entities via glob — `src/**/*.entity.ts` (dev), `dist/**/*.entity.js` (prod).
- `autoLoadEntities: true` in `DatabaseModule`. Do not manually register entities there.
- Register repositories in the domain module via `TypeOrmModule.forFeature([Entity])`.

---

## Core Policy

- **Generate migrations via CLI, not by hand.**
- **Do not edit generated migration files** unless explicitly asked. If the output is wrong, fix the entity and regenerate.
- Every migration must implement both `up` and `down`.
- `synchronize: false` in all environments — both `DatabaseModule` and both data source files.

---

## Data Source Files

| File | Used by | Globs |
|---|---|---|
| `src/common/database/data-source.ts` | Dev CLI (ts-node) | `src/**/*.entity.ts`, `src/migrations/*.ts` |
| `src/common/database/data-source-prod.ts` | Prod CLI (compiled) | `dist/**/*.entity.js`, `dist/migrations/*.js` |

Do not alter these files without explicit instruction.

---

## Commands

```bash
npm run migration:generate -- src/migrations/DescriptiveName
npm run migration:run
npm run migration:revert
npm run migration:show

# Production (requires npm run build first)
npm run migration:run:prod
npm run migration:revert:prod
npm run migration:show:prod
```

Migration names must be descriptive: `CreatePublicationsTable`, `AddSlugToAuthors`, `AddFullTextSearch`.