// Job lookups shared by the routes: load the job named in the URL, or require it to be completed.
import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { trace } from "@opentelemetry/api";

import { db } from "../db";
import { type Job, JobStatus, jobs } from "../schema";
import { HttpError } from "./errors";

// The public shape of a job. Deliberately separate from the table: object_key is never exposed.
export function toJobOut(job: Job) {
  return {
    id: job.id,
    filename: job.filename,
    status: job.status,
    expected_rows: job.expected_rows,
    total_rows: job.total_rows,
    valid_rows: job.valid_rows,
    invalid_rows: job.invalid_rows,
    error: job.error,
    created_at: job.created_at.toISOString(),
  };
}

// The job named in the URL (res.locals.job), or a 404.
export const loadJob: RequestHandler<{ id: string }> = async (req, res, next) => {
  trace.getActiveSpan()?.setAttribute("job.id", req.params.id); // searchable in the trace UI
  const [job] = await db.select().from(jobs).where(eq(jobs.id, req.params.id));
  if (!job) throw new HttpError(404, "Job not found");
  res.locals.job = job;
  next();
};

// 409 until processing has finished: results do not exist before that. Use after loadJob.
export const requireCompleted: RequestHandler = (_req, res, next) => {
  if ((res.locals.job as Job).status !== JobStatus.COMPLETED) {
    throw new HttpError(409, "Results are available once the job completes");
  }
  next();
};
