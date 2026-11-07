// A-Level results: a class table and printable report cards. Grades and points come from the school's A-Level grading.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getGetSchoolConfigQueryKey, useGetSchoolConfig, type School } from '@workspace/api-client-react';
import { Printer } from 'lucide-react';
import { jiibApi } from '@/lib/jiib-api';
import {
  aLevelGrading, aLevelStudentResult, combinationsOf, currentTerm, enrolmentLabel, getTerms, isALevelClass, isALevelEnabled,
  type Enrolment, type SchoolConfig,
} from '@/lib/school-data';

type Person = { id: string; name: string; className: string; house?: string; subjects?: string[]; aLevel?: Enrolment | null };
type PaperMark = { studentId: string; subject: string; paper: string; score: number };

const whole = (value: number | null) => (value === null ? '–' : String(Math.round(Math.round(value * 1e6) / 1e6)));
const select = 'h-10 w-full rounded-lg border border-input bg-background px-2 text-sm';

export function ALevelResults({ school }: { school: School }) {
  const configQuery = useGetSchoolConfig(school.id, { query: { queryKey: getGetSchoolConfigQueryKey(school.id) } });
  const config = (configQuery.data?.data ?? {}) as SchoolConfig;
  const terms = getTerms(config);
  const [term, setTerm] = useState('');
  const [className, setClassName] = useState('');
  const [filter, setFilter] = useState('');
  const [view, setView] = useState<'class' | 'cards'>('class');
  const termKey = term || currentTerm(config);
  const termLabel = terms.find((item) => item.key === termKey)?.label ?? termKey;
  const classes = Object.keys((config.subjects as Record<string, unknown> | undefined) ?? {}).filter(isALevelClass).sort();
  const chosenClass = className || classes[0] || '';
  const grading = aLevelGrading(config);
  const combinations = combinationsOf(config);

  const students = useQuery({
    queryKey: ['alevel-results-students', school.id, chosenClass],
    enabled: Boolean(chosenClass),
    queryFn: () => jiibApi<Person[]>(`/api/schools/${encodeURIComponent(school.id)}/students?className=${encodeURIComponent(chosenClass)}`),
  });
  const marks = useQuery({
    queryKey: ['alevel-results-marks', school.id, termKey],
    enabled: Boolean(termKey) && isALevelEnabled(config),
    queryFn: () => jiibApi<PaperMark[]>(`/api/schools/${encodeURIComponent(school.id)}/a-level/marks?termKey=${encodeURIComponent(termKey)}`),
  });

  const results = useMemo(() => {
    const byStudent = new Map<string, Map<string, Map<string, number>>>();
    for (const mark of marks.data ?? []) {
      const subjects = byStudent.get(mark.studentId) ?? new Map<string, Map<string, number>>();
      const papers = subjects.get(mark.subject) ?? new Map<string, number>();
      papers.set(mark.paper, mark.score);
      subjects.set(mark.subject, papers);
      byStudent.set(mark.studentId, subjects);
    }
    const list = (students.data ?? [])
      .filter((student) => !filter || (filter === 'sciences' || filter === 'arts' ? student.aLevel?.stream === filter : student.aLevel?.combination === filter))
      .map((student) => ({ student, result: aLevelStudentResult(config, { className: student.className, subjects: student.subjects ?? [] }, byStudent.get(student.id) ?? new Map()) }));
    return list.sort((a, b) => b.result.totalPoints - a.result.totalPoints || a.student.name.localeCompare(b.student.name));
  }, [students.data, marks.data, config, filter]);

  if (!isALevelEnabled(config)) {
    return <div className="fade-up"><h2 className="font-display text-3xl font-semibold">A-Level results</h2><p className="mt-3 text-sm text-muted-foreground">A-Level is switched off for this school. Switch it on in School settings first.</p></div>;
  }
  const loading = configQuery.isLoading || students.isLoading || marks.isLoading;
  const failed = students.isError || marks.isError;
  const keyLine = `Principal grades: ${grading.principal.map((band) => `${band.grade} from ${band.min}% = ${band.points}`).join(' · ')}. Subsidiary and General Paper: pass from ${grading.subsidiaryPass}% = 1 point.`;

  return <div className="fade-up">
    <div className="print:hidden">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[.22em] text-primary">Academics & marks</p>
      <h2 className="font-display text-3xl font-semibold tracking-[-.035em] sm:text-4xl">A-Level results</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Subject marks come from the papers teachers entered. Points follow the grading set on the A-Level page.</p>
      <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl border border-border bg-card p-3 sm:p-4 xl:grid-cols-4">
        <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Term</span>
          <select data-testid="select-results-term" value={termKey} onChange={(event) => setTerm(event.target.value)} className={select}>{(terms.length ? terms : [{ key: termKey, label: termLabel }]).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
        <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Class</span>
          <select data-testid="select-results-class" value={chosenClass} onChange={(event) => setClassName(event.target.value)} className={select}>{classes.length ? classes.map((item) => <option key={item} value={item}>{item}</option>) : <option value="">No A-Level classes</option>}</select></label>
        <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Stream / combination</span>
          <select data-testid="select-results-filter" value={filter} onChange={(event) => setFilter(event.target.value)} className={select}><option value="">Everyone</option><option value="sciences">Sciences</option><option value="arts">Arts</option>{combinations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="flex items-end gap-2">
          <div className="inline-flex flex-1 overflow-hidden rounded-lg border border-input text-sm font-semibold">
            <button type="button" data-testid="view-class" aria-pressed={view === 'class'} onClick={() => setView('class')} className={`h-10 flex-1 ${view === 'class' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}>Class</button>
            <button type="button" data-testid="view-cards" aria-pressed={view === 'cards'} onClick={() => setView('cards')} className={`h-10 flex-1 ${view === 'cards' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}>Report cards</button>
          </div>
          <button type="button" data-testid="button-print-results" onClick={() => window.print()} aria-label="Print or save as PDF" className="grid h-10 w-10 place-items-center rounded-lg border border-input hover:bg-muted"><Printer size={16} /></button>
        </div>
      </div>
    </div>

    {loading ? <div className="mt-5 space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-muted" />)}</div>
      : failed ? <p role="alert" className="mt-5 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{(marks.error ?? students.error) instanceof Error ? (marks.error ?? students.error as Error).message : 'Results could not be loaded.'}</p>
      : !results.length ? <p className="mt-5 text-sm text-muted-foreground">No students to show. Enrol S.5 / S.6 students in a combination first.</p>
      : view === 'class'
        ? <div className="mt-5">
          <div className="hidden print:block"><h2 className="font-display text-xl font-semibold">{school.name} · {chosenClass} A-Level results</h2><p className="text-xs">{termLabel}</p></div>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card print:rounded-none print:border-0">
            <table data-testid="alevel-class-table" className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border bg-muted/45 text-[10px] uppercase tracking-[.14em] text-muted-foreground"><tr><th className="px-3 py-3">#</th><th className="px-3 py-3">Student</th><th className="px-3 py-3">Subjects (mark · grade)</th><th className="px-3 py-3 text-right">Points</th></tr></thead>
              <tbody className="divide-y divide-border">{results.map(({ student, result }, index) => <tr key={student.id} data-testid={`result-row-${student.id}`}>
                <td className="px-3 py-3 text-muted-foreground">{index + 1}</td>
                <td className="px-3 py-3"><p className="font-semibold uppercase">{student.name}</p><p className="text-xs text-muted-foreground">{enrolmentLabel(config, student.aLevel) || student.className}</p></td>
                <td className="px-3 py-3"><div className="flex flex-wrap gap-1.5">{result.rows.map((row) => <span key={row.subject} className="rounded-md bg-muted px-2 py-1 text-[11px]"><b>{row.subject}</b> {whole(row.percent)}{row.percent === null ? '' : '%'} · {row.grade ?? '–'}</span>)}{!result.rows.length && <span className="text-xs text-muted-foreground">Not enrolled in a combination</span>}</div></td>
                <td className="px-3 py-3 text-right"><span data-testid={`result-points-${student.id}`} className="font-display text-lg font-semibold">{result.totalPoints}</span><span className="ml-1 text-xs text-muted-foreground">/ {result.maxPoints}</span>{!result.complete && result.rows.length > 0 && <span className="block text-[10px] text-muted-foreground">incomplete</span>}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">{keyLine}</p>
        </div>
        : <div className="mt-5 space-y-6">{results.map(({ student, result }) => <article key={student.id} data-testid={`card-${student.id}`} className="break-after-page rounded-2xl border border-border bg-card p-5 print:rounded-none print:border-0 print:p-0">
          <header className="flex items-center gap-3 border-b border-border pb-3">
            {school.logoUrl && <img src={school.logoUrl} alt="" className="h-12 w-12 object-contain" />}
            <div><h3 className="font-display text-lg font-semibold uppercase">{school.name}</h3><p className="text-xs uppercase tracking-[.14em] text-muted-foreground">A-Level report · {termLabel}</p></div>
          </header>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm"><div><dt className="inline text-muted-foreground">Student: </dt><dd className="inline font-semibold uppercase">{student.name}</dd></div><div><dt className="inline text-muted-foreground">Class: </dt><dd className="inline font-semibold">{student.className}</dd></div><div className="col-span-2"><dt className="inline text-muted-foreground">Combination: </dt><dd className="inline font-semibold">{enrolmentLabel(config, student.aLevel) || '—'}</dd></div></dl>
          <table className="mt-4 w-full text-left text-sm">
            <thead className="border-b border-border text-[10px] uppercase tracking-[.12em] text-muted-foreground"><tr><th className="py-2 pr-2">Subject</th><th className="py-2 pr-2">Papers</th><th className="py-2 pr-2 text-right">Mark</th><th className="py-2 pr-2 text-center">Grade</th><th className="py-2 text-right">Points</th></tr></thead>
            <tbody className="divide-y divide-border">{result.rows.map((row) => <tr key={row.subject}>
              <td className="py-2 pr-2 font-semibold">{row.subject}<span className="block text-[10px] font-normal capitalize text-muted-foreground">{row.category}</span></td>
              <td className="py-2 pr-2 text-xs text-muted-foreground">{row.papers.map((paper) => `${paper.name}: ${paper.score ?? '–'}/${paper.max}`).join(' · ')}</td>
              <td className="py-2 pr-2 text-right">{whole(row.percent)}{row.percent === null ? '' : '%'}</td>
              <td className="py-2 pr-2 text-center font-semibold">{row.grade ?? '–'}</td>
              <td className="py-2 text-right font-semibold">{row.points ?? '–'}</td>
            </tr>)}</tbody>
            <tfoot><tr className="border-t border-border"><td colSpan={4} className="py-2 pr-2 text-right text-xs font-bold uppercase tracking-[.12em]">Total points</td><td data-testid={`card-points-${student.id}`} className="py-2 text-right font-display text-lg font-semibold">{result.totalPoints} / {result.maxPoints}</td></tr></tfoot>
          </table>
          {!result.complete && <p className="mt-2 text-[11px] text-muted-foreground">Some subjects have no marks yet, so the total may change.</p>}
          <p className="mt-4 text-[10px] leading-4 text-muted-foreground">{keyLine}</p>
          <div className="mt-8 grid grid-cols-2 gap-8 text-[11px] text-muted-foreground"><div className="border-t border-border pt-1">Class teacher</div><div className="border-t border-border pt-1">Head teacher</div></div>
        </article>)}</div>}
  </div>;
}
