// Database tables (Drizzle). These describe the DATABASE; what the API returns is shaped in the routes.
// Example: jobs.object_key exists in the table but is never sent to clients.
import { boolean, date, index, integer, numeric, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

// The job state machine: awaiting_upload -> queued -> processing -> completed | failed
export const JobStatus = {
  AWAITING_UPLOAD: "awaiting_upload",
  QUEUED: "queued",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export const jobs = pgTable("jobs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  filename: varchar("filename").notNull(),
  object_key: varchar("object_key").notNull(), // internal detail: never exposed by the API
  status: varchar("status", { length: 20 }).notNull().default(JobStatus.AWAITING_UPLOAD),
  expected_rows: integer("expected_rows").notNull().default(0),
  total_rows: integer("total_rows").notNull().default(0),
  valid_rows: integer("valid_rows").notNull().default(0),
  invalid_rows: integer("invalid_rows").notNull().default(0),
  error: varchar("error"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    job_id: varchar("job_id", { length: 36 }).notNull().references(() => jobs.id),
    order_id: varchar("order_id").notNull(),
    customer_email: varchar("customer_email").notNull(),
    country: varchar("country", { length: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    // exact decimals, as strings: never JavaScript floats for money
    amount: numeric("amount", { precision: 12, scale: 2, mode: "string" }).notNull(),
    amount_usd: numeric("amount_usd", { precision: 12, scale: 2, mode: "string" }).notNull(),
    order_date: date("order_date", { mode: "string" }).notNull(),
    is_high_value: boolean("is_high_value").notNull(),
  },
  // Pagination filters by job_id and sorts by id: this index serves exactly that query.
  (table) => [index("ix_orders_job_id_id").on(table.job_id, table.id)],
);

export const rejectedRows = pgTable(
  "rejected_rows",
  {
    id: serial("id").primaryKey(),
    job_id: varchar("job_id", { length: 36 }).notNull().references(() => jobs.id),
    row_number: integer("row_number").notNull(),
    message: varchar("message").notNull(),
  },
  (table) => [index("ix_rejected_rows_job_id").on(table.job_id)],
);

export type Job = typeof jobs.$inferSelect;
