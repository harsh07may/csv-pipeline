"""Structured logs and distributed tracing, set up once per process.

Logs: every line is one JSON object (event + fields), including the request id and the
trace id of the span that was active, so a log line can be matched to its trace.
Traces: OpenTelemetry spans for HTTP requests, SQL queries and S3 calls, exported to Jaeger.

Call `setup_observability("<service name>")` at the top of each entry point (API, worker).
"""
import logging
import os
import sys

import structlog
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.botocore import BotocoreInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from sqlalchemy import event
from sqlalchemy.engine import Engine

from .config import LOG_FORMAT, LOG_LEVEL


# --- Logging ---------------------------------------------------------------------------
def _add_trace_ids(_logger, _method, event_dict):
    """Stamp the active span's ids on the log line, to jump from a log to its trace."""
    context = trace.get_current_span().get_span_context()
    if context.is_valid:
        event_dict["trace_id"] = format(context.trace_id, "032x")
        event_dict["span_id"] = format(context.span_id, "016x")
    return event_dict


def configure_logging(service: str, stream=None) -> None:
    """Route every log (ours, uvicorn's, RQ's, SQLAlchemy's) through one structlog formatter.

    `stream` is where lines are written (stdout by default); tests pass their own.
    """

    def add_service(_logger, _method, event_dict):
        event_dict["service"] = service
        return event_dict

    shared = [
        structlog.contextvars.merge_contextvars,     # request_id, job_id ... bound for this request/job
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        add_service,
        _add_trace_ids,
    ]
    structlog.configure(
        processors=[*shared, structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    if LOG_FORMAT == "json":
        renderer = structlog.processors.JSONRenderer()
        final = [structlog.processors.format_exc_info, renderer]   # tracebacks as a JSON field
    else:
        final = [structlog.dev.ConsoleRenderer()]                   # colourful, for local dev

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared,   # plain `logging` records (uvicorn, rq, ...) get the same fields
        processors=[structlog.stdlib.ProcessorFormatter.remove_processors_meta, *final],
    )
    handler = logging.StreamHandler(stream or sys.stdout)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(LOG_LEVEL)

    # Uvicorn installs its own handlers; hand its logs to the root handler instead.
    for name in ("uvicorn", "uvicorn.error"):
        logging.getLogger(name).handlers = []
        logging.getLogger(name).propagate = True
    # Our request middleware logs each request with more detail (id, duration, trace).
    logging.getLogger("uvicorn.access").disabled = True


# --- Tracing ---------------------------------------------------------------------------
def _trace_sql(engine: Engine) -> None:
    """One span per SQL statement, nested under the request or job that ran it.

    Done with SQLAlchemy's own event hooks because the ready-made OpenTelemetry package
    does not support SQLAlchemy 2.1 yet. Only the statement text is recorded, never the
    parameter values, so no customer data ends up in a trace.
    """
    tracer = trace.get_tracer("app.sql")

    @event.listens_for(engine, "before_cursor_execute")
    def start_span(_conn, _cursor, statement, _parameters, context, _executemany):
        verb = statement.lstrip().split(None, 1)[0].upper() if statement.strip() else "SQL"
        context._otel_span = tracer.start_span(
            f"db {verb}",
            attributes={"db.system": "postgresql", "db.statement": statement[:1000]},
        )

    @event.listens_for(engine, "after_cursor_execute")
    def end_span(_conn, _cursor, _statement, _parameters, context, _executemany):
        span = getattr(context, "_otel_span", None)
        if span is not None:
            span.end()

    @event.listens_for(engine, "handle_error")
    def fail_span(exception_context):
        execution = exception_context.execution_context
        span = getattr(execution, "_otel_span", None) if execution is not None else None
        if span is not None:
            span.record_exception(exception_context.original_exception)
            span.set_status(Status(StatusCode.ERROR))
            span.end()


def configure_tracing(service: str) -> None:
    """Send spans to the OTLP endpoint (Jaeger). Standard OTEL_* env vars choose where.

    Setting OTEL_SDK_DISABLED=true turns this off (the tests do).
    """
    if os.getenv("OTEL_SDK_DISABLED", "").lower() == "true":
        return   # no provider, no exporter thread, nothing instrumented

    from .db import async_engine, engine   # imported here: db needs settings that tests set late

    provider = TracerProvider(resource=Resource.create({"service.name": service}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)

    # One span per SQL statement and per S3 call, nested under whatever request/job runs them.
    _trace_sql(engine)
    _trace_sql(async_engine.sync_engine)
    BotocoreInstrumentor().instrument()


def setup_observability(service: str) -> None:
    configure_logging(service)
    configure_tracing(service)
