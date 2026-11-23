# JobTrack AI

[![CI](https://github.com/vaazquezz/jobtrack-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/vaazquezz/jobtrack-ai/actions/workflows/ci.yml)

Personal web app to manage a job search: track applications, visualise them on a Kanban
board, review statistics and, in a later phase, analyse job offers against a CV with AI.

> **Status:** phase 7 — AI job offer analysis. Built incrementally, one branch per phase.

## Tech stack

| Layer    | Technology                                              |
| -------- | ------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, dnd-kit, Recharts |
| Backend  | Python 3.11+, FastAPI, SQLModel, Pydantic Settings, Anthropic SDK |
| Database | SQLite                                                  |
| Quality  | pytest, ruff, Vitest, Testing Library, oxlint, GitHub Actions |

## Roadmap

- [x] **Phase 0** — Project skeleton, health endpoint and CI
- [x] **Phase 1** — Applications REST API (CRUD)
- [x] **Phase 2** — Applications UI (list and form)
- [x] **Phase 3** — Search and filters
- [x] **Phase 4** — Follow-up reminders
- [x] **Phase 5** — Kanban board
- [x] **Phase 6** — Statistics dashboard
- [x] **Phase 7** — AI job offer analysis and CV comparison

## Project structure

```
jobtrack-ai/
├── backend/            # FastAPI application
│   ├── app/            # main.py, config.py, database.py, models.py, routers/
│   ├── tests/          # pytest suite (isolated in-memory SQLite)
│   └── pyproject.toml  # dependencies, ruff and pytest config
├── frontend/           # React + TypeScript + Vite + Tailwind
│   └── src/
│       ├── api/        # typed fetch client for the FastAPI endpoints
│       ├── components/ # page, list, form, modal and UI pieces (+ tests)
│       ├── hooks/      # useApplications: loading and syncing the list
│       ├── lib/        # validation (mirrors the backend) and formatting
│       └── types/      # shared TypeScript types
├── .github/workflows/  # CI pipeline
└── .env.example        # environment variables template (no secrets)
```

## Getting started

### Requirements

- Python 3.11 or newer
- Node.js 22.22+ or 24.15+ (needed by the test tooling; the app itself runs on 20.19+)

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

## Using the app

- **List** — every application with company, position, applied date, follow-up date and
  status. On phones each application is a card; on larger screens it is a table row.
- **Add** — *Nueva candidatura* opens a form. Company and position are required; the
  applied date defaults to today.
- **Edit** — the pencil icon opens the same form pre-filled.
- **Delete** — the bin icon asks for confirmation before anything is removed.
- **Kanban** — the *Kanban* tab shows one column per status (*Por aplicar*, *Aplicada*,
  *Entrevista*, *Oferta*, *Rechazada*) with its count. Cards show company, position,
  applied date and follow-up date. Drag a card to another column to change its status;
  it is saved automatically through the API. Without dragging, use the *Mover a* selector
  on each card (handy on phones and with a keyboard or screen reader), or focus the
  card's grip handle, press space, move with ←/→ and press space again. The move is shown
  at once; if the server fails, the card goes back to its column and an alert offers
  *Reintentar*. The search applies to the board, but the status filter does not (the
  columns already split by status, and a filter would make moved cards vanish). On
  narrow screens only the board scrolls sideways, one column at a time.
- **Follow-ups** — the *Seguimientos* tab lists every application with a follow-up date,
  grouped into *Vencidos* (overdue), *Para hoy* and *Próximos*, with relative dates
  ("Hace 3 días", "Mañana"). Its counter shows how many are pending (overdue + today),
  in red when any is overdue. From there you can mark a follow-up as done, change or
  remove its date (with quick options: 3 days, 1 week, 2 weeks) or edit the application.
  The list also flags overdue and due-today follow-ups. The search and status filters
  apply to the list and follow-ups tabs, and the selected tab is kept in the URL
  (`#kanban`, `#seguimientos`, `#estadisticas`, `#analisis`).
- **Statistics** — the *Estadísticas* tab shows KPIs, counts per status and three charts
  (weekly activity, distribution by status, interviews and offers) for the last 30 days,
  the last 90 days or the whole history. Each chart has a hover tooltip and a *Ver datos*
  table. The numbers reload after any change made in the other tabs. Search and status
  filters do not apply here. See [Statistics](#statistics) for the definitions.
- **AI analysis** — the *Análisis IA* tab compares a pasted CV with a job offer and lists
  what the CV demonstrates (with the quote that proves it), what is missing, what is
  ambiguous, the relevant skills, and recommendations for the CV and the interview, with an
  orientative score and a *Copiar resultado* button. It works without any key (basic
  keyword analysis) and can use Claude when the backend has an API key. See
  [AI analysis](#ai-analysis).
- **Search and filter** — type in the search box to find applications by company or
  position (case and accents are ignored) and pick a status (*Todas*, *Por aplicar*,
  *Aplicada*, *Entrevista*, *Oferta*, *Rechazada*). Both can be combined; results come
  from the API as you type, without reloading the page. *Limpiar filtros* resets both, and
  a message is shown when nothing matches.
- **Feedback** — loading placeholders, an error panel with *Reintentar* if the API is not
  reachable, an empty state for the first visit and a short notice after each change.

The form validates the same rules as the API (required fields, length limits, `http(s)`
URLs, follow-up date not before the applied date) and still shows any error the API
returns.

## API reference

All endpoints are under `/api`. Request and response bodies are JSON.

| Method   | Endpoint                  | Description                     | Success |
| -------- | ------------------------- | ------------------------------- | ------- |
| `GET`    | `/api/health`             | Liveness check                  | `200`   |
| `POST`   | `/api/applications`       | Create an application           | `201`   |
| `GET`    | `/api/applications`       | List and filter, newest first   | `200`   |
| `GET`    | `/api/applications/{id}`  | Get one application             | `200`   |
| `PATCH`  | `/api/applications/{id}`  | Update the fields sent          | `200`   |
| `DELETE` | `/api/applications/{id}`  | Delete an application           | `204`   |
| `GET`    | `/api/follow-ups`         | Follow-ups grouped by date      | `200`   |
| `POST`   | `/api/applications/{id}/follow-up/complete` | Mark a follow-up as done | `200` |
| `GET`    | `/api/stats`              | Statistics for a period         | `200`   |
| `GET`    | `/api/analysis/config`    | Available analysis modes        | `200`   |
| `POST`   | `/api/analysis`           | Analyse a CV against an offer   | `200`   |

### Listing, search and filters

`GET /api/applications` accepts these query parameters, which can be combined:

| Parameter | Description                                                                 |
| --------- | --------------------------------------------------------------------------- |
| `q`       | Text to find in `company` or `position`. Case- and accent-insensitive (`telefónica` matches `TELEFÓNICA`), surrounding spaces are ignored, max 200 characters |
| `status`  | One of `wishlist`, `applied`, `interview`, `offer`, `rejected`              |
| `offset`  | Number of results to skip (default `0`)                                     |
| `limit`   | Maximum number of results (default `100`, max `200`)                        |

The response header `X-Total-Count` contains the total number of matches, ignoring
`offset` and `limit`.

```bash
curl -i "http://localhost:8000/api/applications?q=backend&status=applied&limit=20"
```

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

### Follow-ups

`GET /api/follow-ups` returns the applications that have a `follow_up_date`, grouped
relative to a reference day and sorted by date:

```json
{
  "today": "2026-11-23",
  "overdue": [/* follow_up_date < today */],
  "due_today": [/* follow_up_date == today */],
  "upcoming": [/* follow_up_date > today */],
  "counts": { "overdue": 1, "today": 1, "upcoming": 2, "pending": 2 }
}
```

It accepts `today` (`YYYY-MM-DD`, defaults to the server date; the UI sends the user's
local date so "today" matches their time zone) and the same `q` and `status` filters as
the list.

**Marking a follow-up as done** — `POST /api/applications/{id}/follow-up/complete`
with an optional body `{"completed_on": "2026-11-23", "next_follow_up_date": "2026-11-30"}`:

- clears `follow_up_date`, so the follow-up is no longer pending (or sets it to
  `next_follow_up_date` to schedule the next one in the same step);
- appends `Seguimiento realizado el 23/11/2026.` to the notes, as a simple history
  (skipped only if the notes are already at the 5000-character limit);
- returns `409` if the application has no pending follow-up, and `422` if the next date
  is before `applied_date`.

This design needs no new database columns, so existing `jobtrack.db` files keep working
without a migration. Changing or removing a follow-up date uses the normal `PATCH`.

There are no emails, push notifications or background jobs: the counter and the
*Seguimientos* tab are the reminders.

### Statistics

`GET /api/stats?period=30d|90d|all&today=YYYY-MM-DD` (defaults: `all` and the server
date; the UI sends the user's local date) returns totals, counts per status, rates and
submitted applications per week. Everything is computed from what is stored in SQLite.

| Metric | Definition |
| --- | --- |
| Period | An application is included when its **applied date**, or its creation date if it has none, is between the period start and `today` (inclusive). 30 days = today and the 29 days before. Future dates are excluded. |
| Candidaturas (`total`) | Applications in the period, every status. |
| Enviadas (`submitted`) | Applications in any status except *Por aplicar* (`wishlist`). |
| Con respuesta (`responded`) | Submitted applications currently in *Entrevista*, *Oferta* or *Rechazada*. |
| Entrevistas (`interviews`) | Submitted applications currently in *Entrevista* or *Oferta*. |
| Ofertas (`offers`) | Applications currently in *Oferta*. |
| Tasa de respuesta | `responded / submitted` |
| Tasa de entrevistas | `interviews / submitted` |
| Tasa de ofertas | `offers / submitted` |
| Evolución semanal (`weekly`) | Submitted applications per week (Monday to Sunday) by **applied date**, including weeks with none. The first and last weeks of a 30/90-day period may be partial. |

Edge cases: with no submitted applications the rates are `null` (shown as "—"), not a
division by zero. Submitted applications without an applied date are left out of the
weekly chart and counted in `undated_submitted` instead of being given a date. A period
without applications returns zeros and the UI shows an empty state.

**Limitations.** Only the *current* status of each application is stored, not a history
of status changes or the dates of responses, interviews or offers. The metrics therefore
describe where applications are today:

- An application rejected after an interview counts as a response but not as an
  interview, so the interview rate is a lower bound.
- Applications marked *Rechazada* without the company replying still count as responses.
- Interviews and offers cannot be placed on a timeline; only submissions (applied date)
  can, which is why the weekly chart shows submissions only.
- Creation dates are stored in UTC, so an application without an applied date created
  late in the evening may fall on the next day.

### AI analysis

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/analysis/config` | Whether AI analysis is available, and which provider/model (never the key) |
| `POST` | `/api/analysis` | Analyse `{cv_text, job_text, mode, consent_external}` |

**Two modes.**

| Mode | When | What it does |
| --- | --- | --- |
| `local` (default) | Always available | Matches ~55 known technologies and competencies (with aliases, ignoring case and accents) between the offer and the CV. No AI and no external service: the texts never leave the server. It cannot understand context, synonyms outside its catalogue or requirements phrased differently, and it always marks years of experience and degrees as ambiguous. |
| `ai` | Only if `ANTHROPIC_API_KEY` is set on the backend, and `consent_external: true` | Sends both texts to Claude through the official Anthropic SDK. The response is constrained to a JSON schema and validated again with Pydantic. |

**How the result is kept honest (both modes).**

- Every requirement is classified as **met** (demonstrated by the CV), **missing** or
  **ambiguous**. A *met* requirement must quote text that really appears in the CV; the
  backend checks it and downgrades any requirement whose quote is not in the CV to
  *ambiguous*, so invented experience is never reported as demonstrated.
- The prompt tells the model to use only what the CV says, to treat the texts as data
  (ignoring instructions inside them), to prefer *ambiguous* when unsure and never to
  recommend claiming experience the CV does not show.
- **Orientative score** = (met + 0.5 × ambiguous) ÷ requirements analysed × 100, computed by
  the backend from the lists (not by the model). It only summarises this comparison: it is
  **not** a probability of being hired. With no requirements detected it is `null`.

**Privacy.** The CV and the offer are processed in memory: they are not stored in the
database, logged or saved in the browser. In the UI, AI mode shows a confirmation dialog
explaining that the full texts will be sent to an external provider before anything is
sent; the backend also refuses `mode: "ai"` without `consent_external: true` (`422`).

**Configuration** (`backend/.env`, see `.env.example`; restart the backend after changes):

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | *(empty)* | Enables AI mode. Empty = local analysis only. Read only by the backend, never sent to the frontend. |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Claude model to use. |
| `AI_TIMEOUT_SECONDS` | `60` | Time to wait for the provider before failing. |
| `AI_MAX_RETRIES` | `2` | SDK retries on connection errors, 429 and 5xx. |

To enable AI mode, create an API key in the Anthropic Console, put it in `backend/.env`
as `ANTHROPIC_API_KEY=...` and restart `uvicorn`. Never commit the key: `.env` is
git-ignored. Each AI analysis is a paid API call billed to that key.

**Limits and errors.** Each text must have 30–20,000 characters (`422` otherwise). AI
mode without a key returns `409`. Provider failures return a Spanish message:
timeout `504`, rate limit `429`, and invalid key, other API errors, connection errors,
refusals, truncated responses or responses that do not match the schema `502`. Server-side
refusal fallbacks are enabled, so a request declined by the model's safety classifiers
is retried on a fallback model within the same call. The app does not fall back
silently from AI to the local mode: the user decides.

### Errors

| Status | When                                                              |
| ------ | ----------------------------------------------------------------- |
| `404`  | The application id does not exist                                 |
| `409`  | Marking a follow-up as done when the application has none         |
| `422`  | Invalid body or query parameters (missing field, bad URL, unknown status, inconsistent dates, search text too long, …) |

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
npm test          # Vitest + Testing Library (jsdom)
npm run build
```

The same checks run automatically in GitHub Actions on every pull request.

## Development workflow

- `main` is the stable branch and only receives changes through pull requests.
- Each feature is developed on its own `feat/...` branch.
- Pull requests are merged only when CI passes.

## Security

Secrets such as API keys are never committed. Local configuration lives in `backend/.env`,
which is git-ignored; `.env.example` documents the available variables. The Anthropic key
is only read by the backend (as a secret value that is not printed in logs or settings
dumps) and never reaches the frontend. Tests use fake providers and fictional texts: they
never call a real API.
