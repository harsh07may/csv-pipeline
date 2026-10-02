"""All settings come from environment variables (see .env). One place, no magic."""
import os
# --- Blob storage (Garage) ---
S3_BUCKET = os.getenv("S3_BUCKET", "csv-uploads")
S3_REGION = os.getenv("S3_REGION", "garage")
S3_ACCESS_KEY = os.environ["S3_ACCESS_KEY"]     # fail at startup, not on the first upload
S3_SECRET_KEY = os.environ["S3_SECRET_KEY"]

# Two endpoints for the SAME Garage server:
#  - containers reach it by its compose service name ("garage")
#  - the browser reaches it through the published port on localhost
S3_INTERNAL_ENDPOINT = os.getenv("S3_INTERNAL_ENDPOINT", "http://garage:3900")
S3_PUBLIC_ENDPOINT = os.getenv("S3_PUBLIC_ENDPOINT", "http://localhost:3900")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

# --- Database ---
DB_PATH = os.getenv("DB_PATH", "/data/app.db")
SQL_ECHO = os.getenv("SQL_ECHO", "false").lower() == "true"   # print every SQL statement

# --- Queue ---
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
QUEUE_NAME = "csv"
# Import path the worker resolves; a string so the API never imports worker code.
# Must match the real function in app/worker/tasks.py.
PROCESS_CSV_TASK = "app.worker.tasks.process_csv"