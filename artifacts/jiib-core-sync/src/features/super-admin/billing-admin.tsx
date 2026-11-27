// Super administrator: registrations, opening terms, invoices, payment approvals and payee details.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { jiibApi } from '@/lib/jiib-api';
import { Badge, Panel } from './shared';

type Row = Record<string, any>;
const ugx = (n: number) => `UGX ${Number(n).toLocaleString('en-US')}`;
const field = 'h-9 w-full rounded-lg border border-input bg-background px-2 text-sm';
const btn = 'h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50';
const ghost = 'h-9 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50';

function useAct() {
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const run = async (job: () => Promise<unknown>, ok: string) => { setBusy(true); setMsg(''); try { await job(); setMsg(ok); } catch (c) { setMsg(c instanceof Error ? c.message : 'Failed.'); } setBusy(false); };
  return { msg, busy, run };
}

function Registrations() {
  const qc = useQueryClient(); const act = useAct();
  const q = useQuery({ queryKey: ['hq', 'registrations'], queryFn: () => jiibApi<{ registrations: Row[] }>('/api/storage-admin/registrations'), retry: 1 });
  const refresh = () => qc.invalidateQueries({ queryKey: ['hq', 'registrations'] });
  const rows = (q.data?.registrations ?? []).filter((r) => r.status === 'pending');
  return <Panel title={`School registrations (${rows.length} waiting)`}>
    {!rows.length && <p className="text-sm text-muted-foreground">No registrations waiting.</p>}
    {rows.map((r) => <div key={r.id} className="flex flex-wrap items-center gap-3 border-b border-border py-2 text-sm last:border-0">
      <div className="flex-1"><b>{r.school_name}</b><p className="text-xs text-muted-foreground">{r.admin_name} · {r.email} · {r.phone}{r.address ? ` · ${r.address}` : ''}</p></div>
      <button className={btn} disabled={act.busy} onClick={() => void act.run(async () => { await jiibApi(`/api/storage-admin/registrations/${r.id}/approve`, { method: 'POST' }); await refresh(); }, `${r.school_name} approved. Welcome e-mail and SMS sent.`)}>Approve</button>
      <button className={ghost} disabled={act.busy} onClick={() => { if (window.confirm(`Reject ${r.school_name}?`)) void act.run(async () => { await jiibApi(`/api/storage-admin/registrations/${r.id}/reject`, { method: 'POST', body: JSON.stringify({}) }); await refresh(); }, 'Rejected.'); }}>Reject</button>
    </div>)}
    {act.msg && <p className="mt-2 text-xs text-muted-foreground">{act.msg}</p>}
  </Panel>;
}

