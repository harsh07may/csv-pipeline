"""Shared dependencies for the route modules: DB session, job lookups and the job queue."""
from typing import Annotated

import redis
from fastapi import Depends, HTTPException
from opentelemetry import trace
from rq import Queue
from sqlalchemy.orm import Session

from app.core.config import QUEUE_NAME, REDIS_URL
from app.core.db import SessionLocal
from app.core.models import Job, JobStatus

# The queue the worker listens on. Connects lazily, so importing this needs no Redis.
queue = Queue(QUEUE_NAME, connection=redis.Redis.from_url(REDIS_URL))


# One session per request
def get_session():
    with SessionLocal() as session:
        yield session   # closed automatically after


SessionDep = Annotated[Session, Depends(get_session)]


def get_job(job_id: str, session: SessionDep) -> Job:
    """The job named in the URL, or a 404. `job_id` is read from the path automatically."""
    trace.get_current_span().set_attribute("job.id", job_id)   # searchable in the trace UI
    job = session.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


JobDep = Annotated[Job, Depends(get_job)]


def get_completed_job(job: JobDep) -> Job:
    """Like get_job, but 409 until processing has finished: results do not exist before that."""
    if job.status != JobStatus.COMPLETED:
        raise HTTPException(status_code=409, detail="Results are available once the job completes")
    return job


CompletedJobDep = Annotated[Job, Depends(get_completed_job)]
