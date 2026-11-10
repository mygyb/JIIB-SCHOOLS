-- J-SCHOOLS Finance (fee structures, student fees, payments). Run ONCE in the Supabase SQL Editor (safe to run again).
-- Adds four new tables. Nothing existing is changed. Amounts are whole Uganda shillings (UGX).
-- Only the Bursar can change these tables through the app; the Head teacher can only read them.
-- School administrators and teachers cannot read them, even by calling the database directly.

-- 1. Fee structure per term, class and student type (day / boarding). `items` = [{ "name": "Tuition", "amount": 450000 }, ...]
create table if not exists public.jsa_fee_structures (
  school_id    uuid   not null,
  term_key     text   not null,
  class_name   text   not null,
  student_type text   not null check (student_type in ('day', 'boarding')),
  items        jsonb  not null default '[]'::jsonb,
  total        bigint not null default 0 check (total >= 0),
  updated_at   timestamptz not null default now(),
  updated_by   text,
  primary key (school_id, term_key, class_name, student_type)
);

-- 2. Whether each student is a day scholar or a boarder.
create table if not exists public.jsa_fee_students (
  school_id    uuid not null,
  student_id   text not null,
  student_type text not null default 'day' check (student_type in ('day', 'boarding')),
  updated_at   timestamptz not null default now(),
  updated_by   text,
  primary key (school_id, student_id)
);

-- 3. A student's own fee structure for one term (replaces the class structure for that student only).
create table if not exists public.jsa_fee_overrides (
  school_id  uuid   not null,
  term_key   text   not null,
  student_id text   not null,
  items      jsonb  not null default '[]'::jsonb,
  total      bigint not null default 0 check (total >= 0),
  note       text,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (school_id, term_key, student_id)
);

-- 4. Payments. Never deleted: a cancelled receipt stays on record, marked cancelled with the reason.
create table if not exists public.jsa_fee_payments (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid   not null,
  seq           bigint not null,
  receipt_no    text   not null,
  term_key      text   not null,
  student_id    text   not null,
  student_name  text   not null default '',
  class_name    text   not null default '',
  amount        bigint not null check (amount > 0),
  method        text   not null default 'cash' check (method in ('cash', 'mobile_money', 'bank', 'cheque', 'other')),
  tid           text,
  paid_on       date   not null default current_date,
  paid_by       text,
  note          text,
  status        text   not null default 'valid' check (status in ('valid', 'cancelled')),
  cancel_reason text,
  cancelled_at  timestamptz,
  cancelled_by  text,
  recorded_by   text,
  created_at    timestamptz not null default now(),
  unique (school_id, seq),
  unique (school_id, receipt_no)
);
create index if not exists jsa_fee_payments_student_idx on public.jsa_fee_payments (school_id, term_key, student_id);
create index if not exists jsa_fee_payments_tid_idx on public.jsa_fee_payments (school_id, tid) where tid is not null;

alter table public.jsa_fee_structures enable row level security;
alter table public.jsa_fee_students   enable row level security;
alter table public.jsa_fee_overrides  enable row level security;
alter table public.jsa_fee_payments   enable row level security;

-- Read: the school's Bursar and Head teacher (and the platform owner). Write: the Bursar (and the platform owner).
do $$
declare t text;
begin
  foreach t in array array['jsa_fee_structures', 'jsa_fee_students', 'jsa_fee_overrides', 'jsa_fee_payments'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format($p$create policy %I on public.%I for select using (
      exists (select 1 from public.allowed_users a
              where a.school_id = %I.school_id and lower(a.email) = lower(coalesce(auth.email(), ''))
                and a.role in ('bursar', 'headteacher'))
      or lower(coalesce(auth.email(), '')) = 'mygjyb@gmail.com')$p$, t || '_read', t, t);
    execute format($p$create policy %I on public.%I for all using (
      exists (select 1 from public.allowed_users a
              where a.school_id = %I.school_id and lower(a.email) = lower(coalesce(auth.email(), ''))
                and a.role = 'bursar')
      or lower(coalesce(auth.email(), '')) = 'mygjyb@gmail.com')
      with check (
      exists (select 1 from public.allowed_users a
              where a.school_id = %I.school_id and lower(a.email) = lower(coalesce(auth.email(), ''))
                and a.role = 'bursar')
      or lower(coalesce(auth.email(), '')) = 'mygjyb@gmail.com')$p$, t || '_write', t, t, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
