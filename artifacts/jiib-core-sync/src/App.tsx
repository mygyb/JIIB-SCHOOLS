import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation } from 'wouter';
import {
  Activity, ArrowRight, BarChart3, BookOpen, Building2, Check, ChevronDown, CircleAlert,
  ClipboardList, GraduationCap, House, Inbox, LayoutDashboard, Loader2, LogOut, Menu,
  MessageSquare, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Settings, ShieldCheck,
  SlidersHorizontal, Trash2, UserRound, UsersRound, X, Send, PanelLeftClose,
} from 'lucide-react';
import {
  getGetDashboardSummaryQueryKey, getGetSchoolBySlugQueryKey, getGetSchoolConfigQueryKey,
  getListMarksQueryKey, getListMessagesQueryKey, getListStudentsQueryKey, getHealthCheckQueryKey,
  useCreateMessage, useCreateStudent, useDeleteStudent, useGetDashboardSummary, useGetSchoolBySlug,
  useGetSchoolConfig, useHealthCheck, useListMarks, useListMessages, useListStudents,
  useUpdateSchoolConfig, useUpdateStudent, useUpsertMark,
} from '@workspace/api-client-react';
import type { Mark, Message, School, Student } from '@workspace/api-client-react';
import { Bar } from 'react-chartjs-2';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { supabase } from '@/lib/supabase';

const queryClient = new QueryClient();
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);
const DEFAULT_SCHOOL = { id: '00000000-0000-0000-0000-000000000000', name: 'JIIB Core Sync', slug: 'demo-school', active: true } as School;
const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/students', label: 'Students', icon: UsersRound },
  { href: '/marks', label: 'Marks register', icon: ClipboardList },
  { href: '/messages', label: 'Messages', icon: Inbox },
  { href: '/settings', label: 'School settings', icon: Settings },
];

function useActiveSchool() {
  const [school] = useState<School>(() => {
    try { return JSON.parse(localStorage.getItem('jiib.school') || 'null') || DEFAULT_SCHOOL; } catch { return DEFAULT_SCHOOL; }
  });
  return school;
}

function initials(name: string) {
  return name.split(' ').map((word) => word[0]).slice(0, 2).join('').toUpperCase();
}

