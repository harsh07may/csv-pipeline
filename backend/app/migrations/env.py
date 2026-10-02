"""Alembic environment: points Alembic at our models and our DATABASE_URL.

Run from backend/ (or /code in the container):  alembic -c app/alembic.ini upgrade head
"""
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from app.core import models  # noqa: F401  (importing registers every table on Base.metadata)
from app.core.config import DATABASE_URL
from app.core.db import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Autogenerate compares this metadata with the real database to write migrations.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Emit the SQL as text instead of running it (alembic upgrade head --sql)."""
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Connect to the database and run the migrations."""
    # NullPool: this is a short-lived command, so don't keep connections open afterwards.
    engine = create_engine(DATABASE_URL, poolclass=pool.NullPool)
    with engine.connect() as connection:
        # compare_type: also notice column TYPE changes (e.g. float -> numeric), not just new columns.
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
