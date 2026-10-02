"""One structured log line per HTTP request, plus a request id to follow it through the logs."""
import time
import uuid

import structlog
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

log = structlog.get_logger("app.request")
QUIET_PATHS = {"/api/health"}   # polled constantly: log at debug so they don't drown real traffic


class RequestLogMiddleware:
    """Plain ASGI middleware (not BaseHTTPMiddleware), so streaming responses (SSE) stay intact."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope["headers"])
        request_id = headers.get(b"x-request-id", b"").decode() or uuid.uuid4().hex[:16]
        structlog.contextvars.bind_contextvars(request_id=request_id)   # on every log line below
        started = time.perf_counter()
        status = 500   # what we report if the app dies before sending a response

        async def send_with_request_id(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                MutableHeaders(scope=message)["X-Request-ID"] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        except Exception:
            log.exception("request_crashed", method=scope["method"], path=scope["path"])
            raise
        finally:
            level = "debug" if scope["path"] in QUIET_PATHS else "info"
            getattr(log, level)(
                "request",
                method=scope["method"],
                path=scope["path"],
                status=status,
                duration_ms=round((time.perf_counter() - started) * 1000, 1),
            )
            structlog.contextvars.clear_contextvars()
