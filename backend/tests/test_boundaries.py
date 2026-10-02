"""Architecture test: the API must not depend on worker code.

If someone writes `from app.worker.tasks import process_csv` in the API, this fails.
The API only refers to the job by its import path string when enqueueing.
"""

import sys


def test_api_does_not_import_worker():
    import app.api.main

    leaked = []
    for name in list(sys.modules):
        if name.startswith("app.worker"):
            leaked.append(name)

    assert leaked == [], f"API imported worker modules: {leaked}"