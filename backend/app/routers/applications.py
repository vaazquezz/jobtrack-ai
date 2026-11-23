"""CRUD endpoints for job applications."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlmodel import Session, col, select

from app.database import get_session
from app.models import (
    Application,
    ApplicationCreate,
    ApplicationRead,
    ApplicationUpdate,
    utc_now,
)

router = APIRouter(prefix="/api/applications", tags=["applications"])

SessionDep = Annotated[Session, Depends(get_session)]


def _get_or_404(session: Session, application_id: int) -> Application:
    application = session.get(Application, application_id)
    if application is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Application {application_id} not found",
        )
    return application


@router.post("", response_model=ApplicationRead, status_code=status.HTTP_201_CREATED)
def create_application(payload: ApplicationCreate, session: SessionDep) -> Application:
    application = Application.model_validate(payload)
    session.add(application)
    session.commit()
    session.refresh(application)
    return application


@router.get("", response_model=list[ApplicationRead])
def list_applications(
    session: SessionDep,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[Application]:
    """List applications, most recently created first."""
    statement = (
        select(Application)
        .order_by(col(Application.created_at).desc(), col(Application.id).desc())
        .offset(offset)
        .limit(limit)
    )
    return list(session.exec(statement).all())


@router.get("/{application_id}", response_model=ApplicationRead)
def get_application(application_id: int, session: SessionDep) -> Application:
    return _get_or_404(session, application_id)


@router.patch("/{application_id}", response_model=ApplicationRead)
def update_application(
    application_id: int, payload: ApplicationUpdate, session: SessionDep
) -> Application:
    application = _get_or_404(session, application_id)
    changes = payload.model_dump(exclude_unset=True)

    applied = changes.get("applied_date", application.applied_date)
    follow_up = changes.get("follow_up_date", application.follow_up_date)
    if applied and follow_up and follow_up < applied:
        raise HTTPException(
            status_code=422,  # numeric: the constant's name differs between Starlette versions
            detail="follow_up_date cannot be earlier than applied_date",
        )

    application.sqlmodel_update(changes)
    application.updated_at = utc_now()
    session.add(application)
    session.commit()
    session.refresh(application)
    return application


@router.delete("/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_application(application_id: int, session: SessionDep) -> Response:
    application = _get_or_404(session, application_id)
    session.delete(application)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
