"""Database engine and session management (SQLite via SQLModel)."""

from collections.abc import Iterator
from typing import Any

from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings


def build_engine(database_url: str, **engine_options: Any) -> Engine:
    """Create an engine. SQLite needs `check_same_thread=False` to be used from FastAPI."""
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    return create_engine(database_url, connect_args=connect_args, **engine_options)


engine = build_engine(get_settings().database_url)


def create_db_and_tables(target_engine: Engine = engine) -> None:
    """Create all tables that do not exist yet."""
    # Import models so their tables are registered in SQLModel.metadata.
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(target_engine)


def get_session() -> Iterator[Session]:
    """FastAPI dependency that yields a database session per request."""
    with Session(engine) as session:
        yield session