function Payments() {
  const qc = useQueryClient(); const act = useAct();
  const q = useQuery({ queryKey: ['hq', 'payments'], queryFn: () => jiibApi<{ payments: Row[] }>('/api/storage-admin/payments?status=pending'), retry: 1, refetchInterval: 60_000 });
  const [expiry, setExpiry] = useState<Record<string, string>>({});
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['hq', 'payments'] }); void qc.invalidateQueries({ queryKey: ['hq', 'billing'] }); };
  const rows = q.data?.payments ?? [];
  return <Panel title={`Payments to approve (${rows.length})`}>
    {!rows.length && <p className="text-sm text-muted-foreground">Nothing waiting.</p>}
    {rows.map((p) => <div key={p.id} className="space-y-2 border-b border-border py-3 text-sm last:border-0">
      <p><b>{p.school_name}</b> ({p.school_code}) · {ugx(p.amount)} · {p.channel.toUpperCase()} · <span className="font-mono">{p.transaction_id}</span></p>
      <p className="text-xs text-muted-foreground">Paid {p.paid_on}{p.payer_name ? ` by ${p.payer_name}` : ''} · submitted {String(p.submitted_at).slice(0, 10)}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold">Subscription runs to<input type="date" className={field} value={expiry[p.id] ?? ''} onChange={(e) => setExpiry((x) => ({ ...x, [p.id]: e.target.value }))} /></label>
        <button className={btn} disabled={act.busy || !expiry[p.id]} onClick={() => void act.run(async () => { await jiibApi(`/api/storage-admin/payments/${p.id}/approve`, { method: 'POST', body: JSON.stringify({ expiresAt: `${expiry[p.id]}T23:59:59Z`, amount: p.amount }) }); refresh(); }, 'Approved. Receipt e-mail and SMS sent.')}>Approve</button>
        <button className={ghost} disabled={act.busy} onClick={() => { const note = window.prompt('Reason (shown to the school):') ?? ''; void act.run(async () => { await jiibApi(`/api/storage-admin/payments/${p.id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }); refresh(); }, 'Rejected.'); }}>Reject</button>
      </div>
    </div>)}
    {act.msg && <p className="mt-2 text-xs text-muted-foreground">{act.msg}</p>}
  </Panel>;
}

function Terms() {
  const act = useAct();
  const q = useQuery({ queryKey: ['hq', 'terms'], queryFn: () => jiibApi<{ schools: Row[]; suggested: string }>('/api/storage-admin/terms'), retry: 1 });
  const [termKey, setTermKey] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [report, setReport] = useState<string[]>([]);
  const schools = q.data?.schools ?? [];
  const key = termKey || q.data?.suggested || '';
  const ids = picked.length ? picked : schools.map((s) => s.id);
  return <Panel title="Open a new term">
    <p className="mb-2 text-xs text-muted-foreground">Closes each school's current term and opens the next one. Schools cannot do this themselves.</p>
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs font-semibold">Term (e.g. 2027-T1)<input className={field} value={key} onChange={(e) => setTermKey(e.target.value)} /></label>
      <button className={btn} disabled={act.busy || !key} onClick={() => { if (window.confirm(`Open ${key} for ${picked.length ? picked.length : 'ALL'} school(s)?`)) void act.run(async () => { const r = await jiibApi<{ results: Row[] }>('/api/storage-admin/open-term', { method: 'POST', body: JSON.stringify({ termKey: key, schoolIds: ids }) }); setReport(r.results.map((x) => `${schools.find((s) => s.id === x.schoolId)?.name ?? x.schoolId}: ${x.result}`)); }, 'Done.'); }}>{picked.length ? `Open for ${picked.length} selected` : 'Open for all schools'}</button>
    </div>
    <div className="mt-2 flex flex-wrap gap-2 text-xs">{schools.map((s) => <label key={s.id} className="flex items-center gap-1"><input type="checkbox" checked={picked.includes(s.id)} onChange={(e) => setPicked((x) => e.target.checked ? [...x, s.id] : x.filter((i) => i !== s.id))} />{s.name} <span className="text-muted-foreground">({s.activeTerm || 'none'})</span></label>)}</div>
    {act.msg && <p className="mt-2 text-xs text-muted-foreground">{act.msg}</p>}
    {report.map((r) => <p key={r} className="text-xs">{r}</p>)}
  </Panel>;
}

function Invoices() {
  const act = useAct();
  const [termKey, setTermKey] = useState(''); const [start, setStart] = useState('');
  const [out, setOut] = useState<Row[]>([]);
  const list = useQuery({ queryKey: ['hq', 'invoices'], queryFn: () => jiibApi<{ invoices: Row[] }>('/api/storage-admin/invoices'), retry: 1 });
  return <Panel title="Issue invoices">
    <p className="mb-2 text-xs text-muted-foreground">Creates one invoice per school (due 21 days after the start date) and sends each school an e-mail and SMS. Run it 2–3 weeks before the term. Safe to run twice: schools with an invoice for that term are skipped.</p>
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs font-semibold">Term<input className={field} placeholder="2027-T1" value={termKey} onChange={(e) => setTermKey(e.target.value)} /></label>
      <label className="text-xs font-semibold">Term starts<input type="date" className={field} value={start} onChange={(e) => setStart(e.target.value)} /></label>
      <button className={btn} disabled={act.busy || !termKey || !start} onClick={() => { if (window.confirm(`Issue ${termKey} invoices to all schools?`)) void act.run(async () => { const r = await jiibApi<{ issued: Row[] }>('/api/storage-admin/invoices/issue', { method: 'POST', body: JSON.stringify({ termKey, startDate: `${start}T00:00:00Z` }) }); setOut(r.issued); void list.refetch(); }, 'Done.'); }}>Issue invoices</button>
    </div>
    {act.msg && <p className="mt-2 text-xs text-muted-foreground">{act.msg}</p>}
    {out.map((o) => <p key={o.invoice} className="text-xs">{o.invoice} {o.sent ? '· sent' : '· not sent (no e-mail/SMS configured)'}</p>)}
    <div className="mt-3 max-h-56 overflow-auto text-xs">{(list.data?.invoices ?? []).map((i) => <p key={i.id} className="flex gap-2 border-b border-border py-1"><b>{i.invoice_no}</b><span>{ugx(i.amount)}</span><Badge tone={i.status === 'paid' ? 'green' : i.status === 'void' ? 'muted' : 'amber'}>{i.status}</Badge><span className="text-muted-foreground">due {String(i.due_at).slice(0, 10)}</span></p>)}</div>
  </Panel>;
}

function Payee() {
  const act = useAct();
  const q = useQuery({ queryKey: ['hq', 'payee'], queryFn: () => jiibApi<Record<string, string>>('/api/storage-admin/billing-settings'), retry: 1 });
  const [edit, setEdit] = useState<Record<string, string>>({});
  const v = { ...(q.data ?? {}), ...edit };
  const labels: Record<string, string> = { bankName: 'Bank', accountName: 'Account name', accountNumber: 'Account number', momoNumber: 'Mobile money number', momoName: 'Mobile money name', whatsapp: 'WhatsApp (international, e.g. 256762971094)', note: 'Extra note (optional)' };
  return <Panel title="Where schools pay">
    <div className="grid gap-2 sm:grid-cols-2">{Object.keys(labels).filter((k) => q.data && k in q.data).map((k) => <label key={k} className="text-xs font-semibold">{labels[k]}<input className={field} value={v[k] ?? ''} onChange={(e) => setEdit((x) => ({ ...x, [k]: e.target.value }))} /></label>)}</div>
    <button className={`${btn} mt-3`} disabled={act.busy} onClick={() => void act.run(() => jiibApi('/api/storage-admin/billing-settings', { method: 'PUT', body: JSON.stringify(v) }), 'Saved.')}>Save</button>
    {act.msg && <span className="ml-3 text-xs text-muted-foreground">{act.msg}</span>}
  </Panel>;
}

export function BillingAdmin() {
  return <div className="space-y-4"><Registrations /><Payments /><Terms /><Invoices /><Payee /></div>;
}
