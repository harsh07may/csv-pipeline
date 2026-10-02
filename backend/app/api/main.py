"""FastAPI app for the CSV pipeline: creates the app and plugs in the routers."""
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes import health, jobs, uploads
from app.core.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()   # create tables on startup (use Alembic on prod)
    yield


app = FastAPI(title="CSV Pipeline", lifespan=lifespan)

# Every route lives under /api; each module owns one part of the flow.
app.include_router(health.router, prefix="/api")
app.include_router(uploads.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
