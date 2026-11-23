"""Statistics about the job search, computed from the data stored in SQLite.

Only the current status and the stored dates are used. There is no history of status
changes, so no interview, response or offer dates are assumed.
"""

from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from app.database import get_session
from app.models import (
    Application,
    ApplicationStatus,
    StatsOverview,
    StatsPeriod,
    WeeklyCount,
)

router = APIRouter(prefix="/api/stats", tags=["stats"])

SessionDep = Annotated[Session, Depends(get_session)]

PERIOD_DAYS = {StatsPeriod.LAST_30_DAYS: 30, StatsPeriod.LAST_90_DAYS: 90}

RESPONDED = {ApplicationStatus.INTERVIEW, ApplicationStatus.OFFER, ApplicationStatus.REJECTED}
INTERVIEW_STAGE = {ApplicationStatus.INTERVIEW, ApplicationStatus.OFFER}


def reference_date(application: Application) -> date:
    """Date that places an application in a period: applied date, else creation date."""
    return application.applied_date or application.created_at.date()


def week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def rate(part: int, whole: int) -> float | None:
    return round(part / whole, 4) if whole else None


def weekly_counts(dates: list[date], first: date | None, today: date) -> list[WeeklyCount]:
    """Count dates per week (Monday start), including weeks with no activity.

    The range runs from the week of `first` (or of the earliest date, for the whole
    history) to the current week. With no dates and no fixed start, it is empty.
    """
    start = first if first is not None else (min(dates) if dates else None)
    if start is None:
        return []
    counts: dict[date, int] = {}
    for day in dates:
        counts[week_start(day)] = counts.get(week_start(day), 0) + 1
    weeks = []
    current = week_start(start)
    while current <= week_start(today):
        weeks.append(WeeklyCount(week_start=current, count=counts.get(current, 0)))
        current += timedelta(days=7)
    return weeks


@router.get("", response_model=StatsOverview)
def get_stats(
    session: SessionDep,
    period: Annotated[
        StatsPeriod, Query(description="30d, 90d or all (the whole history).")
    ] = StatsPeriod.ALL,
    today: Annotated[
        date | None,
        Query(description="Reference date (YYYY-MM-DD). Defaults to the server's date."),
    ] = None,
) -> StatsOverview:
    """Totals, status counts, rates and weekly activity for the selected period.

    An application belongs to the period when its applied date (or, if it has none,
    its creation date) falls between the period start and `today`, inclusive.
    """
    reference = today or date.today()
    days = PERIOD_DAYS.get(period)
    start = reference - timedelta(days=days - 1) if days else None

    applications = [
        application
        for application in session.exec(select(Application)).all()
        if (start is None or reference_date(application) >= start)
        and reference_date(application) <= reference
    ]

    by_status = {status: 0 for status in ApplicationStatus}
    for application in applications:
        by_status[application.status] += 1

    submitted_apps = [a for a in applications if a.status != ApplicationStatus.WISHLIST]
    submitted = len(submitted_apps)
    responded = sum(by_status[s] for s in RESPONDED)
    interviews = sum(by_status[s] for s in INTERVIEW_STAGE)
    offers = by_status[ApplicationStatus.OFFER]
    dated = [a.applied_date for a in submitted_apps if a.applied_date is not None]

    return StatsOverview(
        period=period,
        today=reference,
        start=start,
        total=len(applications),
        by_status=by_status,
        submitted=submitted,
        responded=responded,
        interviews=interviews,
        offers=offers,
        response_rate=rate(responded, submitted),
        interview_rate=rate(interviews, submitted),
        offer_rate=rate(offers, submitted),
        weekly=weekly_counts(dated, start, reference),
        undated_submitted=submitted - len(dated),
    )
