import { useEffect, useState } from "react";
import { api } from "../api.js";
import type { JobSummary } from "../types";

interface SummaryProps {
  jobId: string | null;
}

export default function Summary({ jobId }: SummaryProps) {
  const [summary, setSummary] = useState<JobSummary | null>(null);
  useEffect(() => {
    if (!jobId) return;
    api.getSummary(jobId).then(setSummary).catch(console.error);
  }, [jobId]);
  if (!summary) return null;
  return (
    <section className="card">
      <h2>
        Summary {summary.cached && <span className="badge">from cache</span>}
      </h2>
      <p>
        Revenue: ${summary.revenue_usd.toLocaleString()} · High-value orders:{" "}
        {summary.high_value_orders}
      </p>
      {summary.sample_errors.length > 0 && (
        <details>
          <summary>First rejected rows</summary>
          <ul>
            {summary.sample_errors.map((e) => (
              <li key={e.row_number}>
                Line {e.row_number}: {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
