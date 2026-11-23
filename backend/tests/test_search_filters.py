"""Tests for search (q) and status filtering on GET /api/applications (fictional data)."""

import pytest
from fastapi.testclient import TestClient

URL = "/api/applications"

SAMPLE = [
    ("Example Corp", "Backend Developer", "applied"),
    ("Acme Software", "Frontend Engineer", "interview"),
    ("Globex Labs", "Data Analyst", "applied"),
    ("Telefónica Tech", "Ingeniero de Datos", "offer"),
    ("Initech", "Backend Engineer", "rejected"),
    ("Umbrella Systems", "QA_Lead 100%", "wishlist"),
]


@pytest.fixture
def seeded(client: TestClient) -> TestClient:
    for company, position, status in SAMPLE:
        response = client.post(
            URL, json={"company": company, "position": position, "status": status}
        )
        assert response.status_code == 201
    return client


def companies(client: TestClient, **params) -> list[str]:
    response = client.get(URL, params=params)
    assert response.status_code == 200, response.text
    return sorted(item["company"] for item in response.json())


# --- Search -------------------------------------------------------------------


def test_search_matches_company(seeded: TestClient):
    assert companies(seeded, q="acme") == ["Acme Software"]


def test_search_matches_position(seeded: TestClient):
    assert companies(seeded, q="analyst") == ["Globex Labs"]


def test_search_matches_company_or_position(seeded: TestClient):
    # "tech" is in "Telefónica Tech" (company) and "Initech" (company);
    # "end" is in "Backend" and "Frontend" (positions).
    assert companies(seeded, q="tech") == ["Initech", "Telefónica Tech"]
    assert companies(seeded, q="end") == ["Acme Software", "Example Corp", "Initech"]


@pytest.mark.parametrize("query", ["BACKEND", "backend", "BaCkEnD"])
def test_search_is_case_insensitive(seeded: TestClient, query: str):
    assert companies(seeded, q=query) == ["Example Corp", "Initech"]


@pytest.mark.parametrize("query", ["TELEFÓNICA", "telefónica", "TeLeFóNiCa"])
def test_search_is_case_insensitive_with_accents(seeded: TestClient, query: str):
    assert companies(seeded, q=query) == ["Telefónica Tech"]


@pytest.mark.parametrize("query", ["óptima", "ÓPTIMA", "Óptima"])
def test_search_folds_accented_capitals_stored_in_the_database(client: TestClient, query: str):
    # SQLite's own lower()/LIKE would not fold "Ó", so this guards the casefold function.
    client.post(URL, json={"company": "ÓPTIMA Consulting", "position": "Consultor"})
    client.post(URL, json={"company": "Other Co", "position": "Consultor"})

    assert companies(client, q=query) == ["ÓPTIMA Consulting"]


def test_search_trims_surrounding_spaces(seeded: TestClient):
    assert companies(seeded, q="  globex  ") == ["Globex Labs"]


@pytest.mark.parametrize("query", ["", "   "])
def test_blank_search_returns_everything(seeded: TestClient, query: str):
    assert len(companies(seeded, q=query)) == len(SAMPLE)


@pytest.mark.parametrize("query", ["%", "_", "100%"])
def test_search_treats_like_wildcards_literally(seeded: TestClient, query: str):
    assert companies(seeded, q=query) == ["Umbrella Systems"]


def test_search_without_matches_returns_empty_list(seeded: TestClient):
    response = seeded.get(URL, params={"q": "does-not-exist"})

    assert response.status_code == 200
    assert response.json() == []
    assert response.headers["X-Total-Count"] == "0"


def test_search_too_long_is_rejected(seeded: TestClient):
    assert seeded.get(URL, params={"q": "x" * 201}).status_code == 422


# --- Status filter ------------------------------------------------------------


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        ("wishlist", ["Umbrella Systems"]),
        ("applied", ["Example Corp", "Globex Labs"]),
        ("interview", ["Acme Software"]),
        ("offer", ["Telefónica Tech"]),
        ("rejected", ["Initech"]),
    ],
)
def test_filter_by_status(seeded: TestClient, status: str, expected: list[str]):
    assert companies(seeded, status=status) == expected


def test_filter_by_unknown_status_is_rejected(seeded: TestClient):
    assert seeded.get(URL, params={"status": "ghosted"}).status_code == 422


def test_filter_follows_status_changes(seeded: TestClient):
    target = seeded.get(URL, params={"q": "acme"}).json()[0]
    seeded.patch(f"{URL}/{target['id']}", json={"status": "offer"})

    assert companies(seeded, status="offer") == ["Acme Software", "Telefónica Tech"]
    assert companies(seeded, status="interview") == []


# --- Combined -----------------------------------------------------------------


def test_search_and_status_combined(seeded: TestClient):
    # Both "Backend" positions match the text, only one of them is still applied.
    assert companies(seeded, q="backend", status="applied") == ["Example Corp"]
    assert companies(seeded, q="backend", status="rejected") == ["Initech"]


def test_search_and_status_combined_without_matches(seeded: TestClient):
    assert companies(seeded, q="backend", status="offer") == []


# --- Pagination and total count ----------------------------------------------


def test_total_count_header_without_filters(seeded: TestClient):
    response = seeded.get(URL)

    assert response.headers["X-Total-Count"] == str(len(SAMPLE))


def test_total_count_ignores_pagination(seeded: TestClient):
    response = seeded.get(URL, params={"status": "applied", "limit": 1})

    assert len(response.json()) == 1
    assert response.headers["X-Total-Count"] == "2"


def test_filters_keep_newest_first_order_and_pagination(client: TestClient):
    for i in range(5):
        client.post(URL, json={"company": f"Match {i}", "position": "Dev", "status": "applied"})
        client.post(URL, json={"company": f"Other {i}", "position": "Dev", "status": "offer"})

    first_page = client.get(URL, params={"q": "match", "status": "applied", "limit": 2})
    second_page = client.get(
        URL, params={"q": "match", "status": "applied", "limit": 2, "offset": 2}
    )

    assert [item["company"] for item in first_page.json()] == ["Match 4", "Match 3"]
    assert [item["company"] for item in second_page.json()] == ["Match 2", "Match 1"]
    assert first_page.headers["X-Total-Count"] == "5"
    assert second_page.headers["X-Total-Count"] == "5"
