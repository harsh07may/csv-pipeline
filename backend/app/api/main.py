"""FastAPI app for the CSV pipeline: creates the app and plugs in the routers."""
from fastapi import FastAPI

from app.api.routes import health, jobs, uploads

# Tables are created by migrations (`alembic upgrade head`), which run before the server starts.
app = FastAPI(title="CSV Pipeline")

# Every route lives under /api; each module owns one part of the flow.
app.include_router(health.router, prefix="/api")
app.include_router(uploads.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
