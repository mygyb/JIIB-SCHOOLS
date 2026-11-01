import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, LogOut, Search, ShieldAlert } from 'lucide-react';
import { jiibApi } from '@/lib/jiib-api';
import { Badge, DeviceIcon, Drawer, Panel, QueryState, timeAgo, type Device, type Hq } from './shared';

const field = 'h-10 rounded-xl border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring';

/** Accounts that appear on three or more devices in the last week. */
export function suspiciousAccounts(devices: Device[]) {
  const weekAgo = Date.now() - 7 * 86_400_000;
  const byEmail = new Map<string, Device[]>();
  for (const device of devices) {
    if (!device.email || new Date(device.lastSeen).getTime() < weekAgo) continue;
    byEmail.set(device.email, [...(byEmail.get(device.email) ?? []), device]);
  }
  return [...byEmail.entries()].filter(([, list]) => list.length >= 3).map(([email, list]) => ({ email, devices: list }));
}

export function useDeviceActions() {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const run = async (action: () => Promise<unknown>) => {
    setError('');
    try { await action(); await Promise.all([queryClient.invalidateQueries({ queryKey: ['hq', 'devices'] }), queryClient.invalidateQueries({ queryKey: ['hq', 'blocked'] }), queryClient.invalidateQueries({ queryKey: ['hq', 'audit'] })]); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'That did not work.'); }
  };
  return {
    error,
    signOut: (id: string) => run(() => jiibApi(`/api/hq/devices/${encodeURIComponent(id)}/revoke`, { method: 'POST' })),
    blockDevice: (id: string) => run(() => jiibApi(`/api/hq/devices/${encodeURIComponent(id)}/block`, { method: 'POST' })),
    unblockDevice: (id: string) => run(() => jiibApi(`/api/hq/devices/${encodeURIComponent(id)}/unblock`, { method: 'POST' })),
    blockAccount: (email: string, reason = '') => run(() => jiibApi('/api/hq/accounts/block', { method: 'POST', body: JSON.stringify({ email, reason }) })),
    unblockAccount: (email: string) => run(() => jiibApi(`/api/hq/accounts/${encodeURIComponent(email)}/block`, { method: 'DELETE' })),
  };
}

function statusBadges(device: Device) {
  return <>
    {device.blocked && <Badge tone="red">Blocked</Badge>}
    {!device.blocked && device.revoked && <Badge tone="amber">Signed out</Badge>}
    {device.isApp && <Badge tone="blue">App</Badge>}
  </>;
}

