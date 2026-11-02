-- J-SCHOOLS teacher activity feed. Run ONCE in the Supabase SQL Editor (safe to run again).
-- Adds one new table, jsa_activity. Nothing existing is changed.
-- School administrators see their own school's teacher logins and marks entries on the dashboard.

create table if not exists public.jsa_activity (
  id         bigint generated always as identity primary key,
  school_id  uuid not null,
  user_email text not null,
  user_name  text,
  kind       text not null check (kind in ('login', 'marks')),
  detail     text not null default '',
  at         timestamptz not null default now()
);
create index if not exists jsa_activity_school_at_idx on public.jsa_activity (school_id, at desc);

alter table public.jsa_activity enable row level security;

drop policy if exists jsa_read   on public.jsa_activity;
drop policy if exists jsa_own    on public.jsa_activity;
drop policy if exists jsa_insert on public.jsa_activity;
drop policy if exists jsa_update on public.jsa_activity;

-- Only that school's administrators (or the system administrator) can read the feed.
create policy jsa_read on public.jsa_activity for select using (
  exists (select 1 from public.allowed_users a
          where a.school_id = jsa_activity.school_id and lower(a.email) = lower(coalesce(auth.email(), '')) and a.role = 'admin')
  or lower(coalesce(auth.email(), '')) = 'mygjyb@gmail.com'
);

-- A teacher can read back their own entries (needed to merge repeats).
create policy jsa_own on public.jsa_activity for select using (lower(user_email) = lower(coalesce(auth.email(), '')));

-- A signed-in member of the school can add entries for themselves only.
create policy jsa_insert on public.jsa_activity for insert with check (
  lower(user_email) = lower(coalesce(auth.email(), ''))
  and exists (select 1 from public.allowed_users a
              where a.school_id = jsa_activity.school_id and lower(a.email) = lower(coalesce(auth.email(), '')))
);

-- ...and refresh the time of their own recent entry (so repeated saves are one line, not fifty).
create policy jsa_update on public.jsa_activity for update
  using (lower(user_email) = lower(coalesce(auth.email(), '')))
  with check (lower(user_email) = lower(coalesce(auth.email(), '')));

grant select, insert, update on public.jsa_activity to authenticated;
