"""Schemas for CV / job offer analysis.

`AnalysisDraft` is what any provider (AI or local) produces. The service then checks it
against the CV and adds the score, so every mode is scored and verified the same way.
"""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

MIN_TEXT_LENGTH = 30
MAX_TEXT_LENGTH = 20_000

AnalysisMode = Literal["local", "ai"]
SkillStatus = Literal["demonstrated", "missing", "ambiguous"]


class MetRequirement(BaseModel):
    requirement: str
    evidence: str  # verbatim excerpt from the CV


class MissingRequirement(BaseModel):
    requirement: str
    note: str


class AmbiguousRequirement(BaseModel):
    requirement: str
    evidence: str | None = None
    note: str


class Skill(BaseModel):
    name: str
    status: SkillStatus


class Recommendation(BaseModel):
    kind: Literal["cv", "interview"]
    text: str


class AnalysisDraft(BaseModel):
    summary: str
    met: list[MetRequirement]
    missing: list[MissingRequirement]
    ambiguous: list[AmbiguousRequirement]
    skills: list[Skill]
    recommendations: list[Recommendation]


class AnalysisResult(AnalysisDraft):
    mode: AnalysisMode
    provider: str
    model: str | None
    score: int | None = Field(description="Orientative 0-100 score, not a hiring probability.")
    score_explanation: str
    notices: list[str]


class AnalysisRequest(BaseModel):
    cv_text: str = Field(max_length=MAX_TEXT_LENGTH)
    job_text: str = Field(max_length=MAX_TEXT_LENGTH)
    mode: AnalysisMode = "local"
    # Must be true to send the texts to an external AI provider (explicit user consent).
    consent_external: bool = False

    @field_validator("cv_text", "job_text")
    @classmethod
    def long_enough(cls, value: str) -> str:
        value = value.strip()
        if len(value) < MIN_TEXT_LENGTH:
            raise ValueError(f"must contain at least {MIN_TEXT_LENGTH} characters")
        return value


class AnalysisConfig(BaseModel):
    ai_available: bool
    provider: str | None
    model: str | None
    min_chars: int = MIN_TEXT_LENGTH
    max_chars: int = MAX_TEXT_LENGTH
