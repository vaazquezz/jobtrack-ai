# JobTrack AI

[![CI](https://github.com/vaazquezz/jobtrack-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/vaazquezz/jobtrack-ai/actions/workflows/ci.yml)

Personal web app to manage a job search: track applications, visualise them on a Kanban
board, review statistics and, in a later phase, analyse job offers against a CV with AI.

> **Status:** phase 1 — applications REST API. The remaining features are planned and are
> being built incrementally, one branch per phase.

## Tech stack

| Layer    | Technology                                              |
| -------- | ------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS                |
| Backend  | Python 3.11+, FastAPI, SQLModel, Pydantic Settings      |
| Database | SQLite                                                  |
| Quality  | pytest, ruff, oxlint, GitHub Actions                    |

## Roadmap

- [x] **Phase 0** — Project skeleton, health endpoint and CI
- [x] **Phase 1** — Applications REST API (CRUD)
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
│   ├── app/            # main.py, config.py, database.py, models.py, routers/
│   ├── tests/          # pytest suite (isolated in-memory SQLite)
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

Data is stored in `backend/jobtrack.db` (SQLite, git-ignored). The table is created
automatically on startup; change the location with `DATABASE_URL`.

### Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. The dev server proxies `/api` requests to the backend,
and the header badge shows whether the API is reachable.

## API reference

All endpoints are under `/api`. Request and response bodies are JSON.

| Method   | Endpoint                  | Description                     | Success |
| -------- | ------------------------- | ------------------------------- | ------- |
| `GET`    | `/api/health`             | Liveness check                  | `200`   |
| `POST`   | `/api/applications`       | Create an application           | `201`   |
| `GET`    | `/api/applications`       | List applications, newest first | `200`   |
| `GET`    | `/api/applications/{id}`  | Get one application             | `200`   |
| `PATCH`  | `/api/applications/{id}`  | Update the fields sent          | `200`   |
| `DELETE` | `/api/applications/{id}`  | Delete an application           | `204`   |

`GET /api/applications` accepts `offset` (default `0`) and `limit` (default `100`, max `200`).

### Application fields

| Field            | Type                     | Required | Rules                                                  |
| ---------------- | ------------------------ | -------- | ------------------------------------------------------ |
| `company`        | string                   | yes      | 1–200 characters, surrounding spaces are trimmed       |
| `position`       | string                   | yes      | 1–200 characters, surrounding spaces are trimmed       |
| `url`            | string \| null           | no       | Valid `http` or `https` URL, max 2000 characters       |
| `applied_date`   | date (`YYYY-MM-DD`) \| null | no    |                                                        |
| `status`         | enum                     | no       | `wishlist`, `applied` (default), `interview`, `offer`, `rejected` |
| `notes`          | string \| null           | no       | Max 5000 characters; blank text is stored as `null`    |
| `follow_up_date` | date (`YYYY-MM-DD`) \| null | no    | Cannot be earlier than `applied_date`                  |

Responses also include the read-only fields `id`, `created_at` and `updated_at` (UTC).
In `PATCH`, only the fields sent are changed; optional fields can be cleared with `null`,
but `company`, `position` and `status` cannot be `null`.

### Errors

| Status | When                                                              |
| ------ | ----------------------------------------------------------------- |
| `404`  | The application id does not exist                                 |
| `422`  | Invalid body or query parameters (missing field, bad URL, unknown status, inconsistent dates, …) |

### Example

```bash
curl -X POST http://localhost:8000/api/applications \
  -H "Content-Type: application/json" \
  -d '{
        "company": "Example Corp",
        "position": "Backend Developer",
        "url": "https://example.com/jobs/123",
        "applied_date": "2026-11-01",
        "status": "applied",
        "follow_up_date": "2026-11-08"
      }'

curl -X PATCH http://localhost:8000/api/applications/1 \
  -H "Content-Type: application/json" \
  -d '{"status": "interview"}'
```

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
