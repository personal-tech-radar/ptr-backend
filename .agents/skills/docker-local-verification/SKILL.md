---
name: docker-local-verification
description: Use this skill to launch, run, boot, or verify ptr-backend locally via Docker before shipping a change — it covers the project-specific docker-compose.test.yml stack (Postgres + Redis, no MinIO), the exact env vars this app needs to boot, host-port conflicts to expect on a dev machine already running other local stacks, and a dotenv/bind-mount gotcha. This is the project skill the general-purpose `run` skill should find so it doesn't fall back to a generic server pattern.
---

# Skill: docker-local-verification

Use this skill when running the `qa-runner` agent, or when asked to launch/boot/verify ptr-backend locally. It documents what was actually needed to get this specific app running against real infrastructure — `qa-runner.md`'s generic spec assumes Postgres/Redis/MinIO; this project needed less than that, plus a few adjustments its generic template didn't anticipate.

---

## Why `docker-compose.test.yml` omits MinIO

The base template wires a global `S3Module`/`S3StorageService`, but nothing in `ptr-backend`'s own domain code (`sources`, `articles`, `digest`, `ai-analysis`, `feed-fetcher`, `mail`, `queue`, `scheduler`) calls it — only `app.module.ts` registers it, exactly as scaffolded. `S3StorageService`'s constructor checks for `S3_ENDPOINT`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`; if any are missing it logs a message and sets `isConfigured = false` rather than throwing. So the app boots cleanly with **no S3/MinIO service in the compose stack at all** and no `S3_*` env vars set. If a future domain module starts actually calling `S3StorageService`, add MinIO back and set the `S3_*` vars — until then, don't reintroduce it just because the generic `qa-runner.md` template stack includes it.

## Env vars actually required to reach `/health`

Postgres and Redis are hard requirements (`DatabaseModule`/`TypeOrmModule` and `BullModule.forRoot` both connect at boot). Beyond those:

- `OPENAI_API_KEY` **must be a non-empty string** — `AiAnalysisService.onModuleInit()` does `new OpenAI({ apiKey: process.env.OPENAI_API_KEY })`, and the OpenAI SDK throws synchronously at construction time if the key is empty/undefined. It does **not** need to be a real/valid key — no network call happens at boot, only when analysis actually runs — but it can't be blank. A placeholder like `sk-local-test-placeholder` is enough.
- `RESEND_API_KEY` — `MailService`'s constructor does `new Resend(process.env.RESEND_API_KEY)` eagerly too. Set a placeholder for the same reason, even though this SDK's constructor is more forgiving than OpenAI's.
- `DB_NAME` must be `ptr` to match this project's actual default (not the generic template's `myapp`).
- `API_KEY`, `APP_URL`, `FEEDBACK_TOKEN`, `DIGEST_FROM_EMAIL`, `DIGEST_TO_EMAIL` — no boot-time validation, but set them anyway so routes that depend on them don't 500 immediately if you poke past `/health`.
- Cron vars (`FETCH_CRON`, `DIGEST_CRON`, etc.) and Playwright/AI-fallback vars all have safe code-level defaults — no need to set them for a boot check.

None of the above need MinIO or real third-party credentials to get a 200 from `GET /health`.

## Migration step is required before the app can boot cleanly

`npm run migration:run` must run against the fresh Postgres container before `start:prod`, or the app fails on its first query with `relation does not exist`. `docker-compose.test.yml`'s `app` service command is:

```
npm ci && npm run build && npm run migration:run && npm run start:prod
```

Verified end-to-end on a clean stack: all 5 existing migrations run cleanly in order (`CreateSourcesTable`, `AddSkippedToArticleStatus`, `AddBuildDebugToDigests`, `AddArticleRelevanceTable`, `AddArticleFeedbackTable`), then Nest starts, all modules initialize, and `GET /health` returns `{"appName":"ptr-backend","environment":"development","uptime":...}`.

## Expect host-port conflicts on this machine (and probably other dev machines)

A developer machine running this project often already has other things bound to the default ports: another Docker stack, a local dev Postgres/Redis, etc. `docker-compose.test.yml` therefore:

- Publishes **no host port** for `postgres` or `redis` — the `app` service reaches them over the compose network by service name (`postgres`, `redis`), so host publishing isn't needed for the boot check itself, and skipping it avoids fighting over 5432/6379.
- Publishes the app on host port **3300**, not 3000 (`3300:3000` — poll `http://localhost:3300/health`, not `:3000`). Adjust if 3300 is also taken locally, but don't default back to `3000` without checking first (`lsof -nP -iTCP:3000 -sTCP:LISTEN`).

## Bind-mount + `dotenv/config()` gotcha

`docker-compose.test.yml` bind-mounts the whole repo (`.:/app`), and `main.ts` calls `import 'dotenv/config'` before anything else. `dotenv` only fills in vars **not already set** in `process.env` — compose's `environment:` block wins for anything it defines, but any var compose doesn't set gets filled from whatever real `.env` file happens to be sitting in the repo root at run time. In practice this means the container may pick up more configuration than the compose file explicitly states (during verification, `S3StorageService` logged `S3 client initialized` even though the compose file sets no `S3_*` vars, because the developer's own local `.env` had them). This is generally harmless for a throwaway local verification run, but:
- Don't assume the compose file is the complete picture of what's actually running — a real `.env` in the repo root fills gaps silently.
- If the real `.env` ever contains genuinely sensitive production secrets, be aware they'd be readable inside this throwaway container too. Don't run this stack against a repo checkout whose `.env` you wouldn't want inside a disposable container.

## Verified working sequence

```bash
docker compose -f docker-compose.test.yml up -d --wait
curl http://localhost:3300/health   # expect 200 after ~1 minute (npm ci + build + migrate)
docker compose -f docker-compose.test.yml logs app
docker compose -f docker-compose.test.yml down -v
```

`npm run test:e2e` is referenced by `package.json` but `test/jest-e2e.json` and the `test/` directory don't exist yet in this repo — per `qa-runner.md`, skip this step silently rather than failing on it.
