-- J-SCHOOLS update: remove report codes, keep SMS credit records for 7 days only. Run once in the Supabase SQL editor (safe to run again).

-- 1. Report codes are no longer used: every report has a QR code. The app never reads this table.
drop table if exists public.report_verification_codes;

-- 2. Running totals per school, so the SMS totals stay correct after old credit records are deleted.
alter table public.jsa_sms_accounts add column if not exists assigned_total bigint not null default 0;
alter table public.jsa_sms_accounts add column if not exists used_total bigint not null default 0;

-- 3. Deletes credit records older than the cutoff and adds them to the running totals in one safe step.
create or replace function public.jsa_sms_roll_ledger(p_cutoff timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  with gone as (
    delete from public.jsa_sms_ledger where created_at < p_cutoff returning school_id, kind, amount
  ), sums as (
    select school_id,
      coalesce(sum(amount) filter (where kind in ('assign', 'adjust')), 0) as assigned,
      coalesce(sum(-amount) filter (where kind = 'use'), 0) - coalesce(sum(amount) filter (where kind = 'refund'), 0) as used
    from gone group by school_id
  )
  update public.jsa_sms_accounts a
     set assigned_total = a.assigned_total + s.assigned, used_total = a.used_total + s.used
    from sums s where a.school_id = s.school_id;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.jsa_sms_roll_ledger(timestamptz) from public, anon, authenticated;
grant execute on function public.jsa_sms_roll_ledger(timestamptz) to service_role;
