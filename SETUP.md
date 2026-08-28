# ParakhMitra — Setup

Everything you must configure outside the code, plus commands to run. Do this once.

---

## 1. Run the database SQL

Open **Supabase Dashboard → SQL Editor → New query**, paste the entire contents of
[`supabase/schema.sql`](supabase/schema.sql), and **Run**.

Before running, edit one line — the administrator allow-list:

```sql
admin_emails text[] := array['mail.parthjsocial@gmail.com'];  -- put your admin email(s) here
```

This single script:

- adds `user_id` to the `scans` table,
- creates the `profiles` table,
- auto-creates a profile on first sign-in (role from email: admin allow-list → `admin`,
  `…@ves.ac.in` → `officer`, everyone else → `none`/no access),
- enables RLS so **scan records are immutable** (no client can edit or delete them; officers
  see only their own scans, admins see all),
- creates the private `evidence-photos` storage bucket, an upload policy, and a read policy
  scoped to the uploading officer (admins see all) so the app can mint short-lived signed URLs.

> Roles live in `profiles` after creation — an admin can change any user's role/status from the
> in-app **Users** screen.

---

## 2. Configure Google OAuth

### 2a. Google Cloud Console
1. Go to <https://console.cloud.google.com/> → create/select a project.
2. **APIs & Services → OAuth consent screen** → External → fill app name, support email → save.
   Add your test Google accounts under **Test users** while the app is unpublished.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → **Web application**.
4. Under **Authorized redirect URIs**, add your Supabase callback URL:
   ```
   https://eknufycjnzwssdttcpsr.supabase.co/auth/v1/callback
   ```
5. Copy the **Client ID** and **Client secret**.

### 2b. Supabase
1. **Dashboard → Authentication → Providers → Google** → enable it → paste the Client ID and
   Client secret from the step above → save.
2. **Dashboard → Authentication → URL Configuration**:
   - **Site URL:** `http://localhost:5173`
   - **Redirect URLs:** add `http://localhost:5173` (and any deployed URL later).

---

## 3. Environment variables

**Frontend** — `frontend/.env.local` (already set for this project):
```
VITE_SUPABASE_URL=...          # your project URL
VITE_SUPABASE_ANON_KEY=...     # anon/public key
VITE_API_BASE_URL=http://127.0.0.1:8000
```

**Backend** — `backend/.env` (must contain your real keys):
```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...  # service-role key (server only — bypasses RLS to write scans)
GEMINI_API_KEY=...
```

---

## 4. Run it

**Backend** (from `backend/`):
```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

**Frontend** (from `frontend/`):
```bash
npm run dev
```

Then open <http://localhost:5173>, click **Continue with Google**, and sign in with an admin or
`@ves.ac.in` account.

---

## How access works

| Email                                   | Role      | Access                                   |
| --------------------------------------- | --------- | ---------------------------------------- |
| in the `admin_emails` allow-list        | `admin`   | Full app + **Users** management, sees all scans |
| ends with `@ves.ac.in`                  | `officer` | Scan + own history, no Users tab         |
| anything else                           | `none`    | Signed in but **denied** with a message  |

An admin can later promote a `none`/`officer` user or deactivate anyone from the **Users** screen.
Deactivated (`inactive`) users are denied at login.