function fmtDate(value?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function Router() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/" component={SignIn} />
        <Route path="/dashboard"><AppShell><Dashboard /></AppShell></Route>
        <Route path="/students"><AppShell><Students /></AppShell></Route>
        <Route path="/marks"><AppShell><Marks /></AppShell></Route>
        <Route path="/messages"><AppShell><Messages /></AppShell></Route>
        <Route path="/settings"><AppShell><SettingsPage /></AppShell></Route>
        <Route path="/parent"><AppShell><Parent /></AppShell></Route>
        <Route path="/super-admin"><AppShell><SuperAdmin /></AppShell></Route>
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function SignIn() {
  const [, setLocation] = useLocation();
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('School administrator');
  const [submitted, setSubmitted] = useState(false);
  const [authError, setAuthError] = useState('');
  const schoolQuery = useGetSchoolBySlug(slug.trim().toLowerCase(), {
    query: { enabled: submitted && Boolean(slug.trim()), queryKey: getGetSchoolBySlugQueryKey(slug.trim().toLowerCase()) },
  });
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } });
  const resolve = async (event: FormEvent) => {
    event.preventDefault();
    if (!slug.trim()) return;
    setAuthError('');
    if (role !== 'Parent / guardian' && supabase) {
      if (!email.trim() || !password) {
        setAuthError('Enter your staff email and password to continue.');
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setAuthError(error.message);
        return;
      }
    }
    setSubmitted(true);
  };
  if (submitted && schoolQuery.isSuccess) {
    localStorage.setItem('jiib.school', JSON.stringify(schoolQuery.data));
    setLocation(role === 'Parent / guardian' ? '/parent' : role === 'Super administrator' ? '/super-admin' : '/dashboard');
  }
  return (
    <main className="min-h-[100dvh] overflow-hidden bg-[#edf2f6] text-foreground">
      <div className="grid min-h-[100dvh] lg:grid-cols-[minmax(390px,0.8fr)_1.2fr]">
        <section className="relative hidden overflow-hidden bg-[#172b43] p-12 text-[#eff4f6] lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 app-grid opacity-[.12]" />
          <div className="relative z-10 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#f3bb52] text-[#172b43]"><GraduationCap size={23} strokeWidth={2.5} /></div>
            <div><div className="font-display text-xl font-semibold tracking-tight">JIIB</div><div className="text-[10px] uppercase tracking-[.24em] text-[#aebdca]">Core Sync</div></div>
          </div>
          <div className="relative z-10 max-w-md">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[.22em] text-[#f3bb52]">The school operating record</p>
            <h1 className="font-display text-5xl font-semibold leading-[1.03] tracking-[-.04em]">A clearer day for every school team.</h1>
            <p className="mt-6 max-w-sm text-base leading-7 text-[#b8c7d2]">One trusted workspace for enrolment, marks, family communication, and the decisions that keep a school moving.</p>
          </div>
          <div className="relative z-10 flex items-center justify-between text-xs text-[#8fa5b7]">
            <span>Operational workspace · v0.1</span>
            <span className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${health.isSuccess ? 'bg-[#61c69a]' : 'bg-[#f3bb52]'}`} /> {health.isSuccess ? 'Systems operational' : 'Connecting to services'}</span>
          </div>
        </section>
        <section className="relative flex items-center justify-center p-6 sm:p-12">
          <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-[#f3bb52]/20 blur-3xl" />
          <div className="relative w-full max-w-[440px] fade-up">
            <div className="mb-10 flex items-center gap-3 lg:hidden">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground"><GraduationCap size={22} /></div>
              <div><div className="font-display text-xl font-semibold">JIIB</div><div className="text-[10px] uppercase tracking-[.24em] text-muted-foreground">Core Sync</div></div>
            </div>
            <div className="mb-9">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[.2em] text-primary">Welcome back</p>
              <h2 className="font-display text-4xl font-semibold tracking-[-.04em]">Open your school workspace.</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">Resolve your school first, then continue to the right view for your role.</p>
            </div>
              <form onSubmit={resolve} className="space-y-6">
               {role !== 'Parent / guardian' && <div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="mb-2 block text-sm font-semibold">Staff email</span><input data-testid="input-login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.org" className="h-12 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label><label className="block"><span className="mb-2 block text-sm font-semibold">Password</span><input data-testid="input-login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" className="h-12 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label></div>}
              <label className="block"><span className="mb-2 block text-sm font-semibold">School slug</span><div className="flex items-center rounded-xl border border-input bg-card px-3 shadow-sm focus-within:ring-2 focus-within:ring-ring"><span className="text-sm text-muted-foreground">jiib.school/</span><input data-testid="input-school-slug" autoFocus value={slug} onChange={(e) => { setSlug(e.target.value); setSubmitted(false); }} placeholder="northbridge" className="h-12 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none" /></div></label>
              <label className="block"><span className="mb-2 block text-sm font-semibold">Continue as</span><select data-testid="select-role" value={role} onChange={(e) => setRole(e.target.value)} className="h-12 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"><option>School administrator</option><option>Teacher</option><option>Parent / guardian</option><option>Super administrator</option></select></label>
              {submitted && schoolQuery.isPending && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" /> Looking up your school…</div>}
              {submitted && schoolQuery.isError && <div data-testid="error-school-resolution" className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">We couldn’t find that school. Check the slug and try again.</div>}
               {authError && <div data-testid="error-login" className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{authError}</div>}
              <button data-testid="button-open-workspace" className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:bg-primary/90" type="submit">Open workspace <ArrowRight size={17} /></button>
            </form>
            <p className="mt-8 text-center text-xs leading-5 text-muted-foreground">Need access to a different school? Ask your system administrator for its workspace slug.</p>
          </div>
        </section>
      </div>
    </main>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const school = useActiveSchool();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const title = location === '/dashboard' ? 'Overview' : location === '/students' ? 'Students' : location === '/marks' ? 'Marks register' : location === '/messages' ? 'Messages' : location === '/settings' ? 'School settings' : location === '/parent' ? 'Family view' : 'Portfolio';
  return (
    <div className="flex min-h-[100dvh] bg-background">
      {open && <button aria-label="Close navigation" data-testid="button-close-mobile-nav" className="fixed inset-0 z-30 bg-[#172b43]/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`${open ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'lg:w-[76px]' : 'lg:w-[248px]'} fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-200 lg:relative lg:translate-x-0`}>
        <div className="flex h-[78px] items-center justify-between border-b border-sidebar-border px-5">
          <Link href="/dashboard" data-testid="link-brand" className={`flex items-center gap-3 ${collapsed ? 'lg:mx-auto' : ''}`}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><GraduationCap size={21} /></span>{!collapsed && <span><span className="block font-display text-lg font-semibold tracking-tight">JIIB</span><span className="block text-[9px] uppercase tracking-[.22em] text-sidebar-foreground/60">Core Sync</span></span>}</Link>
          <button data-testid="button-close-nav" onClick={() => { setCollapsed(!collapsed); setOpen(false); }} className="hidden rounded-lg p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground lg:block">{collapsed ? <Menu size={17} /> : <PanelLeftClose size={17} />}</button>
        </div>
        <div className={`mx-3 mt-5 rounded-xl bg-sidebar-accent/70 p-3 ${collapsed ? 'lg:p-2' : ''}`}><div className="flex items-center gap-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sidebar-primary/15 text-xs font-bold text-sidebar-primary">{initials(school.name)}</span>{!collapsed && <div className="min-w-0"><p data-testid="text-active-school" className="truncate text-sm font-semibold">{school.name}</p><p className="mt-0.5 text-[10px] uppercase tracking-widest text-sidebar-foreground/50">Active school</p></div>}</div></div>
        <nav className="mt-7 flex-1 space-y-1 px-3">{navItems.map(({ href, label, icon: Icon }) => <Link href={href} key={href} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`} onClick={() => setOpen(false)} className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${location === href ? 'bg-sidebar-primary font-semibold text-sidebar-primary-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground'} ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}><Icon size={18} strokeWidth={location === href ? 2.4 : 1.8} />{!collapsed && <span>{label}</span>}{href === '/messages' && !collapsed && <span className="ml-auto rounded-full bg-sidebar-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-sidebar-primary">3</span>}</Link>)}
          <div className="my-5 border-t border-sidebar-border" />
          <Link href="/parent" data-testid="link-nav-family-view" className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/65 transition hover:bg-sidebar-accent hover:text-sidebar-foreground ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}><UserRound size={18} />{!collapsed && <span>Family view</span>}</Link>
          <Link href="/super-admin" data-testid="link-nav-portfolio" className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/65 transition hover:bg-sidebar-accent hover:text-sidebar-foreground ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}><ShieldCheck size={18} />{!collapsed && <span>Portfolio admin</span>}</Link>
        </nav>
        {!collapsed && <div className="border-t border-sidebar-border p-4"><div className="rounded-xl bg-[#102238] p-3"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-sidebar-primary">Current term</p><p className="mt-1 text-sm font-semibold">2024 / 25 · Term 2</p><p className="mt-1 text-xs text-sidebar-foreground/55">12 weeks remaining</p></div><button data-testid="button-sign-out" onClick={() => setLocation('/')} className="mt-4 flex w-full items-center gap-2 px-1 text-xs text-sidebar-foreground/55 hover:text-sidebar-foreground"><LogOut size={14} /> Sign out</button></div>}
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-[78px] items-center justify-between border-b border-border bg-background/90 px-5 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3"><button data-testid="button-open-mobile-nav" onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-muted lg:hidden"><Menu size={20} /></button><div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-muted-foreground">Workspace</p><h1 data-testid="text-page-title" className="font-display text-xl font-semibold tracking-tight">{title}</h1></div></div>
          <div className="flex items-center gap-3"><div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground sm:flex"><span className="h-2 w-2 rounded-full bg-[#61b990]" /> Data synced 2m ago</div><button data-testid="button-profile" className="grid h-9 w-9 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{initials('Amina Cole')}</button></div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] p-5 sm:p-8">{children}</main>
      </div>
    </div>
  );
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.22em] text-primary">{eyebrow}</p><h2 className="font-display text-3xl font-semibold tracking-[-.035em] sm:text-4xl">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p></div>{action}</div>;
}

