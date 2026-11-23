"""Optional demo data: a small set of fictional job applications.

Usage (from backend/):  python -m app.seed

- Every company, role and note is fictional. No personal data.
- Dates are relative to today, so follow-ups and statistics always look meaningful.
- It never overwrites anything: if the database already has applications, it does nothing.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy.engine import Engine
from sqlmodel import Session, func, select

from app.database import create_db_and_tables, engine
from app.models import Application, ApplicationCreate, ApplicationStatus


@dataclass(frozen=True)
class DemoApplication:
    company: str
    position: str
    status: ApplicationStatus
    applied_days_ago: int | None  # None: not applied yet / no date
    follow_up_in_days: int | None = None  # negative = overdue
    url: str | None = None
    notes: str | None = None


S = ApplicationStatus

DEMO_APPLICATIONS: tuple[DemoApplication, ...] = (
    DemoApplication(
        "Hooli",
        "Site Reliability Engineer",
        S.WISHLIST,
        None,
        notes="Revisar requisitos de guardias antes de aplicar.",
    ),
    DemoApplication("Pied Piper", "Backend Engineer (Python)", S.WISHLIST, None),
    DemoApplication(
        "Example Corp",
        "Backend Developer",
        S.APPLIED,
        3,
        4,
        "https://example.com/jobs/backend-developer",
    ),
    DemoApplication(
        "Globex Labs",
        "Data Analyst",
        S.APPLIED,
        9,
        0,
        notes="Escribir a la persona de selección si no hay respuesta.",
    ),
    DemoApplication("Vandelay Industries", "Full Stack Developer", S.APPLIED, 16, -2),
    DemoApplication("Stark Industries", "Machine Learning Engineer", S.APPLIED, 24),
    DemoApplication(
        "Acme Software",
        "Frontend Engineer",
        S.INTERVIEW,
        12,
        1,
        "https://example.com/jobs/frontend-engineer",
        "Entrevista técnica con el equipo de producto.",
    ),
    DemoApplication(
        "Tyrell Corp",
        "Python Developer",
        S.INTERVIEW,
        30,
        -5,
        notes="Pendiente de la segunda entrevista.",
    ),
    DemoApplication(
        "Initech",
        "Platform Engineer",
        S.OFFER,
        41,
        6,
        notes="Oferta recibida; comparar condiciones.",
    ),
    DemoApplication("Umbrella Systems", "QA Automation Engineer", S.REJECTED, 20),
    DemoApplication("Soylent Corp", "Data Engineer", S.REJECTED, 47),
    DemoApplication("Wayne Enterprises", "Security Engineer", S.REJECTED, 63),
    DemoApplication("Cyberdyne", "Robotics Software Engineer", S.APPLIED, 75),
    DemoApplication("Wonka Industries", "Product Engineer", S.REJECTED, 96),
)


def build_applications(today: date) -> list[Application]:
    """Validated Application rows for the demo, with dates relative to `today`."""
    rows: list[Application] = []
    for index, demo in enumerate(DEMO_APPLICATIONS):
        applied = today - timedelta(days=demo.applied_days_ago) if demo.applied_days_ago else None
        follow_up = (
            today + timedelta(days=demo.follow_up_in_days)
            if demo.follow_up_in_days is not None
            else None
        )
        payload = ApplicationCreate(
            company=demo.company,
            position=demo.position,
            url=demo.url,
            applied_date=applied,
            status=demo.status,
            notes=demo.notes,
            follow_up_date=follow_up,
        )
        # Creation time follows the applied date so the list order looks natural.
        created_day = applied or today
        created = datetime.combine(created_day, time(9, 0), tzinfo=UTC) + timedelta(minutes=index)
        rows.append(
            Application.model_validate(
                payload, update={"created_at": created, "updated_at": created}
            )
        )
    return rows


def seed(target_engine: Engine = engine, today: date | None = None) -> int:
    """Insert the demo data into an empty database. Returns how many rows were added."""
    create_db_and_tables(target_engine)
    with Session(target_engine) as session:
        existing = session.exec(select(func.count()).select_from(Application)).one()
        if existing:
            return 0
        rows = build_applications(today or date.today())
        session.add_all(rows)
        session.commit()
        return len(rows)


def main() -> None:
    added = seed()
    if added:
        print(f"Added {added} fictional demo applications.")
    else:
        print("The database already has applications; nothing was added.")


if __name__ == "__main__":
    main()
