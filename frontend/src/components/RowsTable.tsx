import { useState } from "react";
import { useRows } from "../hooks/useRows";
import { formatCount, formatMoney, formatUsd } from "../lib/format";

interface RowsTableProps {
  jobId: string;
}

export default function RowsTable({ jobId }: RowsTableProps) {
  const [page, setPage] = useState(1);
  const { data, error, isPending, isPlaceholderData } = useRows(jobId, page);

  if (isPending) return <p className="note">Loading orders…</p>;
  if (error) return <p className="error" role="alert">Couldn't load orders: {error.message}</p>;

  return (
    <section className="orders" aria-labelledby="orders-title">
      <h2 id="orders-title">Orders ({formatCount(data.total)})</h2>

      <div className="panel table-panel" data-stale={isPlaceholderData}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Country</th>
                <th className="num">Amount</th>
                <th className="num">In USD</th>
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
                  <td className="num">{formatMoney(row.amount, row.currency)}</td>
                  <td className="num">{formatUsd(row.amount_usd)}</td>
                  <td>{row.order_date}</td>
                  <td>{row.is_high_value ? <span className="flag">High value</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <nav className="pager" aria-label="Pages of orders">
          <button className="button button-quiet" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
            Previous
          </button>
          <span>
            Page {data.page} of {data.total_pages}
          </span>
          <button
            className="button button-quiet"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= data.total_pages}
          >
            Next
          </button>
        </nav>
      </div>
    </section>
  );
}
