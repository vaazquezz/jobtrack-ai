"""The optional demo data loader (app/seed.py)."""

from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlmodel import Session, func, select

from app.models import Application
from app.seed import DEMO_APPLICATIONS, seed

TODAY = date(2026, 11, 23)


def count(engine: Engine) -> int:
    with Session(engine) as session:
        return session.exec(select(func.count()).select_from(Application)).one()


def test_seed_fills_an_empty_database(engine: Engine):
    assert seed(engine, TODAY) == len(DEMO_APPLICATIONS)
    assert count(engine) == len(DEMO_APPLICATIONS)


def test_seed_never_touches_existing_data(client: TestClient, engine: Engine):
    client.post("/api/applications", json={"company": "Mine", "position": "Dev"})

    assert seed(engine, TODAY) == 0
    assert count(engine) == 1


def test_seed_is_idempotent(engine: Engine):
    seed(engine, TODAY)

    assert seed(engine, TODAY) == 0
    assert count(engine) == len(DEMO_APPLICATIONS)


def test_demo_data_covers_every_feature(client: TestClient, engine: Engine):
    seed(engine, TODAY)

    statuses = {a["status"] for a in client.get("/api/applications").json()}
    assert statuses == {"wishlist", "applied", "interview", "offer", "rejected"}
    counts = client.get("/api/follow-ups", params={"today": TODAY.isoformat()}).json()["counts"]
    assert counts["overdue"] > 0 and counts["today"] > 0 and counts["upcoming"] > 0
    stats = client.get("/api/stats", params={"period": "30d", "today": TODAY.isoformat()}).json()
    assert stats["submitted"] > 0 and stats["interviews"] > 0


def test_demo_data_is_valid_and_fictional(engine: Engine):
    seed(engine, TODAY)

    with Session(engine) as session:
        rows = session.exec(select(Application)).all()
    for row in rows:
        assert not row.url or row.url.startswith("https://example.com/")
        if row.applied_date and row.follow_up_date:
            assert row.follow_up_date >= row.applied_date
