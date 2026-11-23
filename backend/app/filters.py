"""Search and status filters shared by the endpoints that list applications."""

from typing import Annotated, Any

from fastapi import Query
from sqlalchemy import func, or_

from app.models import Application, ApplicationStatus

SEARCH_MAX_LENGTH = 200

SearchParam = Annotated[
    str | None,
    Query(
        max_length=SEARCH_MAX_LENGTH,
        description="Case-insensitive text matched against company or position.",
    ),
]

StatusParam = Annotated[
    ApplicationStatus | None,
    Query(alias="status", description="Only return applications with this status."),
]


def filter_conditions(q: str | None, status: ApplicationStatus | None) -> list[Any]:
    """Build SQL conditions for the optional search text and status."""
    conditions: list[Any] = []
    search = q.strip() if q else ""
    if search:
        needle = search.casefold()
        conditions.append(
            or_(
                func.py_casefold(Application.company).contains(needle, autoescape=True),
                func.py_casefold(Application.position).contains(needle, autoescape=True),
            )
        )
    if status is not None:
        conditions.append(Application.status == status)
    return conditions
