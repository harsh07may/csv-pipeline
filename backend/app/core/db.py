"""SQLAlchemy engine + session factory. The only file that knows we use SQLite."""
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import DB_PATH, SQL_ECHO

# The engine owns a pool of DB connections.
engine = create_engine(
    f"sqlite:///{DB_PATH}",
    echo=SQL_ECHO,
    connect_args={"timeout": 10},
)

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Set PRAGMAs on each new connection."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL") # readers dont block writers
    cursor.execute("PRAGMA foreign_keys=ON") # sqlite ignores FK by default
    cursor.close()

# Unit of work
SessionLocal = sessionmaker(bind = engine, expire_on_commit=False)

class Base(DeclarativeBase):
    """Base class for all ORM models."""

def init_db():
    from . import models # noqa: F401
    Base.metadata.create_all(engine) # CREATE TABLE IF NOT EXISTS ... for all models