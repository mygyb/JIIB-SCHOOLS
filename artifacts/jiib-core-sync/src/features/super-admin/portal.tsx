import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Inbox, LayoutDashboard, LogOut, RefreshCw, Settings2, Smartphone, UsersRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { HQ_PROOF_KEY, jiibApi } from '@/lib/jiib-api';
import { DevicesSection, InboxSection, Overview, SchoolsSection, SystemSection, UsersSection } from './sections';
import { useHq } from './shared';

const SECTIONS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'schools', label: 'Schools', icon: Building2 },
  { key: 'devices', label: 'Devices', icon: Smartphone },
  { key: 'users', label: 'Users', icon: UsersRound },
  { key: 'inbox', label: 'Inbox', icon: Inbox },
  { key: 'system', label: 'System', icon: Settings2 },
] as const;
type SectionKey = (typeof SECTIONS)[number]['key'];

const IDLE_MS = 30 * 60_000;

async function leave(setLocation: (path: string) => void) {
  try { await supabase?.auth.signOut(); } catch { /* already signed out */ }
  ['jiib.school', 'jiib.role', 'jiib.userName', 'jiib.email'].forEach((key) => localStorage.removeItem(key));
  sessionStorage.removeItem('jiib.launched');
  sessionStorage.removeItem(HQ_PROOF_KEY);
  setLocation('/');
}

export function SuperAdminPortal() {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [verified, setVerified] = useState(false);
  const hq = useHq();
  const section = (SECTIONS.find((s) => location === `/super-admin/${s.key}`)?.key ?? 'overview') as SectionKey;
  const go = (key: string) => setLocation(key === 'overview' ? '/super-admin' : `/super-admin/${key}`);

  // Only the verified system administrator ever sees this; everyone else is sent to the public home page.
  useEffect(() => {
    let cancelled = false;
    jiibApi<{ role: string }>('/api/auth/super-admin')
      .then((identity) => { if (identity.role !== 'super_admin') throw new Error('no'); if (!cancelled) setVerified(true); })
      .catch(() => { if (!cancelled) void leave(setLocation); });
    return () => { cancelled = true; };
  }, [setLocation]);

  // Sign out after 30 minutes without activity.
  useEffect(() => {
    if (!verified) return;
    let timer = window.setTimeout(() => void leave(setLocation), IDLE_MS);
    const reset = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void leave(setLocation), IDLE_MS); };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    events.forEach((name) => window.addEventListener(name, reset, { passive: true }));
    return () => { window.clearTimeout(timer); events.forEach((name) => window.removeEventListener(name, reset)); };
  }, [verified, setLocation]);

  useEffect(() => {
    document.title = 'Administration';
    const robots = document.createElement('meta');
    robots.name = 'robots'; robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
    return () => { robots.remove(); };
  }, []);

  if (!verified) return <div className="min-h-screen bg-background" aria-busy="true" />;
  const title = SECTIONS.find((s) => s.key === section)?.label ?? 'Overview';

  return (
    <div className="min-h-screen bg-background text-foreground lg:flex">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card p-4 lg:flex">
        <div className="mb-6 flex items-center gap-3 px-2"><img src="/icons/icon-192.png" alt="" width={36} height={36} className="h-9 w-9 rounded-xl" /><span className="font-display text-lg font-semibold">J-SCHOOLS</span></div>
        <nav className="space-y-1" aria-label="Administration">{SECTIONS.map(({ key, label, icon: Icon }) => <button key={key} type="button" data-testid={`hq-nav-${key}`} onClick={() => go(key)} aria-current={section === key ? 'page' : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${section === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}><Icon size={18} aria-hidden="true" /> {label}</button>)}</nav>
        <button type="button" data-testid="hq-signout" onClick={() => void leave(setLocation)} className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/5"><LogOut size={18} aria-hidden="true" /> Sign out</button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur sm:px-6">
          <h1 className="font-display text-xl font-semibold">{title}</h1>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Refresh" onClick={() => void queryClient.invalidateQueries({ queryKey: ['hq'] })} className="grid h-10 w-10 place-items-center rounded-xl border border-border hover:bg-muted"><RefreshCw size={16} /></button>
            <button type="button" aria-label="Sign out" onClick={() => void leave(setLocation)} className="grid h-10 w-10 place-items-center rounded-xl border border-border text-destructive hover:bg-destructive/5 lg:hidden"><LogOut size={16} /></button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 pb-24 sm:p-6 lg:pb-8">
          {section === 'overview' && <Overview hq={hq} go={go} />}
          {section === 'schools' && <SchoolsSection hq={hq} />}
          {section === 'devices' && <DevicesSection hq={hq} />}
          {section === 'users' && <UsersSection hq={hq} />}
          {section === 'inbox' && <InboxSection hq={hq} />}
          {section === 'system' && <SystemSection hq={hq} />}
        </main>
        <nav aria-label="Administration" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
          {SECTIONS.map(({ key, label, icon: Icon }) => <button key={key} type="button" data-testid={`hq-tab-${key}`} onClick={() => go(key)} aria-current={section === key ? 'page' : undefined} className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ${section === key ? 'text-primary' : 'text-muted-foreground'}`}><Icon size={20} aria-hidden="true" />{label}</button>)}
        </nav>
      </div>
    </div>
  );
}
