// Performance: school and class results for a term, the academic giants honour roll (PDF per class), subjects, and students needing support.
import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from 'react-chartjs-2';
import { Award, BarChart3, Download, FileSpreadsheet, LifeBuoy, Printer, Trophy } from 'lucide-react';
import type { Mark, School, Student } from '@workspace/api-client-react';
import { getAssessmentFields, getTerms, type SchoolConfig } from '@/lib/school-data';
import { readGrading } from '@/features/report-studio/report-model';
import { downloadCsv, printTable } from '@/features/finance/export';
import { isPrimarySchool, primaryLabel } from '@/lib/school-data';
import { compute, distributionOf, featured, fmt, type StudentRow } from './analysis';
import { giantsPages, pdfDownload, pdfPrint, safeFileName, summaryPages, type ClassList, type PdfContext } from './pdf';

type Tab = 'overview' | 'giants' | 'subjects' | 'support';
type Mode = 'giants' | 3 | 5 | 10;

const PASS_MARK = 50;
const GIANT_MARKS = [70, 75, 80, 85, 90];
const TABS: Array<{ id: Tab; label: string; icon: typeof BarChart3 }> = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'giants', label: 'Academic giants', icon: Trophy },
  { id: 'subjects', label: 'Subjects', icon: Award },
  { id: 'support', label: 'Support needed', icon: LifeBuoy },
];

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const card = 'rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_hsl(var(--foreground)/.03)] sm:p-6';
const selectClass = 'h-11 w-full rounded-lg border border-input bg-card px-3 text-sm';
const buttonClass = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 text-sm font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50';
const primaryButton = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50';

