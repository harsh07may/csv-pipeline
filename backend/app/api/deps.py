"""Shared dependencies for the route modules: the DB session and the job queue."""
from typing import Annotated

import redis
from fastapi import Depends
from rq import Queue
from sqlalchemy.orm import Session

from app.core.config import QUEUE_NAME, REDIS_URL
from app.core.db import SessionLocal

# The queue the worker listens on. Connects lazily, so importing this needs no Redis.
queue = Queue(QUEUE_NAME, connection=redis.Redis.from_url(REDIS_URL))


# One session per request
def get_session():
    with SessionLocal() as session:
        yield session   # closed automatically after


SessionDep = Annotated[Session, Depends(get_session)]
