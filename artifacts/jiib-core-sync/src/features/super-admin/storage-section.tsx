// Super administrator: how much of the free database is used, by what and by which school, plus the automatic cleanup.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { jiibApi } from '@/lib/jiib-api';
import { Panel, QueryState, Stat, timeAgo } from './shared';

type Overview = {
  problem: string; limitBytes: number; usedBytes: number; lowValueDays: number;
  tables: Array<{ name: string; bytes: number; rows: number }>;
  schools: Array<{ id: string; name: string; bytes: number }>;
  directory?: Array<{ id: string; name: string }>;
  log: Array<{ at: string; kind: string; school: string; detail: string }>;
};

export const formatBytes = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(bytes >= 10485760 ? 0 : 1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;
const LABELS: Record<string, string> = {
  marks: 'Marks', students: 'Students', jsa_alevel_marks: 'A-Level marks', jsa_fee_payments: 'Fee payments', jsa_fee_structures: 'Fee structures', jsa_fee_overrides: 'Fee adjustments',
  jsa_fee_students: 'Day/boarding', jsa_term_summary: 'Old-term summaries', jsa_activity: 'Teacher activity', jsa_push_log: 'Notification log', jsa_push_subscriptions: 'Notification devices',
  jsa_sms_messages: 'SMS history', jsa_sms_recipients: 'SMS delivery details', jsa_sms_ledger: 'SMS credits record', parent_chat: 'Parent chat', contact_messages: 'Contact messages',
  device_sessions: 'Device sessions', jhq_logins: 'Login log', jhq_devices: 'Devices', jhq_audit: 'Audit trail', school_data: 'School settings',
};

export function StorageSection() {
  const queryClient = useQueryClient();
  const overview = useQuery({ queryKey: ['hq', 'storage'], queryFn: () => jiibApi<Overview>('/api/storage-admin/overview'), retry: 1 });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const data = overview.data;
  const percent = data && data.limitBytes ? Math.min(100, (data.usedBytes / data.limitBytes) * 100) : 0;
  const tone = percent >= 85 ? 'bg-red-500' : percent >= 65 ? 'bg-amber-500' : 'bg-emerald-500';
  const biggest = Math.max(1, ...(data?.tables ?? []).map((t) => t.bytes));
  const biggestSchool = Math.max(1, ...(data?.schools ?? []).map((s) => s.bytes));
  const clean = async () => {
    setBusy(true); setError(''); setNote('');
    try {
      const result = await jiibApi<{ cleaned: string[] }>('/api/storage-admin/cleanup', { method: 'POST', body: '{}' });
      setNote(`Cleanup done: ${result.cleaned.length ? result.cleaned.join(', ') : 'nothing to remove'}.`);
      await queryClient.invalidateQueries({ queryKey: ['hq', 'storage'] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The cleanup could not run.'); }
    finally { setBusy(false); }
  };
  return <div data-testid="hq-storage" className="space-y-4">
    <QueryState query={overview}>
      {data?.problem && <p role="alert" data-testid="hq-storage-problem" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{data.problem}</p>}
      <Panel title="Database space">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <p className="font-display text-3xl font-semibold" data-testid="hq-storage-used">{formatBytes(data?.usedBytes ?? 0)} <span className="text-base font-normal text-muted-foreground">of {formatBytes(data?.limitBytes ?? 0)}</span></p>
          <p className="text-sm font-semibold" data-testid="hq-storage-percent">{percent.toFixed(0)}% used</p>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${percent.toFixed(0)} percent of the database is used`}><div className={`h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} /></div>
        <p className="mt-2 text-xs text-muted-foreground">The free plan limit is shown. Deleted records free space that new data then reuses, so the total stops growing even if it does not drop straight away.</p>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="By school (estimated)">
          {(data?.schools ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No data yet.</p> : <ul className="space-y-3">{data!.schools.map((school) => <li key={school.id}>
            <div className="flex justify-between text-sm"><span className="font-medium">{school.name}</span><span className="tabular-nums text-muted-foreground">{formatBytes(school.bytes)}</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/70" style={{ width: `${(school.bytes / biggestSchool) * 100}%` }} /></div></li>)}</ul>}
        </Panel>
        <Panel title="By kind of data">
          <ul className="space-y-3">{(data?.tables ?? []).slice(0, 12).map((table) => <li key={table.name}>
            <div className="flex justify-between text-sm"><span className="font-medium">{LABELS[table.name] ?? table.name}</span><span className="tabular-nums text-muted-foreground">{formatBytes(table.bytes)} · {table.rows.toLocaleString('en-US')} rows</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/70" style={{ width: `${(table.bytes / biggest) * 100}%` }} /></div></li>)}</ul>
        </Panel>
      </div>
      <Panel title="Automatic cleanup" action={<button type="button" data-testid="hq-storage-clean" disabled={busy} onClick={() => void clean()} className="h-9 rounded-lg border border-primary px-3 text-sm font-semibold text-primary disabled:opacity-50">{busy ? 'Cleaning…' : 'Clean now'}</button>}>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Every day: teacher activity, notification log, login log and SMS delivery details older than <strong>{data?.lowValueDays ?? 30} days</strong> are deleted. SMS credit records are deleted after <strong>7 days</strong> (the totals per school are kept).</li>
          <li>When a school opens a new term: the marks of terms older than the previous term are deleted. A small summary per student (average, position) is kept first.</li>
          <li>Never deleted: fee payments and receipts, fee structures, student lists and each school's SMS balance and totals.</li>
        </ul>
        {note && <p role="status" className="mt-3 text-sm text-emerald-700">{note}</p>}
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        {(data?.log ?? []).length > 0 && <ul className="mt-4 divide-y divide-border text-sm" data-testid="hq-storage-log">{data!.log.map((row, index) => <li key={index} className="py-2"><span className="text-xs text-muted-foreground">{timeAgo(row.at)}{row.school ? ` · ${row.school}` : ''}</span><p>{row.detail}</p></li>)}</ul>}
      </Panel>
      <DataCheckPanel schools={data?.directory ?? data?.schools ?? []} />
    </QueryState>
  </div>;
}

type TermCheck = {
  termKey: string; label: string;
  students: { inTable: number; inRecord: number; onlyInRecord: number; onlyInTable: number; subjectsToCopy: number; aLevelToCopy: number; differ: Record<string, number> };
  marks: { inTable: number; inRecord: number; onlyInRecord: number; differ: number };
};
type SchoolCheck = { schoolId: string; name: string; recordBytes: number; terms: TermCheck[] } | { schoolId: string; name: string; error: string };

/** Dry run for the planned move of learners and marks into the real tables. It only reads and counts; it changes nothing. */
function DataCheckPanel({ schools }: { schools: Array<{ id: string; name: string }> }) {
  const [results, setResults] = useState<SchoolCheck[]>([]);
  const [running, setRunning] = useState(false);
  const run = async () => {
    setRunning(true); setResults([]);
    for (const school of schools) {
      try {
        const result = await jiibApi<Exclude<SchoolCheck, { error: string }>>(`/api/storage-admin/data-check?schoolId=${encodeURIComponent(school.id)}`);
        setResults((list) => [...list, { ...result, name: school.name }]);
      } catch (cause) {
        setResults((list) => [...list, { schoolId: school.id, name: school.name, error: cause instanceof Error ? cause.message : 'Could not check this school.' }]);
      }
    }
    setRunning(false);
  };
  const [copying, setCopying] = useState('');
  const [copied, setCopied] = useState<Record<string, string>>({});
  const copy = async (schoolId: string) => {
    if (!window.confirm('Copy this school\'s missing learners and newer subject lists into the tables? Marks are not touched and nothing is deleted.')) return;
    setCopying(schoolId);
    try {
      const r = await jiibApi<{ inserted: number; subjectsUpdated: number; skipped: number; why?: { badId: number; noName: number; noClass: number }; sampleKeys?: string[]; sampleId?: string }>('/api/storage-admin/data-check/copy', { method: 'POST', body: JSON.stringify({ schoolId }) });
      setCopied((m) => ({ ...m, [schoolId]: `Done: ${r.inserted} learners added, ${r.subjectsUpdated} subject lists updated${r.skipped ? `, ${r.skipped} skipped (bad id ${r.why?.badId}, no name ${r.why?.noName}, no class ${r.why?.noClass}; id shape ${r.sampleId}; fields ${r.sampleKeys?.join('/')})` : ''}. Run the check again.` }));
    } catch (cause) { setCopied((m) => ({ ...m, [schoolId]: cause instanceof Error ? cause.message : 'Copy failed.' })); }
    setCopying('');
  };
  const need = (term: TermCheck) => term.students.onlyInRecord + term.students.subjectsToCopy + term.marks.onlyInRecord;
  const mismatch = (term: TermCheck) => Object.values(term.students.differ).reduce((a, b) => a + b, 0) + term.marks.differ;
  return <Panel title="Data check (dry run)" action={<button type="button" data-testid="hq-data-check" disabled={running || !schools.length} onClick={() => void run()} className="h-9 rounded-lg border border-primary px-3 text-sm font-semibold text-primary disabled:opacity-50">{running ? 'Checking…' : results.length ? 'Run again' : 'Run check'}</button>}>
    <p className="text-sm text-muted-foreground">Shows what would have to be copied from each school's saved-settings record into the learner and marks tables. It only reads and counts: nothing is changed, and no names or marks are shown.</p>
    <div className="mt-4 space-y-4">
      {results.map((result) => 'error' in result
        ? <p key={result.schoolId} role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{result.name}: {result.error}</p>
        : <section key={result.schoolId} className="rounded-xl border border-border" data-testid="hq-data-check-school">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5"><p className="text-sm font-semibold">{result.name}</p><span className="flex items-center gap-2 text-xs text-muted-foreground">Settings record {formatBytes(result.recordBytes)}<button type="button" data-testid="hq-data-copy" disabled={!!copying} onClick={() => void copy(result.schoolId)} className="h-8 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">{copying === result.schoolId ? 'Copying…' : 'Copy into tables'}</button></span></div>
          {copied[result.schoolId] ? <p className="border-b border-border px-4 py-2 text-xs text-emerald-700">{copied[result.schoolId]}</p> : null}
          <div className="overflow-x-auto"><table className="w-full min-w-[34rem] text-left text-xs">
            <thead className="text-muted-foreground"><tr><th className="px-4 py-2">Term</th><th className="px-2 py-2">Learners (table / record)</th><th className="px-2 py-2">To copy</th><th className="px-2 py-2">Marks (table / record)</th><th className="px-2 py-2">Marks to copy</th><th className="px-2 py-2">Differences</th></tr></thead>
            <tbody className="divide-y divide-border">{result.terms.map((term) => <tr key={term.termKey}>
              <td className="px-4 py-2 font-medium">{term.label}</td>
              <td className="px-2 py-2 tabular-nums">{term.students.inTable} / {term.students.inRecord}</td>
              <td className="px-2 py-2 tabular-nums">{term.students.onlyInRecord} learners · {term.students.subjectsToCopy} subject lists{term.students.aLevelToCopy ? ` · ${term.students.aLevelToCopy} A-Level` : ''}</td>
              <td className="px-2 py-2 tabular-nums">{term.marks.inTable} / {term.marks.inRecord}</td>
              <td className="px-2 py-2 tabular-nums">{term.marks.onlyInRecord}</td>
              <td className="px-2 py-2">{mismatch(term) ? <span className="font-semibold text-amber-700">{mismatch(term)} to review<span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{[...Object.entries(term.students.differ).filter(([, count]) => count > 0).map(([field, count]) => `${field}: ${count}`), term.marks.differ ? `marks: ${term.marks.differ}` : ''].filter(Boolean).join(' · ')}</span></span> : <span className="text-emerald-700">None</span>}</td>
            </tr>)}</tbody>
          </table></div>
          <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">{result.terms.reduce((sum, term) => sum + need(term), 0) === 0 ? 'Nothing to copy: the tables already hold everything in the record.' : `${result.terms.reduce((sum, term) => sum + need(term), 0)} items exist only in the record and would be copied.`}</p>
        </section>)}
    </div>
  </Panel>;
}
