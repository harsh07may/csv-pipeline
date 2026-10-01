"""FastAPI app for the CSV pipeline."""
import uuid
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy.orm import Session

from app.core.db import SessionLocal, init_db
from app.core.storage import presigned_upload_url
from app.core.models import Job

from .schemas import JobOut, UploadRequest, UploadResponse

@asynccontextmanager
async def lifespan(app:FastAPI):
    init_db() # create tables on startup(use Alembic on prod)
    yield


app = FastAPI(title="CSV Pipeline", lifespan=lifespan)

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

@app.get("/api/jobs/{job_id}", response_model=JobOut, tags=["jobs"])
def read_job(job_id:str, session: SessionDep):
    return _job_or_404(session, job_id)