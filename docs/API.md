# JobTrack AI — API reference

The backend is a FastAPI app. With it running, interactive docs are also available at
<http://localhost:8000/docs>. Back to the [README](../README.md).

## Endpoints

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

## Listing, search and filters

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

## Application fields

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

## Follow-ups

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

## Statistics

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

## AI analysis

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/analysis/config` | Whether AI analysis is available, and which provider/model (never the key) |
| `POST` | `/api/analysis` | Analyse `{cv_text, job_text, mode, consent_external}` |

**Two modes.**

| Mode | When | What it does |
| --- | --- | --- |
| `local` (default) | Always available | Matches about 50 known technologies and competencies (with aliases, ignoring case and accents) between the offer and the CV. No AI and no external service: the texts never leave the server. It cannot understand context, synonyms outside its catalogue or requirements phrased differently, and it always marks years of experience and degrees as ambiguous. |
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
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Claude model ID (Claude Opus 5.5, listed in Anthropic's models overview). Any current Claude API model ID works, e.g. `claude-sonnet-5-5` or `claude-haiku-5-5`. |
| `AI_TIMEOUT_SECONDS` | `60` | Time to wait for the provider before failing. |
| `AI_MAX_RETRIES` | `2` | SDK retries on transient failures only (connection errors, 408/409/429, 5xx). Safety refusals are never retried. |

To enable AI mode, create an API key in the Anthropic Console, put it in `backend/.env`
as `ANTHROPIC_API_KEY=...` and restart `uvicorn`. Never commit the key: `.env` is
git-ignored. Each AI analysis is a paid API call billed to that key.

**Limits and errors.** Each text must have 30–20,000 characters (`422` otherwise). AI
mode without a key returns `409`. Provider failures return a Spanish message: timeout
`504`, rate limit `429`, and invalid key, other API errors, connection errors, truncated
responses or responses that do not match the schema `502`.

**Retries and safety refusals.** Only transient technical failures are retried, by the
SDK itself (connection errors, 408/409/429 and 5xx; `AI_MAX_RETRIES` times). A safety
refusal from the model (`stop_reason: "refusal"`) is **not** retried and is **never**
sent to another model: the user sees a `422` explaining that the model declined, and can
review the texts or use the basic analysis. The request uses the standard Messages
endpoint with the single configured model and no server-side fallbacks. The app does not
fall back silently from AI to the local mode either: the user decides.

## Errors

| Status | When                                                              |
| ------ | ----------------------------------------------------------------- |
| `404`  | The application id does not exist                                 |
| `409`  | Marking a follow-up as done when the application has none         |
| `422`  | Invalid body or query parameters (missing field, bad URL, unknown status, inconsistent dates, search text too long, …) |

## Example

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

