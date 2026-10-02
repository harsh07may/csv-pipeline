import { useEffect, useState } from "react";
import { api } from "../api.js";
import type { RowsPage } from "../types";

const PAGE_SIZE = 25;

interface RowsTableProps {
  jobId: string
}

export default function RowsTable({ jobId }: RowsTableProps) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RowsPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Refetch whenever the job or the page changes.
  useEffect(() => {
    let ignore = false; // guards against a slow old response overwriting a newer one
    api
      .getRows(jobId, page, PAGE_SIZE)
      .then((result) => !ignore && setData(result))
      .catch((err) => !ignore && setError(err.message));
    return () => {
      ignore = true;
    };
  }, [jobId, page]);
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>Loading rows…</p>;
  return (
    <section className="card">
      <h2>
        Orders ({data.total}){" "}
        {data.cached && <span className="badge">from cache</span>}
      </h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Email</th>
              <th>Country</th>
              <th>Amount</th>
              <th>USD</th>
              <th>Date</th>
              <th>High value</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((row) => (
              <tr key={row.order_id}>
                <td>{row.order_id}</td>
                <td>{row.customer_email}</td>
                <td>{row.country}</td>
                <td>
                  {row.amount.toFixed(2)} {row.currency}
                </td>
                <td>{row.amount_usd.toFixed(2)}</td>
                <td>{row.order_date}</td>
                <td>{row.is_high_value ? "Yes" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
          Previous
        </button>
        <span>
          Page {data.page} of {data.total_pages}
        </span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={page >= data.total_pages}
        >
          Next
        </button>
      </div>
    </section>
  );
}
