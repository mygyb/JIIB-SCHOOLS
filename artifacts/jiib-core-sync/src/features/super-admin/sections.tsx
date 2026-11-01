import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, Search, Send } from 'lucide-react';
import { useHealthCheck, getHealthCheckQueryKey } from '@workspace/api-client-react';
import { jiibApi } from '@/lib/jiib-api';
import { suspiciousAccounts, useDeviceActions, DevicesSection } from './devices';
import { Badge, Bar, DeviceIcon, Drawer, Panel, QueryState, Stat, timeAgo, type Device, type Hq, type PortfolioSchool } from './shared';

const field = 'h-10 rounded-xl border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring';

// ---------------------------------------------------------------------------------------------- Overview
export function Overview({ hq, go }: { hq: Hq; go: (section: string) => void }) {
  const totals = hq.analytics.data;
  const devices = hq.devices.data ?? [];
  const online = devices.filter((d) => d.online).length;
  const sevenDays = Date.now() - 7 * 86_400_000;
  const quiet = (totals?.schools ?? []).filter((s) => s.active && !devices.some((d) => d.schoolId === s.id && new Date(d.lastSeen).getTime() > sevenDays));
  const behind = (totals?.schools ?? []).filter((s) => s.active && s.studentCount > 0 && s.marksCompletionPercent < 40);
  const flagged = suspiciousAccounts(devices);
  const mix = { phone: devices.filter((d) => d.deviceType === 'phone').length, computer: devices.filter((d) => d.deviceType === 'computer').length, tablet: devices.filter((d) => d.deviceType === 'tablet').length, app: devices.filter((d) => d.isApp).length };
  const attention: { text: string; to: string }[] = [
    ...flagged.map((f) => ({ text: `${f.email} signed in on ${f.devices.length} devices this week`, to: 'devices' })),
    ...(hq.blocked.data?.length ? [{ text: `${hq.blocked.data.length} blocked account${hq.blocked.data.length > 1 ? 's' : ''}`, to: 'users' }] : []),
    ...behind.map((s) => ({ text: `${s.name}: marks only ${Math.round(s.marksCompletionPercent)}% complete`, to: 'schools' })),
    ...(hq.devices.isSuccess ? quiet.map((s) => ({ text: `${s.name}: no one has logged in for 7 days`, to: 'schools' })) : []),
  ];
  return (
    <div className="space-y-4">
      <QueryState query={hq.analytics}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Schools" value={totals?.schoolCount ?? 0} hint={`${totals?.activeSchoolCount ?? 0} active · ${totals?.suspendedSchoolCount ?? 0} suspended`} />
          <Stat label="Staff" value={totals?.staffCount ?? 0} />
          <Stat label="Students" value={(totals?.studentCount ?? 0).toLocaleString()} />
          <Stat label="Online now" value={online} tone="text-emerald-600" hint={`${devices.length} devices seen`} />
          <Stat label="Marks complete" value={`${Math.round(totals?.marksCompletionPercent ?? 0)}%`} />
        </div>
      </QueryState>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Needs attention">
          {attention.length === 0 ? <p className="text-sm text-muted-foreground">Nothing needs attention right now.</p> : (
            <ul className="space-y-2">{attention.slice(0, 8).map((item, index) => <li key={index}><button type="button" onClick={() => go(item.to)} className="flex w-full items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-left text-sm hover:bg-amber-500/15"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />{item.text}</button></li>)}</ul>
          )}
        </Panel>
        <Panel title="Devices" action={<button type="button" onClick={() => go('devices')} className="text-xs font-semibold text-primary">View all</button>}>
          {hq.devices.isError ? <p className="text-sm text-muted-foreground">Device tracking is not switched on yet. Run <code>hq-setup.sql</code> once in Supabase.</p> : (
            <div className="space-y-3">{([['Phones', mix.phone], ['Computers', mix.computer], ['Tablets', mix.tablet], ['Installed app', mix.app]] as [string, number][]).map(([label, count]) => <div key={label}><div className="mb-1 flex justify-between text-xs"><span>{label}</span><span className="text-muted-foreground">{count}</span></div><Bar percent={devices.length ? (count / devices.length) * 100 : 0} /></div>)}</div>
          )}
        </Panel>
      </div>
      <Panel title="Recent logins" action={<button type="button" onClick={() => go('devices')} className="text-xs font-semibold text-primary">Open devices</button>}>
        <ul className="divide-y divide-border">{devices.slice(0, 8).map((d: Device) => <li key={d.deviceId} className="flex items-center gap-3 py-2.5 text-sm"><span className={d.online ? 'text-emerald-500' : 'text-muted-foreground'}><DeviceIcon type={d.deviceType} /></span><span className="min-w-0 flex-1"><span className="block truncate font-medium">{d.label || d.email || 'Parent / guardian'}</span><span className="block truncate text-xs text-muted-foreground">{d.schoolName ?? '—'} · {d.os}</span></span><span className="shrink-0 text-xs text-muted-foreground">{d.online ? 'Online' : timeAgo(d.lastSeen)}</span></li>)}{devices.length === 0 && <li className="py-3 text-sm text-muted-foreground">No devices recorded yet.</li>}</ul>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- Schools
function SchoolDetail({ school, hq, onClose, onChanged }: { school: PortfolioSchool; hq: Hq; onClose: () => void; onChanged: () => void }) {
  const [tab, setTab] = useState<'summary' | 'staff' | 'devices'>('summary');
  const [error, setError] = useState('');
  const staff = (hq.staff.data ?? []).filter((s) => s.schoolId === school.id);
  const devices = (hq.devices.data ?? []).filter((d) => d.schoolId === school.id);
  const toggle = async () => {
    if (!confirm(school.active ? `Suspend ${school.name}? Their staff and parents will not be able to use the system.` : `Reactivate ${school.name}?`)) return;
    try { await jiibApi(`/api/schools/${encodeURIComponent(school.id)}/status`, { method: 'PATCH', body: JSON.stringify({ active: !school.active }) }); onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not change the status.'); }
  };
  return (
    <Drawer title={school.name} onClose={onClose}>
      <div className="mb-4 flex items-center gap-2">{school.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Suspended</Badge>}<span className="text-xs text-muted-foreground">/{school.slug}</span></div>
      <div className="mb-4 flex gap-1 rounded-xl bg-muted p-1 text-sm font-semibold">{(['summary', 'staff', 'devices'] as const).map((key) => <button key={key} type="button" onClick={() => setTab(key)} className={`flex-1 rounded-lg py-2 capitalize ${tab === key ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>{key}{key === 'staff' ? ` (${staff.length})` : key === 'devices' ? ` (${devices.length})` : ''}</button>)}</div>
      {tab === 'summary' && <div className="space-y-4"><div className="grid grid-cols-2 gap-3"><Stat label="Students" value={school.studentCount} /><Stat label="Classes" value={school.classCount} /><Stat label="Staff" value={staff.length} /><Stat label="Online now" value={devices.filter((d) => d.online).length} /></div>
        <div><div className="mb-1 flex justify-between text-sm"><span>Marks completion</span><span className="font-semibold">{Math.round(school.marksCompletionPercent)}%</span></div><Bar percent={school.marksCompletionPercent} /></div>
        <p className="text-sm text-muted-foreground">Last activity: {devices[0] ? timeAgo(devices[0].lastSeen) : 'no devices recorded'}</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button type="button" data-testid="hq-toggle-school" onClick={toggle} className={`h-11 w-full rounded-xl text-sm font-semibold ${school.active ? 'border border-destructive/40 text-destructive hover:bg-destructive/5' : 'bg-primary text-primary-foreground'}`}>{school.active ? 'Suspend school' : 'Reactivate school'}</button></div>}
      {tab === 'staff' && <ul className="divide-y divide-border rounded-xl border border-border text-sm">{staff.map((s) => <li key={s.email} className="flex items-center justify-between gap-3 px-3 py-2.5"><span className="min-w-0"><span className="block truncate font-medium">{s.displayName || s.email}</span><span className="block truncate text-xs text-muted-foreground">{s.email}</span></span><Badge tone={s.role === 'admin' ? 'blue' : 'muted'}>{s.role === 'admin' ? 'Admin' : 'Teacher'}</Badge></li>)}{staff.length === 0 && <li className="px-3 py-4 text-muted-foreground">No staff yet.</li>}</ul>}
      {tab === 'devices' && <ul className="divide-y divide-border rounded-xl border border-border text-sm">{devices.map((d) => <li key={d.deviceId} className="flex items-center gap-3 px-3 py-2.5"><span className={d.online ? 'text-emerald-500' : 'text-muted-foreground'}><DeviceIcon type={d.deviceType} /></span><span className="min-w-0 flex-1"><span className="block truncate font-medium">{d.label || d.email || 'Parent / guardian'}</span><span className="block truncate text-xs text-muted-foreground">{d.os} · {d.isApp ? 'App' : d.browser}</span></span><span className="text-xs text-muted-foreground">{d.online ? 'Online' : timeAgo(d.lastSeen)}</span></li>)}{devices.length === 0 && <li className="px-3 py-4 text-muted-foreground">No devices recorded yet.</li>}</ul>}
    </Drawer>
  );
}

export function SchoolsSection({ hq }: { hq: Hq }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [state, setState] = useState<'all' | 'active' | 'suspended'>('all');
  const [openId, setOpenId] = useState('');
  const [registering, setRegistering] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', adminEmail: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const schools = hq.analytics.data?.schools ?? [];
  const devices = hq.devices.data ?? [];
  const list = schools.filter((s) => (state === 'all' || (state === 'active') === s.active) && `${s.name} ${s.slug}`.toLowerCase().includes(search.toLowerCase()));
  const open = schools.find((s) => s.id === openId);
  const refresh = () => Promise.all([hq.analytics.refetch(), queryClient.invalidateQueries({ queryKey: ['hq'] })]);
  const register = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setNotice('');
    try {
      await jiibApi('/api/schools', { method: 'POST', body: JSON.stringify({ name: form.name.trim(), slug: form.slug.trim(), ...(form.adminEmail.trim() ? { initialAdminEmail: form.adminEmail.trim() } : {}) }) });
      setForm({ name: '', slug: '', adminEmail: '' }); setRegistering(false); setNotice('School registered.'); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not register this school.'); }
  };
  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[200px] flex-1"><Search size={15} className="absolute left-3 top-3 text-muted-foreground" aria-hidden="true" /><input aria-label="Search schools" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search schools" className={`${field} w-full pl-9`} /></label>
          <select aria-label="Status" value={state} onChange={(e) => setState(e.target.value as typeof state)} className={field}><option value="all">All</option><option value="active">Active</option><option value="suspended">Suspended</option></select>
          <button type="button" data-testid="hq-register-school" onClick={() => setRegistering(!registering)} className="flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus size={16} /> Register school</button>
        </div>
        {registering && <form onSubmit={register} className="mt-4 grid gap-2 sm:grid-cols-3">
          <input required placeholder="School name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} />
          <input required placeholder="slug (e.g. mucoss)" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className={field} />
          <input type="email" placeholder="Admin email (optional)" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} className={field} />
          <button className="h-10 rounded-xl bg-primary text-sm font-semibold text-primary-foreground sm:col-span-3">Create school</button>
        </form>}
        {notice && <p className="mt-3 text-sm text-emerald-600">{notice}</p>}{error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      </Panel>
      <QueryState query={hq.analytics}>
        {list.length === 0 ? <Panel><p className="py-6 text-center text-sm text-muted-foreground">No schools match.</p></Panel> : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{list.map((s) => {
            const mine = devices.filter((d) => d.schoolId === s.id);
            return <li key={s.id}><button type="button" data-testid={`hq-school-${s.slug}`} onClick={() => setOpenId(s.id)} className="w-full rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/50">
              <span className="flex items-start justify-between gap-2"><span className="min-w-0"><span className="block truncate font-display text-base font-semibold">{s.name}</span><span className="text-xs text-muted-foreground">/{s.slug}</span></span>{s.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Suspended</Badge>}</span>
              <span className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><span><b className="block text-base">{s.studentCount}</b>students</span><span><b className="block text-base">{(hq.staff.data ?? []).filter((x) => x.schoolId === s.id).length}</b>staff</span><span><b className="block text-base">{mine.filter((d) => d.online).length}</b>online</span></span>
              <span className="mt-3 block"><span className="mb-1 flex justify-between text-xs text-muted-foreground"><span>Marks</span><span>{Math.round(s.marksCompletionPercent)}%</span></span><Bar percent={s.marksCompletionPercent} /></span>
              <span className="mt-2 block text-xs text-muted-foreground">Last activity {mine[0] ? timeAgo(mine[0].lastSeen) : '—'}</span></button></li>;
          })}</ul>
        )}
      </QueryState>
      {open && <SchoolDetail school={open} hq={hq} onClose={() => setOpenId('')} onChanged={() => void refresh()} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- Users
export function UsersSection({ hq }: { hq: Hq }) {
  const actions = useDeviceActions();
  const [search, setSearch] = useState('');
  const [school, setSchool] = useState('');
  const blocked = new Set((hq.blocked.data ?? []).map((b) => b.email.toLowerCase()));
  const staff = (hq.staff.data ?? []).filter((s) => (!school || s.schoolId === school) && `${s.displayName ?? ''} ${s.email} ${s.schoolName}`.toLowerCase().includes(search.toLowerCase()));
  const schools = hq.analytics.data?.schools ?? [];
  const deviceCount = (email: string) => (hq.devices.data ?? []).filter((d) => d.email?.toLowerCase() === email.toLowerCase()).length;
  return (
    <div className="space-y-4">
      {(hq.blocked.data?.length ?? 0) > 0 && <Panel title="Blocked accounts"><ul className="divide-y divide-border">{hq.blocked.data!.map((b) => <li key={b.email} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="min-w-0"><span className="block truncate font-medium">{b.email}</span><span className="block truncate text-xs text-muted-foreground">{b.reason || 'No reason given'} · {timeAgo(b.blockedAt)}</span></span><button type="button" onClick={() => void actions.unblockAccount(b.email)} className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Unblock</button></li>)}</ul></Panel>}
      <Panel>
        <div className="flex flex-wrap gap-2"><label className="relative min-w-[200px] flex-1"><Search size={15} className="absolute left-3 top-3 text-muted-foreground" aria-hidden="true" /><input aria-label="Search users" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, school" className={`${field} w-full pl-9`} /></label>
          <select aria-label="School" value={school} onChange={(e) => setSchool(e.target.value)} className={field}><option value="">All schools</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        {actions.error && <p role="alert" className="mt-3 text-sm text-destructive">{actions.error}</p>}
      </Panel>
      <QueryState query={hq.staff}>
        <ul className="space-y-2">{staff.map((s) => {
          const isBlocked = blocked.has(s.email.toLowerCase());
          return <li key={`${s.schoolId}-${s.email}`} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3 text-sm">
            <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="truncate font-semibold">{s.displayName || s.email}</span><Badge tone={s.role === 'admin' ? 'blue' : 'muted'}>{s.role === 'admin' ? 'Admin' : 'Teacher'}</Badge>{isBlocked && <Badge tone="red">Blocked</Badge>}</span><span className="block truncate text-xs text-muted-foreground">{s.email} · {s.schoolName} · {deviceCount(s.email)} device{deviceCount(s.email) === 1 ? '' : 's'}</span></span>
            {isBlocked ? <button type="button" onClick={() => void actions.unblockAccount(s.email)} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Unblock</button>
              : <button type="button" onClick={() => { const reason = prompt(`Block ${s.email}? They will be signed out on every device.\n\nReason (optional):`); if (reason !== null) void actions.blockAccount(s.email, reason); }} className="rounded-lg border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/5">Block account</button>}
          </li>;
        })}{staff.length === 0 && <li className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">No users match.</li>}</ul>
      </QueryState>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- Inbox
export function InboxSection({ hq }: { hq: Hq }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const schools = hq.analytics.data?.schools ?? [];
  const received = (hq.inbox.data ?? []).filter((m) => m.direction === 'in');
  const send = async () => {
    if (!message.trim()) return;
    setError(''); setNotice('');
    try {
      const result = await jiibApi<{ sentTo: number }>('/api/schools/portfolio/messages', { method: 'POST', body: JSON.stringify({ message: message.trim(), ...(target.length ? { schoolIds: target } : {}) }) });
      setMessage(''); setNotice(`Sent to ${result.sentTo} school${result.sentTo === 1 ? '' : 's'}.`); void queryClient.invalidateQueries({ queryKey: ['hq', 'inbox'] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not send.'); }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Send an announcement">
        <textarea aria-label="Announcement" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message for school administrators" className="w-full rounded-xl border border-input bg-card p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <p className="mb-2 mt-3 text-xs font-semibold text-muted-foreground">{target.length ? `${target.length} school${target.length > 1 ? 's' : ''} selected` : 'All active schools'}</p>
        <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">{schools.map((s) => <button key={s.id} type="button" onClick={() => setTarget((cur) => cur.includes(s.id) ? cur.filter((id) => id !== s.id) : [...cur, s.id])} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${target.includes(s.id) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{s.name}</button>)}</div>
        {notice && <p className="mt-3 text-sm text-emerald-600">{notice}</p>}{error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        <button type="button" data-testid="hq-send-announcement" onClick={send} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground"><Send size={16} /> Send</button>
      </Panel>
      <Panel title={`Help requests (${received.length})`}>
        <QueryState query={hq.inbox}>
          <ul className="divide-y divide-border">{received.map((m) => <li key={m.id} className="py-3 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-semibold">{m.schoolName}</span><span className="text-xs text-muted-foreground">{timeAgo(m.createdAt)}</span></div><p className="mt-1 text-muted-foreground">{m.message.replace(/^\[system administrator help\]\s*/i, '')}</p><button type="button" onClick={() => { setTarget([m.schoolId]); setMessage(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="mt-1 text-xs font-semibold text-primary">Reply to this school</button></li>)}{received.length === 0 && <li className="py-6 text-center text-muted-foreground">No help requests.</li>}</ul>
        </QueryState>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- System
export function SystemSection({ hq }: { hq: Hq }) {
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } });
  const trackingOn = hq.devices.isSuccess;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Server" value={health.isSuccess ? 'Healthy' : health.isError ? 'Down' : '…'} tone={health.isSuccess ? 'text-emerald-600' : health.isError ? 'text-destructive' : ''} />
        <Stat label="Device tracking" value={trackingOn ? 'On' : 'Not set up'} tone={trackingOn ? 'text-emerald-600' : 'text-amber-600'} hint={trackingOn ? undefined : 'Run hq-setup.sql in Supabase'} />
        <Stat label="Devices recorded" value={(hq.devices.data ?? []).length} />
      </div>
      <Panel title="Activity log (what you changed)">
        <QueryState query={hq.audit}>
          <ul className="divide-y divide-border text-sm">{(hq.audit.data ?? []).map((a, index) => <li key={index} className="flex flex-wrap justify-between gap-2 py-2"><span><b>{a.action}</b> <span className="break-all text-muted-foreground">{a.target}{a.detail ? ` — ${a.detail}` : ''}</span></span><span className="text-xs text-muted-foreground">{new Date(a.at).toLocaleString()}</span></li>)}{(hq.audit.data ?? []).length === 0 && <li className="py-6 text-center text-muted-foreground">Nothing recorded yet.</li>}</ul>
        </QueryState>
      </Panel>
    </div>
  );
}

export { DevicesSection };
