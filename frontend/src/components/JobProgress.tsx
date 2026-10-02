import type { JobUpdate } from "../hooks/useJobEvents";

interface JobProgressProps {
  job: JobUpdate;
}

export default function JobProgress({ job }: JobProgressProps) {
  const done = job.total_rows ?? 0;
  const expected = job.expected_rows || 0;
  const percent =
    job.status === "completed"
      ? 100
      : expected
        ? Math.round((done / expected) * 100)
        : 0;
  return (
    <section className="card">
      <p>
        Status: <strong>{job.status}</strong>
      </p>
      <progress value={percent} max="100" />
      <p>
        {done} rows read · {job.valid_rows ?? 0} valid · {job.invalid_rows ?? 0}{" "}
        rejected
      </p>
      {job.status === "failed" && <p className="error">{job.error}</p>}
    </section>
  );
}
