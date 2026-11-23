"""Tests for GET /api/stats (fictional data only)."""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlmodel import Session

from app.models import Application

URL = "/api/stats"
TODAY = "2026-11-23"  # a Monday


def stats(client: TestClient, period: str = "all", today: str = TODAY) -> dict:
    response = client.get(URL, params={"period": period, "today": today})
    assert response.status_code == 200, response.text
    return response.json()


def add(client: TestClient, status: str, applied_date: str | None = None, company: str = "Co"):
    response = client.post(
        "/api/applications",
        json={
            "company": company,
            "position": "Developer",
            "status": status,
            "applied_date": applied_date,
        },
    )
    assert response.status_code == 201, response.text


def add_created_on(engine: Engine, created: str, status: str = "wishlist") -> None:
    """Insert an application with a chosen creation date and no applied date."""
    with Session(engine) as session:
        session.add(
            Application(
                company="Created Co",
                position="Developer",
                status=status,
                created_at=datetime.fromisoformat(created).replace(tzinfo=UTC),
            )
        )
        session.commit()


# --- Empty database --------------------------------------------------------------


@pytest.mark.parametrize("period", ["30d", "90d", "all"])
def test_empty_database_has_zero_counts_and_no_rates(client: TestClient, period: str):
    data = stats(client, period)

    assert data["total"] == data["submitted"] == data["responded"] == 0
    assert data["interviews"] == data["offers"] == data["undated_submitted"] == 0
    assert data["by_status"] == {
        "wishlist": 0,
        "applied": 0,
        "interview": 0,
        "offer": 0,
        "rejected": 0,
    }
    # No division by zero: rates are null when nothing was submitted.
    assert data["response_rate"] is None
    assert data["interview_rate"] is None
    assert data["offer_rate"] is None


def test_empty_fixed_period_still_lists_its_weeks_with_zero(client: TestClient):
    weekly = stats(client, "30d")["weekly"]

    # 30 days back from Monday 2026-11-23 starts on Sunday 2026-10-25 (week of 10-19).
    assert [w["week_start"] for w in weekly] == [
        "2026-10-19",
        "2026-10-26",
        "2026-11-02",
        "2026-11-09",
        "2026-11-16",
        "2026-11-23",
    ]
    assert all(w["count"] == 0 for w in weekly)


def test_empty_whole_history_has_no_weeks(client: TestClient):
    assert stats(client, "all")["weekly"] == []


# --- Counts and rates ------------------------------------------------------------


def test_counts_and_rates_follow_the_definitions(client: TestClient):
    counts = {"wishlist": 2, "applied": 3, "interview": 2, "offer": 1, "rejected": 2}
    for status, n in counts.items():
        for _ in range(n):
            add(client, status, "2026-11-10")

    data = stats(client)

    assert data["total"] == 10
    assert data["by_status"] == {
        "wishlist": 2,
        "applied": 3,
        "interview": 2,
        "offer": 1,
        "rejected": 2,
    }
    assert data["submitted"] == 8  # everything except wishlist
    assert data["responded"] == 5  # interview + offer + rejected
    assert data["interviews"] == 3  # interview + offer
    assert data["offers"] == 1
    assert data["response_rate"] == 0.625
    assert data["interview_rate"] == 0.375
    assert data["offer_rate"] == 0.125


def test_only_wishlist_means_nothing_submitted(client: TestClient):
    add(client, "wishlist")
    add(client, "wishlist")

    data = stats(client)

    assert data["total"] == 2
    assert data["submitted"] == 0
    assert data["response_rate"] is None


def test_rates_are_rounded_to_four_decimals(client: TestClient):
    for status in ["applied", "applied", "interview"]:
        add(client, status, "2026-11-10")

    data = stats(client)

    assert data["response_rate"] == 0.3333
    assert data["interview_rate"] == 0.3333


# --- Periods ---------------------------------------------------------------------


