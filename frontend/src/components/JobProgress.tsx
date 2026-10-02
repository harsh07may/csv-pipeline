import type { JobUpdate } from "../hooks/useJobEvents";
import { formatCount } from "../lib/format";
import { STATUS_LABEL } from "../lib/status";

interface JobProgressProps {
  job: JobUpdate;
}

export default function JobProgress({ job }: JobProgressProps) {
  const status = job.status ?? "queued";
  const total = job.total_rows ?? 0;
  const valid = job.valid_rows ?? 0;
  const invalid = job.invalid_rows ?? 0;

  // expected_rows is a quick line count taken before processing, so it can be slightly off.
  // Once the job is done, the real total is the truth.
  const scale = status === "completed" ? total : Math.max(job.expected_rows ?? 0, total);
  const share = (rows: number) => (scale ? Math.min(100, (rows / scale) * 100) : 0);
  const remaining = Math.max(scale - total, 0);

  return (
    <section className="panel run" aria-live="polite">
      <div className="run-head">
        <h2>{job.filename ?? "Import"}</h2>
        <span className="status" data-status={status}>
          {STATUS_LABEL[status] ?? status}
        </span>
      </div>

      <div
        className="ingest"
        role="progressbar"
        aria-label="Rows processed"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(share(total))}
      >
        <div className="ingest-valid" style={{ width: `${share(valid)}%` }} />
        <div className="ingest-rejected" style={{ width: `${share(invalid)}%` }} />
      </div>

      <dl className="figures">
        <div>
          <dt>Valid</dt>
          <dd>{formatCount(valid)}</dd>
        </div>
        <div>
          <dt>Rejected</dt>
          <dd>{formatCount(invalid)}</dd>
        </div>
        {status !== "completed" && status !== "failed" && (
          <div>
            <dt>Left to read</dt>
            <dd>{formatCount(remaining)}</dd>
          </div>
        )}
      </dl>

      {status === "failed" && job.error && (
        <p className="error" role="alert">
          {job.error}
        </p>
      )}
    </section>
  );
}
