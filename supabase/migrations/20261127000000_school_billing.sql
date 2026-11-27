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

alter table public.school_billing add column if not exists contact_phone text;

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  invoice_no text not null unique,
  term_key text not null,
  plan text not null,
  cycle text not null default 'termly',
  amount bigint not null,
  learners_snapshot integer,
  status text not null default 'unpaid' check (status in ('unpaid','paid','void')),
  issued_at timestamptz not null default now(),
  due_at timestamptz not null,
  paid_at timestamptz,
  paid_amount bigint not null default 0,
  unique (school_id, term_key)
);
create index if not exists billing_invoices_school_idx on public.billing_invoices (school_id, status);
alter table public.billing_invoices enable row level security;

create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  invoice_id uuid references public.billing_invoices(id) on delete set null,
  channel text not null check (channel in ('bank','mtn','airtel')),
  transaction_id text not null,
  amount bigint not null,
  paid_on date,
  payer_name text,
  phone text,
  reference text,
  raw_sms text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_by text,
  submitted_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz,
  note text,
  receipt_no text,
  unique (channel, transaction_id)
);
create index if not exists billing_payments_school_idx on public.billing_payments (school_id, status);
alter table public.billing_payments enable row level security;

create table if not exists public.school_registrations (
  id uuid primary key default gen_random_uuid(),
  school_name text not null,
  admin_name text not null,
  email text not null,
  phone text not null,
  address text,
  auth_user_id uuid,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  school_id uuid,
  note text
);
alter table public.school_registrations enable row level security;

create table if not exists public.billing_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb
);
alter table public.billing_settings enable row level security;
