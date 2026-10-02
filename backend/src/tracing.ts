// Distributed tracing, set up once per process. Must be the FIRST import of an entry point,
// so the instrumentations can hook express, pg, ioredis and the AWS SDK before they load.
//
// Spans go to the OTLP endpoint (Jaeger). The standard OTEL_* variables choose where
// (OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_SERVICE_NAME, ...). OTEL_SDK_DISABLED=true turns it all off.
import { ExpressInstrumentation, ExpressLayerType } from "@opentelemetry/instrumentation-express";
import { AwsInstrumentation } from "@opentelemetry/instrumentation-aws-sdk";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { NodeSDK } from "@opentelemetry/sdk-node";

// Health checks and the long-lived SSE stream would only add noise.
const QUIET_URL = /^\/api\/health|\/events(\?|$)/;

export const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [
    new HttpInstrumentation({ ignoreIncomingRequestHook: (req) => QUIET_URL.test(req.url ?? "") }),
    new ExpressInstrumentation({ ignoreLayersType: [ExpressLayerType.MIDDLEWARE, ExpressLayerType.ROUTER] }),
    new PgInstrumentation(), // statement text only, never parameter values: no customer data in traces
    new IORedisInstrumentation(),
    new AwsInstrumentation(),
  ],
});
sdk.start();

// Push the last spans out before the process exits.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    sdk.shutdown().finally(() => process.exit(0));
  });
}
