// All settings come from environment variables (see .env). One place, no magic.

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

// --- Blob storage (Garage) ---
export const S3_BUCKET = process.env.S3_BUCKET ?? "csv-uploads";
export const S3_REGION = process.env.S3_REGION ?? "garage";
export const S3_ACCESS_KEY = required("S3_ACCESS_KEY"); // fail at startup, not on the first upload
export const S3_SECRET_KEY = required("S3_SECRET_KEY");

// Two endpoints for the SAME Garage server:
//  - containers reach it by its compose service name ("garage")
//  - the browser reaches it through the published port on localhost
export const S3_INTERNAL_ENDPOINT = process.env.S3_INTERNAL_ENDPOINT ?? "http://garage:3900";
export const S3_PUBLIC_ENDPOINT = process.env.S3_PUBLIC_ENDPOINT ?? "http://localhost:3900";
export const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";

// --- Database (Postgres) ---
// e.g. postgresql://user:password@postgres:5432/dbname
// The old SQLAlchemy driver suffix ("postgresql+psycopg://") is dropped so an old .env still works.
export const DATABASE_URL = required("DATABASE_URL").replace(/^(postgres(?:ql)?)\+\w+:/, "$1:");
export const SQL_ECHO = (process.env.SQL_ECHO ?? "false").toLowerCase() === "true";

// --- Queue ---
export const REDIS_URL = process.env.REDIS_URL ?? "redis://redis:6379/0";
export const QUEUE_NAME = "csv";
export const PROCESS_CSV_JOB = "process_csv";
export const JOB_TIMEOUT_MS = 600_000;

// --- Server ---
export const PORT = Number(process.env.PORT ?? 8000);

// --- Processing ---
// Simulated delay in seconds for testing; 0 means no delay.
export const SIMULATED_DELAY_SECONDS = Number(process.env.SIMULATED_DELAY_SECONDS ?? 0);

// --- Cache ---
export const CACHE_TTL_SECONDS = 300;

// --- Observability ---
// "json": one JSON object per line (containers, log shippers). "console": readable, for local dev.
export const LOG_FORMAT = (process.env.LOG_FORMAT ?? "console").toLowerCase();
export const LOG_LEVEL = (process.env.LOG_LEVEL ?? "INFO").toLowerCase();
