"""What the API accepts and returns (Pydantic). Deliberately separate from core/models.py:
the database shape and the public API shape are allowed to differ. Example: Job.object_key
exists in the table but is not part of JobOut, so it can never leak to clients.

These classes also generate the OpenAPI schema you can browse at /docs.
"""

from pydantic import BaseModel, Field

class UploadRequest(BaseModel):
    filename: str = Field(examples=["orders.csv"])

class UploadResponse(BaseModel):
    job_id: str
    upload_url: str
