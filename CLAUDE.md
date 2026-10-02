# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A CSV order-import pipeline. A React UI uploads a CSV straight to S3-compatible storage (Garage); a FastAPI service tracks the job in Postgres; an RQ worker validates and loads the rows; progress streams back to the browser live. `backend/` is Python 3.13 managed with `uv`; `frontend/` is React 19 + TypeScript + Vite.

## Commands

Everything runs in Docker Compose from the repo root:

```bash
docker compose up -d --build          # api, worker, postgres, redis, garage, garage-webui, jaeger
docker compose logs -f api            # logs are JSON, one object per line
docker compose exec api alembic -c app/alembic.ini revision --autogenerate -m "msg" --rev-id 0002
docker compose exec -T api python -m app.setup_storage   # one-time: bucket CORS for the browser upload
docker compose exec postgres psql -U csv -d csv_pipeline
```

Jaeger (traces) is at http://localhost:16686, API docs at http://localhost:8000/docs. The api container runs `alembic upgrade head` before uvicorn, and `./backend/app` is bind-mounted with `--reload`, so Python edits apply without a rebuild. Rebuild only when `pyproject.toml`/`uv.lock` change.

Backend tests (run from `backend/`; they need no running services):

```bash
uv run pytest                                  # all
uv run pytest tests/test_processing.py::test_rejects_bad_rows   # one test
```

Frontend (run from `frontend/`):

```bash
npm run dev          # Vite on :5173, proxies /api to localhost:8000
npx tsc -b && npx eslint .     # type-check + lint; `npm run build` runs tsc then vite build
```

Demo data: `uv run backend/scripts/generate_sample.py orders.csv 5000` makes a CSV with deliberately broken rows; `JOB=$(./backend/scripts/upload.sh orders.csv)` runs the whole upload flow from the terminal. `frontend/public/sample-orders.csv` is the download-sample button's file.

On Windows Git Bash, prefix `docker compose exec` commands that contain a container path (`/data/...`) with `MSYS_NO_PATHCONV=1`, or the path gets rewritten and fails.

## Architecture

The request flow spans several files:

1. `POST /api/uploads` creates a `Job` row (`awaiting_upload`) and returns a pre-signed PUT URL. The browser uploads **directly to Garage**; the API never sees the bytes. This is why the bucket needs CORS (`app/setup_storage.py`, lost if the `garage-data` volume is wiped).
2. `POST /api/jobs/{id}/start` locks the row (`SELECT ... FOR UPDATE`) so a double click cannot enqueue twice, checks the object exists, commits `queued`, then enqueues. If Redis is down it reverts the status and returns 503.
3. The worker (`python -m app.worker.main`, not the `rq worker` CLI) runs `app.worker.tasks.process_csv`: download to a temp dir, stream the CSV, call `process_row` per row, bulk-insert in batches of 500. Each batch commits the rows and the job's counters in **one transaction**, then publishes a progress event to Redis pub/sub. A retry deletes the job's old rows first, so it is idempotent.
4. `GET /api/jobs/{id}/events` is an SSE stream: subscribe to the Redis channel **first**, then send a DB snapshot, then forward live events. The order matters because pub/sub keeps no history. Its generator is `_event_stream` in `app/api/routes/jobs.py`.
5. `summary` and `rows` endpoints (completed jobs only, via `CompletedJobDep` in `app/api/deps.py`) use Redis cache-aside; a finished job's data never changes.

Rules that are easy to break:

- **The API must not import worker code.** The job is enqueued by the string `PROCESS_CSV_TASK` in `app/core/config.py`; `tests/test_boundaries.py` enforces the separation and `tests/test_task_path.py` checks the string resolves. The second test imports the worker, so it relies on running after the first (alphabetical file order).
- **`app/core/processing.py` is pure** (no DB, no I/O): per-row normalize, validate, business rules. Rules that need other rows (duplicate `order_id`) live in the worker loop.
- **Money is `Decimal`** end to end (`NUMERIC(12,2)` columns, round-half-up). The API's `Money` type in `schemas.py` keeps it exact in Python and serializes it as a plain JSON number, so the frontend gets numbers, not strings.
- **Schema changes go through Alembic** (`app/migrations/`). There is no `create_all`. Only the api container migrates.
- **DB access is sync** (`SessionLocal`, sync routes) except the SSE snapshot, which uses `AsyncSessionLocal`. Both engines point at the same Postgres.
- **`app/core/config.py` reads required env vars at import** (`DATABASE_URL`, `S3_*`), so anything importing it needs them; `tests/conftest.py` sets dummies.

### Observability

`app/core/observability.py` sets up structlog JSON logging (request id, job id, trace id on every line, including uvicorn's and RQ's) and OpenTelemetry tracing to Jaeger. The API stores its trace context in the RQ job's `meta`, and `TracedWorker` in `app/worker/main.py` continues it, so one upload is one trace across both services. SQL spans come from hand-written SQLAlchemy event hooks because the official instrumentation does not support SQLAlchemy 2.1. `.env` sets `OTEL_METRICS_EXPORTER=none` and `OTEL_LOGS_EXPORTER=none` because Jaeger takes traces only and FastAPI would otherwise log a 404 every minute. Tests set `OTEL_SDK_DISABLED=true`.

### Frontend

- The current job id lives in the URL (`?job=<id>`, `hooks/useJobId.ts`), so refresh and bookmarks reopen the job; the data itself is in Postgres.
- Server state (rows, summary, recent jobs, upload mutation) uses TanStack Query in `hooks/`. The live progress stream is a custom `EventSource` hook (`useJobEvents`) because Query is not built for streams. Completed-job queries use `staleTime: Infinity`.
- Types in `src/types.ts` mirror `backend/app/api/schemas.py` by hand; keep them in sync.
- The React Compiler and `react-hooks/set-state-in-effect` lint are on: do not call `setState` synchronously in an effect.

## Conventions

- `.env` is committed despite being in `.gitignore`; it holds demo-only credentials (S3 keys, Postgres, `DATABASE_URL`). Keep `POSTGRES_*` and `DATABASE_URL` in sync.
- The owner prefers plain loops over list comprehensions and does not want functions split into small helpers unless asked. Comments use the `#*` prefix style for explanations.
- Garage's own `db_engine = "sqlite"` in `garage/garage.toml` is Garage's internal metadata store, unrelated to the app database.
