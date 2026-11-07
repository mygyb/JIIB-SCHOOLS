-- J-SCHOOLS A-Level paper marks. Run ONCE in the Supabase SQL Editor (safe to run again).
-- Adds one new table, jsa_alevel_marks: one row per student, subject and paper. Nothing existing is changed.
-- One row per paper means two teachers entering marks at the same time can never overwrite each other.

create table if not exists public.jsa_alevel_marks (
  school_id  uuid not null,
  term_key   text not null,
  student_id text not null,
  subject    text not null,
  paper      text not null,
  score      numeric not null check (score >= 0),
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (school_id, term_key, student_id, subject, paper)
);
create index if not exists jsa_alevel_marks_lookup_idx on public.jsa_alevel_marks (school_id, term_key, subject);

alter table public.jsa_alevel_marks enable row level security;

-- Same rule as the other J-SCHOOLS tables: signed-in members of the school (listed in allowed_users) can read and write.
-- The app itself still checks the role, the teacher's assigned subjects, the active term and locked terms.
drop policy if exists jsa_alevel_marks_access on public.jsa_alevel_marks;
create policy jsa_alevel_marks_access on public.jsa_alevel_marks
  for all
  using (
    exists (select 1 from public.allowed_users a
            where a.school_id = jsa_alevel_marks.school_id and lower(a.email) = lower(coalesce(auth.email(), '')))
    or lower(coalesce(auth.email(), '')) = 'mygjyb@gmail.com'
  )
  with check (
    exists (select 1 from public.allowed_users a
            where a.school_id = jsa_alevel_marks.school_id and lower(a.email) = lower(coalesce(auth.email(), '')))
    or lower(coalesce(auth.email(), '')) = 'mygjyb@gmail.com'
  );

grant select, insert, update, delete on public.jsa_alevel_marks to authenticated;
