// Super administrator: buy SMS from EgoSMS once, then assign them to schools. A school can only send what it has been given.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { jiibApi } from '@/lib/jiib-api';
import { Badge, Drawer, Panel, QueryState, Stat, timeAgo } from './shared';

type SmsSchool = { id: string; name: string; balance: number; assigned: number; used: number; openRequest: { id: string; amount: number; note: string; by: string; createdAt: string } | null };
type Overview = { provider: { ok: boolean; balance?: number; error?: string }; schools: SmsSchool[] };
type LedgerRow = { kind: string; amount: number; balanceAfter: number; note: string; by: string; createdAt: string };
const KIND: Record<string, string> = { assign: 'Assigned', adjust: 'Adjusted', use: 'Used', refund: 'Refunded' };
const n = (value: number) => value.toLocaleString('en-US');

export function SmsSection() {
  const queryClient = useQueryClient();
  const overview = useQuery({ queryKey: ['hq', 'sms'], queryFn: () => jiibApi<Overview>('/api/sms-admin/overview'), retry: 1 });
  const [target, setTarget] = useState<SmsSchool | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [ledgerFor, setLedgerFor] = useState<SmsSchool | null>(null);
  const ledger = useQuery({ queryKey: ['hq', 'sms-ledger', ledgerFor?.id], queryFn: () => jiibApi<LedgerRow[]>(`/api/sms-admin/${ledgerFor?.id}/ledger`), enabled: Boolean(ledgerFor) });
  const data = overview.data;
  const totalHeld = data?.schools.reduce((t, s) => t + s.balance, 0) ?? 0;
  const requests = data?.schools.filter((s) => s.openRequest) ?? [];

  const open = (school: SmsSchool, suggested?: number) => { setTarget(school); setAmount(suggested ? String(suggested) : ''); setNote(''); setError(''); };
  const assign = async () => {
    if (!target) return;
    const value = Math.round(Number(amount));
    if (!Number.isFinite(value) || value === 0) { setError('Enter the number of SMS to add (use a minus sign to take some back).'); return; }
    setBusy(true); setError('');
    try {
      const result = await jiibApi<{ balance: number }>(`/api/sms-admin/${target.id}/assign`, { method: 'POST', body: JSON.stringify({ amount: value, note: note.trim() || undefined }) });
      setDone(`${target.name} now has ${n(result.balance)} SMS.`); setTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['hq', 'sms'] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not assign the SMS.'); }
    finally { setBusy(false); }
  };

  return <div data-testid="hq-sms" className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="EgoSMS balance" value={data ? (data.provider.ok ? n(data.provider.balance ?? 0) : '—') : '…'} hint={data && !data.provider.ok ? data.provider.error : 'Credits you hold with EgoSMS'} tone={data && !data.provider.ok ? 'text-destructive' : ''} />
      <Stat label="Held by schools" value={n(totalHeld)} hint="Assigned but not yet used" />
      <Stat label="Assigned in total" value={n(data?.schools.reduce((t, s) => t + s.assigned, 0) ?? 0)} />
      <Stat label="Recharge requests" value={requests.length} tone={requests.length ? 'text-amber-600' : ''} hint="Schools waiting" />
    </div>
    {done && <p role="status" data-testid="hq-sms-done" className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{done}</p>}
    {requests.length > 0 && <Panel title="Schools asking for SMS">
      <ul className="divide-y divide-border">{requests.map((s) => <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
        <span><strong>{s.name}</strong> wants <strong>{n(s.openRequest!.amount)}</strong> SMS <span className="text-muted-foreground">· {timeAgo(s.openRequest!.createdAt)} · {s.openRequest!.by}</span></span>
        <button type="button" data-testid={`hq-sms-fulfil-${s.id}`} onClick={() => open(s, s.openRequest!.amount)} className="h-9 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground">Assign {n(s.openRequest!.amount)}</button></li>)}</ul>
    </Panel>}
    <Panel title="School SMS balances">
      <QueryState query={overview}>
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="py-2 pr-3">School</th><th className="px-3 text-right">Balance</th><th className="px-3 text-right">Assigned</th><th className="px-3 text-right">Used</th><th className="pl-3" /></tr></thead>
          <tbody className="divide-y divide-border">{(data?.schools ?? []).map((s) => <tr key={s.id} data-testid={`hq-sms-row-${s.id}`}>
            <td className="py-2.5 pr-3 font-medium">{s.name}{s.openRequest && <span className="ml-2"><Badge tone="amber">asked for more</Badge></span>}</td>
            <td className="px-3 text-right tabular-nums"><span className={s.balance <= 0 ? 'font-semibold text-destructive' : 'font-semibold'}>{n(s.balance)}</span></td>
            <td className="px-3 text-right tabular-nums">{n(s.assigned)}</td><td className="px-3 text-right tabular-nums">{n(s.used)}</td>
            <td className="space-x-2 pl-3 text-right whitespace-nowrap"><button type="button" onClick={() => setLedgerFor(s)} className="text-xs text-primary underline">History</button><button type="button" data-testid={`hq-sms-assign-${s.id}`} onClick={() => open(s)} className="h-8 rounded-lg border border-primary px-3 text-xs font-semibold text-primary">Assign SMS</button></td></tr>)}</tbody>
        </table></div>
      </QueryState>
    </Panel>
    {target && <Drawer title={`Assign SMS · ${target.name}`} onClose={() => setTarget(null)}>
      <p className="text-sm text-muted-foreground">Current balance: <strong>{n(target.balance)}</strong> SMS. The school can only send what you assign here, even if you still have credits at EgoSMS.</p>
      <label className="mt-4 block"><span className="mb-1 block text-xs font-semibold text-muted-foreground">Number of SMS to add</span>
        <input data-testid="hq-sms-amount" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 300" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" /></label>
      <div className="mt-2 flex gap-2">{[100, 300, 500, 1000].map((v) => <button key={v} type="button" onClick={() => setAmount(String(v))} className="h-8 rounded-full border border-border px-3 text-xs font-semibold">{v}</button>)}</div>
      <label className="mt-4 block"><span className="mb-1 block text-xs font-semibold text-muted-foreground">Note (payment reference, optional)</span>
        <input data-testid="hq-sms-note" value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" /></label>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      <button type="button" data-testid="hq-sms-assign-confirm" disabled={busy} onClick={() => void assign()} className="mt-5 h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? 'Saving…' : 'Add to school'}</button>
    </Drawer>}
    {ledgerFor && <Drawer title={`SMS history · ${ledgerFor.name}`} onClose={() => setLedgerFor(null)}>
      <QueryState query={ledger}>{(ledger.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No SMS activity yet.</p> : <ul className="divide-y divide-border text-sm">{(ledger.data ?? []).map((row, index) => <li key={index} className="flex items-center justify-between gap-3 py-2.5">
        <span><strong>{KIND[row.kind] ?? row.kind}</strong><span className="block text-xs text-muted-foreground">{timeAgo(row.createdAt)} · {row.by}{row.note ? ` · ${row.note}` : ''}</span></span>
        <span className="text-right tabular-nums"><span className={row.amount > 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-muted-foreground'}>{row.amount > 0 ? '+' : ''}{n(row.amount)}</span><span className="block text-xs text-muted-foreground">balance {n(row.balanceAfter)}</span></span></li>)}</ul>}</QueryState>
    </Drawer>}
  </div>;
}
