"""The contract between worker (publisher) and API (subscriber) for live progress."""

import json

from .redis_client import sync_redis

def job_channel(job_id: str) -> str:
    return f"job:{job_id}:events"

def publish_job_event(job_id: str, event: dict) -> None:
    """Fire-and-forget: only subscribers connected *right now* receive it (no history)."""
    sync_redis.publish(job_channel(job_id), json.dumps(event))