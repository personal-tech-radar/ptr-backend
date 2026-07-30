---
name: verify-docker-runtime
description: Boot and verify ptr-backend against its project-specific Docker test stack. Use for runtime-relevant changes involving NestJS module wiring, migrations, PostgreSQL, Redis, queues, startup configuration, or when explicitly asked to run the service locally. Do not use for documentation-only or static instruction changes.
---

# Verify the Docker Runtime

Recheck `docker-compose.test.yml` and `.env.example` before relying on these assumptions.

## Stack

- Use PostgreSQL and Redis.
- Do not add MinIO unless current domain code actually uses `S3StorageService`.
- The app is published on host port `3300`; PostgreSQL and Redis need no host ports.
- Use non-empty local placeholders for `OPENAI_API_KEY` and `RESEND_API_KEY`.
- Use `DB_NAME=ptr`.
- Never expose or modify the real `.env`.

The bind-mounted repository may allow `dotenv` to fill variables omitted by Compose from the developer's `.env`. Treat the effective environment carefully.

## Run

1. Start with `docker compose -f docker-compose.test.yml up -d --wait`.
2. Ensure the app command builds, runs migrations, and starts production output.
3. Poll `http://localhost:3300/health`.
4. Run e2e tests only when their configuration exists.
5. On failure, inspect `docker compose -f docker-compose.test.yml logs`.
6. Always tear down with `docker compose -f docker-compose.test.yml down -v`.

Do not repair application logic while performing an independent runtime check unless the task explicitly includes the fix. Report reproducible application failures with relevant logs.
