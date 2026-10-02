// Step 2 and 3: start processing once the upload is done, check on a job, stream its progress
// and read its results.
import { context, propagation, trace } from "@opentelemetry/api";
import { asc, count, desc, eq, ne, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";

import { PROCESS_CSV_JOB } from "../../config";
import { db } from "../../db";
import { getLogger } from "../../logger";
import { jobChannel, newSubscriber } from "../../redis";
import { type Job, JobStatus, jobs, orders, rejectedRows } from "../../schema";
import { objectExists } from "../../storage";
import { getCached, setCached } from "../cache";
import { HttpError } from "../errors";
import { loadJob, requireCompleted, toJobOut } from "../jobs";
import { queue } from "../queue";

export const jobsRouter = Router();
const log = getLogger("app.api.jobs");
const tracer = trace.getTracer("app.api.jobs");

// Money stays an exact decimal string inside the database and the worker, and only becomes a
// plain JSON number at the very last step, so the frontend gets 1250.5 rather than "1250.50".
const money = (value: string | null) => Number(value ?? 0);

const ListQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) });
const RowsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
});

// The most recent imports, newest first, so the UI can reopen past jobs.
// Jobs still waiting for their upload are left out: the user never finished starting them.
jobsRouter.get("/jobs", async (req, res) => {
  const { limit } = ListQuery.parse(req.query);
  const recent = await db
    .select()
    .from(jobs)
    .where(ne(jobs.status, JobStatus.AWAITING_UPLOAD))
    .orderBy(desc(jobs.created_at))
    .limit(limit);
  res.json(recent.map(toJobOut));
});

// Client says the upload finished: verify the file is there, then queue the work.
jobsRouter.post("/jobs/:id/start", loadJob, async (req, res) => {
  const id = req.params.id as string;

  //* Lock the row and re-read it, so two simultaneous "start" calls can't both pass the
  //* status check below and enqueue the job twice. The second call waits, then sees QUEUED.
  const job = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(jobs).where(eq(jobs.id, id)).for("update");
    if (locked.status !== JobStatus.AWAITING_UPLOAD) throw new HttpError(409, `Job is already ${locked.status}`);
    if (!(await objectExists(locked.object_key))) {
      throw new HttpError(400, "File not found in storage. Upload it first.");
    }
    // Commit status BEFORE enqueueing: a fast worker could otherwise flip it to "processing".
    const [queued] = await tx.update(jobs).set({ status: JobStatus.QUEUED }).where(eq(jobs.id, id)).returning();
    return queued;
  });

  await tracer.startActiveSpan("enqueue job", { attributes: { "job.id": job.id } }, async (span) => {
    try {
      //* Carry this trace across the queue: the worker picks it up from the job data, so
      //* the worker's spans land in the same trace as this request.
      const otel: Record<string, string> = {};
      propagation.inject(context.active(), otel);
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("queue timeout")), 5000));
      await Promise.race([queue.add(PROCESS_CSV_JOB, { jobId: job.id, otel }, { jobId: job.id, attempts: 1 }), timeout]);
    } catch (err) {
      // The queue is unreachable. Put the job back so the client can simply try again;
      // otherwise it would sit in "queued" forever with nothing to run it.
      await db.update(jobs).set({ status: JobStatus.AWAITING_UPLOAD }).where(eq(jobs.id, job.id));
      log.error({ err, job_id: job.id }, "job_enqueue_failed");
      throw new HttpError(503, "Could not queue the job. Try again in a moment.");
    } finally {
      span.end();
    }
  });

  log.info({ job_id: job.id, filename: job.filename }, "job_queued");
  res.json(toJobOut(job));
});

jobsRouter.get("/jobs/:id", loadJob, (_req, res) => {
  res.json(toJobOut(res.locals.job as Job));
});

// ---------------------------------------------------------------- Live progress (SSE)
//* Once a job reaches one of these, nothing more will happen, so the stream can end.
const TERMINAL_STATUSES: string[] = [JobStatus.COMPLETED, JobStatus.FAILED];

