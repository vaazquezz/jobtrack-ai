"""Tests for follow-up reminders (fictional data only)."""

import pytest
from fastapi.testclient import TestClient

APPS = "/api/applications"
FOLLOW_UPS = "/api/follow-ups"
TODAY = "2026-11-23"


def create(client: TestClient, company: str, **fields) -> dict:
    payload = {"company": company, "position": "Developer", **fields}
    response = client.post(APPS, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def overview(client: TestClient, **params) -> dict:
    response = client.get(FOLLOW_UPS, params={"today": TODAY, **params})
    assert response.status_code == 200, response.text
    return response.json()


def names(items: list[dict]) -> list[str]:
    return [item["company"] for item in items]


def complete(client: TestClient, application_id: int, **body):
    return client.post(f"{APPS}/{application_id}/follow-up/complete", json=body)


# --- Overview: grouping by date --------------------------------------------------


def test_overview_is_empty_without_follow_ups(client: TestClient):
    create(client, "No Date Co")

    data = overview(client)

    assert data["today"] == TODAY
    assert data["overdue"] == data["due_today"] == data["upcoming"] == []
    assert data["counts"] == {"overdue": 0, "today": 0, "upcoming": 0, "pending": 0}


def test_overview_groups_around_today_boundaries(client: TestClient):
    create(client, "Yesterday Co", follow_up_date="2026-11-22")
    create(client, "Today Co", follow_up_date="2026-11-23")
    create(client, "Tomorrow Co", follow_up_date="2026-11-24")
    create(client, "No Date Co")

    data = overview(client)

    assert names(data["overdue"]) == ["Yesterday Co"]
    assert names(data["due_today"]) == ["Today Co"]
    assert names(data["upcoming"]) == ["Tomorrow Co"]
    assert data["counts"] == {"overdue": 1, "today": 1, "upcoming": 1, "pending": 2}


def test_overview_sorts_each_group_by_date(client: TestClient):
    create(client, "Late Overdue", follow_up_date="2026-11-20")
    create(client, "Oldest Overdue", follow_up_date="2026-10-01")
    create(client, "Far Upcoming", follow_up_date="2027-01-15")
    create(client, "Near Upcoming", follow_up_date="2026-11-25")

    data = overview(client)

    assert names(data["overdue"]) == ["Oldest Overdue", "Late Overdue"]
    assert names(data["upcoming"]) == ["Near Upcoming", "Far Upcoming"]


def test_overview_uses_the_reference_date(client: TestClient):
    create(client, "Example Corp", follow_up_date="2026-11-25")

    assert names(overview(client, today="2026-11-24")["upcoming"]) == ["Example Corp"]
    assert names(overview(client, today="2026-11-25")["due_today"]) == ["Example Corp"]
    assert names(overview(client, today="2026-11-26")["overdue"]) == ["Example Corp"]


def test_overview_defaults_to_server_date(client: TestClient):
    response = client.get(FOLLOW_UPS)

    assert response.status_code == 200
    assert len(response.json()["today"]) == 10  # YYYY-MM-DD


@pytest.mark.parametrize("today", ["not-a-date", "2026-13-01"])
def test_overview_rejects_invalid_reference_date(client: TestClient, today: str):
    assert client.get(FOLLOW_UPS, params={"today": today}).status_code == 422


def test_overview_returns_full_application_data(client: TestClient):
    created = create(
        client, "Example Corp", status="interview", follow_up_date=TODAY, url="https://example.com"
    )

    item = overview(client)["due_today"][0]

    assert item == created


# --- Overview: filters -----------------------------------------------------------


def test_overview_respects_search_and_status_filters(client: TestClient):
    create(client, "Acme Software", status="interview", follow_up_date="2026-11-20")
    create(client, "Acme Labs", status="applied", follow_up_date="2026-11-30")
    create(client, "Globex", status="interview", follow_up_date="2026-11-23")

    assert names(overview(client, q="ACME")["overdue"]) == ["Acme Software"]
    assert names(overview(client, q="acme")["upcoming"]) == ["Acme Labs"]
    assert overview(client, status="interview")["counts"]["pending"] == 2
    combined = overview(client, q="acme", status="interview")
    assert combined["counts"] == {"overdue": 1, "today": 0, "upcoming": 0, "pending": 1}


def test_overview_rejects_unknown_status(client: TestClient):
    assert client.get(FOLLOW_UPS, params={"status": "ghosted"}).status_code == 422


# --- Changing and removing the follow-up date -------------------------------------


def test_changing_follow_up_date_moves_it_between_groups(client: TestClient):
    app = create(client, "Example Corp", follow_up_date="2026-11-20")
    assert overview(client)["counts"]["overdue"] == 1

    client.patch(f"{APPS}/{app['id']}", json={"follow_up_date": "2026-12-01"})

    data = overview(client)
    assert data["counts"]["overdue"] == 0
    assert names(data["upcoming"]) == ["Example Corp"]


def test_removing_follow_up_date_removes_it_from_overview(client: TestClient):
    app = create(client, "Example Corp", follow_up_date=TODAY)

    client.patch(f"{APPS}/{app['id']}", json={"follow_up_date": None})

    assert overview(client)["counts"]["today"] == 0


# --- Mark as done ----------------------------------------------------------------


def test_complete_clears_date_and_records_it_in_notes(client: TestClient):
    app = create(client, "Example Corp", follow_up_date="2026-11-20")

    response = complete(client, app["id"], completed_on=TODAY)

    assert response.status_code == 200
    body = response.json()
    assert body["follow_up_date"] is None
    assert body["notes"] == "Seguimiento realizado el 23/11/2026."
    assert body["updated_at"] > app["updated_at"]
    assert overview(client)["counts"] == {"overdue": 0, "today": 0, "upcoming": 0, "pending": 0}


def test_complete_keeps_existing_notes(client: TestClient):
    app = create(client, "Example Corp", follow_up_date=TODAY, notes="Contact: recruiter")

    body = complete(client, app["id"], completed_on=TODAY).json()

    assert body["notes"] == "Contact: recruiter\nSeguimiento realizado el 23/11/2026."


def test_complete_is_persisted(client: TestClient):
    app = create(client, "Example Corp", follow_up_date=TODAY)
    complete(client, app["id"], completed_on=TODAY)

    stored = client.get(f"{APPS}/{app['id']}").json()

    assert stored["follow_up_date"] is None
    assert "Seguimiento realizado" in stored["notes"]


def test_complete_can_schedule_the_next_follow_up(client: TestClient):
    app = create(client, "Example Corp", follow_up_date="2026-11-20")

    body = complete(client, app["id"], completed_on=TODAY, next_follow_up_date="2026-11-30").json()

    assert body["follow_up_date"] == "2026-11-30"
    data = overview(client)
    assert data["counts"]["pending"] == 0
    assert names(data["upcoming"]) == ["Example Corp"]


def test_complete_uses_server_date_by_default(client: TestClient):
    app = create(client, "Example Corp", follow_up_date=TODAY)

    body = complete(client, app["id"]).json()

    assert body["notes"].startswith("Seguimiento realizado el ")


def test_complete_does_not_change_status_or_other_fields(client: TestClient):
    app = create(client, "Example Corp", status="interview", follow_up_date=TODAY)

    body = complete(client, app["id"], completed_on=TODAY).json()

    assert body["status"] == "interview"
    assert body["company"] == "Example Corp"


def test_complete_without_pending_follow_up_returns_409(client: TestClient):
    app = create(client, "Example Corp")

    response = complete(client, app["id"])

    assert response.status_code == 409
    assert response.json()["detail"] == "This application has no pending follow-up"


def test_complete_unknown_application_returns_404(client: TestClient):
    assert complete(client, 999).status_code == 404


def test_complete_rejects_next_date_before_applied_date(client: TestClient):
    app = create(client, "Example Corp", applied_date="2026-11-10", follow_up_date="2026-11-20")

    response = complete(client, app["id"], next_follow_up_date="2026-11-01")

    assert response.status_code == 422
    # Nothing was changed.
    assert client.get(f"{APPS}/{app['id']}").json()["follow_up_date"] == "2026-11-20"


def test_complete_skips_note_when_notes_are_full(client: TestClient):
    full_notes = "x" * 5000
    app = create(client, "Example Corp", follow_up_date=TODAY, notes=full_notes)

    body = complete(client, app["id"], completed_on=TODAY).json()

    assert body["follow_up_date"] is None
    assert body["notes"] == full_notes
