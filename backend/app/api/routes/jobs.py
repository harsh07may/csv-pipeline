"""Step 2 and 3: start processing once the upload is done, and check on a job."""
import asyncio
import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, select

from app.api.deps import SessionDep, queue
from app.api.schemas import JobOut
from app.core.config import PROCESS_CSV_TASK
from app.core.db import SessionLocal
from app.core.events import job_channel
from app.core.models import Job, JobStatus, Order, RejectedRow
from app.core.storage import object_exists
from app.core.redis_client import async_redis

from ..cache import get_cached, set_cached
from ..schemas import (CountryTotal, JobOut, OrderOut, RejectedRowOut, RowsPage, Summary,
                      UploadRequest, UploadResponse)

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

# ---------------------------------------------------------------- Live progress (SSE)
#* Once a job reaches one of these, nothing more will happen, so the stream can end.
TERMINAL_STATUSES = {JobStatus.COMPLETED, JobStatus.FAILED}


def _sse(payload: dict) -> str:
    """Format a dict as a Server-Sent Events line. The browser expects "data: <json>\n\n"."""

    return f"data: {json.dumps(payload)}\n\n"  # SSE format: "data: <json>\n\n"


#* Sent first on every connection, because Redis pub/sub keeps no history:
#* a client that connects late would otherwise see nothing until the next update.
def _job_snapshot(job_id: str) -> dict | None:
    """Returns job's current state straight from the DB, as a plain dict."""
    with SessionLocal() as session:
        job = session.get(Job, job_id)
        if job is None:
            return None
        return JobOut.model_validate(job).model_dump(mode="json")

#* Async generator: every `yield` sends one chunk to the browser, then pauses.
async def _event_stream(job_id: str, request: Request):
    #* 1) Subscribe BEFORE the DB read, so no update can slip through the gap.
    pubsub = async_redis.pubsub()
    await pubsub.subscribe(job_channel(job_id))

    try:
        #* 2) Current state first, for late joiners (blocking DB call, so run in a thread).
        snapshot = await asyncio.to_thread(_job_snapshot, job_id)
        if snapshot is None:
            yield _sse({"status": "not_found"})
            return
        yield _sse(snapshot)

        if snapshot["status"] in TERMINAL_STATUSES:
            return

        #* 3) Live updates, until the job finishes or the browser leaves.
        while not await request.is_disconnected():
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=15.0)
            if message is None:
                # ":" lines are SSE comments: a ping so proxies don't drop a quiet connection
                yield ": keep-alive\n\n"
                continue

            event = json.loads(message["data"])
            yield _sse(event)

            if event["status"] in TERMINAL_STATUSES:
                return

    finally:
        #* Always runs, so Redis connections don't leak.
        await pubsub.unsubscribe()
        await pubsub.aclose()


#* worker --publish--> Redis "job:<id>:events" --> this endpoint --data: {...}--> browser
@router.get("/{job_id}/events", tags=["live"])
async def job_events(job_id: str, request: Request):
    """Server-Sent Events stream: one `data:` line per progress update."""

    return StreamingResponse(
        _event_stream(job_id, request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},  # no proxy buffering
    )



@router.get("/{job_id}/summary", response_model=Summary, tags=["results"])
def job_summary(job_id: str, session: SessionDep):
    """Aggregations scan every row of the job: a textbook candidate for caching."""

    job = _job_or_404(session, job_id)
    if job.status != JobStatus.COMPLETED:
        raise HTTPException(status_code=409, detail="Summary is available once the job completes")

    #* Cache-aside: try Redis first; on a miss, compute from the DB and store it (below).
    #* Safe to cache forever-ish because a completed job's rows never change.
    cache_key = f"summary:{job_id}"
    if (cached := get_cached(cache_key, Summary)) is not None:
        cached.cached = True
        return cached

    #* Three queries over this job's orders: totals, per-country breakdown, a few rejected rows.
    #* The database does the summing and grouping; Python only shapes the result.
    revenue, high_value = session.execute(
        select(
            func.coalesce(func.sum(Order.amount_usd), 0.0),
            func.count().filter(Order.is_high_value),   # COUNT(*) FILTER (WHERE ...): SQLite and Postgres
        ).where(Order.job_id == job_id)
    ).one()
    
    revenue_col = func.sum(Order.amount_usd)
    
    by_country = session.execute(
        select(Order.country, func.count(), revenue_col)
        .where(Order.job_id == job_id)
        .group_by(Order.country)
        .order_by(revenue_col.desc())
    ).all()
    
    sample_errors = session.scalars(
        select(RejectedRow)
        .where(RejectedRow.job_id == job_id)
        .order_by(RejectedRow.row_number)
        .limit(10)
    ).all()

    result = Summary(
        valid_rows=job.valid_rows,
        invalid_rows=job.invalid_rows,
        revenue_usd=round(revenue, 2),      # round in Python: portable across databases
        high_value_orders=high_value,
        by_country=[CountryTotal(country=c, orders=n, revenue_usd=round(r, 2)) for c, n, r in by_country],
        sample_errors=[RejectedRowOut.model_validate(e) for e in sample_errors],
    )
    set_cached(cache_key, result)
    return result