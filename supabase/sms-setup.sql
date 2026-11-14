-- J-SCHOOLS bulk SMS (EgoSMS). Run once in the Supabase SQL editor.
-- Every table is only touched by the API server (service role): RLS is on with no policies, so browsers can never read or edit balances.

-- Staff phone numbers (so the Head teacher can message teachers).
alter table public.allowed_users add column if not exists phone text;

-- One row per school: the SMS the school may still send, and the school's pay code printed in fee reminders.
create table if not exists public.jsa_sms_accounts (
  school_id uuid primary key,
  balance integer not null default 0 check (balance >= 0),
  pay_code text,
  updated_at timestamptz not null default now()
);

-- Every change to a balance: assigned by the super admin, used by a send, refunded after a failed send.
create table if not exists public.jsa_sms_ledger (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  kind text not null,                 -- assign | adjust | use | refund
  amount integer not null,            -- signed: + adds SMS, - uses SMS
  balance_after integer not null,
  note text,
  actor text,
  ref uuid,
  created_at timestamptz not null default now()
);
create index if not exists jsa_sms_ledger_school_idx on public.jsa_sms_ledger (school_id, created_at desc);

-- One row per send (fee reminders or announcements).
create table if not exists public.jsa_sms_messages (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  kind text not null,                 -- fees | announcement
  audience text,
  sample text,                        -- the first message text, for the history list
  sent_by text,
  recipients integer not null default 0,
  segments integer not null default 0,
  failed integer not null default 0,
  status text not null default 'sending',   -- sending | done | failed
  created_at timestamptz not null default now()
);
create index if not exists jsa_sms_messages_school_idx on public.jsa_sms_messages (school_id, created_at desc);

-- One row per phone number in a send, so delivery reports from EgoSMS can be matched.
create table if not exists public.jsa_sms_recipients (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  school_id uuid not null,
  name text,
  number text not null,
  segments integer not null default 1,
  status text not null default 'queued',    -- queued | sent | delivered | failed
  follow_up text,
  delivered_at timestamptz
);
create index if not exists jsa_sms_recipients_message_idx on public.jsa_sms_recipients (message_id);
create index if not exists jsa_sms_recipients_follow_idx on public.jsa_sms_recipients (follow_up, number);

-- Schools asking the super admin for more SMS.
create table if not exists public.jsa_sms_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  amount integer not null,
  note text,
  requested_by text,
  status text not null default 'open',      -- open | done
  created_at timestamptz not null default now()
);
create index if not exists jsa_sms_requests_idx on public.jsa_sms_requests (status, created_at desc);

alter table public.jsa_sms_accounts enable row level security;
alter table public.jsa_sms_ledger enable row level security;
alter table public.jsa_sms_messages enable row level security;
alter table public.jsa_sms_recipients enable row level security;
alter table public.jsa_sms_requests enable row level security;

-- Adds or removes SMS in one safe step: the balance row is locked, so two sends at the same moment can never spend the same SMS,
-- and the balance can never go below zero.
create or replace function public.jsa_sms_adjust(p_school uuid, p_delta integer, p_kind text, p_note text default null, p_actor text default null, p_ref uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare next_balance integer;
begin
  insert into public.jsa_sms_accounts (school_id) values (p_school) on conflict (school_id) do nothing;
  update public.jsa_sms_accounts set balance = balance + p_delta, updated_at = now()
    where school_id = p_school and balance + p_delta >= 0
    returning balance into next_balance;
  if next_balance is null then raise exception 'insufficient_sms'; end if;
  insert into public.jsa_sms_ledger (school_id, kind, amount, balance_after, note, actor, ref)
    values (p_school, p_kind, p_delta, next_balance, p_note, p_actor, p_ref);
  return next_balance;
end;
$$;
revoke all on function public.jsa_sms_adjust(uuid, integer, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.jsa_sms_adjust(uuid, integer, text, text, text, uuid) to service_role;
