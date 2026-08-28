-- ============================================================================
-- ParakhMitra — Supabase schema, RLS & auth wiring
-- Run this whole file once in the Supabase SQL Editor (Dashboard → SQL Editor).
--
-- It is idempotent (safe to re-run). It:
--   1. Adds user_id to the existing "scans" table.
--   2. Creates the "profiles" table (one row per user).
--   3. Auto-creates a profile on first Google sign-in, with role derived
--      from email (admin allow-list -> admin; @ves.ac.in -> officer; else none).
--   4. Locks everything down with RLS so inspection records are IMMUTABLE
--      from every client — no one can edit or delete a scan.
--   5. Adds a storage policy so officers can upload evidence photos.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. scans.user_id  (owner of each inspection record)
-- ---------------------------------------------------------------------------
alter table public.scans
  add column if not exists user_id uuid references auth.users (id);

-- Dedicated evidence path columns. The backend prefers these and falls back to
-- the combined "front.jpg | back.jpg" storage_path when they are absent, so
-- this is optional — but with them the insert succeeds on the first attempt
-- instead of erroring and retrying on every scan.
alter table public.scans
  add column if not exists front_path text,
  add column if not exists back_path  text;

-- Advisories: observations for the officer that are NOT rule violations and do
-- not affect the compliance status (e.g. declarations printed too small to
-- adjudicate from a photograph). The backend degrades gracefully if this column
-- is absent, but the advisories are then not persisted with the record.
alter table public.scans
  add column if not exists advisories jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. profiles table
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'none'   check (role   in ('admin', 'officer', 'none')),
  status     text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Role derivation + auto-create profile on first sign-in
--    >>> EDIT the admin_emails array below to set your administrator(s). <<<
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- EDIT ME: emails that should become administrators.
  admin_emails text[] := array['mail.parthjsocial@gmail.com'];
  user_email   text   := lower(coalesce(new.email, ''));
  derived_role text;
begin
  if user_email = any (admin_emails) then
    derived_role := 'admin';
  elsif user_email like '%@ves.ac.in' then
    derived_role := 'officer';
  else
    derived_role := 'none';       -- signed in, but no access until an admin grants a role
  end if;

  insert into public.profiles (id, email, full_name, role, status)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    derived_role,
    'active'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 4. is_admin() helper — SECURITY DEFINER so it can read profiles without
--    triggering recursive RLS on the profiles policies below.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------------

-- profiles: users read their own row; admins read & update everyone.
-- (No client INSERT — the trigger creates rows. No client role self-update.)
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own   on public.profiles;
drop policy if exists profiles_select_admin  on public.profiles;
drop policy if exists profiles_update_admin  on public.profiles;

create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

create policy profiles_select_admin on public.profiles
  for select using (public.is_admin());

create policy profiles_update_admin on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- scans: officers read only their own; admins read all.
-- Deliberately NO insert/update/delete policies for clients: inspection
-- records can only be written by the backend (service-role key bypasses RLS)
-- and can never be altered or removed by any user.
alter table public.scans enable row level security;

drop policy if exists scans_select_own_or_admin on public.scans;

create policy scans_select_own_or_admin on public.scans
  for select using (auth.uid() = user_id or public.is_admin());

-- ---------------------------------------------------------------------------
-- 6. Storage: evidence-photos bucket + upload policy
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('evidence-photos', 'evidence-photos', false)
on conflict (id) do nothing;

-- Authenticated officers may upload evidence photos.
drop policy if exists evidence_upload_authenticated on storage.objects;

create policy evidence_upload_authenticated on storage.objects
  for insert to authenticated
  with check (bucket_id = 'evidence-photos');

-- No client SELECT policy is needed on the evidence bucket. The app never reads
-- these objects directly: the backend mints short-lived SIGNED urls with the
-- service-role key (GET /api/scans/{id}/evidence) after checking that the caller
-- owns the scan or is an admin, and reads the bytes itself when building the
-- notice. The bucket therefore stays private with upload as its only client
-- permission.
drop policy if exists evidence_read_own_or_admin on storage.objects;
