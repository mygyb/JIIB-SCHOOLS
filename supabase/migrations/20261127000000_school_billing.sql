-- Billing: one row per school (plan, cycle, trial and paid-through dates, permanent school code).
create table if not exists public.school_billing (
  school_id uuid primary key references public.schools(id) on delete cascade,
  school_code text unique,
  plan text not null default 'starter' check (plan in ('starter','growth','premium')),
  cycle text not null default 'termly' check (cycle in ('termly','yearly')),
  status text not null default 'trial' check (status in ('trial','active','overdue','read_only','suspended')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  expires_at timestamptz,
  note text,
  updated_at timestamptz not null default now()
);
alter table public.school_billing enable row level security;
-- No policies: only the server (service key) reads and writes this table.
