-- Run once in the Supabase SQL editor. Adds the school type used by the super administrator
-- to register a school as Primary or Secondary. Existing schools stay Secondary.
alter table public.schools
  add column if not exists school_type text not null default 'secondary';

alter table public.schools drop constraint if exists schools_school_type_check;
alter table public.schools
  add constraint schools_school_type_check check (school_type in ('primary', 'secondary'));
