"""The worker process: `python -m app.worker.main`.

This replaces the `rq worker` command so logging and tracing are set up before any job runs.
"""
import redis
import structlog
from opentelemetry import propagate, trace
from opentelemetry.trace import SpanKind
from rq import Queue, Worker

from app.core.config import QUEUE_NAME, REDIS_URL
from app.core.observability import setup_observability

tracer = trace.get_tracer(__name__)
log = structlog.get_logger(__name__)


class TracedWorker(Worker):
    """An RQ worker whose jobs continue the trace that the API request started."""

    def perform_job(self, job, queue):
        #* perform_job runs inside RQ's forked "work horse", once per job.
        #* The API stored its trace context in the job's meta when it enqueued the job.
        context = propagate.extract(job.meta.get("otel", {}))
        job_id = job.args[0] if job.args else None
        structlog.contextvars.bind_contextvars(job_id=job_id, rq_job_id=job.id)
        try:
            with tracer.start_as_current_span(
                "process_csv job", context=context, kind=SpanKind.CONSUMER,
                attributes={"job.id": job_id, "rq.job_id": job.id},
            ):
                return super().perform_job(job, queue)
        finally:
            # The horse exits right after this job, so push the spans out before it dies.
            trace.get_tracer_provider().force_flush()
            structlog.contextvars.clear_contextvars()


def main() -> None:
    setup_observability("csv-worker")
    log.info("worker_started", queue=QUEUE_NAME)
    connection = redis.Redis.from_url(REDIS_URL)
    TracedWorker([Queue(QUEUE_NAME, connection=connection)], connection=connection).work()


if __name__ == "__main__":
    main()