def test_period_boundaries_are_inclusive(client: TestClient):
    add(client, "applied", "2026-10-25", company="First day of 30d")
    add(client, "applied", "2026-10-24", company="Day before 30d")
    add(client, "applied", TODAY, company="Today")

    last_30 = stats(client, "30d")

    assert last_30["start"] == "2026-10-25"
    assert last_30["total"] == 2
    assert stats(client, "90d")["total"] == 3
    assert stats(client, "all")["start"] is None


def test_periods_include_progressively_more(client: TestClient):
    add(client, "applied", "2026-11-20")  # 3 days ago
    add(client, "interview", "2026-10-01")  # ~2 months ago
    add(client, "offer", "2025-06-01")  # over a year ago

    assert stats(client, "30d")["total"] == 1
    assert stats(client, "90d")["total"] == 2
    assert stats(client, "all")["total"] == 3
    assert stats(client, "90d")["interviews"] == 1
    assert stats(client, "all")["offers"] == 1


def test_future_applied_dates_are_excluded(client: TestClient):
    add(client, "applied", "2026-12-01")

    assert stats(client, "all")["total"] == 0


def test_creation_date_is_used_when_there_is_no_applied_date(client: TestClient, engine: Engine):
    add_created_on(engine, "2026-11-01T10:00:00")
    add_created_on(engine, "2026-06-01T10:00:00")

    assert stats(client, "30d")["total"] == 1
    assert stats(client, "30d")["by_status"]["wishlist"] == 1
    assert stats(client, "all")["total"] == 2


def test_reference_date_changes_the_window(client: TestClient):
    add(client, "applied", "2026-11-01")

    assert stats(client, "30d", today="2026-11-23")["total"] == 1
    assert stats(client, "30d", today="2026-12-15")["total"] == 0


def test_invalid_period_or_date_is_rejected(client: TestClient):
    assert client.get(URL, params={"period": "7d"}).status_code == 422
    assert client.get(URL, params={"today": "not-a-date"}).status_code == 422


def test_defaults_to_whole_history_and_server_date(client: TestClient):
    data = client.get(URL).json()

    assert data["period"] == "all"
    assert len(data["today"]) == 10


# --- Weekly activity --------------------------------------------------------------


def test_weekly_counts_use_monday_weeks_and_include_empty_weeks(client: TestClient):
    add(client, "applied", "2026-11-02")  # Monday
    add(client, "rejected", "2026-11-08")  # Sunday, same week
    add(client, "interview", "2026-11-23")  # current week
    add(client, "wishlist", "2026-11-23")  # not submitted: not counted

    weekly = stats(client, "all")["weekly"]

    assert weekly == [
        {"week_start": "2026-11-02", "count": 2},
        {"week_start": "2026-11-09", "count": 0},
        {"week_start": "2026-11-16", "count": 0},
        {"week_start": "2026-11-23", "count": 1},
    ]


def test_weekly_total_matches_dated_submissions(client: TestClient):
    for day in ["2026-10-28", "2026-11-05", "2026-11-06", "2026-11-21"]:
        add(client, "applied", day)

    data = stats(client, "30d")

    assert sum(w["count"] for w in data["weekly"]) == 4
    assert data["weekly"][-1]["week_start"] == "2026-11-23"


def test_submitted_without_applied_date_are_reported_not_invented(client: TestClient):
    add(client, "applied", "2026-11-20")
    add(client, "interview")  # no applied date

    data = stats(client, "all")

    assert data["submitted"] == 2
    assert data["undated_submitted"] == 1
    assert sum(w["count"] for w in data["weekly"]) == 1


def test_stats_follow_status_changes(client: TestClient):
    add(client, "applied", "2026-11-10")
    assert stats(client)["interviews"] == 0

    client.patch("/api/applications/1", json={"status": "interview"})

    data = stats(client)
    assert data["interviews"] == 1
    assert data["responded"] == 1
