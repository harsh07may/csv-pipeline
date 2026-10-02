"""FastAPI app for the CSV pipeline: creates the app and plugs in the routers."""
from fastapi import FastAPI
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from app.api.middleware import RequestLogMiddleware
from app.api.routes import health, jobs, uploads
from app.core.observability import setup_observability

setup_observability("csv-api")   # logs + traces, before anything starts handling requests

# Tables are created by migrations (`alembic upgrade head`), which run before the server starts.
app = FastAPI(title="CSV Pipeline")

app.add_middleware(RequestLogMiddleware)
# One span per request. Health checks and the long-lived SSE stream would only add noise.
FastAPIInstrumentor.instrument_app(
    app,
    excluded_urls="/api/health,/events",
    exclude_spans=["send", "receive"],   # skip the empty per-message ASGI spans
)

# Every route lives under /api; each module owns one part of the flow.
app.include_router(health.router, prefix="/api")
app.include_router(uploads.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
