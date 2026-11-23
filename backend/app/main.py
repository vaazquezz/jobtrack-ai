"""FastAPI entry point for the JobTrack AI backend."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.config import get_settings
from app.database import create_db_and_tables
from app.routers import analysis, applications, follow_ups, stats

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    create_db_and_tables()
    yield


app = FastAPI(title=settings.app_name, version=__version__, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)

app.include_router(applications.router)
app.include_router(follow_ups.router)
app.include_router(stats.router)
app.include_router(analysis.router)


@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    """Simple liveness check used by the frontend and CI."""
    return {"status": "ok", "version": __version__}
