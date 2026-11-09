-- J-SCHOOLS: allow the Head teacher and Bursar staff roles. Run ONCE in the Supabase SQL Editor (safe to run again).
-- It only widens the list of roles a staff account may have; no data is changed.

do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.allowed_users'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.allowed_users drop constraint %I', c.conname);
  end loop;

  alter table public.allowed_users
    add constraint allowed_users_role_check
    check (role in ('admin', 'teacher', 'headteacher', 'bursar'));
end $$;
