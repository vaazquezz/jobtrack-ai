"""Shared fixtures: every test gets its own empty in-memory SQLite database."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool
from sqlmodel import Session

from app.database import build_engine, create_db_and_tables, get_session
from app.main import app


@pytest.fixture
def engine() -> Iterator[Engine]:
    # StaticPool keeps a single connection so the in-memory database is shared
    # between the test and the request handlers, and discarded afterwards.
    test_engine = build_engine("sqlite://", poolclass=StaticPool)
    create_db_and_tables(test_engine)
    yield test_engine
    test_engine.dispose()


@pytest.fixture
def client(engine: Engine) -> Iterator[TestClient]:
    def override_get_session() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    # No `with` block: the startup hook would create tables in the real database file.
    yield TestClient(app)
    app.dependency_overrides.clear()
