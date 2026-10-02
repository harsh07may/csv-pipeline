/** A job as the API returns it (mirrors JobOut in backend/app/api/schemas.py). */
export interface JobState {
  id: string;
  filename: string;
  status: string; // awaiting_upload | queued | processing | completed | failed
  expected_rows: number;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  error: string | null;
  created_at: string;
}

/** Response of POST /api/uploads. */
export interface UploadResponse {
  job_id: string;
  upload_url: string;
}

export interface CountryTotal {
  country: string;
  orders: number;
  revenue_usd: number;
}

export interface RejectedRow {
  row_number: number;
  message: string;
}

/** Response of GET /api/jobs/{id}/summary. */
export interface JobSummary {
  valid_rows: number;
  invalid_rows: number;
  revenue_usd: number;
  high_value_orders: number;
  by_country: CountryTotal[];
  sample_errors: RejectedRow[];
  cached: boolean;
}

export interface Order {
  order_id: string;
  customer_email: string;
  country: string;
  currency: string;
  amount: number;
  amount_usd: number;
  order_date: string; // ISO date, e.g. "2026-10-02"
  is_high_value: boolean;
}

/** Response of GET /api/jobs/{id}/rows. */
export interface RowsPage {
  items: Order[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  cached: boolean;
}
