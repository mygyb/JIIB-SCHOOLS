-- J-SCHOOLS storage panel and automatic cleanup. Run once in the Supabase SQL editor (safe to run again).
-- Everything here is only touched by the API server (service role): RLS is on with no policies.

-- A tiny summary kept for every student when an old term's detailed marks are removed.
create table if not exists public.jsa_term_summary (
  school_id uuid not null,
  term_key text not null,
  student_id text not null,
  name text not null default '',
  class text not null default '',
  subjects integer not null default 0,
  average numeric(5,1),
  position integer,
  class_size integer,
  created_at timestamptz not null default now(),
  primary key (school_id, term_key, student_id)
);

-- A short record of what the cleanup did, shown in the super admin Storage panel.
create table if not exists public.jsa_cleanup_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null,          -- daily | term
  school_id uuid,
  detail text not null default ''
);
create index if not exists jsa_cleanup_log_at_idx on public.jsa_cleanup_log (at desc);

alter table public.jsa_term_summary enable row level security;
alter table public.jsa_cleanup_log enable row level security;

-- How much space the database uses, per table and (estimated) per school. Read-only; only the API server may call it.
create or replace function public.jsa_storage_report()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  names text[] := array['marks','students','jsa_alevel_marks','jsa_fee_payments','jsa_fee_structures','jsa_fee_overrides','jsa_fee_students',
    'jsa_term_summary','jsa_activity','jsa_push_log','jsa_push_subscriptions','jsa_sms_messages','jsa_sms_recipients','jsa_sms_ledger',
    'parent_chat','contact_messages','device_sessions','report_verification_codes','jhq_logins','jhq_devices','jhq_audit'];
  n text;
  reg regclass;
  bytes bigint;
  total_rows bigint;
  tables jsonb := '[]'::jsonb;
  by_school jsonb := '{}'::jsonb;
  rec record;
  has_school boolean;
begin
  foreach n in array names loop
    reg := to_regclass('public.' || n);
    if reg is null then continue; end if;
    bytes := pg_total_relation_size(reg);
    execute format('select count(*) from public.%I', n) into total_rows;
    tables := tables || jsonb_build_array(jsonb_build_object('name', n, 'bytes', bytes, 'rows', total_rows));
    select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = n and column_name = 'school_id') into has_school;
    if has_school and total_rows > 0 then
      for rec in execute format('select school_id::text as sid, count(*)::bigint as c from public.%I where school_id is not null group by 1', n) loop
        by_school := jsonb_set(by_school, array[rec.sid],
          to_jsonb(coalesce((by_school ->> rec.sid)::numeric, 0) + bytes::numeric * rec.c / total_rows), true);
      end loop;
    end if;
  end loop;
  -- The settings blob is stored per school, so its real size is known.
  if to_regclass('public.school_data') is not null then
    tables := tables || jsonb_build_array(jsonb_build_object('name', 'school_data', 'bytes', pg_total_relation_size('public.school_data'), 'rows', (select count(*) from public.school_data)));
    for rec in select school_id::text as sid, pg_column_size(data)::bigint as b from public.school_data loop
      by_school := jsonb_set(by_school, array[rec.sid], to_jsonb(coalesce((by_school ->> rec.sid)::numeric, 0) + rec.b), true);
    end loop;
  end if;
  return jsonb_build_object('databaseBytes', pg_database_size(current_database()), 'tables', tables, 'schools', by_school);
end;
$$;
revoke all on function public.jsa_storage_report() from public, anon, authenticated;
grant execute on function public.jsa_storage_report() to service_role;
