"""One-time: allow the React dev server's origin to PUT files straight into the bucket.
Without CORS the browser blocks the cross-origin upload (localhost:5173 -> localhost:3900).
Run via: docker compose run --rm api python -m app.setup_storage
"""
import time
from botocore.exceptions import BotoCoreError, ClientError
from app.core.config import FRONTEND_ORIGIN, S3_BUCKET
from app.core.storage import internal_s3
CORS_RULES = {
    "CORSRules": [{
        "AllowedOrigins": [FRONTEND_ORIGIN],
        "AllowedMethods": ["PUT"],
        "AllowedHeaders": ["*"],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3600,
    }]
}
def main(attempts: int = 10) -> None:
    # Garage creates the bucket a moment after it starts, so retry briefly instead of
    # failing if this runs right after `docker compose up`.
    for attempt in range(1, attempts + 1):
        try:
            internal_s3.put_bucket_cors(Bucket=S3_BUCKET, CORSConfiguration=CORS_RULES)
            print(f"CORS set on bucket '{S3_BUCKET}' for {FRONTEND_ORIGIN}")
            return
        except (ClientError, BotoCoreError) as exc:
            if attempt == attempts:
                raise
            print(f"Garage not ready yet ({exc.__class__.__name__}), retrying...")
            time.sleep(2)
if __name__ == "__main__":
    main()