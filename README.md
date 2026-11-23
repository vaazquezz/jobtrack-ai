# JobTrack AI

[![CI](https://github.com/vaazquezz/jobtrack-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/vaazquezz/jobtrack-ai/actions/workflows/ci.yml)

Personal web app to manage a job search: track applications, visualise them on a Kanban
board, review statistics and, in a later phase, analyse job offers against a CV with AI.

> **Status:** phase 0 — project skeleton. The features below are planned and are being
> built incrementally, one branch per phase.

## Tech stack

| Layer    | Technology                                              |
| -------- | ------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS                |
| Backend  | Python 3.11+, FastAPI, Pydantic Settings                |
| Database | SQLite (from phase 1)                                   |
| Quality  | pytest, ruff, oxlint, GitHub Actions                    |

## Roadmap

- [x] **Phase 0** — Project skeleton, health endpoint and CI
- [ ] **Phase 1** — Applications REST API (CRUD)
- [ ] **Phase 2** — Applications UI (list and form)
- [ ] **Phase 3** — Search and filters
- [ ] **Phase 4** — Follow-up reminders
- [ ] **Phase 5** — Kanban board
- [ ] **Phase 6** — Statistics dashboard
- [ ] **Phase 7** — AI job offer analysis and CV comparison

## Project structure

```
jobtrack-ai/
├── backend/            # FastAPI application
│   ├── app/            # main.py, config.py
│   ├── tests/          # pytest suite
│   └── pyproject.toml  # dependencies, ruff and pytest config
├── frontend/           # React + TypeScript + Vite + Tailwind
│   └── src/
├── .github/workflows/  # CI pipeline
└── .env.example        # environment variables template (no secrets)
```

## Getting started

### Requirements

- Python 3.11 or newer
- Node.js 20.19+ or 22.12+

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
cp ../.env.example .env            # optional, defaults work out of the box
uvicorn app.main:app --reload
```

The API runs at <http://localhost:8000>. Interactive docs: <http://localhost:8000/docs>.

### Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. The dev server proxies `/api` requests to the backend,
and the header badge shows whether the API is reachable.

## Quality checks

```bash
# Backend
cd backend
ruff check . && ruff format --check .
pytest

# Frontend
cd frontend
npm run lint
npm run build
```

The same checks run automatically in GitHub Actions on every pull request.

## Development workflow

- `main` is the stable branch and only receives changes through pull requests.
- Each feature is developed on its own `feat/...` branch.
- Pull requests are merged only when CI passes.

## Security

Secrets such as API keys are never committed. Local configuration lives in `backend/.env`,
which is git-ignored; `.env.example` documents the available variables.
