"""The API enqueues the job by string, so nothing else checks the string is right.

This imports worker code, so it lives in its own file: test_boundaries.py must run
first (pytest runs files alphabetically) or it would see app.worker in sys.modules.
"""

import importlib
import os

# Dummy values so config imports; nothing here connects to S3 or Redis.
os.environ.setdefault("S3_ACCESS_KEY", "test")
os.environ.setdefault("S3_SECRET_KEY", "test")


def test_task_path_points_to_real_function():
    from app.core.config import PROCESS_CSV_TASK

    module_path, func_name = PROCESS_CSV_TASK.rsplit(".", 1)
    module = importlib.import_module(module_path)
    assert callable(getattr(module, func_name))