function SkeletonBlock({ className = '' }: { className?: string }) { return <div className={`animate-pulse rounded-xl bg-muted ${className}`} />; }
function ErrorState({ retry }: { retry: () => void }) { return <div data-testid="state-error" className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center"><CircleAlert className="mx-auto text-destructive" size={26} /><p className="mt-3 font-semibold">This section couldn’t load</p><p className="mt-1 text-sm text-muted-foreground">The service may be taking a moment. Try again.</p><button data-testid="button-retry" onClick={retry} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted"><RefreshCw size={15} /> Retry</button></div>; }
function EmptyState({ icon: Icon, title, body, action }: { icon: typeof Inbox; title: string; body: string; action?: ReactNode }) { return <div data-testid="state-empty" className="rounded-2xl border border-dashed border-border bg-card/60 p-12 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon size={23} /></div><p className="mt-4 font-display text-lg font-semibold">{title}</p><p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{body}</p>{action && <div className="mt-5">{action}</div>}</div>; }

function Dashboard() {
  const school = useActiveSchool();
  const summary = useGetDashboardSummary(school.id, { query: { queryKey: getGetDashboardSummaryQueryKey(school.id) } });
  const data = summary.data;
  const completion = data ? Math.round((data.marksEntered / Math.max(data.marksExpected, 1)) * 100) : 0;
  return <div className="fade-up"><PageHeader eyebrow="Monday · 14 October 2024" title={`Good morning, Amina`} description={`Here’s the operating picture for ${school.name}.`} action={<button data-testid="button-dashboard-refresh" onClick={() => summary.refetch()} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted"><RefreshCw size={15} /> Refresh</button>} />
    {summary.isLoading ? <div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map((item) => <SkeletonBlock key={item} className="h-32" />)}</div> : summary.isError ? <ErrorState retry={() => summary.refetch()} /> : data ? <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[{ label: 'Students enrolled', value: data.studentCount, icon: UsersRound, tone: 'text-primary' }, { label: 'Active classes', value: data.classCount, icon: BookOpen, tone: 'text-[#2e8c72]' }, { label: 'Marks entered', value: `${data.marksEntered}/${data.marksExpected}`, icon: BarChart3, tone: 'text-[#c88e17]' }, { label: 'Houses', value: data.houses.length, icon: Building2, tone: 'text-[#a44f47]' }].map(({ label, value, icon: Icon, tone }) => <div key={label} data-testid={`card-metric-${label.toLowerCase().replaceAll(' ', '-')}`} className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_hsl(var(--foreground)/.03)]"><div className="flex items-start justify-between"><p className="text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">{label}</p><Icon size={18} className={tone} /></div><p className="mt-5 font-display text-3xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label === 'Marks entered' ? `${completion}% complete this term` : 'Across the active school'}</p></div>)}</div>
       <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_.9fr]"><section className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex items-center justify-between"><div><h3 className="font-display text-lg font-semibold">Marks completion</h3><p className="mt-1 text-sm text-muted-foreground">Assessment entry across the current term.</p></div><span className="font-display text-2xl font-semibold text-primary">{completion}%</span></div><div className="mt-7 h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${completion}%` }} /></div><div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>{data.marksEntered} entries recorded</span><span>{data.marksExpected - data.marksEntered} remaining</span></div><div className="mt-8 h-52"><Bar data={{ labels: data.houses.map((house) => house.label), datasets: [{ label: 'Students', data: data.houses.map((house) => house.count), backgroundColor: '#d3a237', borderRadius: 7, barThickness: 22 }] }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } } }} /></div></section><section className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex items-center justify-between"><div><h3 className="font-display text-lg font-semibold">Recent activity</h3><p className="mt-1 text-sm text-muted-foreground">What changed recently.</p></div><Activity size={18} className="text-muted-foreground" /></div>{data.recentActivity.length ? <div className="mt-5 space-y-4">{data.recentActivity.slice(0, 5).map((item) => <div key={item.id} data-testid={`activity-${item.id}`} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" /><div className="min-w-0"><p className="text-sm leading-5">{item.label}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{item.detail} · {fmtDate(item.createdAt)}</p></div></div>)}</div> : <p className="mt-6 text-sm text-muted-foreground">No recent activity yet.</p>}</section></div>
    </> : <EmptyState icon={LayoutDashboard} title="Your overview is quiet" body="Once your school has records, the operating picture will appear here." />}
  </div>;
}

function Students() {
  const school = useActiveSchool();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [house, setHouse] = useState('');
  const [editing, setEditing] = useState<Student | null>(null);
  const [showForm, setShowForm] = useState(false);
  const query = useListStudents(school.id, { search: search || undefined, house: house || undefined });
  const create = useCreateStudent(); const update = useUpdateStudent(); const remove = useDeleteStudent();
  const students = query.data || [];
  const saveStudent = (payload: { name: string; className: string; house: string; parentPhone?: string | null; badges?: string[] }) => {
    if (editing) update.mutate({ schoolId: school.id, studentId: editing.id, data: payload }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListStudentsQueryKey(school.id) }); setEditing(null); setShowForm(false); } });
    else create.mutate({ schoolId: school.id, data: payload }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListStudentsQueryKey(school.id) }); setShowForm(false); } });
  };
  const deleteStudent = (student: Student) => { if (window.confirm(`Remove ${student.name} from the school register?`)) remove.mutate({ schoolId: school.id, studentId: student.id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListStudentsQueryKey(school.id) }) }); };
  return <div className="fade-up"><PageHeader eyebrow="School register" title="Students" description="Keep the school register accurate, searchable, and ready for every team." action={<button data-testid="button-add-student" onClick={() => { setEditing(null); setShowForm(true); }} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"><Plus size={16} /> Add student</button>} />
    <div className="mb-5 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search size={17} className="absolute left-3 top-3.5 text-muted-foreground" /><input data-testid="input-student-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by student name" className="h-11 w-full rounded-xl border border-input bg-card pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></div><select data-testid="select-student-house" value={house} onChange={(e) => setHouse(e.target.value)} className="h-11 rounded-xl border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"><option value="">All houses</option><option value="Atlas">Atlas</option><option value="Beacon">Beacon</option><option value="Cedar">Cedar</option></select><button data-testid="button-filter-students" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-input bg-card px-4 text-sm font-semibold hover:bg-muted"><SlidersHorizontal size={15} /> Filters</button></div>
    <div className="overflow-hidden rounded-2xl border border-border bg-card">{query.isLoading ? <div className="space-y-3 p-5">{[1, 2, 3, 4].map((item) => <SkeletonBlock key={item} className="h-14" />)}</div> : query.isError ? <div className="p-5"><ErrorState retry={() => query.refetch()} /></div> : students.length === 0 ? <EmptyState icon={UsersRound} title="No students match" body={search ? 'Try a different search term or clear the filters.' : 'Your register is ready for its first student.'} action={!search ? <button data-testid="button-empty-add-student" onClick={() => setShowForm(true)} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Add first student</button> : undefined} /> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead className="border-b border-border bg-muted/45 text-[10px] uppercase tracking-[.16em] text-muted-foreground"><tr><th className="px-5 py-4 font-bold">Student</th><th className="px-5 py-4 font-bold">Class</th><th className="px-5 py-4 font-bold">House</th><th className="px-5 py-4 font-bold">Parent contact</th><th className="px-5 py-4 text-right font-bold">Actions</th></tr></thead><tbody className="divide-y divide-border">{students.map((student) => <tr key={student.id} data-testid={`row-student-${student.id}`} className="group transition hover:bg-muted/25"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{initials(student.name)}</span><div><p data-testid={`text-student-${student.id}`} className="text-sm font-semibold">{student.name}</p><p className="mt-0.5 text-xs text-muted-foreground">Joined {fmtDate(student.createdAt)}</p></div></div></td><td className="px-5 py-4 text-sm">{student.className}</td><td className="px-5 py-4"><span className="rounded-full bg-[#f7edcf] px-2.5 py-1 text-xs font-semibold text-[#87631c]">{student.house}</span></td><td className="px-5 py-4 text-sm text-muted-foreground">{student.parentPhone || 'Not provided'}</td><td className="px-5 py-4"><div className="flex justify-end gap-1 opacity-70 group-hover:opacity-100"><button data-testid={`button-edit-student-${student.id}`} onClick={() => { setEditing(student); setShowForm(true); }} className="rounded-lg p-2 hover:bg-muted"><Pencil size={15} /></button><button data-testid={`button-delete-student-${student.id}`} onClick={() => deleteStudent(student)} className="rounded-lg p-2 text-destructive hover:bg-destructive/10"><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div>}</div>
    {showForm && <StudentDialog student={editing} pending={create.isPending || update.isPending} onClose={() => { setShowForm(false); setEditing(null); }} onSave={saveStudent} />}
  </div>;
}

function StudentDialog({ student, pending, onClose, onSave }: { student: Student | null; pending: boolean; onClose: () => void; onSave: (data: { name: string; className: string; house: string; parentPhone?: string | null; badges?: string[] }) => void }) {
  const [name, setName] = useState(student?.name || ''); const [className, setClassName] = useState(student?.className || ''); const [house, setHouse] = useState(student?.house || ''); const [parentPhone, setParentPhone] = useState(student?.parentPhone || '');
  const submit = (event: FormEvent) => { event.preventDefault(); if (name.trim() && className.trim() && house.trim()) onSave({ name: name.trim(), className: className.trim(), house: house.trim(), parentPhone: parentPhone.trim() || null }); };
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#172b43]/45 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">{student ? 'Update record' : 'New record'}</p><h3 className="mt-1 font-display text-2xl font-semibold">{student ? 'Edit student' : 'Add student'}</h3></div><button data-testid="button-close-student-dialog" onClick={onClose} className="rounded-lg p-2 hover:bg-muted"><X size={18} /></button></div><form onSubmit={submit} className="mt-6 space-y-4"><Field label="Full name" value={name} onChange={setName} testId="input-student-name" required /><div className="grid gap-4 sm:grid-cols-2"><Field label="Class" value={className} onChange={setClassName} testId="input-student-class" required /><Field label="House" value={house} onChange={setHouse} testId="input-student-house-form" required /></div><Field label="Parent phone" value={parentPhone} onChange={setParentPhone} testId="input-student-parent-phone" /><div className="flex justify-end gap-3 pt-3"><button type="button" data-testid="button-cancel-student" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">Cancel</button><button disabled={pending} data-testid="button-save-student" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">{pending && <Loader2 size={15} className="animate-spin" />} {student ? 'Save changes' : 'Create student'}</button></div></form></div></div>;
}
function Field({ label, value, onChange, testId, required = false }: { label: string; value: string; onChange: (value: string) => void; testId: string; required?: boolean }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span><input data-testid={testId} required={required} value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>; }

function Marks() {
  const school = useActiveSchool(); const qc = useQueryClient(); const [term, setTerm] = useState('2024-T2'); const [className, setClassName] = useState(''); const [subject, setSubject] = useState(''); const [search, setSearch] = useState('');
  const config = useGetSchoolConfig(school.id, { query: { queryKey: getGetSchoolConfigQueryKey(school.id) } }); const studentsQuery = useListStudents(school.id, { className: className || undefined, search: search || undefined }); const marksQuery = useListMarks(school.id, { termKey: term, className: className || undefined, subject: subject || undefined }); const upsert = useUpsertMark();
  const subjects = Array.isArray(config.data?.data?.subjects) ? config.data.data.subjects as string[] : ['English', 'Mathematics', 'Science', 'Social Studies'];
  const students = studentsQuery.data || []; const marks = marksQuery.data || [];
  const getMark = (studentId: string) => marks.find((mark) => mark.studentId === studentId && (!subject || mark.subject === subject));
  const save = (student: Student, key: 'aoi' | 'midterm' | 'end', value: string) => { const existing = getMark(student.id); const payload = { studentId: student.id, termKey: term, subject: subject || existing?.subject || subjects[0], aoi: existing?.aoi || 0, midterm: existing?.midterm || 0, end: existing?.end || 0, [key]: value === '' ? 0 : Number(value) }; upsert.mutate({ schoolId: school.id, data: payload }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListMarksQueryKey(school.id, { termKey: term, className: className || undefined, subject: subject || undefined }) }) }); };
  return <div className="fade-up"><PageHeader eyebrow="Assessment desk" title="Marks register" description="Enter, review, and keep assessment records moving by class and subject." action={<div className="flex items-center gap-2 rounded-lg border border-[#e4c66e] bg-[#fff7d9] px-3 py-2 text-xs font-semibold text-[#755817]"><span className="h-2 w-2 rounded-full bg-[#d3a237]" /> Autosave is on</div>} />
    <div className="mb-5 grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[1fr_1fr_1fr_1.3fr]"><label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Term</span><select data-testid="select-mark-term" value={term} onChange={(e) => setTerm(e.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm"><option value="2024-T2">2024 / 25 · Term 2</option><option value="2024-T1">2024 / 25 · Term 1</option><option value="2023-T3">2023 / 24 · Term 3</option></select></label><label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Class</span><input data-testid="input-mark-class" value={className} onChange={(e) => setClassName(e.target.value)} placeholder="All classes" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" /></label><label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Subject</span><select data-testid="select-mark-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm"><option value="">All subjects</option>{subjects.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Find student</span><div className="relative"><Search size={15} className="absolute left-3 top-3 text-muted-foreground" /><input data-testid="input-mark-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or student ID" className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm" /></div></label></div>
    <div className="overflow-hidden rounded-2xl border border-border bg-card">{studentsQuery.isLoading || marksQuery.isLoading ? <div className="space-y-3 p-5">{[1, 2, 3, 4].map((item) => <SkeletonBlock key={item} className="h-14" />)}</div> : studentsQuery.isError || marksQuery.isError ? <div className="p-5"><ErrorState retry={() => { studentsQuery.refetch(); marksQuery.refetch(); }} /></div> : students.length === 0 ? <EmptyState icon={ClipboardList} title="Nothing to enter yet" body="Students matching this class and search will appear here." /> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="border-b border-border bg-muted/45 text-[10px] uppercase tracking-[.16em] text-muted-foreground"><tr><th className="px-5 py-4 font-bold">Student</th><th className="px-3 py-4 font-bold">AOI <span className="font-normal normal-case tracking-normal">(20)</span></th><th className="px-3 py-4 font-bold">Midterm <span className="font-normal normal-case tracking-normal">(30)</span></th><th className="px-3 py-4 font-bold">End <span className="font-normal normal-case tracking-normal">(50)</span></th><th className="px-5 py-4 text-right font-bold">Total</th></tr></thead><tbody className="divide-y divide-border">{students.map((student) => { const mark = getMark(student.id); const total = (mark?.aoi || 0) + (mark?.midterm || 0) + (mark?.end || 0); return <tr key={student.id} data-testid={`row-mark-${student.id}`}><td className="px-5 py-3"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">{initials(student.name)}</span><div><p className="text-sm font-semibold">{student.name}</p><p className="text-xs text-muted-foreground">{student.className} · {mark?.subject || subject || subjects[0]}</p></div></div></td>{(['aoi', 'midterm', 'end'] as const).map((key) => <td key={key} className="px-3 py-3"><input data-testid={`input-mark-${key}-${student.id}`} type="number" min="0" max={key === 'aoi' ? 20 : key === 'midterm' ? 30 : 50} defaultValue={mark?.[key] || ''} onBlur={(e) => save(student, key, e.target.value)} className="h-9 w-20 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring" /></td>)}<td className="px-5 py-3 text-right"><span className={`font-display text-lg font-semibold ${total >= 50 ? 'text-[#2e8c72]' : 'text-foreground'}`}>{total}</span><span className="ml-1 text-xs text-muted-foreground">/ 100</span></td></tr>; })}</tbody></table></div>}</div>
  </div>;
}

function Messages() {
  const school = useActiveSchool(); const qc = useQueryClient(); const query = useListMessages(school.id, { query: { queryKey: getListMessagesQueryKey(school.id) } }); const create = useCreateMessage(); const [draft, setDraft] = useState(''); const [filter, setFilter] = useState('all'); const messages = query.data || []; const filtered = messages.filter((item) => filter === 'all' || (filter === 'unread' ? !item.read : item.direction === filter));
  const send = (event: FormEvent) => { event.preventDefault(); if (!draft.trim()) return; create.mutate({ schoolId: school.id, data: { message: draft.trim() } }, { onSuccess: () => { setDraft(''); qc.invalidateQueries({ queryKey: getListMessagesQueryKey(school.id) }); } }); };
  return <div className="fade-up"><PageHeader eyebrow="Communication centre" title="Messages" description="A focused inbox for school-to-family communication and follow-up." action={<div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1"><button data-testid="button-filter-all" onClick={() => setFilter('all')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${filter === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>All</button><button data-testid="button-filter-unread" onClick={() => setFilter('unread')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${filter === 'unread' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Unread</button></div>} />
    <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><section className="overflow-hidden rounded-2xl border border-border bg-card">{query.isLoading ? <div className="space-y-4 p-5">{[1, 2, 3].map((item) => <SkeletonBlock key={item} className="h-24" />)}</div> : query.isError ? <div className="p-5"><ErrorState retry={() => query.refetch()} /></div> : filtered.length === 0 ? <EmptyState icon={MessageSquare} title="Your inbox is clear" body="New school conversations will appear here." /> : <div className="divide-y divide-border">{filtered.map((message) => <div key={message.id} data-testid={`message-${message.id}`} className={`p-5 transition hover:bg-muted/25 ${!message.read ? 'bg-[#fffaf0]' : ''}`}><div className="flex gap-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold ${message.direction === 'in' ? 'bg-[#e6eef4] text-primary' : 'bg-primary text-primary-foreground'}`}>{initials(message.senderName)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{message.senderName}{!message.read && <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" />}</p><span className="text-xs text-muted-foreground">{fmtDate(message.createdAt)}</span></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{message.message}</p><p className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{message.direction === 'in' ? 'Received' : 'Sent'} {message.senderEmail ? `· ${message.senderEmail}` : ''}</p></div></div></div>)}</div>}</section><section className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/25 text-[#87631c]"><Send size={16} /></div><div><h3 className="font-display text-lg font-semibold">Start a message</h3><p className="text-xs text-muted-foreground">Send to the school communication thread.</p></div></div><form onSubmit={send} className="mt-6"><textarea data-testid="textarea-message" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a clear, considerate message…" rows={7} className="w-full resize-none rounded-xl border border-input bg-background p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring" /><div className="mt-3 flex items-center justify-between"><span className="text-xs text-muted-foreground">{draft.length}/5000</span><button data-testid="button-send-message" disabled={!draft.trim() || create.isPending} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{create.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send message</button></div></form></section></div>
  </div>;
}

function SettingsPage() {
  const school = useActiveSchool(); const qc = useQueryClient(); const config = useGetSchoolConfig(school.id, { query: { queryKey: getGetSchoolConfigQueryKey(school.id) } }); const update = useUpdateSchoolConfig(); const [saved, setSaved] = useState(false); const data = config.data?.data || {}; const initialSubjects = Array.isArray(data.subjects) ? data.subjects as string[] : ['English', 'Mathematics', 'Science', 'Social Studies']; const initialTerms = Array.isArray(data.terms) ? data.terms as string[] : ['2024 / 25 · Term 1', '2024 / 25 · Term 2', '2024 / 25 · Term 3']; const [subjects, setSubjects] = useState(initialSubjects); const [newSubject, setNewSubject] = useState('');
  const save = () => update.mutate({ schoolId: school.id, data: { data: { ...data, subjects, terms: initialTerms } } }, { onSuccess: (result) => { setSaved(true); qc.setQueryData(getGetSchoolConfigQueryKey(school.id), result); setTimeout(() => setSaved(false), 2200); } });
  return <div className="fade-up"><PageHeader eyebrow="Administration" title="School settings" description="Keep the school’s academic structure and access conventions in one place." action={<button data-testid="button-save-settings" onClick={save} disabled={update.isPending} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{update.isPending ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : null}{saved ? 'Saved' : 'Save changes'}</button>} />
    {config.isLoading ? <div className="grid gap-5 lg:grid-cols-2"><SkeletonBlock className="h-72" /><SkeletonBlock className="h-72" /></div> : config.isError ? <ErrorState retry={() => config.refetch()} /> : <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><section className="rounded-2xl border border-border bg-card p-5 sm:p-6"><h3 className="font-display text-lg font-semibold">Academic structure</h3><p className="mt-1 text-sm text-muted-foreground">These values shape marks entry and reporting.</p><div className="mt-7"><p className="mb-3 text-xs font-bold uppercase tracking-[.15em] text-muted-foreground">Subjects</p><div className="flex flex-wrap gap-2">{subjects.map((item) => <span key={item} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs font-semibold">{item}<button data-testid={`button-remove-subject-${item}`} onClick={() => setSubjects(subjects.filter((subject) => subject !== item))} className="rounded-full text-muted-foreground hover:text-destructive"><X size={13} /></button></span>)}</div><div className="mt-4 flex gap-2"><input data-testid="input-new-subject" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Add a subject" className="h-10 flex-1 rounded-lg border border-input bg-background px-3 text-sm" /><button data-testid="button-add-subject" onClick={() => { if (newSubject.trim()) { setSubjects([...subjects, newSubject.trim()]); setNewSubject(''); } }} className="grid h-10 w-10 place-items-center rounded-lg border border-input bg-background hover:bg-muted"><Plus size={16} /></button></div></div><div className="mt-8"><p className="mb-3 text-xs font-bold uppercase tracking-[.15em] text-muted-foreground">Terms</p><div className="space-y-2">{initialTerms.map((item, index) => <div key={item} className={`flex items-center justify-between rounded-xl border p-3 text-sm ${index === 1 ? 'border-[#e4c66e] bg-[#fffaf0]' : 'border-border bg-muted/30'}`}><span className="font-semibold">{item}</span>{index === 1 && <span className="rounded-full bg-accent px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-foreground">Current</span>}</div>)}</div></div></section><section className="space-y-5"><div className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex items-start justify-between"><div><h3 className="font-display text-lg font-semibold">School profile</h3><p className="mt-1 text-sm text-muted-foreground">Identity visible across Core Sync.</p></div><Building2 size={18} className="text-primary" /></div><div className="mt-6 space-y-4"><Field label="School name" value={school.name} onChange={() => undefined} testId="input-school-name" /><Field label="Workspace slug" value={school.slug} onChange={() => undefined} testId="input-school-slug-settings" /></div></div><div className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex items-start justify-between"><div><h3 className="font-display text-lg font-semibold">User access</h3><p className="mt-1 text-sm text-muted-foreground">Access controls for your school team.</p></div><ShieldCheck size={18} className="text-primary" /></div><div className="mt-5 space-y-3">{[['Amina Cole', 'School administrator', 'Active'], ['Jon Bell', 'Teacher', 'Active'], ['Mariam Diaz', 'Teacher', 'Invite pending']].map(([name, role, status]) => <div key={name} className="flex items-center gap-3 rounded-xl bg-muted/40 p-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{initials(name)}</span><div className="flex-1"><p className="text-sm font-semibold">{name}</p><p className="text-xs text-muted-foreground">{role}</p></div><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{status}</span><button data-testid={`button-user-menu-${name.replace(' ', '-')}`} className="rounded-md p-1.5 hover:bg-background"><MoreHorizontal size={16} /></button></div>)}</div></div></section></div>}
  </div>;
}

function Parent() {
  const school = useActiveSchool(); const students = useListStudents(school.id, {}); const marks = useListMarks(school.id, { termKey: '2024-T2' }); const messages = useListMessages(school.id); const student = students.data?.[0]; const studentMarks = marks.data?.filter((mark) => mark.studentId === student?.id) || []; const average = studentMarks.length ? Math.round(studentMarks.reduce((sum, item) => sum + item.aoi + item.midterm + item.end, 0) / studentMarks.length) : 0;
  return <div className="fade-up"><PageHeader eyebrow="Family view" title="A clear view of progress." description={`Welcome back. Here’s the latest from ${school.name}.`} action={<span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold"><span className="h-2 w-2 rounded-full bg-[#61b990]" /> Parent portal</span>} />
    <div className="grid gap-5 lg:grid-cols-[1.3fr_.7fr]"><section className="rounded-2xl border border-border bg-card p-5 sm:p-7"><div className="flex items-center gap-4"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground">{student ? initials(student.name) : <UserRound size={23} />}</span><div><p className="text-xs uppercase tracking-[.18em] text-muted-foreground">Student report</p><h3 className="mt-1 font-display text-2xl font-semibold">{student?.name || 'Student not assigned'}</h3><p className="text-sm text-muted-foreground">{student ? `${student.className} · ${student.house} house` : 'Ask your school to connect a student record.'}</p></div></div>{student ? <><div className="mt-8 grid grid-cols-3 gap-3"><div className="rounded-xl bg-muted/55 p-4"><p className="text-xs text-muted-foreground">Subjects</p><p className="mt-2 font-display text-2xl font-semibold">{studentMarks.length}</p></div><div className="rounded-xl bg-muted/55 p-4"><p className="text-xs text-muted-foreground">Average</p><p className="mt-2 font-display text-2xl font-semibold text-primary">{average}</p></div><div className="rounded-xl bg-muted/55 p-4"><p className="text-xs text-muted-foreground">Term</p><p className="mt-2 font-display text-lg font-semibold">2 / 3</p></div></div><div className="mt-8"><div className="mb-3 flex items-center justify-between"><h4 className="font-semibold">Subject performance</h4><span className="text-xs text-muted-foreground">2024 / 25 · Term 2</span></div>{studentMarks.length ? <div className="space-y-3">{studentMarks.map((mark) => { const total = mark.aoi + mark.midterm + mark.end; return <div key={mark.id} data-testid={`parent-mark-${mark.id}`}><div className="mb-1 flex justify-between text-sm"><span>{mark.subject}</span><span className="font-semibold">{total}/100</span></div><div className="h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${total}%` }} /></div></div> })}</div> : <p className="text-sm text-muted-foreground">No marks have been published for this term yet.</p>}</div></> : <div className="mt-8"><EmptyState icon={GraduationCap} title="Waiting for school connection" body="Once the school links a student to your family view, reports will appear here." /></div>}</section><section className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex items-center justify-between"><div><h3 className="font-display text-lg font-semibold">School messages</h3><p className="mt-1 text-sm text-muted-foreground">Recent communication.</p></div><MessageSquare size={18} className="text-primary" /></div>{messages.data?.length ? <div className="mt-5 space-y-4">{messages.data.slice(-4).map((message) => <div key={message.id} className="border-l-2 border-accent pl-3"><p className="text-sm leading-5">{message.message}</p><p className="mt-1 text-xs text-muted-foreground">{message.senderName} · {fmtDate(message.createdAt)}</p></div>)}</div> : <p className="mt-6 text-sm text-muted-foreground">No messages from the school yet.</p>}<Link href="/messages" data-testid="link-parent-messages" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">Open messages <ArrowRight size={15} /></Link></section></div>
  </div>;
}

function SuperAdmin() {
  const school = useActiveSchool(); const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } }); const dashboard = useGetDashboardSummary(school.id, { query: { queryKey: getGetDashboardSummaryQueryKey(school.id) } }); const [broadcast, setBroadcast] = useState(''); const [sent, setSent] = useState(false);
  return <div className="fade-up"><PageHeader eyebrow="System oversight" title="Portfolio administration" description="A high-level view across the school portfolio and the health of its records." action={<span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold"><span className={`h-2 w-2 rounded-full ${health.isSuccess ? 'bg-[#61b990]' : 'bg-accent'}`} /> {health.isSuccess ? 'All services operational' : 'Checking services'}</span>} /><div className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]"><section className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex items-center justify-between"><div><h3 className="font-display text-lg font-semibold">School portfolio</h3><p className="mt-1 text-sm text-muted-foreground">Connected school workspaces and operating status.</p></div><button data-testid="button-refresh-portfolio" onClick={() => dashboard.refetch()} className="rounded-lg border border-border p-2 hover:bg-muted"><RefreshCw size={16} /></button></div><div className="mt-6 overflow-hidden rounded-xl border border-border"><div className="flex items-center gap-3 bg-muted/40 p-4"><span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground"><Building2 size={17} /></span><div className="flex-1"><p data-testid="text-portfolio-school" className="text-sm font-semibold">{school.name}</p><p className="text-xs text-muted-foreground">{school.slug} · Primary workspace</p></div><span className="rounded-full bg-[#e0f3ea] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#277556]">Active</span><MoreHorizontal size={17} className="text-muted-foreground" /></div><div className="grid grid-cols-3 divide-x border-t border-border"><div className="p-4"><p className="text-xs text-muted-foreground">Students</p><p className="mt-1 font-display text-xl font-semibold">{dashboard.data?.studentCount ?? '—'}</p></div><div className="p-4"><p className="text-xs text-muted-foreground">Classes</p><p className="mt-1 font-display text-xl font-semibold">{dashboard.data?.classCount ?? '—'}</p></div><div className="p-4"><p className="text-xs text-muted-foreground">Marks progress</p><p className="mt-1 font-display text-xl font-semibold">{dashboard.data ? `${Math.round(dashboard.data.marksEntered / Math.max(1, dashboard.data.marksExpected) * 100)}%` : '—'}</p></div></div></div><button data-testid="button-add-school" className="mt-5 inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted"><Plus size={15} /> Register another school</button></section><section className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/25 text-[#87631c]"><Send size={16} /></div><div><h3 className="font-display text-lg font-semibold">Cross-school note</h3><p className="mt-1 text-xs text-muted-foreground">Send an operational message.</p></div></div><textarea data-testid="textarea-broadcast" value={broadcast} onChange={(e) => setBroadcast(e.target.value)} placeholder="Share an update with school administrators…" rows={6} className="mt-6 w-full resize-none rounded-xl border border-input bg-background p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring" /><button data-testid="button-send-broadcast" onClick={() => { if (broadcast.trim()) { setSent(true); setBroadcast(''); setTimeout(() => setSent(false), 2200); } }} disabled={!broadcast.trim()} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{sent ? <Check size={15} /> : <Send size={15} />} {sent ? 'Message queued' : 'Send to administrators'}</button></section></div></div>;
}

export default App;