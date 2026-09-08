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

-- Capture location (WGS84) of where the scan was taken, read from the device's
-- geolocation at scan time and printed on the improvement notice. All three are
-- optional: an officer may deny location permission, or the device may have no
-- fix, in which case the notice simply omits the location line. The backend
-- degrades gracefully if these columns are absent (the coordinates are then not
-- persisted), so re-run this file to start recording them.
alter table public.scans
  add column if not exists latitude          double precision,
  add column if not exists longitude         double precision,
  add column if not exists location_accuracy double precision;   -- metres

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

-- ---------------------------------------------------------------------------
-- 7. Repeat offenders — who has been flagged, how often, and how recently
--
-- This is a VIEW, not a column on "scans", and that is deliberate. Deriving the
-- identity at read time means no new column, no backfill, and above all no
-- UPDATE against inspection records -- the table has no update path by design,
-- and a migration that rewrote every historical row to add a key would be the
-- one thing the whole schema is built to make impossible. Change the rules
-- below and every record, old and new, is regrouped on the next query.
--
-- security_invoker = on is load-bearing. Without it a view runs with its
-- creator's rights and quietly bypasses row-level security, which would let any
-- officer read every other officer's inspections through this view. With it,
-- the policies on "scans" apply exactly as they do everywhere else: officers
-- see their own work, admins see all of it.
-- ---------------------------------------------------------------------------

-- Reduces a printed packer name to one identity, so the same firm groups
-- together across photographs.
--
-- The ladder, in order:
--   1. take the part before the first comma -- packer strings read
--      "Name, Address, City", and only the name identifies the firm;
--   2. drop the role prefix. Packs say who the party IS as well as who they
--      are: "Mfd. By:", "Marketed by", "Packed by". The extraction prompt's own
--      worked example is 'Mfd. By: XYZ Ltd', so this is the common case, not an
--      edge one -- without it the same firm splits into a group per prefix;
--   3. drop the corporate suffixes, which appear inconsistently on the same
--      pack across print runs ("Pvt. Ltd." / "Pvt Ltd" / "PRIVATE LIMITED");
--   4. remove separators so spacing and punctuation stop mattering.
--
-- Step 4 deletes SEPARATORS rather than keeping only [:alnum:], and that
-- distinction is load-bearing. A packer named in Devanagari or Tamil is making
-- a lawful declaration, but vowel signs and viramas are combining marks, which
-- [:alnum:] does not match -- keeping only alphanumerics would quietly strip
-- शुभ फूड्स down to शभफडस, mangling the identity and risking collisions between
-- firms whose names differ only in those marks. Removing spaces and punctuation
-- leaves every script intact.
create or replace function public.manufacturer_identity(packer text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(split_part(coalesce(packer, ''), ',', 1)),
          '^\s*(mfd|manufactured|mfg|mktd|marketed|packed|pkd|imported|impd|distributed)\.?\s*(by)?\.?\s*:?\s*',
          '', 'g'
        ),
        -- Devanagari suffixes carry the same meaning as the English ones and
        -- appear on the same packs: प्रा. लि. is Pvt. Ltd. Without them a firm
        -- printing its name in Hindi splits from the same firm printing it in
        -- English. NEEDS REVIEW by a native reader, and by the same reasoning
        -- as the unit vocabulary: extend it per script rather than guess.
        '(\s*\.?\s*(pvt|private|ltd|limited|llp|inc|corp|co|प्रा|प्राइवेट|लि|लिमिटेड|कंपनी)\.?)+\s*$', '', 'g'
      ),
      '[[:space:][:punct:]]+', '', 'g'
    ),
    ''
  );
$$;

create or replace view public.manufacturer_offences
with (security_invoker = on) as
select
  public.manufacturer_identity(extracted ->> 'manufacturer_packer_importer') as manufacturer_key,
  -- The most recently read spelling, shown to a human. The key groups; this
  -- names. Picking the newest keeps the display current as extraction improves.
  (array_agg(
    extracted ->> 'manufacturer_packer_importer' order by created_at desc
  ))[1] as manufacturer_name,
  count(*)                                                                  as scan_count,
  count(*) filter (where lower(coalesce(status, '')) <> 'compliant')         as flagged_count,
  min(created_at)                                                           as first_seen,
  max(created_at)                                                           as last_seen
from public.scans
where public.manufacturer_identity(extracted ->> 'manufacturer_packer_importer') is not null
group by 1;

comment on view public.manufacturer_offences is
  'Inspection history grouped by packer identity. Read-time derivation: no column on scans, no backfill, no update to an immutable record.';

-- ---------------------------------------------------------------------------
-- 8. The officer's review of the extraction
--
-- An officer now corrects what the model read BEFORE the record exists, rather
-- than editing a record afterwards. That keeps rule 4 intact -- there is still
-- no update path, and a row is still written exactly once -- while letting a
-- misread MRP be fixed instead of standing as a false violation.
--
-- Both readings are kept. "extracted" is what the officer confirmed and what
-- the verdict was computed from; "extracted_original" is what the model
-- returned. A record that showed only the corrected values could no longer
-- demonstrate what the photograph actually said, which is most of its worth as
-- evidence, and would let a correction pass as a reading.
--
-- corrected_fields names the declarations that differ, so the notice can say
-- so plainly rather than leaving a reader to diff two JSON blobs.
--
-- Both are null on records written before this existed, and on one-shot scans
-- that never went through a review.
-- ---------------------------------------------------------------------------
alter table public.scans
  add column if not exists extracted_original jsonb,
  add column if not exists corrected_fields   text[];
