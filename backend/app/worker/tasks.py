"""Background work, executed by the RQ worker process."""
import os
import tempfile

from app.core.db import SessionLocal
from app.core.models import Job, JobStatus
from app.core.storage import download_file

# TODO:
# check if the job exists
# update status to processing and commit
# download file to tmp dir
# return total rows of the file minus header for v1
# update status to completed and commit 


def process_csv(job_id: str) -> dict:
    with SessionLocal() as session:
        job = session.get(Job, job_id)
        if job is None:
            return {"session": "job not found"}

        job.status = JobStatus.PROCESSING
        session.commit()

        with tempfile.TemporaryDirectory() as tmp_dir:
            local_path = os.path.join(tmp_dir, "input.csv")
            download_file(job.object_key, local_path)
            
            with open(local_path, "r") as file:
                job.total_rows = max(sum(1 for every_line in file) - 1, 0)

        job.status = JobStatus.COMPLETED
        session.commit()
        print(f"Job {job_id}: {job.total_rows} rows")

    return {"total_rows": job.total_rows}