-- J-SCHOOLS push notifications. Run once in the Supabase SQL editor.
-- All three tables are only ever touched by the API server (service role); RLS is on with no policies,
-- so browsers and logged-in users can never read other people's push subscriptions or the signing keys.

create table if not exists public.jsa_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  email text not null,
  role text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists jsa_push_subscriptions_school_idx on public.jsa_push_subscriptions (school_id, role);
create index if not exists jsa_push_subscriptions_email_idx on public.jsa_push_subscriptions (school_id, email);

-- One row per notification sent (history for administrators) and the "already sent today" guard for reminders.
create table if not exists public.jsa_push_log (
  id uuid primary key default gen_random_uuid(),
  school_id uuid,
  kind text not null,                 -- message | deadline | reminder | update
  title text not null,
  body text not null,
  audience text,
  sent_by text,
  recipients integer not null default 0,
  failed integer not null default 0,
  dedup_key text,
  created_at timestamptz not null default now()
);
create unique index if not exists jsa_push_log_dedup_idx on public.jsa_push_log (school_id, dedup_key) where dedup_key is not null;
create unique index if not exists jsa_push_log_dedup_global_idx on public.jsa_push_log (dedup_key) where school_id is null and dedup_key is not null;
create index if not exists jsa_push_log_school_idx on public.jsa_push_log (school_id, created_at desc);

-- Small key/value store: the push signing keys (created automatically on first use) and the last app version announced.
create table if not exists public.jsa_push_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.jsa_push_subscriptions enable row level security;
alter table public.jsa_push_log enable row level security;
alter table public.jsa_push_config enable row level security;
revoke all on public.jsa_push_subscriptions, public.jsa_push_log, public.jsa_push_config from anon, authenticated;
grant all on public.jsa_push_subscriptions, public.jsa_push_log, public.jsa_push_config to service_role;
