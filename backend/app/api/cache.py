"""Read-through cache helpers. Values are Pydantic models stored as JSON strings."""
from typing import TypeVar

from pydantic import BaseModel

from app.core.config import CACHE_TTL_SECONDS
from app.core.redis_client import sync_redis


M = TypeVar("M", bound=BaseModel)


def get_cached(key: str, model: type[M]) -> M | None:
    """Return a Pydantic model from Redis if it exists, else None."""
    raw = sync_redis.get(key)
    
    if raw is None:
        return None
    
    return model.model_validate_json(raw)

def set_cached(key: str, value: BaseModel, ttl: int = CACHE_TTL_SECONDS) -> None:
    """Store a Pydantic model in Redis as JSON, with a TTL."""
    # SETEX = set + expiry in one call. The TTL is a safety net so stale keys never live forever.
    
    sync_redis.setex(key, ttl, value.model_dump_json())