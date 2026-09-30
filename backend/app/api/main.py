"""FastAPI app for the CSV pipeline."""
import uuid
from fastapi import FastAPI, HTTPException
from app.core.storage import presigned_upload_url
from .schemas import UploadRequest, UploadResponse

app = FastAPI(title="CSV Pipeline")

@app.get("/api/health")
def health():
    # The smallest possible endpoint: proves the server runs and routing works.
    return {"status": "ok"}

@app.post("/api/uploads", response_model=UploadResponse)
def create_upload(request: UploadRequest):
    """Return a pre-signed URL to the client."""
    if not request.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are accepted")

    job_id = str(uuid.uuid4())
    object_key = f"uploads/{job_id}.csv"
    return UploadResponse(job_id=job_id, upload_url=presigned_upload_url(object_key))
