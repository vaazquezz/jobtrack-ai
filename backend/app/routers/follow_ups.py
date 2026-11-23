"""Follow-up reminders: grouped overview and "mark as done".

Marking a follow-up as done clears `follow_up_date` (so it is no longer pending) and
appends a dated line to the application's notes as a record. No new database columns
are needed, so existing SQLite files keep working without a migration.
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, col, select

from app.database import get_session
from app.filters import SearchParam, StatusParam, filter_conditions
from app.models import (
    NOTES_MAX_LENGTH,
    Application,
    ApplicationRead,
    FollowUpComplete,
    FollowUpCounts,
    FollowUpOverview,
    utc_now,
)

router = APIRouter(tags=["follow-ups"])

SessionDep = Annotated[Session, Depends(get_session)]


def completion_note(completed_on: date) -> str:
    return f"Seguimiento realizado el {completed_on:%d/%m/%Y}."


@router.get("/api/follow-ups", response_model=FollowUpOverview)
def follow_up_overview(
    session: SessionDep,
    q: SearchParam = None,
    status_filter: StatusParam = None,
    today: Annotated[
        date | None,
        Query(description="Reference date (YYYY-MM-DD). Defaults to the server's date."),
    ] = None,
) -> FollowUpOverview:
    """Applications with a follow-up date, split into overdue, due today and upcoming.

    Accepts the same `q` and `status` filters as the applications list. Each group is
    sorted by follow-up date (earliest first).
    """
    reference = today or date.today()
    statement = (
        select(Application)
        .where(col(Application.follow_up_date).is_not(None))
        .where(*filter_conditions(q, status_filter))
        .order_by(col(Application.follow_up_date), col(Application.id))
    )
    applications = session.exec(statement).all()

    overdue = [a for a in applications if a.follow_up_date < reference]
    due_today = [a for a in applications if a.follow_up_date == reference]
    upcoming = [a for a in applications if a.follow_up_date > reference]

    return FollowUpOverview(
        today=reference,
        overdue=overdue,
        due_today=due_today,
        upcoming=upcoming,
        counts=FollowUpCounts(
            overdue=len(overdue),
            today=len(due_today),
            upcoming=len(upcoming),
            pending=len(overdue) + len(due_today),
        ),
    )


@router.post(
    "/api/applications/{application_id}/follow-up/complete", response_model=ApplicationRead
)
def complete_follow_up(
    application_id: int, payload: FollowUpComplete, session: SessionDep
) -> Application:
    """Mark the pending follow-up as done, optionally scheduling the next one."""
    application = session.get(Application, application_id)
    if application is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Application {application_id} not found",
        )
    if application.follow_up_date is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This application has no pending follow-up",
        )

    next_date = payload.next_follow_up_date
    if next_date and application.applied_date and next_date < application.applied_date:
        raise HTTPException(
            status_code=422,
            detail="next_follow_up_date cannot be earlier than applied_date",
        )

    note = completion_note(payload.completed_on or date.today())
    notes = f"{application.notes}\n{note}" if application.notes else note
    # Keep the notes within the API limit; the follow-up is completed either way.
    if len(notes) <= NOTES_MAX_LENGTH:
        application.notes = notes

    application.follow_up_date = next_date
    application.updated_at = utc_now()
    session.add(application)
    session.commit()
    session.refresh(application)
    return application