function RankBadge({ rank }: { rank: number }) {
  const tone = rank === 1 ? 'bg-amber-200 text-amber-900' : rank === 2 ? 'bg-slate-200 text-slate-800' : rank === 3 ? 'bg-orange-200 text-orange-900' : 'bg-muted text-muted-foreground';
  return <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-bold ${tone}`}>{rank}</span>;
}

function Stat({ label, value, hint, testId }: { label: string; value: ReactNode; hint?: string; testId?: string }) {
  return <div data-testid={testId} className="rounded-xl border border-border bg-card p-4">
    <p className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">{label}</p>
    <p className="mt-2 font-display text-2xl font-semibold">{value}</p>
    {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
  </div>;
}

export type PerformanceViewProps = {
  school: School;
  config: SchoolConfig;
  students: Student[];
  marks: Mark[];
  loading: boolean;
  error: boolean;
  retry: () => void;
  termKey: string;
  onTermChange: (key: string) => void;
};

export function PerformanceView({ school, config, students, marks, loading, error, retry, termKey, onTermChange }: PerformanceViewProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [className, setClassName] = useState('');
  const [giantMin, setGiantMin] = useState(80);
  const [mode, setMode] = useState<Mode>('giants');
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState('');
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState('');

  const terms = getTerms(config);
  const termLabel = terms.find((term) => term.key === termKey)?.label ?? termKey;
  const fields = useMemo(() => getAssessmentFields(config), [config]);
  const grading = useMemo(() => readGrading(config), [config]);
  const primary = isPrimarySchool(school);
  const w = (text: string) => (primary ? primaryLabel(text) : text);
  const perf = useMemo(() => compute({ students, marks, fields, grading, primary, settings: { giantMin, passMark: PASS_MARK } }), [students, marks, fields, grading, giantMin, primary]);

  const classNames = [...perf.byClass.keys()];
  const shownClasses = className && perf.byClass.has(className) ? [className] : classNames;
  const scopedRows = shownClasses.flatMap((name) => perf.byClass.get(name) ?? []);
  const pleRows = scopedRows.filter((row) => row.ple);
  const scopedSummary = perf.classes.filter((item) => shownClasses.includes(item.className));
  const settings = (config.settings && typeof config.settings === 'object' ? config.settings : {}) as Record<string, unknown>;
  const criterion = mode === 'giants' ? w(`Academic giants are students with an average of ${giantMin}% or more`) : `The top ${mode} students in each class (equal averages are kept together)`;
  const ctx: PdfContext = {
    schoolName: school.name, address: String(settings.address ?? ''), motto: String(settings.motto ?? ''), logoUrl: school.logoUrl ?? '',
    primary, termLabel, giantMin, passMark: PASS_MARK, criterion, printedOn: new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(new Date()),
  };
  const listFor = (name: string): ClassList => ({ summary: perf.classes.find((item) => item.className === name)!, entries: featured(perf.byClass.get(name) ?? [], mode, giantMin) });
  const giantsTotal = shownClasses.reduce((sum, name) => sum + listFor(name).entries.length, 0);
  const modeName = mode === 'giants' ? 'Academic-Giants' : `Top-${mode}`;

  const run = async (key: string, job: () => Promise<void>) => {
    setBusy(key); setProblem(''); setNotice(''); setProgress('');
    try { await job(); } catch (cause) { setProblem(cause instanceof Error ? cause.message : 'That could not be completed. Please try again.'); } finally { setBusy(''); setProgress(''); }
  };
  const giantsDocument = (names: string[]) => {
    const lists = names.map(listFor).filter((list) => list.summary);
    if (!lists.some((list) => list.entries.length)) throw new Error('No students qualify for this list yet.');
    return giantsPages(ctx, lists, { summary: names.length > 1, overall: perf.overall });
  };
  const downloadGiants = (names: string[], key: string) => run(key, async () => {
    const pages = giantsDocument(names);
    const base = names.length === 1 ? safeFileName(modeName, names[0], termLabel) : safeFileName(modeName, 'All-Classes', termLabel);
    await pdfDownload(pages, `${base}.pdf`, (done, total) => setProgress(`Page ${done} of ${total}`));
    setNotice(`Saved ${base}.pdf`);
  });
  const printGiants = (names: string[]) => run('print-giants', async () => { await pdfPrint(giantsDocument(names)); });
  const downloadSummary = () => run('summary', async () => {
    const pages = summaryPages(ctx, scopedSummary, perf.overall);
    const base = safeFileName('Class-Performance-Summary', termLabel);
    await pdfDownload(pages, `${base}.pdf`, (done, total) => setProgress(`Page ${done} of ${total}`));
    setNotice(`Saved ${base}.pdf`);
  });
  const rowsCsv = (rows: StudentRow[]) => [['Class', 'Rank', w('Student'), 'Average %', 'Grade', 'Subjects', 'Best subject', 'Weakest subject'],
    ...rows.map((row) => [row.className, row.rank, row.name, row.average, row.grade, row.subjects, row.best ? `${row.best.subject} (${Math.round(row.best.percent)}%)` : '', row.weakest ? `${row.weakest.subject} (${Math.round(row.weakest.percent)}%)` : ''])];
  const support = scopedRows.filter((row) => row.average < PASS_MARK);

  return <div className="fade-up" data-testid="performance-page">
    <div className="mb-6"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">Academics & marks</p>
      <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">Performance</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Results for {termLabel}: class averages, the academic giants honour roll, subject strengths and {w('students who need support.')}</p></div>

    <div className={`${card} mb-5 !p-4`}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Term</span>
          <select data-testid="select-performance-term" value={termKey} onChange={(event) => onTermChange(event.target.value)} className={selectClass}>
            {(terms.some((term) => term.key === termKey) ? terms : [...terms, { key: termKey, label: termKey, locked: false, active: false }]).map((term) => <option key={term.key} value={term.key}>{term.label}{term.active ? ' (current)' : ''}</option>)}
          </select></label>
        <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Class</span>
          <select data-testid="select-performance-class" value={className} onChange={(event) => setClassName(event.target.value)} className={selectClass}>
            <option value="">All classes</option>{classNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select></label>
        <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Academic giant means an average of</span>
          <select data-testid="select-giant-mark" value={giantMin} onChange={(event) => setGiantMin(Number(event.target.value))} className={selectClass}>
            {GIANT_MARKS.map((value) => <option key={value} value={value}>{value}% or more</option>)}
          </select></label>
      </div>
    </div>

    {loading ? <div className="rounded-xl bg-muted p-6 text-sm text-muted-foreground">Loading results…</div>
      : error ? <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">Results could not load. <button className="ml-2 font-semibold underline" onClick={retry}>Retry</button></div>
      : !perf.rows.length ? <div data-testid="performance-empty" className={`${card} text-center`}><p className="font-display text-lg font-semibold">No marks for {termLabel} yet</p><p className="mt-1 text-sm text-muted-foreground">Once teachers enter marks, rankings and the honour roll appear here. You can also pick another term above.</p></div>
      : <>
        <div role="tablist" aria-label="Performance sections" className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">
          {TABS.map(({ id, label, icon: Icon }) => <button key={id} role="tab" aria-selected={tab === id} data-testid={`tab-performance-${id}`} onClick={() => setTab(id)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold ${tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}><Icon size={15} />{label}</button>)}
        </div>
        {(problem || notice || progress) && <div className="mb-4">
          {problem && <p role="alert" data-testid="text-performance-error" className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{problem}</p>}
          {progress && <p role="status" className="rounded-lg bg-muted p-3 text-sm">Preparing PDF… {progress}</p>}
          {notice && !progress && <p role="status" data-testid="text-performance-notice" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
        </div>}

        {tab === 'overview' && <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Stat testId="stat-ranked" label={w('Students ranked')} value={scopedRows.length} hint={`of ${scopedSummary.reduce((s, c) => s + c.enrolled, 0)} enrolled`} />
            <Stat testId="stat-average" label={className ? 'Class average' : 'School average'} value={scopedRows.length ? fmt(scopedRows.reduce((s, r) => s + r.average, 0) / scopedRows.length) : '—'} />
            <Stat testId="stat-pass" label={`Pass rate (${PASS_MARK}%+)`} value={scopedRows.length ? `${Math.round(scopedRows.filter((r) => r.average >= PASS_MARK).length / scopedRows.length * 100)}%` : '—'} />
            <Stat testId="stat-giants" label={`Academic giants · ${giantMin}%+`} value={scopedRows.filter((r) => r.average >= giantMin).length} />
            <Stat testId="stat-support" label={`Need support · below ${PASS_MARK}%`} value={support.length} />
            <Stat testId="stat-top" label="Highest average" value={scopedRows.length ? fmt(Math.max(...scopedRows.map((r) => r.average))) : '—'} hint={[...scopedRows].sort((a, b) => b.average - a.average)[0]?.name} />
          </div>
          <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
            {primary && pleRows.length > 0 && <section className={card} data-testid="ple-divisions">
            <h3 className="font-display text-lg font-semibold">PLE divisions · P.7</h3>
            <p className="mt-1 text-sm text-muted-foreground">Aggregate of English, Mathematics, Science and Social Studies (best 4, worst 36).</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {['Division 1', 'Division 2', 'Division 3', 'Division 4', 'Ungraded (U)', '—'].map((name) => <div key={name} className="rounded-xl border border-border p-3 text-center"><p className="text-[11px] text-muted-foreground">{name === '—' ? 'Incomplete' : name}</p><p className="mt-1 font-display text-2xl font-semibold" data-testid={`ple-count-${name === '—' ? 'incomplete' : name.split(' ')[1]?.replace(/[()]/g, '') ?? name}`}>{pleRows.filter((row) => row.ple?.division === name).length}</p></div>)}
            </div>
          </section>}
          <section className={card}>
              <h3 className="font-display text-lg font-semibold">{className ? w(`Top students · ${className}`) : 'Class averages'}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{className ? w('Average of the first 15 students in the class.') : 'Average percentage of each class.'}</p>
              <div className="mt-5 h-72"><Bar
                data={{ labels: className ? scopedRows.slice(0, 15).map((r) => r.name.split(' ')[0].toUpperCase()) : scopedSummary.map((c) => c.className), datasets: [{ label: 'Average', data: className ? scopedRows.slice(0, 15).map((r) => r.average) : scopedSummary.map((c) => c.average), backgroundColor: '#284e80', borderRadius: 7 }] }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100, ticks: { callback: (value) => `${value}%` } } } }} /></div>
            </section>
            <section className={card}>
              <h3 className="font-display text-lg font-semibold">How results are spread</h3>
              <p className="mt-1 text-sm text-muted-foreground">{w('Students by average score.')}</p>
              <div className="mt-5 space-y-3" data-testid="distribution">
                {distributionOf(scopedRows).map((band) => <div key={band.label}><div className="flex justify-between text-sm"><span>{band.label}</span><span className="font-semibold">{band.count}</span></div>
                  <div className="mt-1.5 h-2 rounded-full bg-muted"><div className={`h-2 rounded-full ${band.low ? 'bg-rose-500' : 'bg-[#2e8c72]'}`} style={{ width: `${scopedRows.length ? (band.count / scopedRows.length) * 100 : 0}%` }} /></div></div>)}
              </div>
            </section>
          </div>
          <section className={card}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="font-display text-lg font-semibold">Class comparison</h3><p className="mt-1 text-sm text-muted-foreground">Every class side by side for {termLabel}.</p></div>
              <div className="flex flex-wrap gap-2">
                <button data-testid="button-summary-csv" className={buttonClass} onClick={() => downloadCsv(`${safeFileName('Class-Performance', termLabel)}.csv`, [['Class', 'Enrolled', 'Ranked', 'Average %', 'Pass rate %', 'Giants', 'Need support', 'Top student', 'Top average %'], ...scopedSummary.map((c) => [c.className, c.enrolled, c.ranked, c.average, c.passRate, c.giants, c.support, c.top?.name ?? '', c.top?.average ?? ''])])}><FileSpreadsheet size={15} /> CSV</button>
                <button data-testid="button-summary-pdf" disabled={Boolean(busy)} className={primaryButton} onClick={() => void downloadSummary()}><Download size={15} /> {busy === 'summary' ? 'Preparing…' : 'Summary PDF'}</button>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[34rem] text-sm" data-testid="table-class-comparison">
              <thead><tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="py-2 pr-3">Class</th><th className="px-2 text-center">Ranked</th><th className="px-2 text-right">Average</th><th className="px-2 text-center">Pass rate</th><th className="px-2 text-center">Giants</th><th className="px-2 text-center">Support</th><th className="pl-3">Top student</th></tr></thead>
              <tbody>{scopedSummary.map((c) => <tr key={c.className} className="border-b border-border/60 last:border-0">
                <td className="py-2.5 pr-3 font-semibold">{c.className}</td><td className="px-2 text-center">{c.ranked}/{c.enrolled}</td><td className="px-2 text-right font-semibold">{fmt(c.average)}</td>
                <td className="px-2 text-center">{c.passRate}%</td><td className="px-2 text-center">{c.giants}</td><td className="px-2 text-center">{c.support}</td>
                <td className="pl-3 text-muted-foreground">{c.top ? `${c.top.name} · ${Math.round(c.top.average)}%` : '—'}</td></tr>)}</tbody>
            </table></div>
          </section>
        </div>}

        {tab === 'giants' && <div className="space-y-5">
          <section className={`${card} !p-4`}>
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-[12rem] flex-1"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">List shows</span>
                <select data-testid="select-giants-mode" value={String(mode)} onChange={(event) => setMode(event.target.value === 'giants' ? 'giants' : Number(event.target.value) as Mode)} className={selectClass}>
                  <option value="giants">Academic giants ({giantMin}%+)</option><option value="3">Top 3 per class</option><option value="5">Top 5 per class</option><option value="10">Top 10 per class</option>
                </select></label>
              <div className="flex flex-wrap gap-2">
                <button data-testid="button-giants-csv" className={buttonClass} disabled={!giantsTotal} onClick={() => downloadCsv(`${safeFileName(modeName, className || 'All-Classes', termLabel)}.csv`, rowsCsv(shownClasses.flatMap((name) => listFor(name).entries)))}><FileSpreadsheet size={15} /> CSV</button>
                <button data-testid="button-giants-print" className={buttonClass} disabled={!giantsTotal || Boolean(busy)} onClick={() => void printGiants(shownClasses)}><Printer size={15} /> Print</button>
                <button data-testid="button-download-giants-all" className={primaryButton} disabled={!giantsTotal || Boolean(busy)} onClick={() => void downloadGiants(shownClasses, 'all')}><Download size={15} /> {busy === 'all' ? 'Preparing…' : shownClasses.length > 1 ? 'All classes PDF' : 'Download PDF'}</button>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{criterion}. Each class prints on its own page, headed with your school badge and ready for signing.</p>
          </section>
          {shownClasses.map((name) => { const list = listFor(name); return <section key={name} data-testid={`giants-class-${slug(name)}`} className={card}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="font-display text-lg font-semibold">{name}</h3><p className="mt-1 text-sm text-muted-foreground">{list.summary.ranked} ranked · class average {fmt(list.summary.average)} · {list.entries.length} on this list</p></div>
              <button data-testid={`button-download-giants-${slug(name)}`} className={primaryButton} disabled={!list.entries.length || Boolean(busy)} onClick={() => void downloadGiants([name], `class-${name}`)}><Download size={15} /> {busy === `class-${name}` ? 'Preparing…' : 'Download PDF'}</button>
            </div>
            {list.entries.length ? <ol className="mt-4 divide-y divide-border">{list.entries.map((row) => <li key={row.id} className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 py-3">
              <RankBadge rank={row.rank} />
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{row.name}</p><p className="truncate text-xs text-muted-foreground">{row.best ? `Best: ${row.best.subject} (${Math.round(row.best.percent)}%)` : ''}{row.best ? ' · ' : ''}{row.subjects} subjects</p></div>
              <div className="text-right"><p className="font-display text-lg font-semibold">{fmt(row.average)}</p><p className="text-xs font-semibold text-primary">Grade {row.grade}</p></div>
            </li>)}</ol> : <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{w('No student in')} {name} reaches {giantMin}% yet. The best average is {fmt(list.summary.highest)}. Try a lower mark or “Top 3 per class”.</p>}
          </section>; })}
        </div>}

        {tab === 'subjects' && <section className={card}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-display text-lg font-semibold">Subject results</h3><p className="mt-1 text-sm text-muted-foreground">Average and best score in each subject{className ? ` for ${className}` : ''}, strongest first.</p></div>
            <button className={buttonClass} data-testid="button-subjects-csv" onClick={() => downloadCsv(`${safeFileName('Subject-Results', className || 'All-Classes', termLabel)}.csv`, [['Subject', 'Average %', 'Highest %', 'Entries'], ...subjectRowsFor(perf.subjects, className).map((s) => [s.subject, s.average, s.highest, s.entries])])}><FileSpreadsheet size={15} /> CSV</button></div>
          <div className="mt-5 space-y-4" data-testid="subject-list">{subjectRowsFor(perf.subjects, className).map((s) => <div key={s.subject}>
            <div className="flex justify-between gap-3 text-sm"><span className="font-semibold">{s.subject}</span><span><b>{fmt(s.average)}</b><span className="text-muted-foreground"> · best {Math.round(s.highest)}%</span></span></div>
            <div className="mt-1.5 h-2 rounded-full bg-muted"><div className={`h-2 rounded-full ${s.average < PASS_MARK ? 'bg-rose-500' : 'bg-[#2e8c72]'}`} style={{ width: `${s.average}%` }} /></div></div>)}</div>
          {!className && classNames.length > 1 && <div className="mt-8"><h4 className="text-sm font-semibold">Average by class</h4>
            <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[28rem] text-sm"><thead><tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="py-2 pr-3">Subject</th>{classNames.map((n) => <th key={n} className="px-2 text-center">{n}</th>)}</tr></thead>
              <tbody>{perf.subjects.map((s) => <tr key={s.subject} className="border-b border-border/60 last:border-0"><td className="py-2 pr-3 font-medium">{s.subject}</td>{classNames.map((n) => <td key={n} className={`px-2 text-center ${s.byClass[n] !== undefined && s.byClass[n] < PASS_MARK ? 'font-semibold text-rose-600' : ''}`}>{s.byClass[n] !== undefined ? `${Math.round(s.byClass[n])}%` : '–'}</td>)}</tr>)}</tbody></table></div></div>}
        </section>}

        {tab === 'support' && <section className={card}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-display text-lg font-semibold">{w('Students needing support')}</h3><p className="mt-1 text-sm text-muted-foreground">Average below {PASS_MARK}% in {termLabel}, with the subject to focus on.</p></div>
            <div className="flex gap-2"><button data-testid="button-support-csv" className={buttonClass} disabled={!support.length} onClick={() => downloadCsv(`${safeFileName('Students-Needing-Support', className || 'All-Classes', termLabel)}.csv`, rowsCsv(support))}><FileSpreadsheet size={15} /> CSV</button>
              <button data-testid="button-support-print" className={buttonClass} disabled={!support.length} onClick={() => printTable(`Students needing support: ${termLabel}`, `${className || 'All classes'} · average below ${PASS_MARK}%`, ['Class', 'Student', 'Average', 'Weakest subject'], support.map((r) => [r.className, r.name, fmt(r.average), r.weakest ? `${r.weakest.subject} (${Math.round(r.weakest.percent)}%)` : '—']), 2)}><Printer size={15} /> Print</button></div></div>
          {support.length ? <div className="mt-5 space-y-5" data-testid="support-list">{shownClasses.map((name) => { const rows = support.filter((r) => r.className === name); return rows.length ? <div key={name}>
            <h4 className="text-sm font-semibold">{name} <span className="font-normal text-muted-foreground">· {rows.length}</span></h4>
            <ul className="mt-2 divide-y divide-border rounded-xl border border-border">{[...rows].reverse().map((r) => <li key={r.id} className="flex items-center justify-between gap-3 p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{r.name}</p><p className="truncate text-xs text-muted-foreground">{r.weakest ? `Focus: ${r.weakest.subject} (${Math.round(r.weakest.percent)}%)` : 'Only one subject recorded'}</p></div><span className="shrink-0 text-sm font-semibold text-rose-600">{fmt(r.average)}</span></li>)}</ul></div> : null; })}</div>
            : <p className="mt-5 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No student is below {PASS_MARK}% for the selected term and class.</p>}
        </section>}
      </>}
  </div>;
}

function subjectRowsFor(subjects: ReturnType<typeof compute>['subjects'], className: string) {
  if (!className) return subjects;
  return subjects.filter((s) => s.byClass[className] !== undefined).map((s) => ({ ...s, average: s.byClass[className], highest: s.classDetail[className].highest, entries: s.classDetail[className].entries })).sort((a, b) => b.average - a.average);
}
