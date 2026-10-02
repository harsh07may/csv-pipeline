// Structured logs: one JSON object per line, carrying the request id / job id bound for the
// current request or job, and the trace id of the active span (to jump from a log to its trace).
import { trace } from "@opentelemetry/api";
import { AsyncLocalStorage } from "node:async_hooks";
import pino from "pino";
import pretty from "pino-pretty";

import { LOG_FORMAT, LOG_LEVEL } from "./config";

// Values bound for the current request/job (the equivalent of Python's contextvars).
export const logContext = new AsyncLocalStorage<Record<string, unknown>>();

export const logger = pino(
  {
    level: LOG_LEVEL,
    messageKey: "event",
    base: { service: process.env.OTEL_SERVICE_NAME ?? "csv-backend" },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    formatters: { level: (label) => ({ level: label }) },
    mixin() {
      const fields: Record<string, unknown> = { ...logContext.getStore() };
      const span = trace.getActiveSpan()?.spanContext();
      if (span) {
        fields.trace_id = span.traceId;
        fields.span_id = span.spanId;
      }
      return fields;
    },
  },
  LOG_FORMAT === "json" ? undefined : pretty({ colorize: true, messageKey: "event", ignore: "pid,hostname,service" }),
);

export function getLogger(name: string) {
  return logger.child({ logger: name });
}
