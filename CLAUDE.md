# CLAUDE.md

Context for working on ParakhMitra. Read [README.md](README.md) for what the project *is*; this
file is what you need to not break it.

---

## Run it

Backend (Windows; the venv is not on PATH, always call it explicitly):

```bash
cd backend && .\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Frontend:

```bash
cd frontend && npm run dev
```

Tests (88, all should pass):

```bash
cd backend && .\venv\Scripts\python.exe -m pytest
```

Typecheck / build the frontend before claiming a change works:

```bash
cd frontend && npx tsc -b && npm run build
```

`backend/.env` and `frontend/.env.local` exist locally with real keys and are gitignored. The
frontend's `VITE_API_BASE_URL` points at `http://127.0.0.1:8000`, so the backend must be running
or every API call fails.

---

## Invariants — do not break these without saying so

1. **The AI extracts; Python judges.** `gemini_service` returns fields only. Compliance verdicts
   come from `app/rules/engine.py` and nothing else. Never let a model decide `status`, and never
   feed rule text into the prompt.
2. **Every violation cites a rule.** If a check cannot be tied to a specific provision, it is an
   advisory, not a violation.
3. **Advisories never change the verdict.** They are observations for an officer; `status` is
   derived from violations alone. There is a test asserting this — keep it passing.
4. **Records are immutable.** `scans` has a `select` policy and deliberately no insert/update/
   delete policy. The backend's service-role key is the only writer and only ever inserts. Do not
   add an update path, an edit UI, or a delete endpoint.
5. **Ownership comes from the token**, never from the request body.
6. **Secrets stay server-side.** `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` live only in
   backend env vars. The browser gets the anon key and nothing else.
7. **Legal Metrology only.** No FSSAI, nutrition, or pricing rules. `CATEGORY_RULES` is an
   intentionally empty hook with a comment saying so.
8. **Don't invent legal citations.** The legibility advisory is referenced descriptively
   (`LMPC 2011 — legibility of declarations`) precisely because the exact rule/schedule number
   hasn't been confirmed by anyone qualified.

---

## Layout and where things actually happen

```
backend/app/
  api/scans.py            all 4 endpoints; _authorise_scan_access() is the shared owner-or-admin gate
  rules/engine.py         the 8 rules + build_advisories(); pure functions, no I/O
  schemas/scan.py         Pydantic models — these ARE the Gemini response schema, not just validation
  services/gemini_service.py   one call, all images, structured output, media_resolution=HIGH
  services/supabase_service.py storage + db; create_signed_url() and the column-degrading insert
  services/report_service.py   Jinja2 -> xhtml2pdf notice, images embedded as base64
backend/tests/            pytest; start here when changing the engine
backend/experiments/      OCR baseline, kept as evidence. Not imported by the app.
frontend/src/
  screens/ components/ hooks/ lib/     one file per screen; lib/api.ts is the only fetch layer
supabase/schema.sql       tables, trigger, every RLS policy. Idempotent — safe to re-run.
```

## Non-obvious facts about the live project

These are things the code doesn't tell you and that have cost time before:

- **`scans.front_path`, `scans.back_path` and `scans.advisories` do not exist** in the live
  database yet. `schema.sql` adds them, but it hasn't been re-run. `save_scan_record()` detects a
  missing column, drops just that key, and retries — so writes succeed and advisories are simply
  not persisted. Re-running `schema.sql` fixes it.
- **`storage_path` is the canonical evidence record**: the 1–4 filenames pipe-joined in capture
  order (`"a.jpg | b.jpg | c.jpg"`). Read it with `_image_paths()`; the front/back columns are a
  legacy fallback only.
- **The evidence bucket is currently public** in the Supabase dashboard, despite `schema.sql`
  creating it private. The app doesn't depend on that flag any more — evidence is served through
  `GET /api/scans/{id}/evidence`, which mints signed URLs server-side — so the bucket can be
  switched to private with nothing breaking. Worth doing.
- **Never link evidence via a public object URL.** That was tried, and it silently ties the app to
  the bucket's public flag.
- **The Render backend has been down before** (`x-render-routing: no-server` on every path,
  including `/health`). If the deployed app 404s on everything, check the service exists before
  debugging code.
- **Free-tier Render sleeps** after ~15 min and cold-starts in ~50s. Hit `/health` before a demo.
- **`GEMINI_MODEL` defaults to `gemini-3.5-flash`.** Flash-Lite is cheaper but loses the small
  ink-jet MRP/batch blocks, which is the whole point of the extraction. Don't downgrade it to
  save money without re-testing that case.

## Known gaps (deliberate, not oversights)

- No labelled accuracy benchmark. Do not quote an accuracy number anywhere.
- Rate limiting is an in-process dict: resets on restart, not shared across instances. A spend
  guard, not a security control.
- Only the backend has tests; the frontend has none.
- Eight rules, not the whole of the 2011 Rules — the photograph-verifiable subset.

---

## Conventions

- Comments explain *why*, not what. The rule engine and `schema.sql` are written to be read by
  someone non-technical; keep that register.
- Errors shown to an officer say what went wrong and what to do about it.
- Python: type hints on public functions, `logger` not `print`.
- TypeScript: `strict` is on and `tsc -b` must stay clean. No `any`.
- Don't add dependencies casually — `xhtml2pdf` was chosen over WeasyPrint specifically because
  it is pure Python and needs no system libraries on Windows or Render's free tier.

## Docs

| File | Use |
| --- | --- |
| [README.md](README.md) | What the project is, for a first-time reader |
| [docs/SETUP.md](docs/SETUP.md) | One-time Supabase, OAuth, and env setup |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Vercel + Render deployment and CORS/OAuth wiring |
| [docs/BRIEFING-BOOK.docx](docs/BRIEFING-BOOK.docx) | Team briefing + a 39-question answer bank |
| [docs/DESIGN.md](docs/DESIGN.md) | Design tokens and component conventions |
