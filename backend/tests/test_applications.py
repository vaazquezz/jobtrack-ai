"""Tests for the /api/applications endpoints (fictional sample data only)."""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.database import build_engine, create_db_and_tables
from app.models import Application

URL = "/api/applications"

VALID_PAYLOAD = {
    "company": "Example Corp",
    "position": "Backend Developer",
    "url": "https://example.com/jobs/123",
    "applied_date": "2026-11-01",
    "status": "applied",
    "notes": "Referred by a former colleague.",
    "follow_up_date": "2026-11-08",
}


def create(client: TestClient, **overrides) -> dict:
    response = client.post(URL, json={**VALID_PAYLOAD, **overrides})
    assert response.status_code == 201, response.text
    return response.json()


# --- Create -------------------------------------------------------------------


def test_create_application_returns_201_and_body(client: TestClient):
    response = client.post(URL, json=VALID_PAYLOAD)

    assert response.status_code == 201
    body = response.json()
    assert body["id"] > 0
    for key, value in VALID_PAYLOAD.items():
        assert body[key] == value
    assert body["created_at"]
    assert body["updated_at"]


def test_create_with_only_required_fields_uses_defaults(client: TestClient):
    response = client.post(URL, json={"company": "Acme", "position": "QA Engineer"})

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "applied"
    assert body["url"] is None
    assert body["applied_date"] is None
    assert body["notes"] is None
    assert body["follow_up_date"] is None


def test_create_trims_whitespace_and_empty_notes_become_null(client: TestClient):
    body = create(client, company="  Acme  ", position=" Dev ", notes="   ")

    assert body["company"] == "Acme"
    assert body["position"] == "Dev"
    assert body["notes"] is None


@pytest.mark.parametrize("status", ["wishlist", "applied", "interview", "offer", "rejected"])
def test_create_accepts_every_valid_status(client: TestClient, status: str):
    assert create(client, status=status)["status"] == status


@pytest.mark.parametrize(
    "overrides",
    [
        {"company": ""},
        {"company": "   "},
        {"position": ""},
        {"company": "x" * 201},
        {"notes": "x" * 5001},
        {"status": "ghosted"},
        {"url": "not-a-url"},
        {"url": "ftp://example.com/job"},
        {"applied_date": "2026-13-45"},
        {"applied_date": "2026-11-10", "follow_up_date": "2026-11-01"},
    ],
    ids=[
        "empty-company",
        "blank-company",
        "empty-position",
        "company-too-long",
        "notes-too-long",
        "unknown-status",
        "invalid-url",
        "non-http-url",
        "invalid-date",
        "follow-up-before-applied",
    ],
)
def test_create_rejects_invalid_data(client: TestClient, overrides: dict):
    response = client.post(URL, json={**VALID_PAYLOAD, **overrides})

    assert response.status_code == 422


@pytest.mark.parametrize("missing", ["company", "position"])
def test_create_requires_company_and_position(client: TestClient, missing: str):
    payload = {k: v for k, v in VALID_PAYLOAD.items() if k != missing}

    response = client.post(URL, json=payload)

    assert response.status_code == 422


def test_create_ignores_client_supplied_id(client: TestClient):
    body = create(client, id=999)

    assert body["id"] != 999


# --- Read ---------------------------------------------------------------------


def test_get_application_by_id(client: TestClient):
    created = create(client)

    response = client.get(f"{URL}/{created['id']}")

    assert response.status_code == 200
    assert response.json() == created


def test_get_unknown_application_returns_404(client: TestClient):
    response = client.get(f"{URL}/999")

    assert response.status_code == 404
    assert response.json() == {"detail": "Application 999 not found"}


def test_get_with_non_integer_id_returns_422(client: TestClient):
    assert client.get(f"{URL}/abc").status_code == 422


# --- List ---------------------------------------------------------------------


def test_list_is_empty_initially(client: TestClient):
    response = client.get(URL)

    assert response.status_code == 200
    assert response.json() == []


def test_list_returns_newest_first(client: TestClient):
    first = create(client, company="First Co")
    second = create(client, company="Second Co")

    ids = [item["id"] for item in client.get(URL).json()]

    assert ids == [second["id"], first["id"]]


def test_list_supports_offset_and_limit(client: TestClient):
    for i in range(5):
        create(client, company=f"Company {i}")

    page = client.get(URL, params={"offset": 1, "limit": 2}).json()

    assert [item["company"] for item in page] == ["Company 3", "Company 2"]


@pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 201}, {"offset": -1}])
def test_list_rejects_invalid_pagination(client: TestClient, params: dict):
    assert client.get(URL, params=params).status_code == 422


# --- Update -------------------------------------------------------------------


def test_patch_updates_only_sent_fields(client: TestClient):
    created = create(client)

    response = client.patch(f"{URL}/{created['id']}", json={"status": "interview"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "interview"
    assert body["company"] == created["company"]
    assert body["notes"] == created["notes"]
    assert body["updated_at"] > created["updated_at"]
    assert body["created_at"] == created["created_at"]


def test_patch_can_clear_optional_fields(client: TestClient):
    created = create(client)

    response = client.patch(
        f"{URL}/{created['id']}", json={"notes": None, "url": None, "follow_up_date": None}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["notes"] is None
    assert body["url"] is None
    assert body["follow_up_date"] is None


def test_patch_persists_changes(client: TestClient):
    created = create(client)
    client.patch(f"{URL}/{created['id']}", json={"position": "Senior Backend Developer"})

    assert client.get(f"{URL}/{created['id']}").json()["position"] == "Senior Backend Developer"


@pytest.mark.parametrize(
    "payload",
    [
        {"company": None},
        {"position": None},
        {"status": None},
        {"company": "  "},
        {"status": "ghosted"},
        {"url": "not-a-url"},
    ],
)
def test_patch_rejects_invalid_data(client: TestClient, payload: dict):
    created = create(client)

    response = client.patch(f"{URL}/{created['id']}", json=payload)

    assert response.status_code == 422


def test_patch_rejects_follow_up_before_existing_applied_date(client: TestClient):
    created = create(client, applied_date="2026-11-01", follow_up_date=None)

    response = client.patch(f"{URL}/{created['id']}", json={"follow_up_date": "2026-10-01"})

    assert response.status_code == 422
    assert client.get(f"{URL}/{created['id']}").json()["follow_up_date"] is None


def test_patch_unknown_application_returns_404(client: TestClient):
    assert client.patch(f"{URL}/999", json={"status": "offer"}).status_code == 404


# --- Delete -------------------------------------------------------------------


def test_delete_application(client: TestClient):
    created = create(client)

    response = client.delete(f"{URL}/{created['id']}")

    assert response.status_code == 204
    assert response.content == b""
    assert client.get(f"{URL}/{created['id']}").status_code == 404


def test_delete_unknown_application_returns_404(client: TestClient):
    assert client.delete(f"{URL}/999").status_code == 404


# --- Persistence --------------------------------------------------------------


def test_data_persists_in_sqlite_file(tmp_path):
    """Data written through one engine is readable from a new one on the same file."""
    database_url = f"sqlite:///{tmp_path / 'test.db'}"

    first_engine = build_engine(database_url)
    create_db_and_tables(first_engine)
    with Session(first_engine) as session:
        session.add(Application(company="Example Corp", position="Data Analyst"))
        session.commit()
    first_engine.dispose()

    second_engine = build_engine(database_url)
    with Session(second_engine) as session:
        stored = session.get(Application, 1)
    second_engine.dispose()

    assert stored is not None
    assert stored.company == "Example Corp"
    assert stored.status == "applied"
