// Separate workspaces for the Head teacher (a calm, view-only overview) and the Bursar (an accountant's ledger).
import { useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import {
  AlertTriangle, Award, Banknote, BarChart3, ClipboardList, Eye, FileBarChart, GraduationCap, LayoutDashboard, LogOut, Moon, Printer,
  Receipt, Settings, Sun, Users, UsersRound, Wallet,
} from 'lucide-react';

export type ShellProps = {
  schoolName: string;
  logoUrl?: string | null;
  userName: string;
  email: string;
  term: string;
  dark: boolean;
  online: boolean;
  location: string;
  onToggleDark: () => void;
  onSignOut: () => void;
  children: ReactNode;
};

const initials = (name: string) => name.split(' ').map((word) => word[0]).slice(0, 2).join('').toUpperCase() || '?';

function ProfileMenu({ userName, email, roleLabel, onSignOut }: { userName: string; email: string; roleLabel: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  return <div className="relative">
    <button type="button" data-testid="button-profile" aria-expanded={open} aria-label="Open user profile menu" onClick={() => setOpen((value) => !value)} className="grid h-9 w-9 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{initials(userName)}</button>
    {open && <div role="menu" className="absolute right-0 top-11 z-50 w-64 rounded-xl border border-border bg-card p-3 shadow-xl">
      <div className="border-b border-border px-2 pb-3"><p className="truncate text-sm font-semibold">{userName}</p><p className="truncate text-xs text-muted-foreground">{email}</p><p className="mt-1 text-xs font-semibold text-primary">{roleLabel}</p></div>
      <Link role="menuitem" href="/account-settings" onClick={() => setOpen(false)} className="mt-2 flex rounded-lg px-2 py-2 text-sm font-medium hover:bg-muted">Account settings</Link>
      <button type="button" role="menuitem" data-testid="button-sign-out" onClick={onSignOut} className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-destructive hover:bg-destructive/5"><LogOut size={14} /> Sign out</button>
    </div>}
  </div>;
}

const ThemeButton = ({ dark, onToggle }: { dark: boolean; onToggle: () => void }) => (
  <button type="button" data-testid="button-toggle-theme" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} aria-pressed={dark} onClick={onToggle} className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card hover:bg-muted">{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
);

/* ------------------------------------------------ Head teacher ------------------------------------------------ */
export const HEAD_TABS = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/students', label: 'Students', icon: UsersRound },
  { href: '/performance', label: 'Performance', icon: BarChart3 },
  { href: '/report-studio', label: 'Report cards', icon: ClipboardList },
  { href: '/print-marksheets', label: 'Marksheets', icon: Printer },
  { href: '/a-level-results', label: 'A-Level', icon: Award },
  { href: '/finance', label: 'Finance', icon: Wallet },
];

export function HeadTeacherShell({ schoolName, logoUrl, userName, email, term, dark, online, location, onToggleDark, onSignOut, children }: ShellProps) {
  return <div className="theme-head min-h-[100dvh] bg-background text-foreground" data-testid="shell-head-teacher">
    <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        {logoUrl ? <img src={logoUrl} alt="" className="h-9 w-9 rounded-lg object-contain" /> : <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground"><GraduationCap size={18} /></span>}
        <div className="min-w-0 flex-1"><p className="truncate font-display text-base font-semibold leading-tight">{schoolName}</p><p className="truncate text-[11px] text-muted-foreground">Head teacher · {term}</p></div>
        <span className="hidden items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[11px] font-semibold text-accent-foreground sm:inline-flex"><Eye size={12} /> View only</span>
        <span className={`hidden h-2 w-2 rounded-full sm:block ${online ? 'bg-[#61b990]' : 'bg-[#e6a23c]'}`} title={online ? 'Online' : 'Offline'} />
        <ThemeButton dark={dark} onToggle={onToggleDark} />
        <ProfileMenu userName={userName} email={email} roleLabel="Head teacher" onSignOut={onSignOut} />
      </div>
      <nav aria-label="Departments" className="mx-auto max-w-6xl overflow-x-auto px-4 sm:px-6">
        <ul className="flex min-w-max gap-1 pb-2">
          {HEAD_TABS.map(({ href, label, icon: Icon }) => {
            const active = location === href || (href === '/finance' && location.startsWith('/finance/'));
            return <li key={href}><Link href={href} data-testid={`tab-${label.toLowerCase().replaceAll(' ', '-')}`} aria-current={active ? 'page' : undefined} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}><Icon size={15} />{label}</Link></li>;
          })}
        </ul>
      </nav>
    </header>
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
  </div>;
}

