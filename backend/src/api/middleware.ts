// One structured log line per HTTP request, plus a request id to follow it through the logs.
import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

import { getLogger, logContext } from "../logger";

const log = getLogger("app.request");
const QUIET_PATHS = ["/api/health"]; // polled constantly: log at debug so they don't drown real traffic

export const requestLog: RequestHandler = (req, res, next) => {
  const requestId = req.get("x-request-id") || randomUUID().replaceAll("-", "").slice(0, 16);
  res.setHeader("X-Request-ID", requestId);
  const started = performance.now();

  res.on("close", () => {
    const path = req.originalUrl.split("?")[0]; // req.path has the router's /api prefix stripped
    const level = QUIET_PATHS.includes(path) ? "debug" : "info";
    log[level](
      {
        method: req.method,
        path,
        status: res.statusCode,
        duration_ms: Math.round((performance.now() - started) * 10) / 10,
      },
      "request",
    );
  });

  // request_id lands on every log line written while this request runs
  logContext.run({ request_id: requestId }, next);
};
