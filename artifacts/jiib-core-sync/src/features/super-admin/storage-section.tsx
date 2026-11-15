// Super administrator: how much of the free database is used, by what and by which school, plus the automatic cleanup.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { jiibApi } from '@/lib/jiib-api';
import { Panel, QueryState, Stat, timeAgo } from './shared';

type Overview = {
  problem: string; limitBytes: number; usedBytes: number; lowValueDays: number;
  tables: Array<{ name: string; bytes: number; rows: number }>;
  schools: Array<{ id: string; name: string; bytes: number }>;
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
    </QueryState>
  </div>;
}
