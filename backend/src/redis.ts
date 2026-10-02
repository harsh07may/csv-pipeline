// Redis connections shared by the API and the worker.
import IORedis from "ioredis";

import { REDIS_URL } from "./config";

// Cache + pub/sub publishing. Fail fast when Redis is down instead of queueing commands forever,
// so the API can answer 503 (start) or fall back to the database (cache).
export const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
redis.on("error", () => {}); // connection errors surface on each command; don't crash on the event

// BullMQ keeps its own connections. The worker's blocking commands need maxRetriesPerRequest: null.
export function newWorkerConnection(): IORedis {
  return new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
}

// One connection per live SSE stream: a connection in subscribe mode can't run other commands.
export function newSubscriber(): IORedis {
  return new IORedis(REDIS_URL);
}

// The contract between worker (publisher) and API (subscriber) for live progress.
export function jobChannel(jobId: string): string {
  return `job:${jobId}:events`;
}

// Fire-and-forget: only subscribers connected *right now* receive it (no history).
export async function publishJobEvent(jobId: string, event: object): Promise<void> {
  await redis.publish(jobChannel(jobId), JSON.stringify(event));
}
