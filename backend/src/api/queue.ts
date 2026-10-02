// The queue the worker listens on. Only the job NAME is shared with the worker (see config.ts):
// the API never imports worker code.
import { Queue } from "bullmq";
import IORedis from "ioredis";

import { QUEUE_NAME, REDIS_URL } from "../config";

// Fail fast when Redis is down, so `start` can answer 503 instead of hanging.
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
connection.on("error", () => {});

export const queue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: { removeOnComplete: { count: 1000 }, removeOnFail: { count: 1000 } },
});
queue.on("error", () => {});
