---
name: sync-seed-data
description: Implement or modify versioned reference-data manifests and explicit idempotent synchronization commands. Use for curated lookup data, default catalog entries, source manifests, or operator-maintained seed records. Do not use for test fixtures or transient development data.
---

# Synchronize Seed Data

Do not seed implicitly during application startup or based on an empty-table check.

## Manifest

- Store versioned manifests under `config/`.
- Use an envelope with a version and named item collection.
- Give entries stable human-readable `seedKey` values.
- Match existing rows by a schema-enforced business key when possible.
- Document that changing a matching business key creates a new row unless explicitly reconciled.

## Field ownership

- Synchronize declarative fields on every run.
- Preserve operator-controlled fields by default.
- Update operational fields only under an explicit `--force` option.
- Omit preserved keys from update objects instead of passing `undefined`.

## Command

- Implement an explicit CLI entry point under `src/seeds/`.
- Bootstrap the real `AppModule` with `createApplicationContext`.
- Close the application context in `finally`.
- Guard direct execution with `require.main === module`.
- Validate every manifest entry because the HTTP validation pipe is bypassed.
- Continue after per-entry failures and report created, updated, unchanged, and failed totals.

Test manifest validation, idempotent reruns, normal preservation of operational fields, and forced synchronization.
