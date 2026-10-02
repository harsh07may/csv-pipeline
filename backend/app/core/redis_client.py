"""Redis connections shared by the API and the worker."""
import redis
import redis.asyncio as aioredis

from .config import REDIS_URL

sync_redis = redis.Redis.from_url(REDIS_URL, decode_responses=True) # Used for pub/sub publishing and for the cache.
async_redis = aioredis.from_url(REDIS_URL, decode_responses=True) # Support the async SSE; sync would block

#! RQ uses its own connection pool(no decode_responses), since it has binary data.