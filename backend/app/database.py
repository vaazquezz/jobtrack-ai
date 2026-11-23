"""Database engine and session management (SQLite via SQLModel)."""

from collections.abc import Iterator
from typing import Any

from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings

# SQL function name for Unicode-aware lowercasing. SQLite's own lower() and LIKE only
# fold ASCII letters, so "Telefónica" would not match "TELEFÓNICA" without this.
CASEFOLD_FUNCTION = "py_casefold"


def _casefold(value: str | None) -> str | None:
    return value.casefold() if isinstance(value, str) else value


def _register_sqlite_functions(dbapi_connection: Any, _connection_record: Any) -> None:
    dbapi_connection.create_function(CASEFOLD_FUNCTION, 1, _casefold, deterministic=True)


def build_engine(database_url: str, **engine_options: Any) -> Engine:
    """Create an engine. SQLite needs `check_same_thread=False` to be used from FastAPI."""
    is_sqlite = database_url.startswith("sqlite")
    connect_args = {"check_same_thread": False} if is_sqlite else {}
    new_engine = create_engine(database_url, connect_args=connect_args, **engine_options)
    if is_sqlite:
        event.listen(new_engine, "connect", _register_sqlite_functions)
    return new_engine


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
