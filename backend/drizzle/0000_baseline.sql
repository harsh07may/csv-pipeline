-- Baseline of the schema the Python backend (Alembic revision 0001) already created.
-- Every statement is IF NOT EXISTS, so on an existing database this changes nothing,
-- and on an empty one it creates the same tables.
CREATE TABLE IF NOT EXISTS "jobs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"filename" varchar NOT NULL,
	"object_key" varchar NOT NULL,
	"status" varchar(20) DEFAULT 'awaiting_upload' NOT NULL,
	"expected_rows" integer DEFAULT 0 NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"valid_rows" integer DEFAULT 0 NOT NULL,
	"invalid_rows" integer DEFAULT 0 NOT NULL,
	"error" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" varchar(36) NOT NULL REFERENCES "jobs"("id"),
	"order_id" varchar NOT NULL,
	"customer_email" varchar NOT NULL,
	"country" varchar(2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"amount_usd" numeric(12, 2) NOT NULL,
	"order_date" date NOT NULL,
	"is_high_value" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rejected_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" varchar(36) NOT NULL REFERENCES "jobs"("id"),
	"row_number" integer NOT NULL,
	"message" varchar NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_orders_job_id_id" ON "orders" USING btree ("job_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_rejected_rows_job_id" ON "rejected_rows" USING btree ("job_id");