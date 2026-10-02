"""Architecture test: the API must not depend on worker code.

If someone writes `from app.worker.tasks import process_csv` in the API, this fails.
The API only refers to the job by its import path string when enqueueing.
"""

import os
import sys

# Dummy values so config imports; nothing here connects to S3 or Redis.
os.environ.setdefault("S3_ACCESS_KEY", "test")
os.environ.setdefault("S3_SECRET_KEY", "test")

def test_api_does_not_import_worker():
    import app.api.main

    leaked = []
    for name in list(sys.modules):
        if name.startswith("app.worker"):
            leaked.append(name)

    assert leaked == [], f"API imported worker modules: {leaked}"