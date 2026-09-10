-- JIIB Core Sync
-- Apply this migration to the Supabase project configured in SUPABASE_URL.
-- It keeps the normalized tables used by the application and preserves the
-- flexible school_data blob used by the original system for term configuration.

create extension if not exists pgcrypto;

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.school_data (
  school_id uuid primary key references public.schools(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.students (
  id uuid not null default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  term_key text not null default 'current',
  name text not null,
  class text not null,
  house text not null default '',
  parent_phone text,
  subjects jsonb,
  badges jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, school_id, term_key)
);

create table if not exists public.marks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  term_key text not null,
  student_id uuid not null,
  subject text not null,
  class text not null default '',
  aoi numeric not null default 0,
  midterm numeric not null default 0,
  end numeric not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  unique (school_id, term_key, student_id, subject)
);

create table if not exists public.allowed_users (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'teacher' check (role in ('admin', 'teacher')),
  subjects jsonb,
  created_at timestamptz not null default now(),
  unique (school_id, email)
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  role text not null check (role in ('super_admin', 'admin', 'teacher')),
  subjects jsonb,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, school_id)
);

create table if not exists public.parent_chat (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  phone text not null,
  sender text not null check (sender in ('parent', 'school')),
  sender_name text not null,
  text text not null,
  ts timestamptz not null default now()
);

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  sender_name text not null,
  sender_email text,
  sender_phone text,
  message text not null,
  direction text not null default 'in' check (direction in ('in', 'out')),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.device_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  device_id text not null,
  device_name text,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, device_id)
);

create table if not exists public.device_blacklist (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.report_verification_codes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  term_key text not null,
  code text not null,
  created_at timestamptz not null default now(),
  unique (school_id, term_key)
);

create index if not exists students_school_term_idx on public.students (school_id, term_key);
create index if not exists marks_school_term_idx on public.marks (school_id, term_key);
create index if not exists parent_chat_school_phone_idx on public.parent_chat (school_id, phone, ts);
create index if not exists contact_messages_school_created_idx on public.contact_messages (school_id, created_at);

alter table public.schools enable row level security;
alter table public.school_data enable row level security;
alter table public.students enable row level security;
alter table public.marks enable row level security;
alter table public.allowed_users enable row level security;
alter table public.user_roles enable row level security;
alter table public.parent_chat enable row level security;
alter table public.contact_messages enable row level security;
alter table public.device_sessions enable row level security;
alter table public.device_blacklist enable row level security;
alter table public.report_verification_codes enable row level security;

create or replace function public.has_school_access(target_school uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and school_id = target_school
  );
$$;

create or replace function public.is_school_admin(target_school uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and school_id = target_school
      and role in ('admin', 'super_admin')
  );
$$;

drop policy if exists schools_public_read on public.schools;
create policy schools_public_read on public.schools
  for select using (active = true or public.has_school_access(id));

drop policy if exists school_data_access on public.school_data;
create policy school_data_access on public.school_data
  for all using (public.has_school_access(school_id))
  with check (public.has_school_access(school_id));

drop policy if exists students_access on public.students;
create policy students_access on public.students
  for all using (public.has_school_access(school_id))
  with check (public.has_school_access(school_id));

drop policy if exists marks_access on public.marks;
create policy marks_access on public.marks
  for all using (public.has_school_access(school_id))
  with check (public.has_school_access(school_id));

drop policy if exists allowed_users_admin_access on public.allowed_users;
create policy allowed_users_admin_access on public.allowed_users
  for all using (public.is_school_admin(school_id))
  with check (public.is_school_admin(school_id));

drop policy if exists user_roles_self_read on public.user_roles;
create policy user_roles_self_read on public.user_roles
  for select using (user_id = auth.uid() or public.is_school_admin(school_id));

drop policy if exists parent_chat_access on public.parent_chat;
create policy parent_chat_access on public.parent_chat
  for all using (public.has_school_access(school_id))
  with check (public.has_school_access(school_id));

drop policy if exists contact_messages_access on public.contact_messages;
create policy contact_messages_access on public.contact_messages
  for all using (school_id is null or public.has_school_access(school_id))
  with check (school_id is null or public.has_school_access(school_id));

drop policy if exists device_sessions_access on public.device_sessions;
create policy device_sessions_access on public.device_sessions
  for all using (user_id = auth.uid() or public.is_school_admin(school_id))
  with check (user_id = auth.uid() or public.is_school_admin(school_id));

drop policy if exists report_verification_access on public.report_verification_codes;
create policy report_verification_access on public.report_verification_codes
  for all using (public.has_school_access(school_id))
  with check (public.has_school_access(school_id));

insert into public.schools (name, slug, active)
values ('JIIB Core Sync Demo School', 'demo-school', true)
on conflict (slug) do nothing;

insert into public.school_data (school_id, data)
select id, jsonb_build_object(
  'activeTerm', 'term-1',
  'terms', jsonb_build_object(
    'term-1', jsonb_build_object('label', 'Term 1', 'status', 'open')
  ),
  'subjects', jsonb_build_object(
    'Primary 1', jsonb_build_array('English', 'Mathematics', 'Science'),
    'Primary 2', jsonb_build_array('English', 'Mathematics', 'Science')
  ),
  'grades', jsonb_build_array(
    jsonb_build_object('min', 80, 'grade', 'A', 'descriptor', 'Excellent'),
    jsonb_build_object('min', 70, 'grade', 'B', 'descriptor', 'Very good'),
    jsonb_build_object('min', 60, 'grade', 'C', 'descriptor', 'Good'),
    jsonb_build_object('min', 50, 'grade', 'D', 'descriptor', 'Developing'),
    jsonb_build_object('min', 0, 'grade', 'E', 'descriptor', 'Needs support')
  )
)
from public.schools
where slug = 'demo-school'
on conflict (school_id) do nothing;