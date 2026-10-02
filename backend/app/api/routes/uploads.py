"""Step 1 of the flow: the client asks where to upload its CSV."""
import uuid

import structlog
from fastapi import APIRouter, HTTPException

from app.api.deps import SessionDep
from app.api.schemas import UploadRequest, UploadResponse
from app.core.models import Job
from app.core.storage import presigned_upload_url

router = APIRouter(tags=["uploads"])
log = structlog.get_logger(__name__)


@router.post("/uploads", response_model=UploadResponse)
def create_upload(body: UploadRequest, session: SessionDep):
    """Return a pre-signed URL to the client."""
    if not body.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are accepted")

    job_id = str(uuid.uuid4())
    object_key = f"uploads/{job_id}.csv"
    new_job = Job(id=job_id, filename=body.filename, object_key=object_key)

    session.add(new_job)
    session.commit()
    log.info("job_created", job_id=job_id, filename=body.filename)
    return UploadResponse(job_id=job_id, upload_url=presigned_upload_url(object_key))
