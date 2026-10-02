#!/usr/bin/env bash
# Runs the whole upload flow from the terminal: create job -> upload to Garage -> start.
# Prints the job id, so you can capture it:   JOB=$(./scripts/upload.sh orders.csv)
set -euo pipefail
FILE=${1:-orders.csv}
API=http://localhost:8000


# 1. Ask the API for a job + pre-signed URL. The response looks like
#    {"job_id":"...","upload_url":"..."}; sed pulls out each value (no jq needed).
RESPONSE=$(curl -sf -X POST "$API/api/uploads" -H 'Content-Type: application/json' \
  -d "{\"filename\": \"$(basename "$FILE")\"}")
JOB_ID=$(echo "$RESPONSE" | sed -E 's/.*"job_id":"([^"]+)".*/\1/')
UPLOAD_URL=$(echo "$RESPONSE" | sed -E 's/.*"upload_url":"([^"]+)".*/\1/')

# 2. PUT the file straight to Garage. Our API never sees these bytes.
curl -sf -T "$FILE" "$UPLOAD_URL" > /dev/null

# 3. Tell the API the upload is done, so it can queue the job.
curl -sf -X POST "$API/api/jobs/$JOB_ID/start" > /dev/null

echo "$JOB_ID"