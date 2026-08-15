# Skill: seed-data-sync-pattern

Use this skill when a domain needs reference or seed data — lookup lists, curated initial records, anything an operator will hand-tune after creation. Covers the manifest shape, matching strategy, and the idempotent sync CLI, as an alternative to implicit "seed if empty" bootstrap logic.

---

## Why Not Implicit Seed-on-Empty

Do not seed data with an `if (count === 0) seed()` check in application bootstrap. It is silently non-idempotent: a legitimate delete-all reseeds on the next boot, and there is no way to add new reference rows to an already-populated table without hand-editing the database. Replace it with an explicit, re-runnable sync command instead.

---

## Manifest

- Reference data lives in a versioned file under `config/` (e.g. `config/<domain>.manifest.json`), not hardcoded in a service or bootstrap file.
- Give the manifest a `version` field and an envelope (`{ version, <items>: [...] }`), not a bare array — this lets a future format change be detected and handled explicitly instead of guessed at.
- Each entry carries a stable `seedKey` (a slug, not a DB id) for tracking/logging purposes, even if it isn't the sync's matching key (see below).

---

## Matching Existing Rows

Prefer matching against a real unique business key the schema already enforces (e.g. a `url` unique column), not a new `seedKey` column added purely for seed-matching — that's a schema change most seed-sync work doesn't need. Only add a dedicated matching column if no existing unique constraint captures entry identity.

Known limitation of matching-by-business-key: if that key changes in the manifest, sync treats the entry as new rather than updating the old row. Document this; treat retiring the old row as a deliberate operator action, not something sync infers.

---

## Declarative vs. Operational Fields

Split each entry's fields into two groups on every sync:

- **Declarative** (name, category, url, ...) — always synced from the manifest on every run.
- **Operational** (enabled, trustScore, or any other field an operator tunes at runtime) — only synced when the command is run with an explicit `--force` flag.

Build the update DTO by only including operational fields when `force` is true (don't pass them as `undefined` — omit the keys entirely) so a partial-assignment update (`Object.assign(entity, dto)`) leaves operator-tuned state untouched on a normal re-run.

---

## Sync Command

- Implement sync as a CLI entrypoint (`src/seeds/sync-<domain>.ts`, wired to an npm script), not code that runs automatically on app boot.
- Bootstrap the **real** `AppModule` via `NestFactory.createApplicationContext(AppModule)`, not a hand-picked module subset — so the sync resolves the exact same provider graph as the running server. Close the app context in a `finally` block.
- Guard direct execution with `if (require.main === module)` so the sync service and manifest loader stay importable from tests without triggering a full bootstrap.
- Continue on a per-entry error: one bad manifest entry must not abort the rest of the run. Collect a summary (created / updated / failed with reasons) and log it at the end.
- Validate each entry's shape explicitly before use. A sync command typically builds DTOs by hand and calls the service directly, bypassing the HTTP layer's `ValidationPipe` — so nothing else enforces the entry's contract.

---

## Reference Implementation

See `src/sources/services/source-sync.service.ts` (manifest loading, validation, declarative/operational split, matching) and `src/seeds/sync-sources.ts` (CLI entrypoint) for a full worked example.
