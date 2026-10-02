# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A CSV order-import pipeline. A React UI uploads a CSV straight to S3-compatible storage (Garage); an Express API tracks the job in Postgres; a BullMQ worker validates and loads the rows; progress streams back to the browser live. `backend/` is Node 22 + TypeScript (one package, two entry points: API and worker); `frontend/` is React 19 + TypeScript + Vite.

## Commands

Everything runs in Docker Compose from the repo root:

```bash
docker compose up -d --build          # api, worker, postgres, redis, garage, garage-webui, jaeger
docker compose logs -f api            # logs are JSON, one object per line
docker compose exec api npx drizzle-kit generate --name msg   # SQL migration from changes in src/schema.ts
docker compose exec -T api npm run setup-storage   # one-time: bucket CORS for the browser upload
docker compose exec postgres psql -U csv -d csv_pipeline
```

Jaeger (traces) is at http://localhost:16686. The api container runs `npm run migrate` before `tsx watch`, and `./backend/src` is bind-mounted, so TypeScript edits apply without a rebuild. Rebuild only when `package.json`/`package-lock.json` change.

There is no test suite for the backend. Check it from `backend/` with:

```bash
npm run typecheck && npm run lint && npm run build
```

Frontend (run from `frontend/`):

```bash
npm run dev          # Vite on :5173, proxies /api to localhost:8000
npx tsc -b && npx eslint .     # type-check + lint; `npm run build` runs tsc then vite build
```

Demo data: `python3 backend/scripts/generate_sample.py orders.csv 5000` (or `uv run`) makes a CSV with deliberately broken rows; `JOB=$(bash backend/scripts/upload.sh orders.csv)` runs the whole upload flow from the terminal. `frontend/public/sample-orders.csv` is the download-sample button's file.

On Windows Git Bash, prefix `docker compose exec` commands that contain a container path (`/data/...`) with `MSYS_NO_PATHCONV=1`, or the path gets rewritten and fails.

## Architecture

The request flow spans several files:

1. `POST /api/uploads` creates a `Job` row (`awaiting_upload`) and returns a pre-signed PUT URL. The browser uploads **directly to Garage**; the API never sees the bytes. This is why the bucket needs CORS (`backend/src/setupStorage.ts`, lost if the `garage-data` volume is wiped).
2. `POST /api/jobs/{id}/start` locks the row (`SELECT ... FOR UPDATE`) so a double click cannot enqueue twice, checks the object exists, commits `queued`, then enqueues. If Redis is down it reverts the status and returns 503.
3. The worker (`backend/src/worker/index.ts`) runs `processCsv` from `worker/tasks.ts`: download to a temp dir, stream the CSV with `csv-parse`, call `processRow` per row, bulk-insert in batches of 500. Each batch commits the rows and the job's counters in **one transaction**, then publishes a progress event to Redis pub/sub. A retry deletes the job's old rows first, so it is idempotent. The job timeout (10 min) is checked between batches, since JavaScript cannot kill a running task.
4. `GET /api/jobs/{id}/events` is an SSE stream: subscribe to the Redis channel **first**, then send a DB snapshot, then forward live events. The order matters because pub/sub keeps no history. It lives in `src/api/routes/jobs.ts`; updates that arrive while the snapshot is read wait in a buffer.
5. `summary` and `rows` endpoints (completed jobs only, via `loadJob`/`requireCompleted` in `src/api/jobs.ts`) use Redis cache-aside; a finished job's data never changes.

Rules that are easy to break:

- **The API must not import worker code.** The job is enqueued by the name `PROCESS_CSV_JOB` in `src/config.ts`; nothing under `src/api` may import `src/worker`. There is no test for it, so check imports by eye.
- **`src/processing.ts` is pure** (no DB, no I/O): per-row normalize, validate, business rules. Rules that need other rows (duplicate `order_id`) live in the worker loop.
- **Money is `decimal.js` / exact strings** end to end (`NUMERIC(12,2)` columns with Drizzle `mode: "string"`, round-half-up). The routes turn them into plain JSON numbers at the very last step, so the frontend gets numbers, not strings.
- **Schema changes go through Drizzle** (`src/schema.ts`, SQL files in `backend/drizzle/`). `0000_baseline.sql` is idempotent, so it is a no-op on a database the old Alembic setup created. There is no `create_all`. Only the api container migrates.
- **`src/config.ts` reads required env vars at import** (`DATABASE_URL`, `S3_*`), so anything importing it needs them. A `postgresql+psycopg://` URL from the old setup is accepted too.
- **Entry points import `./init` then `../tracing` first**, in separate imports so the service name is set and the instrumentations hook express, pg and ioredis before they load.

### Observability

`src/logger.ts` sets up pino JSON logging (request id, job id and trace id on every line, bound per request/job with `AsyncLocalStorage`) and `src/tracing.ts` sets up OpenTelemetry tracing to Jaeger with the ready-made express, http, pg, ioredis and AWS SDK instrumentations. The API puts its trace context in the BullMQ job data and the worker continues it, so one upload is one trace across both services. `.env` sets `OTEL_METRICS_EXPORTER=none` and `OTEL_LOGS_EXPORTER=none` because Jaeger takes traces only. `OTEL_SDK_DISABLED=true` turns tracing off.

### Frontend

- The current job id lives in the URL (`?job=<id>`, `hooks/useJobId.ts`), so refresh and bookmarks reopen the job; the data itself is in Postgres.
- Server state (rows, summary, recent jobs, upload mutation) uses TanStack Query in `hooks/`. The live progress stream is a custom `EventSource` hook (`useJobEvents`) because Query is not built for streams. Completed-job queries use `staleTime: Infinity`.
- Types in `src/types.ts` mirror the response shapes in `backend/src/api` by hand; keep them in sync.
- The React Compiler and `react-hooks/set-state-in-effect` lint are on: do not call `setState` synchronously in an effect.

## Conventions

- `.env` is committed despite being in `.gitignore`; it holds demo-only credentials (S3 keys, Postgres, `DATABASE_URL`, a plain `postgresql://` URL). Keep `POSTGRES_*` and `DATABASE_URL` in sync.
- The owner prefers plain loops over `map`/`filter` chains where practical and does not want functions split into small helpers unless asked. Explanatory comments use the `//*` prefix style.
- Garage's own `db_engine = "sqlite"` in `garage/garage.toml` is Garage's internal metadata store, unrelated to the app database.
