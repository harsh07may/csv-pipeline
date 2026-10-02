import { useSummary } from "../hooks/useSummary";
import { formatCount, formatUsd } from "../lib/format";

interface SummaryProps {
  jobId: string;
}

export default function Summary({ jobId }: SummaryProps) {
  const { data, isPending, error } = useSummary(jobId);

  if (isPending) return <p className="note">Loading results…</p>;
  if (error) return <p className="error" role="alert">Couldn't load results: {error.message}</p>;

  // The biggest country fills its bar; the others are drawn relative to it.
  const topRevenue = Math.max(...data.by_country.map((c) => c.revenue_usd), 1);

  return (
    <section className="results" aria-labelledby="results-title">
      <h2 id="results-title">Results</h2>
      {data.cached && <p className="note">Served from cache.</p>}

      <dl className="figures figures-large">
        <div>
          <dt>Revenue</dt>
          <dd>{formatUsd(data.revenue_usd)}</dd>
        </div>
        <div>
          <dt>High-value orders</dt>
          <dd>{formatCount(data.high_value_orders)}</dd>
        </div>
        <div>
          <dt>Rejected rows</dt>
          <dd>{formatCount(data.invalid_rows)}</dd>
        </div>
      </dl>

      {data.by_country.length > 0 && (
        <>
          <h3>Revenue by country</h3>
          <ul className="bars">
            {data.by_country.map((c) => (
              <li key={c.country}>
                <span className="bars-label">{c.country}</span>
                <span className="bars-track">
                  <span className="bars-fill" style={{ width: `${(c.revenue_usd / topRevenue) * 100}%` }} />
                </span>
                <span className="bars-value">
                  {formatUsd(c.revenue_usd)}
                  <span className="bars-count"> from {formatCount(c.orders)} orders</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {data.sample_errors.length > 0 && (
        <details className="rejects">
          <summary>Why rows were rejected ({formatCount(data.invalid_rows)})</summary>
          <ul>
            {data.sample_errors.map((e) => (
              <li key={e.row_number}>
                <span className="rejects-line">Line {e.row_number}</span> {e.message}
              </li>
            ))}
          </ul>
          {data.invalid_rows > data.sample_errors.length && (
            <p className="note">Showing the first {data.sample_errors.length}.</p>
          )}
        </details>
      )}
    </section>
  );
}