//* worker --publish--> Redis "job:<id>:events" --> this endpoint --data: {...}--> browser
// Server-Sent Events stream: one `data:` line per progress update.
jobsRouter.get("/jobs/:id/events", async (req, res) => {
  const id = req.params.id;
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" });
  res.flushHeaders();

  // SSE format: "data: <json>\n\n"
  const send = (payload: object) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

  //* 1) Subscribe BEFORE the DB read, so no update can slip through the gap.
  //*    Updates that arrive while the snapshot is being read wait in `pending`.
  const subscriber = newSubscriber();
  let pending: string[] | null = [];
  let keepAlive: NodeJS.Timeout | undefined;
  let closed = false;

  //* Always runs once, so Redis connections and timers don't leak.
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(keepAlive);
    subscriber.disconnect();
    res.end();
  };
  req.on("close", close);
  subscriber.on("error", (err) => {
    log.warn({ err, job_id: id }, "sse_redis_error");
    close();
  });

  // Forward one raw pub/sub message; ends the stream after a terminal status.
  const forward = (raw: string) => {
    const event = JSON.parse(raw);
    send(event);
    if (TERMINAL_STATUSES.includes(event.status)) close();
  };
  subscriber.on("message", (_channel, raw) => {
    if (pending) pending.push(raw);
    else if (!closed) forward(raw);
  });

  try {
    await subscriber.subscribe(jobChannel(id));

    //* 2) Current state first, for late joiners (Redis pub/sub keeps no history).
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    if (closed) return;
    if (!job) {
      send({ status: "not_found" });
      close();
      return;
    }
    send(toJobOut(job));
    if (TERMINAL_STATUSES.includes(job.status)) {
      close();
      return;
    }

    //* 3) Live updates, until the job finishes or the browser leaves.
    const buffered = pending;
    pending = null;
    for (const raw of buffered) {
      if (closed) return;
      forward(raw);
    }
    // ":" lines are SSE comments: a ping so proxies don't drop a quiet connection
    keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 15_000);
  } catch (err) {
    log.warn({ err, job_id: id }, "sse_failed");
    close();
  }
});

// Aggregations scan every row of the job: a textbook candidate for caching.
jobsRouter.get("/jobs/:id/summary", loadJob, requireCompleted, async (_req, res) => {
  const job = res.locals.job as Job;

  //* Cache-aside: try Redis first; on a miss, compute from the DB and store it (below).
  //* Safe to cache forever-ish because a completed job's rows never change.
  const cacheKey = `summary:${job.id}`;
  const cached = await getCached<object>(cacheKey);
  if (cached) {
    res.json({ ...cached, cached: true });
    return;
  }

  //* Three queries over this job's orders: totals, per-country breakdown, a few rejected rows.
  //* The database does the summing and grouping; JavaScript only shapes the result.
  const [totals] = await db
    .select({
      revenue: sql<string>`coalesce(sum(${orders.amount_usd}), 0)`,
      high_value: sql<number>`count(*) filter (where ${orders.is_high_value})`.mapWith(Number),
    })
    .from(orders)
    .where(eq(orders.job_id, job.id));

  const revenueSum = sql<string>`sum(${orders.amount_usd})`;
  const byCountry = await db
    .select({ country: orders.country, orders: count().mapWith(Number), revenue_usd: revenueSum })
    .from(orders)
    .where(eq(orders.job_id, job.id))
    .groupBy(orders.country)
    .orderBy(desc(revenueSum));

  const sampleErrors = await db
    .select({ row_number: rejectedRows.row_number, message: rejectedRows.message })
    .from(rejectedRows)
    .where(eq(rejectedRows.job_id, job.id))
    .orderBy(asc(rejectedRows.row_number))
    .limit(10);

  const result = {
    valid_rows: job.valid_rows,
    invalid_rows: job.invalid_rows,
    revenue_usd: money(totals.revenue), // sums of NUMERIC(12, 2) values are already exact to the cent
    high_value_orders: totals.high_value,
    by_country: byCountry.map((c) => ({ country: c.country, orders: c.orders, revenue_usd: money(c.revenue_usd) })),
    sample_errors: sampleErrors,
    cached: false,
  };
  await setCached(cacheKey, result);
  res.json(result);
});

// One page of the job's valid orders, in the order they appeared in the file.
jobsRouter.get("/jobs/:id/rows", loadJob, requireCompleted, async (req, res) => {
  const job = res.locals.job as Job;
  const { page, page_size: pageSize } = RowsQuery.parse(req.query);

  //* Same cache-aside as the summary: a finished job's rows never change.
  const cacheKey = `rows:${job.id}:${page}:${pageSize}`;
  const cached = await getCached<object>(cacheKey);
  if (cached) {
    res.json({ ...cached, cached: true });
    return;
  }

  //* Filter by job_id and sort by id: exactly what the (job_id, id) index serves.
  //* LIMIT/OFFSET is fine at this size; keyset pagination is the upgrade for huge jobs.
  const pageRows = await db
    .select()
    .from(orders)
    .where(eq(orders.job_id, job.id))
    .orderBy(asc(orders.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const result = {
    items: pageRows.map((o) => ({
      order_id: o.order_id,
      customer_email: o.customer_email,
      country: o.country,
      currency: o.currency,
      amount: money(o.amount),
      amount_usd: money(o.amount_usd),
      order_date: o.order_date,
      is_high_value: o.is_high_value,
    })),
    page,
    page_size: pageSize,
    total: job.valid_rows, // every valid row became exactly one order
    total_pages: Math.max(1, Math.ceil(job.valid_rows / pageSize)),
    cached: false,
  };
  await setCached(cacheKey, result);
  res.json(result);
});
