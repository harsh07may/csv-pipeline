"""Logs must be one JSON object per line, carrying the request id and the trace id."""
import io
import json
import logging

import pytest
import structlog
from opentelemetry.sdk.trace import TracerProvider

from app.core import observability


@pytest.fixture
def json_logs(monkeypatch):
    """Configure JSON logging into a buffer for one test, then put the previous setup back."""
    root = logging.getLogger()
    saved_handlers, saved_level = root.handlers[:], root.level
    buffer = io.StringIO()
    monkeypatch.setattr(observability, "LOG_FORMAT", "json")
    observability.configure_logging("test-service", stream=buffer)

    def lines():
        return [json.loads(line) for line in buffer.getvalue().splitlines() if line.strip()]

    yield lines
    root.handlers, root.level = saved_handlers, saved_level
    structlog.contextvars.clear_contextvars()


def test_log_line_is_json_with_bound_context(json_logs):
    structlog.contextvars.bind_contextvars(request_id="abc123")
    structlog.get_logger("app.test").info("job_queued", job_id="j1")

    (line,) = json_logs()
    assert line["event"] == "job_queued"
    assert line["job_id"] == "j1"
    assert line["request_id"] == "abc123"
    assert line["service"] == "test-service"
    assert line["level"] == "info"
    assert line["timestamp"].endswith("Z")


def test_plain_logging_records_get_the_same_format(json_logs):
    logging.getLogger("rq.worker").warning("something from a library")

    (line,) = json_logs()
    assert line["event"] == "something from a library"
    assert line["logger"] == "rq.worker"
    assert line["service"] == "test-service"


def test_log_line_carries_the_active_trace_ids(json_logs, monkeypatch):
    monkeypatch.delenv("OTEL_SDK_DISABLED")   # the test suite turns the SDK off; we need real spans
    tracer = TracerProvider().get_tracer("test")

    with tracer.start_as_current_span("work") as span:
        structlog.get_logger("app.test").info("inside_span")
        expected = format(span.get_span_context().trace_id, "032x")

    (line,) = json_logs()
    assert line["trace_id"] == expected
    assert len(line["span_id"]) == 16
