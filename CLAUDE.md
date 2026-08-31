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

Tests (106, all should pass):

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

`.claude/launch.json` is gitignored. Recreate it locally if you need `preview_start` — one entry
for the frontend (`npm run dev`, cwd `frontend`, port 5173) and, if you want the app to actually
work in the preview, one for the backend (`venv/Scripts/python.exe -m uvicorn app.main:app …`,
cwd `backend`, port 8000).

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
9. **`GET /api/scans/{id}/verify` is public and must stay minimal.** It exists so someone holding
   a printed notice can check it. Return only what is already printed on that notice — never the
   evidence photos, the officer's email, or anything else on the record. Widening it turns an
   unguessable id into a data leak.
10. **Notice dates are IST.** Timestamps arrive from Postgres in UTC; `_fmt_dt()` converts to
    `Asia/Kolkata` before formatting. Formatting without converting silently prints a time 5.5
    hours out — and, before 05:30 IST, the wrong *date* on a document whose compliance period is
    counted from it.
11. **The notice reference must stay deterministic.** `_notice_ref()` derives `PM/<year>/<12 hex>`
    from the record's id and creation date, so regenerating a notice a year later produces the
    same reference. Don't make it depend on the current time or a counter.

---

## Layout and where things actually happen

```
backend/app/
  api/scans.py            all 5 endpoints; _authorise_scan_access() is the shared owner-or-admin gate
  rules/engine.py         the 8 rules + build_advisories(); pure functions, no I/O
  schemas/scan.py         Pydantic models — these ARE the Gemini response schema, not just validation
  services/gemini_service.py   one call, all images, structured output, media_resolution=HIGH
  services/supabase_service.py storage + db; create_signed_url() and the column-degrading insert
  services/report_service.py   Jinja2 -> xhtml2pdf notice; IST dates, notice ref, QR, base64 images
  assets/logo-notice.png  legacy notice masthead logo — no longer used (the notice is now text-only)
backend/tests/            pytest; start here when changing the engine
backend/experiments/      OCR baseline, kept as evidence. Not imported by the app.
frontend/src/
  screens/                one file per screen; Verify.tsx is the only public one
  components/ hooks/ lib/ lib/api.ts is the only fetch layer
  assets/logo.png         app logo; public/favicon.png is the tab icon
supabase/schema.sql       tables, trigger, every RLS policy. Idempotent — safe to re-run.
```

**The five endpoints:** `POST /api/scans` (the only writer), `GET /{id}/evidence` (signed photo
URLs), `GET /{id}/notice` (PDF), `GET /{id}/verify` (**public**), `GET /health`.

**Public route.** `/verify/:id` is handled in `App.tsx` *before* the auth gate, because the QR on
a printed notice has to work for whoever is holding the paper. Everything else requires a session.

## Non-obvious facts about the live project

These are things the code doesn't tell you and that have cost time before:

- **`APP_BASE_URL` must be the real frontend origin.** It is what the QR on each notice points at,
  and it defaults to `http://localhost:5173`. Set wrong, notices render fine but the QR leads
  nowhere — and the URL is baked into each PDF at generation time, so already-downloaded notices
  keep the bad link forever. `parakhmitra.vercel.app` appears throughout DEPLOY.md as an *example*
  and is not a live deployment; scanning a QR built from it gives Vercel's "Deployment not found".
- **`storage_path` is the canonical evidence record**: the 1–4 filenames pipe-joined in capture
  order (`"a.jpg | b.jpg | c.jpg"`). Read it with `_image_paths()`; the front/back columns are a
  legacy fallback only.
- **The evidence bucket is public** in the Supabase dashboard, despite `schema.sql` creating it
  private. The app doesn't depend on that flag — evidence is served through
  `GET /api/scans/{id}/evidence`, which mints signed URLs server-side — so the bucket can be
  switched to private with nothing breaking. Still worth doing.
- **Never link evidence via a public object URL.** That was tried, and it silently ties the app to
  the bucket's public flag.
- **`save_scan_record()` degrades per column.** If an optional column is missing it drops *only*
  that key and retries, so a partly-migrated database still saves the rest. Don't "simplify" it
  into an all-or-nothing fallback — that used to cost the record its `category`.
- **The Render backend has been down before** (`x-render-routing: no-server` on every path,
  including `/health`). If the deployed app 404s on everything, check the service exists before
  debugging code.
- **Free-tier Render sleeps** after ~15 min and cold-starts in ~50s. Hit `/health` before a demo.
- **`GEMINI_MODEL` defaults to `gemini-3.5-flash`.** Flash-Lite is cheaper but loses the small
  ink-jet MRP/batch blocks, which is the whole point of the extraction. Don't downgrade it to
  save money without re-testing that case.
- **xhtml2pdf can't render SVG and is unreliable with PNG alpha.** That is why every image in the
  PDF is a base64 JPEG/PNG data URI. (The notice itself is now text-only and monochrome — the only
  colour is the compliance verdict block — so there is no masthead image to flatten any more.)
- **A scan takes several seconds**, almost all of it the Gemini call at high media resolution plus
  moving several MB of photos. The rule engine is microseconds. Don't go optimising the rules.

## Known gaps (deliberate, not oversights)

- No labelled accuracy benchmark. Do not quote an accuracy number anywhere.
- Rate limiting is an in-process dict: resets on restart, not shared across instances. A spend
  guard, not a security control. The public verify route is limited per IP, same caveat.
- Only the backend has tests; the frontend has none.
- Eight rules, not the whole of the 2011 Rules — the photograph-verifiable subset.
- The admin dashboard's most-breached-rule tile (`topBreach()` in `lib/format.ts`) is computed in
  the browser over every row the admin query returns. Fine at demo scale; the production answer is
  a grouped query in Postgres.
- The notice is tamper-*evident* (QR verification), not tamper-proof. Digitally signing the PDF —
  PAdES, e.g. via pyHanko — is the production answer, and key custody is the real obstacle.

---

## Conventions

- Comments explain *why*, not what. The rule engine and `schema.sql` are written to be read by
  someone non-technical; keep that register.
- Errors shown to an officer say what went wrong and what to do about it.
- Python: type hints on public functions, `logger` not `print`.
- TypeScript: `strict` is on and `tsc -b` must stay clean. No `any`.
- Don't add dependencies casually — `xhtml2pdf` was chosen over WeasyPrint specifically because
  it is pure Python and needs no system libraries on Windows or Render's free tier. `qrcode` was
  added on the same basis.
- **Commit messages are literally `update`.** That is the owner's deliberate choice for how the
  repository reads on GitHub — match it rather than writing descriptive subjects.

## Docs

| File | Use |
| --- | --- |
| [README.md](README.md) | What the project is, for a first-time reader |
| [docs/SETUP.md](docs/SETUP.md) | One-time Supabase, OAuth, and env setup |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Vercel + Render deployment, CORS/OAuth and `APP_BASE_URL` |
| [docs/BRIEFING-BOOK.docx](docs/BRIEFING-BOOK.docx) | Team briefing + a 39-question answer bank |
| [docs/DESIGN.md](docs/DESIGN.md) | Design tokens and component conventions |
