"""What the API accepts and returns (Pydantic). Deliberately separate from core/models.py:
the database shape and the public API shape are allowed to differ. Example: Job.object_key
exists in the table but is not part of JobOut, so it can never leak to clients.

These classes also generate the OpenAPI schema you can browse at /docs.
"""

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field 

class UploadRequest(BaseModel):
    filename: str = Field(examples=["orders.csv"])

class UploadResponse(BaseModel):
    job_id: str
    upload_url: str

class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True) # allow JobOut.model_validate(orm_job)

    id: str
    filename: str
    status: str
    expected_rows: int
    total_rows: int
    valid_rows: int
    invalid_rows: int
    error: str | None
    created_at: datetime