import { useRecentJobs } from "../hooks/useRecentJobs";
import { formatCount, formatDateTime } from "../lib/format";
import { STATUS_LABEL } from "../lib/status";

interface RecentJobsProps {
  currentJobId: string | null;
  onSelect: (jobId: string) => void;
}

export default function RecentJobs({ currentJobId, onSelect }: RecentJobsProps) {
  const { data: jobs } = useRecentJobs();

  // A history list is a convenience: while loading, empty or failing, show nothing at all.
  if (!jobs || jobs.length === 0) return null;

  return (
    <section className="recent" aria-labelledby="recent-title">
      <h2 id="recent-title">Recent imports</h2>
      <ul className="panel recent-list">
        {jobs.map((job) => (
          <li key={job.id}>
            <button
              className="recent-item"
              aria-current={job.id === currentJobId ? "true" : undefined}
              onClick={() => job.id !== currentJobId && onSelect(job.id)}
            >
              <span className="recent-name">{job.filename}</span>
              <span className="status" data-status={job.status}>
                {STATUS_LABEL[job.status] ?? job.status}
              </span>
              <span className="recent-counts">
                {formatCount(job.valid_rows)} valid, {formatCount(job.invalid_rows)} rejected
              </span>
              <time className="recent-time" dateTime={job.created_at}>
                {formatDateTime(job.created_at)}
              </time>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
