// Read-through cache helpers. Values are JSON strings in Redis.
import { CACHE_TTL_SECONDS } from "../config";
import { getLogger } from "../logger";
import { redis } from "../redis";

const log = getLogger("app.cache");

// Return the cached value, or null on a miss. A Redis outage is a miss, not an error:
// the caller falls back to the database.
export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch (err) {
    log.warn({ err, key }, "cache_read_failed");
    return null;
  }
}

// SETEX = set + expiry in one call. The TTL is a safety net so stale keys never live forever.
export async function setCached(key: string, value: object, ttl: number = CACHE_TTL_SECONDS): Promise<void> {
  try {
    await redis.setex(key, ttl, JSON.stringify(value));
  } catch (err) {
    log.warn({ err, key }, "cache_write_failed");
  }
}
