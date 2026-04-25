# Skill: typeorm-migration-workflow

Use this skill when making entity changes or running migrations. It covers the end-to-end workflow, safety rules, and post-generation checklist.

---

## Core Rules

- **Never handwrite migration files by default.** The CLI diffs entity definitions against the database schema and produces the correct output.
- **Never manually edit generated migrations by default.** If the output is incorrect, fix the entity and regenerate.
- Every migration must implement both `up` and `down`.
- `synchronize: false` in all environments. Never change this.

---

## Step-by-Step Workflow

1. **Write entity changes** — add or modify fields, relations, or indexes in the entity file.
2. **Generate the migration:**
   ```bash
   npm run migration:generate -- src/migrations/DescriptiveName
   ```
   Name must describe the change: `CreateItemsTable`, `AddSlugToItems`, `AddFullTextSearchIndex`.

3. **Review the generated file** — open it and verify:
   - `up` creates exactly what was intended
   - `down` fully reverses the change
   - No unexpected columns, drops, or type changes
   - Column types match entity definitions

4. **Apply locally:**
   ```bash
   npm run migration:run
   ```

5. **Verify the schema** — inspect the affected table to confirm structure is correct.

6. **Commit together** — entity file and migration file in the same commit.

---

## Data Source Files

| File | Used by | Globs |
|---|---|---|
| `src/common/database/data-source.ts` | Dev CLI (via ts-node) | `src/**/*.entity.ts`, `src/migrations/*.ts` |
| `src/common/database/data-source-prod.ts` | Prod CLI (compiled JS) | `dist/**/*.entity.js`, `dist/migrations/*.js` |

Prod commands require `npm run build` first.

---

## Commands Reference

```bash
# Development
npm run migration:generate -- src/migrations/Name
npm run migration:run
npm run migration:revert
npm run migration:show

# Production
npm run migration:run:prod
npm run migration:revert:prod
npm run migration:show:prod
```

---

## Schema Change Safety

| Change type | Risk | Approach |
|---|---|---|
| New nullable column | Safe | Single migration |
| New table | Safe | Single migration |
| New non-null column on existing table | Risky | Add nullable first, backfill, then add constraint in separate migration |
| Drop column | Destructive | Make nullable first and deploy, then drop in separate migration |
| Type change | Risky | Verify compatibility; prefer additive approach |
| Index on large table | Potentially blocking | Use `CONCURRENTLY` in raw SQL; request explicit handwritten migration |
| Schema + data change | Mixed | Split into separate migrations unless truly atomic |

---

## Post-Generation Review Checklist

- [ ] `up` produces only the intended changes
- [ ] `down` fully reverses the change
- [ ] No unintended column drops or type coercions
- [ ] Column types match entity field decorators exactly
- [ ] Migration name is descriptive
- [ ] `npm run migration:show` lists it as pending
- [ ] `npm run migration:run` applies without error locally