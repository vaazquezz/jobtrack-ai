"""POST /api/analysis and GET /api/analysis/config with fake providers."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlmodel import Session, func, select

from app.analysis.provider import AIProviderError
from app.analysis.schemas import (
    AnalysisDraft,
    AnalysisMode,
    MetRequirement,
    MissingRequirement,
)
from app.main import app
from app.models import Application
from app.routers.analysis import get_ai_provider
from tests.analysis_fixtures import CV, JOB

URL = "/api/analysis"


class FakeAI:
    name = "fake-ai"
    model = "fake-model-1"
    mode: AnalysisMode = "ai"

    def __init__(self, draft: AnalysisDraft | None = None, error: AIProviderError | None = None):
        self.draft = draft
        self.error = error
        self.calls: list[tuple[str, str]] = []

    def analyze(self, cv_text: str, job_text: str) -> AnalysisDraft:
        self.calls.append((cv_text, job_text))
        if self.error:
            raise self.error
        assert self.draft is not None
        return self.draft


DRAFT = AnalysisDraft(
    summary="Encaje parcial.",
    met=[
        MetRequirement(requirement="Python", evidence="Experiencia con Python y FastAPI"),
        # Invented evidence: must not be reported as met.
        MetRequirement(requirement="AWS", evidence="Certificación AWS Solutions Architect"),
    ],
    missing=[MissingRequirement(requirement="React", note="No aparece.")],
    ambiguous=[],
    skills=[],
    recommendations=[],
)


@pytest.fixture
def ai_provider(client: TestClient) -> Iterator[FakeAI]:
    fake = FakeAI(DRAFT)
    app.dependency_overrides[get_ai_provider] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_ai_provider, None)


@pytest.fixture
def no_ai(client: TestClient) -> Iterator[None]:
    app.dependency_overrides[get_ai_provider] = lambda: None
    yield
    app.dependency_overrides.pop(get_ai_provider, None)


def body(**overrides) -> dict:
    return {"cv_text": CV, "job_text": JOB, "mode": "local", **overrides}


# --- Configuration ----------------------------------------------------------------------


def test_config_without_key(client: TestClient, no_ai):
    data = client.get(f"{URL}/config").json()

    assert data == {
        "ai_available": False,
        "provider": None,
        "model": None,
        "min_chars": 30,
        "max_chars": 20000,
    }


def test_config_with_provider_never_exposes_a_key(client: TestClient, ai_provider: FakeAI):
    response = client.get(f"{URL}/config")

    assert response.json()["ai_available"] is True
    assert response.json()["model"] == "fake-model-1"
    assert "key" not in response.text.lower()


# --- Local mode -------------------------------------------------------------------------


def test_local_mode_works_without_key(client: TestClient, no_ai):
    response = client.post(URL, json=body())

    assert response.status_code == 200
    data = response.json()
    assert data["mode"] == "local"
    assert data["provider"] == "local-keywords"
    assert [m["requirement"] for m in data["met"]] == ["Python", "SQL", "Inglés"]
    assert 0 <= data["score"] <= 100


def test_local_mode_never_calls_the_ai_provider(client: TestClient, ai_provider: FakeAI):
    client.post(URL, json=body(mode="local", consent_external=True))

    assert ai_provider.calls == []


def test_mode_defaults_to_local(client: TestClient, ai_provider: FakeAI):
    data = client.post(URL, json={"cv_text": CV, "job_text": JOB}).json()

    assert data["mode"] == "local"
    assert ai_provider.calls == []


# --- AI mode ----------------------------------------------------------------------------


def test_ai_mode_without_key_returns_409(client: TestClient, no_ai):
    response = client.post(URL, json=body(mode="ai", consent_external=True))

    assert response.status_code == 409
    assert "ANTHROPIC_API_KEY" in response.json()["detail"]


def test_ai_mode_requires_consent(client: TestClient, ai_provider: FakeAI):
    response = client.post(URL, json=body(mode="ai", consent_external=False))

    assert response.status_code == 422
    assert "confirmar" in response.json()["detail"]
    assert ai_provider.calls == []  # nothing was sent


def test_ai_mode_with_consent_returns_a_verified_result(client: TestClient, ai_provider: FakeAI):
    response = client.post(URL, json=body(mode="ai", consent_external=True))

    assert response.status_code == 200
    data = response.json()
    assert data["mode"] == "ai"
    assert data["provider"] == "fake-ai"
    assert data["model"] == "fake-model-1"
    # The invented AWS certification is not in the CV: downgraded to ambiguous.
    assert [m["requirement"] for m in data["met"]] == ["Python"]
    assert [a["requirement"] for a in data["ambiguous"]] == ["AWS"]
    assert data["score"] == 50  # (1 met + 0.5 × 1 ambiguous) / 3
    assert any("modelo de IA" in n for n in data["notices"])
    assert any("se han pasado a ambiguos" in n for n in data["notices"])
    assert ai_provider.calls == [(CV, JOB)]


@pytest.mark.parametrize(
    ("error", "status"),
    [
        (AIProviderError("timeout", "Ha tardado demasiado.", 504), 504),
        (AIProviderError("rate_limited", "Límite alcanzado.", 429), 429),
        (AIProviderError("invalid_response", "Formato inesperado.", 502), 502),
    ],
)
def test_provider_errors_are_returned_with_their_status(
    client: TestClient, ai_provider: FakeAI, error: AIProviderError, status: int
):
    ai_provider.error = error

    response = client.post(URL, json=body(mode="ai", consent_external=True))

    assert response.status_code == status
    assert response.json() == {"detail": error.message}


# --- Validation and privacy -------------------------------------------------------------


@pytest.mark.parametrize(
    "overrides",
    [
        {"cv_text": "demasiado corto"},
        {"job_text": "   " + "x" * 10 + "   "},
        {"cv_text": "x" * 20_001},
        {"mode": "magic"},
    ],
    ids=["short-cv", "short-job", "long-cv", "unknown-mode"],
)
def test_invalid_input_is_rejected(client: TestClient, no_ai, overrides: dict):
    assert client.post(URL, json=body(**overrides)).status_code == 422


def test_texts_are_not_stored(client: TestClient, engine: Engine, ai_provider: FakeAI):
    client.post(URL, json=body(mode="local"))
    client.post(URL, json=body(mode="ai", consent_external=True))

    with Session(engine) as session:
        assert session.exec(select(func.count()).select_from(Application)).one() == 0
