"""Provider interface: anything that turns a CV and a job offer into an AnalysisDraft.

The rest of the app only depends on this protocol, so a provider (Anthropic, another
vendor, or the local keyword analyzer) can be swapped without other changes.
"""

from typing import Protocol

from app.analysis.schemas import AnalysisDraft, AnalysisMode


class AIProvider(Protocol):
    name: str  # e.g. "anthropic" or "local-keywords"
    model: str | None
    mode: AnalysisMode

    def analyze(self, cv_text: str, job_text: str) -> AnalysisDraft: ...


class AIProviderError(Exception):
    """A provider failed in a way the API reports to the client.

    `kind` is a stable code (timeout, rate_limited, auth, refusal, invalid_response,
    unavailable, ...), `status_code` the HTTP status the endpoint should return and
    `message` a user-facing explanation in Spanish.
    """

    def __init__(self, kind: str, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.kind = kind
        self.message = message
        self.status_code = status_code
