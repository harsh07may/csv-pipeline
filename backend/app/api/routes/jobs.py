"""Step 2 and 3: start processing once the upload is done, and check on a job."""
import asyncio
import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import SessionDep, queue
from app.api.schemas import JobOut
from app.core.config import PROCESS_CSV_TASK
from app.core.db import SessionLocal
from app.core.events import job_channel
from app.core.models import Job, JobStatus
from app.core.storage import object_exists
from app.core.redis_client import async_redis

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _job_or_404(session: Session, job_id: str) -> Job:
    job = session.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/{job_id}/start", response_model=JobOut)
def start_job(job_id: str, session: SessionDep):
    """Client says the upload finished: verify the file is there, then queue the work."""

    job = _job_or_404(session, job_id)

    if job.status != JobStatus.AWAITING_UPLOAD:
        raise HTTPException(status_code=409, detail=f"Job is already {job.status}")

    if not object_exists(job.object_key):
        raise HTTPException(status_code=400, detail="File not found in storage. Upload it first.")

    # Commit status BEFORE enqueueing:
    # a fast worker could otherwise flip it to "processing"
    job.status = JobStatus.QUEUED
    session.commit()

    # Enqueue by import path of the actual function
    queue.enqueue(PROCESS_CSV_TASK, job_id, job_timeout=600)
    return job


@router.get("/{job_id}", response_model=JobOut)
def read_job(job_id: str, session: SessionDep):
    return _job_or_404(session, job_id)

TERMINAL_STATUSES = {JobStatus.COMPLETED, JobStatus.FAILED}
def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"  # SSE format: "data: <json>\n\n"

def _job_snapshot(job_id: str) -> dict | None:
    with SessionLocal() as session:
        job = session.get(Job, job_id)
        if job is None:
            return None
        return JobOut.model_validate(job).model_dump(mode="json")

#* Order of operations:
# worker  ──publish──▶  Redis channel "job:<id>:events" ── 
# ──▶ API (this endpoint)  ──data: {...}──▶  browser

# 1. Subscribe to the pub/sub channel THEN snapshot (no history, so do this first)
# 2. Read the current state from the database (for late joiners)


@router.get("/{job_id}/events", tags=["live"])
async def job_events(job_id: str, request: Request  ):
    """Server-Sent Events stream: one `data:` line per progress update."""

    async def event_stream():
        pubsub = async_redis.pubsub()
        await pubsub.subscribe(job_channel(job_id))
        
        try:
            # SQLAlchemy + sqlite3 are blocking: run in a thread so the event loop stays free.
            snapshot = await asyncio.to_thread(_job_snapshot, job_id)
            if snapshot is None:    
                yield _sse({"status": "not_found"})
                return
            yield _sse(snapshot)                     # current state, for late joiners
            
            if snapshot["status"] in TERMINAL_STATUSES:
                return

            while not await request.is_disconnected():
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=15.0)
                if message is None:
                    # Lines starting with ":" are SSE comments. Sending one now and then
                    # stops proxies from closing a quiet connection.
                    yield ": keep-alive\n\n"
                    continue
                event = json.loads(message["data"])
                yield _sse(event)
                if event["status"] in TERMINAL_STATUSES:
                    return
                
        finally:
            await pubsub.unsubscribe()
            await pubsub.aclose()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},  # no proxy buffering
    )