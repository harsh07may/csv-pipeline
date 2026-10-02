"""FastAPI app for the CSV pipeline."""
import uuid
from contextlib import asynccontextmanager
from typing import Annotated

import redis
from fastapi import Depends, FastAPI, HTTPException
from rq import Queue
from sqlalchemy.orm import Session

from app.core.db import SessionLocal, init_db
from app.core.storage import object_exists, presigned_upload_url
from app.core.models import Job, JobStatus
from app.core.config import PROCESS_CSV_TASK, QUEUE_NAME, REDIS_URL


from .schemas import JobOut, UploadRequest, UploadResponse

@asynccontextmanager
async def lifespan(app:FastAPI):
    init_db() # create tables on startup(use Alembic on prod)
    yield


app = FastAPI(title="CSV Pipeline", lifespan=lifespan)
queue = Queue(QUEUE_NAME, connection=redis.Redis.from_url(REDIS_URL))

# One session per request
def get_session():
    with SessionLocal() as session:
        yield session # closed automatically after

SessionDep = Annotated[Session, Depends(get_session)]


def _job_or_404(session:Session, job_id: str) -> Job:
    job = session.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.get("/api/health")
def health():
    # The smallest possible endpoint: proves the server runs and routing works.
    return {"status": "ok"}

@app.post("/api/uploads", response_model=UploadResponse)
def create_upload(body: UploadRequest, session: SessionDep):
    """Return a pre-signed URL to the client."""
    if not body.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are accepted")

    job_id = str(uuid.uuid4())
    object_key = f"uploads/{job_id}.csv"
    new_job = Job(id=job_id, filename=body.filename, object_key=object_key)
    
    session.add(new_job)
    session.commit()
    return UploadResponse(job_id=job_id, upload_url=presigned_upload_url(object_key))


# todo: write a endpoint to start a job 
# todo: when client says "upload finished". 
# todo: verify it, then queue the work.

@app.post("/api/jobs/{job_id}/start", response_model=JobOut, tags=["jobs"])
def start_job(job_id: str, session: SessionDep):
    job = _job_or_404(session, job_id)
    
    if job.status != JobStatus.AWAITING_UPLOAD:
        raise HTTPException(status_code=409, detail=f"Job is already {job.status}")
    
    if not object_exists(job.object_key):
        raise HTTPException(status_code=400, detail="File not found in storage. Upload it first.")

    #* Commit status BEFORE enqueueing: 
    #* a fast worker could otherwise flip it to "processing"
    job.status = JobStatus.QUEUED
    session.commit()

    #* Enqueue by import path of the actual function
    queue.enqueue(PROCESS_CSV_TASK, job_id, job_timeout=600)
    return job  


@app.get("/api/jobs/{job_id}", response_model=JobOut, tags=["jobs"])
def read_job(job_id:str, session: SessionDep):
    return _job_or_404(session, job_id)