"""Background work, executed by the RQ worker process."""
import csv
import os
import tempfile
import time

from sqlalchemy import delete, insert
from sqlalchemy.orm import Session

from app.core.config import SIMULATED_DELAY_SECONDS
from app.core.db import SessionLocal
from app.core.events import publish_job_event
from app.core.models import Job, JobStatus, Order, RejectedRow
from app.core.processing import RowError, check_header, process_row
from app.core.storage import download_file

# TODO:
# check if the job exists
# update status to processing and commit
# download file to tmp dir
# return total rows of the file minus header for v1
# update status to completed and commit 

BATCH_SIZE = 500          # rows per transaction + progress event
MAX_STORED_ERRORS = 200   # keep a sample of rejected rows, not millions of them

def process_csv(job_id: str) -> dict:
    """Entry point. RQ calls this with the arguments given to queue.enqueue()."""
    
    with SessionLocal() as session:
        job = session.get(Job, job_id)
        if job is None:
            return {"session": "job not found"}

        job.status = JobStatus.PROCESSING
        session.commit()
        publish_job_event(job_id, {"status": job.status, "total_rows": 0})

        try:
            with tempfile.TemporaryDirectory() as tmp_dir:
                local_path = os.path.join(tmp_dir, "input.csv")
                download_file(job.object_key, local_path)
                _process_file(session, job, local_path)
        
        except Exception as exc:
            session.rollback()                  # discard the half-finished batch
            job.status, job.error = JobStatus.FAILED, str(exc)
            session.commit()
            publish_job_event(job_id, {"status": job.status, "error": job.error})
            raise  

        job.status = JobStatus.COMPLETED
        session.commit()
        print(f"Job {job_id}: {job.total_rows} rows")

        stats = {"total_rows": job.total_rows, 
                 "valid_rows": job.valid_rows,
                 "invalid_rows": job.invalid_rows
                 }
        publish_job_event(job_id, {"status": job.status, **stats})

    return stats    

# Idempotency: 
# What: Operations can be applied multiple times without changing the result beyond the initial application. 
# Where: If worker crashes & RQ retries the job, it No double-counting rows or duplicates created. 
# How: The database transaction + row-level validation ensures this.

def _process_file(session: Session, job: Job, path: str) -> None:
    
    #  If job is retried, wipe rows to avoid duplication.
    session.execute(delete(Order).where(Order.job_id == job.id))
    session.execute(delete(RejectedRow).where(RejectedRow.job_id == job.id))
    job.expected_rows = _count_data_lines(path)
    session.commit()
    
    total = valid = invalid = stored_errors = 0
    seen_order_ids: set[str] = set()
    good_rows: list[dict] = []
    rejected: list[dict] = []
    
    # utf-8-sig silently drops the BOM that Excel likes to add at the start of CSV files.
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        check_header(reader.fieldnames or [])

        for line_number, raw in enumerate(reader, start=2):   # line 1 is the header
            total += 1
            try:
                row = process_row(raw)
                # A rule that needs context across rows lives here, not in process_row().
                if row["order_id"] in seen_order_ids:
                    raise RowError(f"duplicate order_id '{row['order_id']}'")
                seen_order_ids.add(row["order_id"])
                good_rows.append({"job_id": job.id, **row})
                valid += 1
            except RowError as err:
                invalid += 1
                if stored_errors < MAX_STORED_ERRORS:
                    rejected.append({"job_id": job.id, "row_number": line_number, "message": str(err)})
                    stored_errors += 1
            
            
            if total % BATCH_SIZE == 0:
                _save_batch(session, job, good_rows, rejected, total, valid, invalid)
                good_rows, rejected = [], []
                time.sleep(SIMULATED_DELAY_SECONDS)   # DEMO ONLY: lets you watch the progress bar
    
    if total % BATCH_SIZE or total == 0:   # a partly filled last batch (or an empty file)
        _save_batch(session, job, good_rows, rejected, total, valid, invalid)



def _save_batch(session: Session, job: Job, 
                good_rows: list[dict], failed_rows: list[dict],
                total: int, valid: int, invalid: int) -> None:
    
    # Bulk INSERT: one statement executed for many parameter sets. Much faster than
    # creating an Order object per row, which matters when a file has 100k rows.
    if good_rows:
        session.execute(insert(Order), good_rows)
    if failed_rows:
        session.execute(insert(RejectedRow), failed_rows)
    
    job.total_rows, job.valid_rows, job.invalid_rows = total, valid, invalid
    session.commit()   # rows + progress counters land in ONE transaction: never out of sync

    publish_job_event(job.id, {
    "status": JobStatus.PROCESSING, "expected_rows": job.expected_rows,
    "total_rows": total, "valid_rows": valid, "invalid_rows": invalid,
})

def _count_data_lines(path: str) -> int:
    """Cheap pre-scan so the UI can show a percentage. Approximate if fields contain newlines."""

    with open(path, encoding="utf-8-sig") as f:
        return max(sum(1 for _ in f) - 1, 0)