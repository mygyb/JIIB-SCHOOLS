// Marks tracker: which teachers and subjects have entered full marks, partial marks, or nothing yet,
// for the assessments switched on in the assessment filter.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, CircleCheck, CircleDashed, CircleDot } from 'lucide-react';
import { getGetSchoolConfigQueryKey, useGetSchoolConfig } from '@workspace/api-client-react';
import type { School } from '@workspace/api-client-react';
import { jiibApi } from '@/lib/jiib-api';
import { getTerms, type SchoolConfig } from '@/lib/school-data';

type Status = 'complete' | 'partial' | 'none' | 'no_students';
type Row = { className: string; subject: string; teacherEmail: string | null; teacherName: string | null; students: number; complete: number; partial: number; empty: number; perField: Record<string, number>; status: Status };
type Progress = { termKey: string; termLabel: string; fields: Array<{ field: string; name: string }>; rows: Row[] };

const LOOK: Record<string, { label: string; chip: string; bar: string; Icon: typeof CircleCheck }> = {
  complete: { label: 'Complete', chip: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-500', Icon: CircleCheck },
  partial: { label: 'Partial', chip: 'bg-amber-100 text-amber-800', bar: 'bg-amber-500', Icon: CircleDot },
  none: { label: 'Not started', chip: 'bg-rose-100 text-rose-800', bar: 'bg-rose-500', Icon: CircleDashed },
};
const rollup = (rows: Row[]): Status => rows.every((r) => r.status === 'complete') ? 'complete' : rows.every((r) => r.status === 'none') ? 'none' : 'partial';
const pct = (done: number, total: number) => total ? Math.round((done / total) * 100) : 0;

function Badge({ status }: { status: Status }) {
  const look = LOOK[status] ?? LOOK.none;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${look.chip}`}><look.Icon size={12} />{look.label}</span>;
}
function Bar({ value, status }: { value: number; status: Status }) {
  return <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><div className={`h-full rounded-full ${(LOOK[status] ?? LOOK.none).bar}`} style={{ width: `${value}%` }} /></div>;
}
function Card({ label, value, hint, tone = '' }: { label: string; value: string | number; hint?: string; tone?: string }) {
  return <div className={`rounded-xl border border-border bg-card p-4 ${tone}`}><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>{hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}</div>;
}

function SubjectLine({ row, fields }: { row: Row; fields: Progress['fields'] }) {
  const done = row.complete, value = pct(done, row.students);
  return <li className="py-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-semibold">{row.className} <span className="font-normal text-muted-foreground">· {row.subject}</span></p>
      <Badge status={row.status} />
    </div>
    <div className="mt-2 flex items-center gap-3"><Bar value={value} status={row.status} /><span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{done}/{row.students} learners</span></div>
    {row.status !== 'complete' && row.students > 0 && <p className="mt-1.5 text-[11px] text-muted-foreground">{fields.map((f) => `${f.name}: ${row.perField[f.field] ?? 0}/${row.students}`).join(' · ')}</p>}
  </li>;
}

export function MarksTracker({ school }: { school: School }) {
  const config = useGetSchoolConfig(school.id, { query: { queryKey: getGetSchoolConfigQueryKey(school.id) } });
  const configData = (config.data?.data ?? {}) as SchoolConfig;
  const terms = getTerms(configData);
  const [picked, setPicked] = useState('');
  const termKey = picked || String(configData.activeTerm ?? '');
  const [view, setView] = useState<'teacher' | 'class'>('teacher');
  const [filter, setFilter] = useState<'all' | 'complete' | 'partial' | 'none'>('all');
  const [open, setOpen] = useState<string>('');
  const query = useQuery({
    queryKey: ['marks-progress', school.id, termKey],
    queryFn: () => jiibApi<Progress>(`/api/schools/${encodeURIComponent(school.id)}/marks-progress?termKey=${encodeURIComponent(termKey)}`),
    enabled: Boolean(termKey), refetchInterval: 60_000,
  });
  const data = query.data;
  const rows = (data?.rows ?? []).filter((r) => r.status !== 'no_students');
  const assigned = rows.filter((r) => r.teacherEmail);
  const unassigned = rows.filter((r) => !r.teacherEmail);
  const count = (s: Status) => rows.filter((r) => r.status === s).length;
  const need = rows.reduce((t, r) => t + r.students, 0), made = rows.reduce((t, r) => t + r.complete, 0);

  const byTeacher = new Map<string, { name: string; rows: Row[] }>();
  for (const r of assigned) { const g = byTeacher.get(r.teacherEmail!) ?? { name: r.teacherName ?? r.teacherEmail!, rows: [] }; g.rows.push(r); byTeacher.set(r.teacherEmail!, g); }
  const teachers = Array.from(byTeacher.entries()).map(([email, g]) => ({ email, ...g, status: rollup(g.rows) })).sort((a, b) => a.name.localeCompare(b.name));
  const teacherFiltered = teachers.filter((t) => filter === 'all' || t.status === filter);
  const classNames = Array.from(new Set(rows.map((r) => r.className)));

  const filters: Array<['all' | 'complete' | 'partial' | 'none', string]> = [['all', 'All'], ['complete', 'Complete'], ['partial', 'Partial'], ['none', 'Not started']];
  return <div className="fade-up" data-testid="marks-tracker">
    <div className="mb-6">
      <p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">Academics & marks</p>
      <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">Marks tracker</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">See which teachers and subjects have entered full marks, partial marks, or none yet, for the assessments that are switched on.</p>
    </div>
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {terms.length > 1 && <select aria-label="Term" value={termKey} onChange={(e) => setPicked(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">{terms.map((t) => <option key={t.key} value={t.key}>{t.label}{t.active ? ' (current)' : ''}</option>)}</select>}
      <span className="text-xs font-semibold text-muted-foreground">Tracking:</span>
      {(data?.fields ?? []).map((f) => <span key={f.field} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{f.name}</span>)}
      <span className="text-[11px] text-muted-foreground">Change this in Publish deadline → assessment filter.</span>
    </div>
    {query.isLoading && <div className="rounded-xl bg-muted p-6 text-sm text-muted-foreground">Checking marks…</div>}
    {query.isError && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">Could not load marks progress. <button className="ml-2 font-semibold underline" onClick={() => void query.refetch()}>Try again</button></div>}
    {data && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="tracker-stats">
        <Card label="Overall complete" value={`${pct(made, need)}%`} hint={`${made} of ${need} learner marks`} tone="border-primary/40 bg-primary/5" />
        <Card label="Subjects complete" value={count('complete')} hint={`of ${rows.length}`} tone="border-emerald-300/60" />
        <Card label="Partial" value={count('partial')} hint="started, not finished" tone="border-amber-300/60" />
        <Card label="Not started" value={count('none')} hint="no marks yet" tone="border-rose-300/60" />
        <Card label="No teacher assigned" value={unassigned.length} hint="subjects" />
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-muted p-1" role="tablist">{([['teacher', 'By teacher'], ['class', 'By class']] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)} className={`rounded-md px-4 py-1.5 text-sm font-semibold ${view === id ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>{label}</button>)}</div>
        <div className="flex flex-wrap gap-1.5">{filters.map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${filter === id ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'}`}>{label}</button>)}</div>
      </div>
      {rows.length === 0 && <p className="mt-5 rounded-xl bg-muted/50 p-5 text-sm text-muted-foreground">No class subjects or students found for this term yet.</p>}
      {view === 'teacher' && <div className="mt-4 space-y-3">
        {teacherFiltered.map((t) => {
          const need2 = t.rows.reduce((s, r) => s + r.students, 0), made2 = t.rows.reduce((s, r) => s + r.complete, 0);
          const isOpen = open === t.email;
          return <section key={t.email} className="rounded-2xl border border-border bg-card">
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? '' : t.email)} className="flex w-full items-center gap-3 p-4 text-left">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{t.name.slice(0, 2).toUpperCase()}</span>
              <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-semibold">{t.name}</span><Badge status={t.status} /></span>
                <span className="mt-2 flex items-center gap-3"><Bar value={pct(made2, need2)} status={t.status} /><span className="shrink-0 text-xs tabular-nums text-muted-foreground">{t.rows.filter((r) => r.status === 'complete').length}/{t.rows.length} subjects</span></span></span>
              <ChevronDown size={16} className={`shrink-0 text-muted-foreground transition ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && <ul className="divide-y divide-border border-t border-border px-4">{t.rows.map((r) => <SubjectLine key={`${r.className}|${r.subject}`} row={r} fields={data.fields} />)}</ul>}
          </section>;
        })}
        {teacherFiltered.length === 0 && assigned.length > 0 && <p className="rounded-xl bg-muted/50 p-5 text-sm text-muted-foreground">No teachers match this filter.</p>}
        {(filter === 'all' || filter === 'none') && unassigned.length > 0 && <section className="rounded-2xl border border-dashed border-border bg-card p-4">
          <p className="text-sm font-semibold">Subjects with no teacher assigned</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Nobody can enter marks for these until a teacher is assigned in User management.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">{unassigned.map((r) => <span key={`${r.className}|${r.subject}`} className="rounded-md bg-muted px-2 py-1 text-xs"><strong>{r.className}</strong> {r.subject}</span>)}</div>
        </section>}
      </div>}
      {view === 'class' && <div className="mt-4 space-y-3">
        {classNames.map((className) => {
          const list = rows.filter((r) => r.className === className && (filter === 'all' || r.status === filter));
          if (!list.length) return null;
          const all = rows.filter((r) => r.className === className);
          return <section key={className} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2"><p className="font-display text-lg font-semibold">{className}</p><span className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{all.filter((r) => r.status === 'complete').length}/{all.length} subjects complete</span><Badge status={rollup(all)} /></span></div>
            <ul className="mt-2 divide-y divide-border">{list.map((r) => <li key={r.subject} className="flex flex-wrap items-center justify-between gap-2 py-2.5"><span className="min-w-0 text-sm"><strong>{r.subject}</strong><span className="block text-xs text-muted-foreground">{r.teacherName ?? 'No teacher assigned'} · {r.complete}/{r.students} learners done</span></span><Badge status={r.status} /></li>)}</ul>
          </section>;
        })}
      </div>}
      <p className="mt-5 text-[11px] text-muted-foreground">A subject is complete when every learner has a mark in every tracked assessment. A mark of 0 counts as not entered. Updates every minute.</p>
    </>}
  </div>;
}
