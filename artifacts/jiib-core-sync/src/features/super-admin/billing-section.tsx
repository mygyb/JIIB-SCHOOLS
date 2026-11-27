// Super administrator: assign each school a plan and see its learners and teachers against that plan's limits.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { jiibApi } from '@/lib/jiib-api';
import { Badge, Bar, Panel, QueryState } from './shared';

type PlanInfo = { label: string; learners: number; teachers: number | null; termFee: number; yearFee: number };
type SchoolBilling = {
  id: string; name: string; active: boolean; termKey: string; usage: { learners: number; teachers: number };
  billing: null | { school_code: string | null; plan: string; cycle: string; status: string; trial_ends_at: string | null; expires_at: string | null; note: string | null };
};
type Overview = { ready: boolean; trialDays: number; plans: Record<string, PlanInfo>; schools: SchoolBilling[] };

const ugx = (n: number) => `UGX ${n.toLocaleString('en-US')}`;
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');
const STATUS_TONE: Record<string, 'green' | 'blue' | 'amber' | 'red' | 'muted'> = { active: 'green', trial: 'blue', overdue: 'amber', read_only: 'amber', suspended: 'red' };

function SchoolCard({ school, plans, trialDays, refresh }: { school: SchoolBilling; plans: Record<string, PlanInfo>; trialDays: number; refresh: () => Promise<unknown> }) {
  const b = school.billing;
  const [plan, setPlan] = useState(b?.plan ?? 'starter');
  const [cycle, setCycle] = useState(b?.cycle ?? 'termly');
  const [status, setStatus] = useState(b?.status ?? 'trial');
  const [trialEnds, setTrialEnds] = useState(day(b?.trial_ends_at));
  const [expires, setExpires] = useState(day(b?.expires_at));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const info = plans[plan] ?? plans.starter;
  const over = school.usage.learners > info.learners || (info.teachers !== null && school.usage.teachers > info.teachers);
  const save = async () => {
    setBusy(true); setNote('');
    try {
      await jiibApi(`/api/storage-admin/billing/${school.id}`, { method: 'PUT', body: JSON.stringify({ plan, cycle, status, trialEndsAt: trialEnds ? `${trialEnds}T23:59:59Z` : null, expiresAt: expires ? `${expires}T23:59:59Z` : null }) });
      setNote('Saved.'); await refresh();
    } catch (cause) { setNote(cause instanceof Error ? cause.message : 'Could not save.'); }
    setBusy(false);
  };
  const field = 'h-9 w-full rounded-lg border border-input bg-background px-2 text-sm';
  return <Panel className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="font-semibold">{school.name}</p><p className="text-xs text-muted-foreground">{b?.school_code ? `Code ${b.school_code}` : 'No plan yet: no limits apply'}{school.termKey ? ` · term ${school.termKey}` : ''}</p></div>
      <div className="flex gap-1.5">{b ? <Badge tone={STATUS_TONE[b.status] ?? 'muted'}>{b.status.replace('_', ' ')}</Badge> : <Badge>unbilled</Badge>}{!school.active && <Badge tone="red">suspended</Badge>}</div>
    </div>
    <div className="grid gap-2 text-xs sm:grid-cols-2">
      <div><div className="mb-1 flex justify-between"><span>Learners</span><span className={over ? 'font-semibold text-red-600' : ''}>{school.usage.learners} / {info.learners}</span></div><Bar percent={(school.usage.learners / info.learners) * 100} tone={school.usage.learners > info.learners ? 'bg-red-500' : 'bg-primary'} /></div>
      <div><div className="mb-1 flex justify-between"><span>Teachers</span><span>{school.usage.teachers} / {info.teachers ?? 'no limit'}</span></div><Bar percent={info.teachers ? (school.usage.teachers / info.teachers) * 100 : 0} /></div>
    </div>
    <div className="grid gap-2 sm:grid-cols-3">
      <label className="text-xs font-semibold">Plan<select value={plan} onChange={(e) => setPlan(e.target.value)} className={field}>{Object.entries(plans).map(([key, p]) => <option key={key} value={key}>{p.label} · {ugx(p.termFee)}/term</option>)}</select></label>
      <label className="text-xs font-semibold">Billing<select value={cycle} onChange={(e) => setCycle(e.target.value)} className={field}><option value="termly">Termly</option><option value="yearly">Yearly ({ugx(info.yearFee)})</option></select></label>
      <label className="text-xs font-semibold">Status<select value={status} onChange={(e) => setStatus(e.target.value)} className={field}>{['trial', 'active', 'overdue', 'read_only', 'suspended'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></label>
      <label className="text-xs font-semibold">Trial ends<input type="date" value={trialEnds} onChange={(e) => setTrialEnds(e.target.value)} className={field} /></label>
      <label className="text-xs font-semibold">Paid until<input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={field} /></label>
    </div>
    {!b && <p className="text-xs text-muted-foreground">Saving starts the {trialDays}-day trial for this school and applies the plan limits.</p>}
    {over && <p className="text-xs text-red-600">This school is already over the limits of this plan. It cannot add more until it upgrades or removes some.</p>}
    <div className="flex items-center gap-3"><button type="button" data-testid={`hq-billing-save-${school.id}`} disabled={busy} onClick={() => void save()} className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>{note && <span className="text-xs text-muted-foreground">{note}</span>}</div>
  </Panel>;
}

export function BillingSection() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['hq', 'billing'], queryFn: () => jiibApi<Overview>('/api/storage-admin/billing'), retry: 1 });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['hq', 'billing'] });
  const data = query.data;
  return <div className="space-y-4">
    <QueryState query={query}>
      {data && !data.ready && <Panel title="One step first"><p className="text-sm text-muted-foreground">Run the billing SQL (20261127000000_school_billing.sql) in the Supabase SQL editor, then refresh this page.</p></Panel>}
      {data && <div className="grid gap-3 sm:grid-cols-3">{Object.entries(data.plans).map(([key, p]) => <Panel key={key}><p className="font-display font-semibold">{p.label}</p><p className="text-sm">{ugx(p.termFee)} per term</p><p className="text-xs text-muted-foreground">Yearly {ugx(p.yearFee)} · up to {p.learners} learners · {p.teachers ? `${p.teachers} teachers` : 'unlimited teachers'}</p></Panel>)}</div>}
      {data?.schools.map((school) => <SchoolCard key={`${school.id}-${school.billing?.plan ?? ''}-${school.billing?.status ?? ''}`} school={school} plans={data.plans} trialDays={data.trialDays} refresh={refresh} />)}
    </QueryState>
  </div>;
}
