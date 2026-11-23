"""Application (job application) table and API schemas."""

from datetime import UTC, date, datetime
from enum import StrEnum
from typing import Any

from pydantic import AnyHttpUrl, TypeAdapter, ValidationError, field_validator, model_validator
from sqlmodel import Field, SQLModel

COMPANY_MAX_LENGTH = 200
POSITION_MAX_LENGTH = 200
URL_MAX_LENGTH = 2000
NOTES_MAX_LENGTH = 5000

_http_url = TypeAdapter(AnyHttpUrl)


class ApplicationStatus(StrEnum):
    WISHLIST = "wishlist"
    APPLIED = "applied"
    INTERVIEW = "interview"
    OFFER = "offer"
    REJECTED = "rejected"


def utc_now() -> datetime:
    return datetime.now(UTC)


def _clean_required_text(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("must not be blank")
    return value


def _clean_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def _validate_url(value: str | None) -> str | None:
    value = _clean_optional_text(value)
    if value is None:
        return None
    try:
        _http_url.validate_python(value)
    except ValidationError as exc:
        raise ValueError("must be a valid http(s) URL") from exc
    return value


def _check_dates(applied: date | None, follow_up: date | None) -> None:
    if applied and follow_up and follow_up < applied:
        raise ValueError("follow_up_date cannot be earlier than applied_date")


class ApplicationBase(SQLModel):
    company: str = Field(max_length=COMPANY_MAX_LENGTH)
    position: str = Field(max_length=POSITION_MAX_LENGTH)
    url: str | None = Field(default=None, max_length=URL_MAX_LENGTH)
    applied_date: date | None = None
    status: ApplicationStatus = ApplicationStatus.APPLIED
    notes: str | None = Field(default=None, max_length=NOTES_MAX_LENGTH)
    follow_up_date: date | None = None


class Application(ApplicationBase, table=True):
    """Database table. Validation happens in the Create/Update schemas below."""

    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class ApplicationCreate(ApplicationBase):
    _clean_company = field_validator("company", "position")(_clean_required_text)
    _clean_notes = field_validator("notes")(_clean_optional_text)
    _clean_url = field_validator("url")(_validate_url)

    @model_validator(mode="after")
    def check_dates(self) -> "ApplicationCreate":
        _check_dates(self.applied_date, self.follow_up_date)
        return self


class ApplicationUpdate(SQLModel):
    """Partial update: only the fields sent in the request are changed."""

    company: str | None = Field(default=None, max_length=COMPANY_MAX_LENGTH)
    position: str | None = Field(default=None, max_length=POSITION_MAX_LENGTH)
    url: str | None = Field(default=None, max_length=URL_MAX_LENGTH)
    applied_date: date | None = None
    status: ApplicationStatus | None = None
    notes: str | None = Field(default=None, max_length=NOTES_MAX_LENGTH)
    follow_up_date: date | None = None

    @model_validator(mode="before")
    @classmethod
    def reject_null_required_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            for name in ("company", "position", "status"):
                if name in data and data[name] is None:
                    raise ValueError(f"{name} cannot be null")
        return data

    @field_validator("company", "position")
    @classmethod
    def clean_required(cls, value: str | None) -> str | None:
        return None if value is None else _clean_required_text(value)

    _clean_notes = field_validator("notes")(_clean_optional_text)
    _clean_url = field_validator("url")(_validate_url)


class ApplicationRead(ApplicationBase):
    id: int
    created_at: datetime
    updated_at: datetime


# --- Follow-ups -----------------------------------------------------------------


class FollowUpCounts(SQLModel):
    overdue: int
    today: int
    upcoming: int
    pending: int  # overdue + today: what needs attention now


class FollowUpOverview(SQLModel):
    """Applications with a follow-up date, grouped relative to `today`."""

    today: date
    overdue: list[ApplicationRead]
    due_today: list[ApplicationRead]
    upcoming: list[ApplicationRead]
    counts: FollowUpCounts


class FollowUpComplete(SQLModel):
    """Body for marking a follow-up as done.

    `completed_on` defaults to the server's date; clients send their local date.
    `next_follow_up_date` optionally schedules the next follow-up in the same step.
    """

    completed_on: date | None = None
    next_follow_up_date: date | None = None
