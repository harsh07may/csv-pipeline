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