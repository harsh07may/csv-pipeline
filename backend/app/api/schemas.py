"""What the API accepts and returns (Pydantic). Deliberately separate from core/models.py:
the database shape and the public API shape are allowed to differ. Example: Job.object_key
exists in the table but is not part of JobOut, so it can never leak to clients.

These classes also generate the OpenAPI schema you can browse at /docs.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer

# Money stays an exact Decimal inside Python (database in, cache in and out) and only becomes a
# plain JSON number at the very last step, so the frontend gets 1250.5 rather than "1250.50".
Money = Annotated[Decimal, PlainSerializer(float, return_type=float, when_used="json")]

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

class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    order_id: str
    customer_email: str
    country: str
    currency: str
    amount: Money
    amount_usd: Money
    order_date: date
    is_high_value: bool

class RowsPage(BaseModel):
    items: list[OrderOut]
    page: int
    page_size: int
    total: int
    total_pages: int
    cached: bool = False

class CountryTotal(BaseModel):
    country: str
    orders: int
    revenue_usd: Money

class RejectedRowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    row_number: int
    message: str

class Summary(BaseModel):
    valid_rows: int
    invalid_rows: int
    revenue_usd: Money
    high_value_orders: int
    by_country: list[CountryTotal]
    sample_errors: list[RejectedRowOut]
    cached: bool = False