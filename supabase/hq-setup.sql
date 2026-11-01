-- J-SCHOOLS system administration setup. Run ONCE in the Supabase SQL Editor (safe to run again).
-- Creates: device tracking, account blocks, an audit log, and makes mygjyb@gmail.com the ONLY super administrator.

-- 0) The single allowed super administrator address -------------------------------------------
create or replace function public.hq_allowed_email() returns text
language sql immutable as $$ select 'mygjyb@gmail.com'::text $$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and lower(coalesce(auth.email(), '')) = lower(public.hq_allowed_email())
     and exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'super_admin');
$$;

-- 1) Make that account the only super administrator ---------------------------------------------
-- (the account must already exist in Authentication > Users; this only changes its role)
delete from public.user_roles where role = 'super_admin'
  and user_id not in (select id from auth.users where lower(email) = lower(public.hq_allowed_email()));
insert into public.user_roles (user_id, role)
  select id, 'super_admin' from auth.users where lower(email) = lower(public.hq_allowed_email())
  and not exists (select 1 from public.user_roles r where r.user_id = auth.users.id and r.role = 'super_admin');

-- 2) Tables -----------------------------------------------------------------------------------
create table if not exists public.device_sessions (
  device_id    text primary key,
  user_email   text,
  user_label   text,
  role         text,
  school_id    uuid,
  school_name  text,
  device_type  text,
  os           text,
  browser      text,
  is_app       boolean not null default false,
  user_agent   text,
  ip           text,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  login_count  integer not null default 1,
  revoked      boolean not null default false,
  revoked_at   timestamptz,
  blocked      boolean not null default false
);
create index if not exists device_sessions_last_seen_idx on public.device_sessions (last_seen desc);
create index if not exists device_sessions_school_idx on public.device_sessions (school_id);

create table if not exists public.device_logins (
  id        bigint generated always as identity primary key,
  device_id text not null,
  user_email text,
  role      text,
  school_id uuid,
  ip        text,
  at        timestamptz not null default now()
);
create index if not exists device_logins_device_idx on public.device_logins (device_id, at desc);

create table if not exists public.blocked_accounts (
  email      text primary key,
  reason     text,
  blocked_at timestamptz not null default now(),
  blocked_by text
);

create table if not exists public.hq_audit (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  actor  text,
  action text not null,
  target text,
  detail text
);
create index if not exists hq_audit_at_idx on public.hq_audit (at desc);

-- 3) Row level security: only the super administrator can read or change these directly ----------
alter table public.device_sessions  enable row level security;
alter table public.device_logins    enable row level security;
alter table public.blocked_accounts enable row level security;
alter table public.hq_audit         enable row level security;

drop policy if exists hq_all on public.device_sessions;
drop policy if exists hq_all on public.device_logins;
drop policy if exists hq_all on public.blocked_accounts;
drop policy if exists hq_all on public.hq_audit;
create policy hq_all on public.device_sessions  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy hq_all on public.device_logins    for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy hq_all on public.blocked_accounts for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy hq_all on public.hq_audit         for all using (public.is_super_admin()) with check (public.is_super_admin());

-- 4) Functions every signed-in (or parent) device may call ---------------------------------------
-- Records the device and tells it whether it has been signed out or blocked.
create or replace function public.device_heartbeat(
  p_device_id text, p_event text, p_role text, p_school_id uuid, p_school_name text,
  p_user_label text, p_device_type text, p_os text, p_browser text, p_is_app boolean,
  p_user_agent text, p_ip text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(coalesce(auth.email(), ''));
  v_role  text := case when auth.uid() is null then 'Parent / guardian' else left(coalesce(p_role, ''), 40) end;
  v_row   public.device_sessions;
  v_blocked boolean := false;
begin
  if p_device_id is null or length(p_device_id) < 8 or length(p_device_id) > 80 then
    return jsonb_build_object('status', 'ok');
  end if;
  if v_email <> '' then
    select exists (select 1 from public.blocked_accounts where lower(email) = v_email) into v_blocked;
  end if;

  insert into public.device_sessions as d (device_id, user_email, user_label, role, school_id, school_name,
      device_type, os, browser, is_app, user_agent, ip)
  values (p_device_id, nullif(v_email, ''), left(p_user_label, 80), v_role, p_school_id, left(p_school_name, 120),
      left(p_device_type, 20), left(p_os, 40), left(p_browser, 40), coalesce(p_is_app, false), left(p_user_agent, 300), left(p_ip, 64))
  on conflict (device_id) do update set
      user_email  = coalesce(nullif(v_email, ''), d.user_email),
      user_label  = coalesce(left(p_user_label, 80), d.user_label),
      role        = v_role,
      school_id   = coalesce(p_school_id, d.school_id),
      school_name = coalesce(left(p_school_name, 120), d.school_name),
      device_type = coalesce(left(p_device_type, 20), d.device_type),
      os          = coalesce(left(p_os, 40), d.os),
      browser     = coalesce(left(p_browser, 40), d.browser),
      is_app      = coalesce(p_is_app, d.is_app),
      user_agent  = coalesce(left(p_user_agent, 300), d.user_agent),
      ip          = coalesce(left(p_ip, 64), d.ip),
      last_seen   = now(),
      login_count = d.login_count + (case when p_event = 'login' then 1 else 0 end),
      -- a fresh login clears a one-time remote sign-out (but never a block)
      revoked     = case when p_event = 'login' then false else d.revoked end
  returning * into v_row;

  if p_event = 'login' then
    insert into public.device_logins (device_id, user_email, role, school_id, ip)
    values (p_device_id, nullif(v_email, ''), v_role, p_school_id, left(p_ip, 64));
  end if;

  return jsonb_build_object('status',
    case when v_blocked or v_row.blocked then 'blocked' when v_row.revoked then 'revoked' else 'ok' end);
end $$;

create or replace function public.account_blocked() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocked_accounts where lower(email) = lower(coalesce(auth.email(), '')));
$$;

-- Lets the system administrator look up an auth user id (used to switch off sign-in for a blocked account).
create or replace function public.hq_user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = public as $$
  select case when public.is_super_admin() then (select id from auth.users where lower(email) = lower(p_email) limit 1) end;
$$;

grant execute on function public.device_heartbeat(text,text,text,uuid,text,text,text,text,text,boolean,text,text) to anon, authenticated;
grant execute on function public.account_blocked() to anon, authenticated;
grant execute on function public.hq_user_id_by_email(text) to authenticated;
grant execute on function public.is_super_admin() to authenticated;
