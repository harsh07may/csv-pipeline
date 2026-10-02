"""SQLAlchemy engine + session factory. The only file that knows which database we use."""
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import DATABASE_URL, SQL_ECHO

# The engine owns a pool of DB connections.
# pool_pre_ping: test a pooled connection before using it, so a restarted database
# doesn't surface as one failed request.
engine = create_engine(DATABASE_URL, echo=SQL_ECHO, pool_pre_ping=True)

# Unit of work
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

# The same database through psycopg's async mode, for code running on the event loop
# (the live-progress stream). Everything else uses the sync SessionLocal above.
async_engine = create_async_engine(DATABASE_URL, echo=SQL_ECHO, pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(bind=async_engine, expire_on_commit=False)

class Base(DeclarativeBase):
    """Base class for all ORM models."""
