"""Database tables as Python classes (SQLAlchemy 2.0 typed style).

`Mapped[int]` means NOT NULL integer; `Mapped[str | None]` means nullable.
These describe the DATABASE. What the API returns lives in api/schemas.py.
"""
from datetime import date, datetime, timezone
from enum import StrEnum

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base

def _utcnow():
    return datetime.now(timezone.utc)

class JobStatus(StrEnum):
    """The job state machine: awaiting_upload -> queued -> processing -> completed | failed."""
    AWAITING_UPLOAD = "awaiting_upload"
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class Job(Base):
    __tablename__ = "jobs"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    filename: Mapped[str]
    object_key: Mapped[str]          # internal detail: never exposed by the API
    status: Mapped[str] = mapped_column(String(20), default=JobStatus.AWAITING_UPLOAD)
    expected_rows: Mapped[int] = mapped_column(default=0)
    total_rows: Mapped[int] = mapped_column(default=0)
    valid_rows: Mapped[int] = mapped_column(default=0)
    invalid_rows: Mapped[int] = mapped_column(default=0)
    error: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)

class Order(Base):
    __tablename__ = "orders"
    # Pagination filters by job_id and sorts by id: this index serves exactly that query.
    __table_args__ = (Index("ix_orders_job_id_id", "job_id", "id"),)

    id: Mapped[int] = mapped_column(primary_key=True)   # auto-increment
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"))
    order_id: Mapped[str]
    customer_email: Mapped[str]
    country: Mapped[str] = mapped_column(String(2))
    currency: Mapped[str] = mapped_column(String(3))
    amount: Mapped[float]
    amount_usd: Mapped[float]
    order_date: Mapped[date]
    is_high_value: Mapped[bool]


class RejectedRow(Base):
    __tablename__ = "rejected_rows"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), index=True)
    row_number: Mapped[int]
    message: Mapped[str]