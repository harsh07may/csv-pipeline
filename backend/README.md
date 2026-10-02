# CSV Pipeline Backend

Node.js 22 + TypeScript: an Express API (`src/api`) and a BullMQ worker (`src/worker`).

- `docker compose up -d --build` starts the backend (api, worker, Postgres, Redis, Garage, Jaeger).
- `docker compose logs -f api` shows the logs of the API (JSON, one object per line).
- `docker compose exec -T api npm run setup-storage` sets the bucket CORS once, so the browser can upload.
- `npm run typecheck && npm run lint` check the code; `npm run build` compiles it to `dist/`.

See the [Dockerfile](./Dockerfile) for the dev and production images.