function DeviceDetail({ device, blockedEmails, onClose }: { device: Device; blockedEmails: Set<string>; onClose: () => void }) {
  const actions = useDeviceActions();
  const history = useQuery({ queryKey: ['hq', 'logins', device.deviceId], queryFn: () => jiibApi<{ at: string; email: string | null; role: string | null; ip: string | null }[]>(`/api/hq/devices/${encodeURIComponent(device.deviceId)}/logins`), retry: false });
  const accountBlocked = device.email ? blockedEmails.has(device.email.toLowerCase()) : false;
  const rows: [string, string][] = [
    ['Person', device.label || device.email || 'Parent / guardian'], ['Email', device.email ?? '—'], ['Role', device.role ?? '—'], ['School', device.schoolName ?? '—'],
    ['Device', `${device.deviceType} · ${device.os}`], ['Opened with', device.isApp ? 'Installed app' : device.browser], ['Address (IP)', device.ip ?? '—'],
    ['First seen', new Date(device.firstSeen).toLocaleString()], ['Last active', `${timeAgo(device.lastSeen)} (${new Date(device.lastSeen).toLocaleString()})`], ['Logins', String(device.loginCount)],
  ];
  return (
    <Drawer title="Device" onClose={onClose}>
      <div className="mb-4 flex flex-wrap items-center gap-2">{device.online ? <Badge tone="green">Online now</Badge> : <Badge>Offline</Badge>}{statusBadges(device)}{accountBlocked && <Badge tone="red">Account blocked</Badge>}</div>
      <dl className="divide-y divide-border rounded-xl border border-border">{rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 px-3 py-2 text-sm"><dt className="text-muted-foreground">{k}</dt><dd className="break-all text-right font-medium">{v}</dd></div>)}</dl>
      {actions.error && <p role="alert" className="mt-3 text-sm text-destructive">{actions.error}</p>}
      <div className="mt-4 grid gap-2">
        <button type="button" data-testid="hq-signout-device" disabled={device.revoked} onClick={() => { if (confirm('Sign this device out? They can log in again.')) void actions.signOut(device.deviceId); }} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted disabled:opacity-50"><LogOut size={16} /> {device.revoked ? 'Sign-out sent' : 'Sign this device out'}</button>
        {device.blocked
          ? <button type="button" onClick={() => void actions.unblockDevice(device.deviceId)} className="h-11 rounded-xl border border-border text-sm font-semibold hover:bg-muted">Unblock this device</button>
          : <button type="button" onClick={() => { if (confirm('Block this device? It cannot be used to log in until you unblock it.')) void actions.blockDevice(device.deviceId); }} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-destructive/40 text-sm font-semibold text-destructive hover:bg-destructive/5"><Ban size={16} /> Block this device</button>}
        {device.email && (accountBlocked
          ? <button type="button" onClick={() => void actions.unblockAccount(device.email!)} className="h-11 rounded-xl bg-primary text-sm font-semibold text-primary-foreground">Unblock account {device.email}</button>
          : <button type="button" data-testid="hq-block-account" onClick={() => { const reason = prompt(`Block the account ${device.email}? It will be signed out everywhere.\n\nReason (optional):`); if (reason !== null) void actions.blockAccount(device.email!, reason); }} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-destructive text-sm font-semibold text-destructive-foreground"><ShieldAlert size={16} /> Block account {device.email}</button>)}
      </div>
      <h3 className="mb-2 mt-6 text-sm font-semibold">Login history</h3>
      <QueryState query={history}>
        <ul className="divide-y divide-border rounded-xl border border-border text-sm">{(history.data ?? []).length ? (history.data ?? []).map((entry, index) => <li key={index} className="flex justify-between gap-3 px-3 py-2"><span>{entry.email ?? 'Parent / guardian'}</span><span className="text-muted-foreground">{new Date(entry.at).toLocaleString()}</span></li>) : <li className="px-3 py-3 text-muted-foreground">No logins recorded yet.</li>}</ul>
      </QueryState>
    </Drawer>
  );
}

export function DevicesSection({ hq, initialSchool = '' }: { hq: Hq; initialSchool?: string }) {
  const [search, setSearch] = useState('');
  const [school, setSchool] = useState(initialSchool);
  const [role, setRole] = useState('');
  const [status, setStatus] = useState<'all' | 'online' | 'out' | 'blocked' | 'suspicious'>('all');
  const [kind, setKind] = useState<'' | 'app' | 'browser'>('');
  const [open, setOpen] = useState<Device | null>(null);
  const devices = hq.devices.data ?? [];
  const blockedEmails = useMemo(() => new Set((hq.blocked.data ?? []).map((entry) => entry.email.toLowerCase())), [hq.blocked.data]);
  const suspicious = useMemo(() => suspiciousAccounts(devices), [devices]);
  const suspiciousEmails = new Set(suspicious.map((entry) => entry.email));
  const schools = [...new Map(devices.filter((d) => d.schoolId).map((d) => [d.schoolId!, d.schoolName ?? 'School'])).entries()];
  const roles = [...new Set(devices.map((d) => d.role).filter(Boolean))] as string[];

  const list = devices.filter((d) => {
    const text = `${d.label ?? ''} ${d.email ?? ''} ${d.schoolName ?? ''} ${d.ip ?? ''} ${d.os} ${d.browser}`.toLowerCase();
    return (!search || text.includes(search.toLowerCase()))
      && (!school || d.schoolId === school) && (!role || d.role === role)
      && (status === 'all' || (status === 'online' && d.online) || (status === 'out' && d.revoked && !d.blocked) || (status === 'blocked' && (d.blocked || (d.email ? blockedEmails.has(d.email.toLowerCase()) : false))) || (status === 'suspicious' && d.email && suspiciousEmails.has(d.email)))
      && (!kind || (kind === 'app') === d.isApp);
  });
  const chips: [typeof status, string][] = [['all', 'All'], ['online', `Online (${devices.filter((d) => d.online).length})`], ['out', 'Signed out'], ['blocked', 'Blocked'], ['suspicious', `Suspicious (${suspicious.length})`]];

  return (
    <div className="space-y-4">
      {hq.devices.isError && <Panel><p className="text-sm"><strong>Device tracking is not switched on yet.</strong> Run the setup script (hq-setup.sql) once in the Supabase SQL Editor, then refresh.</p></Panel>}
      <Panel>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="relative sm:col-span-2"><Search size={15} className="absolute left-3 top-3 text-muted-foreground" aria-hidden="true" /><input aria-label="Search devices" data-testid="hq-device-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, school, IP…" className={`${field} w-full pl-9`} /></label>
          <select aria-label="School" value={school} onChange={(e) => setSchool(e.target.value)} className={field}><option value="">All schools</option>{schools.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
          <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)} className={field}><option value="">All roles</option>{roles.map((r) => <option key={r}>{r}</option>)}</select>
          <select aria-label="App or browser" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={field}><option value="">App and browser</option><option value="app">Installed app</option><option value="browser">Browser</option></select>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">{chips.map(([key, label]) => <button key={key} type="button" onClick={() => setStatus(key)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{label}</button>)}</div>
      </Panel>
      {status === 'suspicious' && <Panel title="Why these are flagged"><p className="text-sm text-muted-foreground">These accounts signed in from three or more devices during the last 7 days.</p></Panel>}
      <QueryState query={hq.devices}>
        {list.length === 0 ? <Panel><p className="py-6 text-center text-sm text-muted-foreground">No devices match.</p></Panel> : (
          <>
            <div className="hidden overflow-hidden rounded-2xl border border-border bg-card lg:block">
              <table className="w-full text-left text-sm"><thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-3">Device</th><th className="px-4 py-3">Person</th><th className="px-4 py-3">School</th><th className="px-4 py-3">Address</th><th className="px-4 py-3">Last active</th><th className="px-4 py-3">Status</th></tr></thead>
                <tbody className="divide-y divide-border">{list.map((d) => <tr key={d.deviceId} data-testid={`hq-device-${d.deviceId}`} onClick={() => setOpen(d)} className="cursor-pointer hover:bg-muted/40">
                  <td className="px-4 py-3"><span className="flex items-center gap-2"><span className={d.online ? 'text-emerald-500' : 'text-muted-foreground'}><DeviceIcon type={d.deviceType} /></span><span>{d.os}<span className="block text-xs text-muted-foreground">{d.isApp ? 'Installed app' : d.browser}</span></span></span></td>
                  <td className="px-4 py-3">{d.label || d.email || 'Parent / guardian'}<span className="block text-xs text-muted-foreground">{d.role}</span></td>
                  <td className="px-4 py-3">{d.schoolName ?? '—'}</td><td className="px-4 py-3 text-xs text-muted-foreground">{d.ip ?? '—'}</td>
                  <td className="px-4 py-3">{d.online ? <span className="font-medium text-emerald-600">Online</span> : timeAgo(d.lastSeen)}</td>
                  <td className="px-4 py-3"><span className="flex flex-wrap gap-1">{statusBadges(d)}</span></td></tr>)}</tbody></table>
            </div>
            <ul className="space-y-2 lg:hidden">{list.map((d) => <li key={d.deviceId}><button type="button" onClick={() => setOpen(d)} className="flex w-full items-start gap-3 rounded-2xl border border-border bg-card p-3 text-left">
              <span className={`mt-0.5 ${d.online ? 'text-emerald-500' : 'text-muted-foreground'}`}><DeviceIcon type={d.deviceType} size={22} /></span>
              <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate font-semibold">{d.label || d.email || 'Parent / guardian'}</span><span className="shrink-0 text-xs text-muted-foreground">{d.online ? 'Online' : timeAgo(d.lastSeen)}</span></span>
                <span className="block truncate text-xs text-muted-foreground">{d.schoolName ?? '—'} · {d.role}</span><span className="block truncate text-xs text-muted-foreground">{d.os} · {d.isApp ? 'Installed app' : d.browser}</span>
                <span className="mt-1 flex flex-wrap gap-1">{statusBadges(d)}</span></span></button></li>)}</ul>
          </>
        )}
      </QueryState>
      {open && <DeviceDetail device={devices.find((d) => d.deviceId === open.deviceId) ?? open} blockedEmails={blockedEmails} onClose={() => setOpen(null)} />}
    </div>
  );
}
