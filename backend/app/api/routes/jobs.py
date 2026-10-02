"""Step 2 and 3: start processing once the upload is done, and check on a job."""
from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import SessionDep, queue
from app.api.schemas import JobOut
from app.core.config import PROCESS_CSV_TASK
from app.core.models import Job, JobStatus
from app.core.storage import object_exists

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
