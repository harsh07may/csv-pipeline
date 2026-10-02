"""Runs before any test module is imported.

app.core.config reads required settings from the environment at import time. These dummy
values let the tests import the app without a .env file. Nothing here connects to S3,
Redis or Postgres: the engine and clients connect lazily.
"""
import os

os.environ.setdefault("S3_ACCESS_KEY", "test")
os.environ.setdefault("S3_SECRET_KEY", "test")
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@localhost:5432/test")
