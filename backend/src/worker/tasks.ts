// Background work, executed by the BullMQ worker process.
import { trace } from "@opentelemetry/api";
import { eq } from "drizzle-orm";
import { parse } from "csv-parse";
import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { JOB_TIMEOUT_MS, SIMULATED_DELAY_SECONDS } from "../config";
import { db } from "../db";
import { getLogger } from "../logger";
import { checkHeader, processRow, RowError, type ProcessedRow } from "../processing";
import { publishJobEvent } from "../redis";
import { JobStatus, jobs, orders, rejectedRows } from "../schema";
import { downloadFile } from "../storage";

const BATCH_SIZE = 500; // rows per transaction + progress event
const MAX_STORED_ERRORS = 200; // keep a sample of rejected rows, not millions of them

const log = getLogger("app.worker.tasks");
const tracer = trace.getTracer("app.worker.tasks");

// Entry point. The worker calls this with the job id the API put in the queue.
export async function processCsv(jobId: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) {
    log.warn({ job_id: jobId }, "job_not_found");
    return { session: "job not found" };
  }

  await db.update(jobs).set({ status: JobStatus.PROCESSING }).where(eq(jobs.id, jobId));
  await publishJobEvent(jobId, { status: JobStatus.PROCESSING, total_rows: 0 });
  log.info({ job_id: jobId, filename: job.filename }, "job_started");
  const started = performance.now();

  // JavaScript can't kill a running task, so the timeout is checked between batches.
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  const stats = { total_rows: 0, valid_rows: 0, invalid_rows: 0 };
  const tmpDir = await mkdtemp(join(tmpdir(), "csv-"));

  try {
    const localPath = join(tmpDir, "input.csv");
    await tracer.startActiveSpan("download file", async (span) => {
      try {
        await downloadFile(job.object_key, localPath);
      } finally {
        span.end();
      }
    });
    await tracer.startActiveSpan("process file", async (span) => {
      try {
        await processFile(jobId, localPath, stats, deadline);
        span.setAttributes({
          "rows.total": stats.total_rows,
          "rows.valid": stats.valid_rows,
          "rows.invalid": stats.invalid_rows,
        });
      } finally {
        span.end();
      }
    });
  } catch (err) {
    // The half-finished batch was never committed (each batch is one transaction).
    const message = err instanceof Error ? err.message : String(err);
    await db.update(jobs).set({ status: JobStatus.FAILED, error: message }).where(eq(jobs.id, jobId));
    await publishJobEvent(jobId, { status: JobStatus.FAILED, error: message });
    // No stack here: it keeps travelling up (throw) and the worker logs it once.
    log.error({ job_id: jobId, error: message }, "job_failed");
    throw err;
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }

  await db.update(jobs).set({ status: JobStatus.COMPLETED }).where(eq(jobs.id, jobId));
  await publishJobEvent(jobId, { status: JobStatus.COMPLETED, ...stats });
  log.info({ job_id: jobId, ...stats, duration_ms: Math.round(performance.now() - started) }, "job_completed");
  return stats;
}

// Idempotency:
// What: Operations can be applied multiple times without changing the result beyond the initial application.
// Where: If the worker crashes and the job is retried, there is no double-counting and no duplicate rows.
// How: The retry wipes the job's rows first; each batch (rows + counters) is one database transaction.
async function processFile(jobId: string, path: string, stats: { total_rows: number; valid_rows: number; invalid_rows: number }, deadline: number) {
  // Cheap pre-scan so the UI can show a percentage. Approximate if fields contain newlines.
  // Counts lines like Python's universal newlines (\n, \r\n and a lone \r), minus the header.
  let lines = 0;
  let lastChar = "";
  let first = true;
  for await (const chunk of createReadStream(path, { encoding: "utf8" })) {
    const text: string = first ? chunk.replace(/^\uFEFF/, "") : chunk; // BOM
    first = false;
    for (const ch of text) {
      if (ch === "\n" && lastChar === "\r") {
        lastChar = ch;
        continue;
      }
      if (ch === "\n" || ch === "\r") lines++;
      lastChar = ch;
    }
  }
  if (lastChar !== "" && lastChar !== "\n" && lastChar !== "\r") lines++; // last line without a newline
  const expectedRows = Math.max(lines - 1, 0);

  //  If the job is retried, wipe rows to avoid duplication.
  await db.transaction(async (tx) => {
    await tx.delete(orders).where(eq(orders.job_id, jobId));
    await tx.delete(rejectedRows).where(eq(rejectedRows.job_id, jobId));
    await tx.update(jobs).set({ expected_rows: expectedRows }).where(eq(jobs.id, jobId));
  });

  let storedErrors = 0;
  const seenOrderIds = new Set<string>();
  let goodRows: (ProcessedRow & { job_id: string })[] = [];
  let rejected: { job_id: string; row_number: number; message: string }[] = [];
  let sawHeader = false;

  // Rows and progress counters land in ONE transaction: never out of sync.
  const saveBatch = async () => {
    await db.transaction(async (tx) => {
      if (goodRows.length > 0) await tx.insert(orders).values(goodRows);
      if (rejected.length > 0) await tx.insert(rejectedRows).values(rejected);
      await tx.update(jobs).set(stats).where(eq(jobs.id, jobId));
    });
    log.debug({ job_id: jobId, ...stats }, "batch_saved");
    await publishJobEvent(jobId, { status: JobStatus.PROCESSING, expected_rows: expectedRows, ...stats });
    goodRows = [];
    rejected = [];
  };

  // Streams the file row by row, never loading it whole. bom: Excel likes to add one at the start.
  const parser = createReadStream(path).pipe(
    parse({
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
      columns: (header: string[]) => {
        checkHeader(header); // a missing column is a file-level error: fail fast
        sawHeader = true;
        return header;
      },
    }),
  );

  let lineNumber = 1; // line 1 is the header
  for await (const raw of parser) {
    lineNumber++;
    stats.total_rows++;
    try {
      const row = processRow(raw);
      // A rule that needs context across rows lives here, not in processRow().
      if (seenOrderIds.has(row.order_id)) throw new RowError(`duplicate order_id '${row.order_id}'`);
      seenOrderIds.add(row.order_id);
      goodRows.push({ job_id: jobId, ...row });
      stats.valid_rows++;
    } catch (err) {
      if (!(err instanceof RowError)) throw err;
      stats.invalid_rows++;
      if (storedErrors < MAX_STORED_ERRORS) {
        rejected.push({ job_id: jobId, row_number: lineNumber, message: err.message });
        storedErrors++;
      }
    }

    if (stats.total_rows % BATCH_SIZE === 0) {
      if (Date.now() > deadline) throw new Error("Job exceeded its time limit");
      await saveBatch();
      await sleep(SIMULATED_DELAY_SECONDS * 1000); // DEMO ONLY: lets you watch the progress bar
    }
  }

  // An empty file has no header row at all, so every column is missing.
  if (!sawHeader) checkHeader([]);

  if (stats.total_rows % BATCH_SIZE !== 0 || stats.total_rows === 0) {
    await saveBatch(); // a partly filled last batch (or an empty file)
  }
}