/* -------------------------------------------------- Bursar ---------------------------------------------------- */
const BURSAR_NAV: Array<{ href: string; label: string; icon: typeof Wallet; soon?: boolean }> = [
  { href: '/finance', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/finance/fees', label: 'Fee structures', icon: FileBarChart },
  { href: '/finance/accounts', label: 'Student fees', icon: Users },
  { href: '/finance/payments', label: 'Record payment', icon: Banknote },
  { href: '/finance/defaulters', label: 'Defaulters', icon: AlertTriangle },
  { href: '/finance/reports', label: 'Reports', icon: Receipt },
  { href: '/students', label: 'Students (view)', icon: UsersRound },
];

export function BursarShell({ schoolName, logoUrl, userName, email, term, dark, online, location, onToggleDark, onSignOut, children }: ShellProps) {
  const current = BURSAR_NAV.find((item) => item.href === location);
  return <div className="theme-ledger flex min-h-[100dvh] bg-background text-foreground" data-testid="shell-bursar">
    <aside className="sticky top-0 hidden h-[100dvh] w-[248px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex h-[72px] items-center gap-3 border-b border-sidebar-border px-5">
        {logoUrl ? <img src={logoUrl} alt="" className="h-9 w-9 rounded-md bg-white/90 object-contain p-0.5" /> : <span className="grid h-9 w-9 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground"><Wallet size={18} /></span>}
        <div className="min-w-0"><p className="truncate font-display text-sm font-semibold leading-tight">{schoolName}</p><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-sidebar-primary">Bursar's office</p></div>
      </div>
      <nav aria-label="Finance" className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-5">
        {BURSAR_NAV.map(({ href, label, icon: Icon, soon }) => soon
          ? <span key={href} aria-disabled="true" className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-sidebar-foreground/45"><Icon size={16} />{label}<span className="ml-auto rounded bg-sidebar-accent px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">Soon</span></span>
          : <Link key={href} href={href} data-testid={`nav-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`} aria-current={location === href ? 'page' : undefined} className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition ${location === href ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_3px_0_0_hsl(var(--sidebar-primary))]' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60'}`}><Icon size={16} />{label}</Link>)}
      </nav>
      <div className="border-t border-sidebar-border p-4 text-xs"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-sidebar-primary">Current term</p><p className="mt-1 font-semibold">{term}</p><p className="mt-3 text-sidebar-foreground/60">All amounts in UGX</p></div>
    </aside>
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="sticky top-0 z-30 flex h-[64px] items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur-md sm:px-8">
        <div className="min-w-0 flex-1"><p className="truncate text-[10px] font-semibold uppercase tracking-[.2em] text-muted-foreground lg:hidden">{schoolName} · Bursar</p><h1 className="truncate font-display text-lg font-semibold">{current?.label ?? 'Finance'}</h1></div>
        <span className="hidden rounded border border-border bg-muted px-2.5 py-1 text-[11px] font-semibold ledger-figure sm:inline">UGX</span>
        <span className={`h-2 w-2 rounded-full ${online ? 'bg-[#2f9e6f]' : 'bg-[#e6a23c]'}`} title={online ? 'Online' : 'Offline'} />
        <ThemeButton dark={dark} onToggle={onToggleDark} />
        <ProfileMenu userName={userName} email={email} roleLabel="Bursar" onSignOut={onSignOut} />
      </header>
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-28 pt-6 sm:px-8 lg:pb-10">{children}</main>
      <nav aria-label="Finance quick links" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        {[BURSAR_NAV[0], BURSAR_NAV[6], { href: '/account-settings', label: 'Account', icon: Settings }].map(({ href, label, icon: Icon }) =>
          <Link key={href} href={href} aria-current={location === href ? 'page' : undefined} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${location === href ? 'text-primary' : 'text-muted-foreground'}`}><Icon size={19} />{label.replace(' (view)', '')}</Link>)}
      </nav>
    </div>
  </div>;
}
