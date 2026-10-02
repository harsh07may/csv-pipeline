// The worker process: `node dist/worker/index.js`.
// Pulls jobs from the "csv" queue and runs processCsv for each one.
import "./init"; // must stay first: names the service
import "../tracing"; // starts tracing before pg and ioredis load

import { context, propagation, SpanKind, trace } from "@opentelemetry/api";
import { Worker } from "bullmq";

import { PROCESS_CSV_JOB, QUEUE_NAME } from "../config";
import { getLogger, logContext } from "../logger";
import { newWorkerConnection } from "../redis";
import { processCsv } from "./tasks";

const log = getLogger("app.worker");
const tracer = trace.getTracer("app.worker");

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    if (job.name !== PROCESS_CSV_JOB) throw new Error(`Unknown job type '${job.name}'`);
    const { jobId, otel } = job.data as { jobId: string; otel?: Record<string, string> };

    //* The API stored its trace context in the job data when it enqueued the job:
    //* continue it, so the worker's spans land in the same trace as the upload request.
    const parent = propagation.extract(context.active(), otel ?? {});
    // job_id lands on every log line written while this job runs
    return logContext.run({ job_id: jobId, queue_job_id: job.id }, () =>
      tracer.startActiveSpan(
        "process_csv job",
        { kind: SpanKind.CONSUMER, attributes: { "job.id": jobId, "queue.job_id": job.id } },
        parent,
        async (span) => {
          try {
            return await processCsv(jobId);
          } finally {
            span.end();
          }
        },
      ),
    );
  },
  { connection: newWorkerConnection(), concurrency: 1 },
);

worker.on("failed", (job, err) => log.error({ queue_job_id: job?.id, err }, "queue_job_failed"));
worker.on("error", (err) => log.error({ err }, "worker_error"));
log.info({ queue: QUEUE_NAME }, "worker_started");

// Finish the job in flight before exiting.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    worker.close().finally(() => process.exit(0));
  });
}
