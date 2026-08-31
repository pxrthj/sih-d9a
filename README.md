<p align="center">
  <img src="docs/logo.png" alt="ParakhMitra" width="170" />
</p>

# ParakhMitra

**Legal Metrology label compliance, checked from a photograph.**

Every pre-packaged commodity sold in India must carry a fixed set of declarations — who packed
it, what it is, how much is inside, what it costs, when it was made, and where to complain.
Verifying that is a manual, per-package job carried out by a limited inspectorate.

ParakhMitra turns it into a photograph. An officer captures one to four panels of a pack on a
phone and gets, in seconds, a **Compliant / Flagged** verdict with each violation named against
the rule it breaches, plus a printable Improvement Notice. Every inspection is stored as a
permanent, un-editable record with its evidence photos attached.

---

## The one design decision that matters

**The AI reads. It never judges.**

The vision model's only job is to turn photographs into structured fields. Whether those fields
satisfy the law is decided by [~200 lines of deterministic Python](backend/app/rules/engine.py) —
same input, same verdict, every time, each one citing the rule it came from. Nothing
probabilistic ever produces a compliance decision.

A second, deliberately weaker output exists for findings a photograph *cannot* settle — such as
lettering that looks too small but whose height would have to be physically measured. Those are
raised as **advisories**: shown to the officer, never counted as violations, never able to change
the status.

---

## How a scan works

```
  phone ──1── upload 1-4 photos ────────────────► Supabase Storage (private)
    │                                                      │
    └──2── POST /api/scans + bearer token ──► FastAPI ──3──┘  fetch bytes (service-role)
                                                 │
                                                 ├──4── one call, all images ──► Gemini
                                                 ├──5── 8 deterministic rules  (Python)
                                                 └──6── insert immutable row ──► Postgres
```

Reads bypass the API entirely: the app queries Postgres directly and **row-level security**, not
application code, decides what comes back.

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Client | React 19 · TypeScript · Vite | Capture, results, history, admin user management |
| API | FastAPI · Python 3.12 | The only writer of records: auth, rate limit, extraction, rules, PDF |
| Data | Supabase (Postgres, Auth, Storage) | Records, Google sign-in, private evidence bucket, RLS |
| Extraction | Gemini 3.5 Flash | Photographs → one schema-validated JSON object |

The API is deliberately five endpoints wide, and only one of them writes:

| Endpoint | Purpose |
| --- | --- |
| `POST /api/scans` | Run the pipeline; returns extraction, violations, advisories, status |
| `GET /api/scans/{id}/evidence` | Short-lived signed URLs for the evidence photos |
| `GET /api/scans/{id}/notice` | Render the Improvement Notice PDF |
| `GET /api/scans/{id}/verify` | **Public.** Verdict for a printed notice, so it can be checked against the record |
| `GET /health` | Liveness probe |

---

## Integrity model

Inspection records are legal evidence, so the guarantees live in the database rather than in the
interface:

- **Records are immutable.** RLS grants clients `select` only. No `insert`, `update` or `delete`
  policy exists on `scans`, so no signed-in user — officer or admin, through the app or with a
  hand-crafted request — can alter or remove an inspection. Only the backend's service-role key
  writes, and it only ever inserts.
- **Ownership can't be forged.** The owner of a scan comes from the validated token, never from
  the request body.
- **Two roles, enforced twice.** Officers scan and see their own work; admins oversee everything
  and manage users but cannot scan, so the audit trail never contains an inspection filed by the
  person supervising the inspectors. Both boundaries exist in the router *and* in RLS.
- **Notices are tamper-evident.** The PDF is a rendering, not the record. Each one carries a QR
  linking to a public verification page that reads the verdict straight from the database, so an
  altered document can be caught by anyone holding it.
- **Evidence stays private.** The bucket has no client read policy; the backend mints expiring
  signed URLs after checking the same owner-or-admin rule as the notice.

---

## Repository layout

```
backend/
  app/
    api/          FastAPI routes
    rules/        the deterministic rule engine + advisories
    schemas/      Pydantic models — validate the API AND define the Gemini response schema
    services/     Gemini, Supabase, PDF generation
  tests/          pytest suite for the rule engine
  experiments/    evaluation spikes kept for the record (see its README)
frontend/src/
  screens/        one file per screen
  components/     shared UI
  hooks/ lib/     data access and formatting
supabase/schema.sql   tables, trigger, and every RLS policy — idempotent, run it once
docs/                 setup, deployment, design, and the team briefing book
```

## Running it

Full instructions, including the one-time Supabase and Google OAuth setup, are in
[docs/SETUP.md](docs/SETUP.md).

```bash
# backend  (needs backend/.env — see backend/.env.example)
cd backend && python -m venv venv && venv/Scripts/pip install -r requirements.txt
venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

```bash
# frontend  (needs frontend/.env.local)
cd frontend && npm install && npm run dev
```

```bash
# tests
cd backend && venv/Scripts/pip install -r requirements-dev.txt && venv/Scripts/python -m pytest
```

## Documentation

| Document | What it covers |
| --- | --- |
| [docs/SETUP.md](docs/SETUP.md) | One-time setup: database, OAuth, environment variables |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Deploying to Vercel + Render, and wiring CORS/OAuth |
| [docs/BRIEFING-BOOK.docx](docs/BRIEFING-BOOK.docx) | Team briefing: architecture, rules, security, Q&A bank |
| [docs/DESIGN.md](docs/DESIGN.md) | Design tokens and component conventions |
| [CLAUDE.md](CLAUDE.md) | Working context: invariants, gotchas, and conventions to preserve |

## Scope and limitations

Stated plainly, because a compliance tool that overclaims is worse than none:

- **Eleven rules, not the whole of the 2011 Rules.** These are the mandatory declarations that can
  be verified from a photograph with certainty. Requirements such as minimum letter height need a
  calibrated reference in frame, so they are raised as advisories rather than adjudicated.
- **No published accuracy figure.** Extraction has not been measured against a labelled set. The
  benchmark — per-field precision and recall, with particular attention to the false-compliant
  rate — is the next milestone.
- **Legal Metrology only.** No FSSAI, nutrition or pricing analysis; those are different Acts and
  different regulators.
- **Rate limiting is per process.** 20 scans/minute/user held in memory: a spend guard, not a
  security control.
