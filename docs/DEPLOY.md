# ParakhMitra — Deployment (Vercel + Render)

Frontend → **Vercel** · Backend → **Render** · Database/Auth/Storage → **Supabase** (already hosted).

Deploy the **backend first** (you need its URL for the frontend), then the frontend, then wire
CORS + OAuth to the new domains.

Prerequisites: code pushed to GitHub (`pxrthj/sih-d9a`), a Supabase project, and Google OAuth
already configured (see [SETUP.md](SETUP.md)).

---

## 1. Backend → Render

1. **Render Dashboard → New → Blueprint** → connect the GitHub repo `pxrthj/sih-d9a`.
   Render reads [`render.yaml`](../render.yaml) and proposes the **parakhmitra-backend** web service
   (root dir `backend`, Python, free plan, start command already set).
2. When prompted, fill the secret env vars (these are `sync:false`, so Render asks for them):
   - `SUPABASE_URL` — your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase **service-role** key (server-only)
   - `GEMINI_API_KEY` — your Gemini key
   - `CORS_ORIGINS` — leave as a placeholder for now (e.g. `http://localhost:5173`); you'll set
     it to the Vercel URL in step 3.
   - `GEMINI_MODEL` and `PYTHON_VERSION` are pre-filled by the blueprint.
3. **Apply / Create** → wait for the build (installs `requirements.txt`; all pure-Python, no
   system libraries needed). When live, note the URL, e.g.:
   ```
   https://parakhmitra-backend.onrender.com
   ```
4. Verify: open `https://parakhmitra-backend.onrender.com/health` → should return
   `{"status":"healthy", ...}`.

> **Free-tier note:** Render free services sleep after ~15 min idle and cold-start (~50s) on the
> next request. The first scan after idle will be slow; that's expected.

---

## 2. Frontend → Vercel

1. **Vercel → Add New → Project** → import `pxrthj/sih-d9a`.
2. **Root Directory:** set to **`frontend`**. Framework preset auto-detects **Vite**
   (build `npm run build`, output `dist`). `frontend/vercel.json` handles SPA routing so deep
   links / refreshes work.
3. **Environment Variables** (Project Settings → Environment Variables) — add all three:
   - `VITE_SUPABASE_URL` — your Supabase URL
   - `VITE_SUPABASE_ANON_KEY` — Supabase **anon** key (public)
   - `VITE_API_BASE_URL` — the Render backend URL from step 1
     (e.g. `https://parakhmitra-backend.onrender.com`, no trailing slash)
4. **Deploy.** Note the URL, e.g. `https://parakhmitra.vercel.app`.

> Vite env vars are baked in at **build time** — if you change any, trigger a redeploy.

---

## 3. Wire them together

Now that you have the Vercel URL:

1. **Render → parakhmitra-backend → Environment** → set
   `CORS_ORIGINS = https://parakhmitra.vercel.app` (your actual Vercel domain; comma-separate
   multiple). Save → Render redeploys.
2. **Supabase → Authentication → URL Configuration:**
   - **Site URL:** `https://parakhmitra.vercel.app`
   - **Redirect URLs:** add `https://parakhmitra.vercel.app`
   (Keep `http://localhost:5173` too if you still develop locally.)
3. **Google OAuth:** no change needed — the authorized redirect URI stays the Supabase callback
   (`https://<ref>.supabase.co/auth/v1/callback`). The frontend signs in with
   `redirectTo = window.location.origin`, which Supabase now allows for the Vercel domain.

> While the Google app is in **Testing**, only accounts added as **Test users** can sign in.
> Publish the OAuth app when you want anyone (admins / `@ves.ac.in`) to log in.

---

## 4. Test the live app

1. Open `https://parakhmitra.vercel.app` → **Continue with Google** → sign in.
2. Run a scan (officer), confirm it appears in History, open the detail, **Download Improvement
   Notice**.
3. Sign in as admin → confirm system-wide view, Users tab, and no scan option.

If login fails: re-check the Supabase Redirect URLs and that your account is a Google test user.
If scans fail with a CORS/network error: confirm `CORS_ORIGINS` on Render exactly matches the
Vercel origin (scheme + host, no trailing slash) and the backend redeployed.

---

## Redeploys
- Push to `main` → Render and Vercel auto-build (once connected).
- Changing Render env vars → auto-redeploys the backend.
- Changing Vercel env vars → trigger a redeploy so the new values are built in.
