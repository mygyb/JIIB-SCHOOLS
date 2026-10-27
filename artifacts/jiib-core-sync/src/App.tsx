import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation } from 'wouter';
import {
  Activity, Archive, ArrowRight, BarChart3, BookOpen, Building2, CalendarDays, Check, ChevronDown, CircleAlert,
  ClipboardList, GraduationCap, House, Inbox, LayoutDashboard, Loader2, LockKeyhole, LogOut, Menu,
  MessageSquare, MoreHorizontal, Pencil, Plus, Printer, RefreshCw, Search, Settings, ShieldCheck,
  SlidersHorizontal, Trash2, UserRound, UsersRound, X, Send, PanelLeftClose,
} from 'lucide-react';
import {
  getGetDashboardSummaryQueryKey, getGetSchoolBySlugQueryKey, getGetSchoolConfigQueryKey,
  getListMarksQueryKey, getListMessagesQueryKey, getListStudentsQueryKey, getHealthCheckQueryKey,
  useCreateMessage, useCreateStudent, useDeleteStudent, useGetDashboardSummary, useGetSchoolBySlug,
  useGetSchoolConfig, useHealthCheck, useListMarks, useListMessages, useListStudents,
  useUpdateSchoolConfig, useUpdateStudent, useUpsertMark,
} from '@workspace/api-client-react';
import type { Mark, Message, School, Student, SubjectCompletion } from '@workspace/api-client-react';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  ArcElement,
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
import { jiibApi } from '@/lib/jiib-api';
import { configuredHouses, currentTerm, getAssessmentFields, getTerms, isTermLocked, subjectNames, type SchoolConfig } from '@/lib/school-data';
import { flushPendingMarks, getPendingMarks, queueMark } from '@/lib/offline-marks';
import { OperationsPage } from '@/features/operations';
import { MarksRegister } from '@/features/marks-register';

const queryClient = new QueryClient();
ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);
const DEFAULT_SCHOOL = { id: '00000000-0000-0000-0000-000000000000', name: 'JIIB Core Sync', slug: 'demo-school', active: true } as School;
const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/students', label: 'Students', icon: UsersRound },
  { href: '/marks', label: 'Marks register', icon: ClipboardList },
  { href: '/messages', label: 'Messages', icon: Inbox },
  { href: '/parent-messages', label: 'Parent conversations', icon: MessageSquare },
  { href: '/overview', label: 'Directory & news', icon: House },
  { href: '/parents-portal', label: 'Parents portal', icon: UserRound },
  { href: '/user-management', label: 'User management', icon: UsersRound },
  { href: '/performance', label: 'Performance', icon: BarChart3 },
  { href: '/report-studio', label: 'Report studio', icon: Archive },
  { href: '/print-marksheets', label: 'Print marksheets', icon: Printer },
  { href: '/term-management', label: 'Term management', icon: CalendarDays },
  { href: '/manage-subjects', label: 'Manage subjects', icon: BookOpen },
  { href: '/grading-system', label: 'Grading system', icon: GraduationCap },
  { href: '/publish-deadline', label: 'Publish deadline', icon: Send },
  { href: '/school-events', label: 'School events', icon: CalendarDays },
  { href: '/school-settings', label: 'School settings', icon: Settings },
  { href: '/system-settings', label: 'System settings', icon: ShieldCheck },
];

// Nav items / routes that belong to the school administrator workspace only.
const ADMIN_ONLY_HREFS = [
  '/students', '/overview', '/parents-portal', '/user-management', '/performance',
  '/report-studio', '/print-marksheets', '/term-management', '/manage-subjects',
  '/grading-system', '/publish-deadline', '/school-events', '/school-settings', '/system-settings',
  '/settings', '/parent-messages',
];

// Nav items / routes that belong to the teacher workspace only.
const TEACHER_ONLY_HREFS = ['/marks'];

function useActiveSchool() {
  const [school] = useState<School>(() => {
    try { return JSON.parse(localStorage.getItem('jiib.school') || 'null') || DEFAULT_SCHOOL; } catch { return DEFAULT_SCHOOL; }
  });
  return school;
}

function useActiveUserName() {
  const [name] = useState<string>(() => localStorage.getItem('jiib.userName') || 'there');
  return name;
}

function useActiveRole() {
  const [role] = useState<string>(() => localStorage.getItem('jiib.role') || '');
  return role;
}

function initials(name: string) {
  return name.split(' ').map((word) => word[0]).slice(0, 2).join('').toUpperCase();
}

function fmtDate(value?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function fmtHeaderDate(value: Date = new Date()) {
  return new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .format(value)
    .replace(', ', ' · ');
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SyncManager />
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function SyncManager() {
  const qc = useQueryClient();
  useEffect(() => {
    let syncing = false;
    const sync = async () => {
      if (syncing || !navigator.onLine || getPendingMarks().length === 0) return;
      syncing = true;
      try {
        await flushPendingMarks();
        localStorage.setItem('jiib.lastSyncAt', new Date().toISOString());
        await qc.invalidateQueries();
        window.dispatchEvent(new Event('jiib:sync'));
      } catch (error) {
        console.warn('Pending marks are still waiting to sync.', error);
      } finally {
        syncing = false;
      }
    };
    window.addEventListener('online', sync);
    window.addEventListener('focus', sync);
    void sync();
    const interval = window.setInterval(sync, 45_000);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('focus', sync);
      window.clearInterval(interval);
    };
  }, [qc]);
  return null;
}

function Router() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/" component={SignIn} />
        <Route path="/dashboard"><AppShell><Dashboard /></AppShell></Route>
        <Route path="/students"><AppShell><Students /></AppShell></Route>
        <Route path="/marks"><AppShell><MarksPage /></AppShell></Route>
        <Route path="/messages"><AppShell><Messages /></AppShell></Route>
        <Route path="/support"><AppShell><SupportPage /></AppShell></Route>
        <Route path="/parent-messages"><AppShell><OperationsRoute page="parentMessages" /></AppShell></Route>
        <Route path="/settings"><AppShell><OperationsRoute page="schoolSettings" /></AppShell></Route>
        <Route path="/overview"><AppShell><OperationsRoute page="overview" /></AppShell></Route>
        <Route path="/parents-portal"><AppShell><OperationsRoute page="parentsPortal" /></AppShell></Route>
        <Route path="/user-management"><AppShell><OperationsRoute page="userManagement" /></AppShell></Route>
        <Route path="/performance"><AppShell><OperationsRoute page="performance" /></AppShell></Route>
        <Route path="/print-marksheets"><AppShell><OperationsRoute page="printMarksheets" /></AppShell></Route>
        <Route path="/report-studio"><AppShell><OperationsRoute page="reportStudio" /></AppShell></Route>
        <Route path="/term-management"><AppShell><OperationsRoute page="termManagement" /></AppShell></Route>
        <Route path="/manage-subjects"><AppShell><OperationsRoute page="manageSubjects" /></AppShell></Route>
        <Route path="/grading-system"><AppShell><OperationsRoute page="gradingSystem" /></AppShell></Route>
        <Route path="/publish-deadline"><AppShell><OperationsRoute page="publishDeadline" /></AppShell></Route>
        <Route path="/school-events"><AppShell><OperationsRoute page="schoolEvents" /></AppShell></Route>
        <Route path="/school-settings"><AppShell><OperationsRoute page="schoolSettings" /></AppShell></Route>
        <Route path="/system-settings"><AppShell><OperationsRoute page="systemSettings" /></AppShell></Route>
        <Route path="/parent"><AppShell><Parent /></AppShell></Route>
        <Route path="/parent-view"><AppShell><OperationsRoute page="parentView" /></AppShell></Route>
        <Route path="/super-admin"><AppShell><SuperAdmin /></AppShell></Route>
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function OperationsRoute({ page }: { page: Parameters<typeof OperationsPage>[0]['page'] }) {
  return <OperationsPage page={page} school={useActiveSchool()} />;
}

function MarksPage() {
  return <MarksRegister school={useActiveSchool()} />;
}

function SignIn() {
  const [, setLocation] = useLocation();
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [role, setRole] = useState('School administrator');
  const [submitted, setSubmitted] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [authError, setAuthError] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const schoolQuery = useGetSchoolBySlug(slug.trim().toLowerCase(), {
    query: { enabled: submitted && Boolean(slug.trim()), queryKey: getGetSchoolBySlugQueryKey(slug.trim().toLowerCase()) },
  });
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } });

  const resolve = async (event: FormEvent) => {
    event.preventDefault();
    if (!slug.trim() && role !== 'Super administrator') return;
    setAuthError('');
    if (role === 'Parent / guardian') {
      if (parentPhone.replace(/\D/g, '').length < 7) {
        setAuthError('Enter the phone number registered with the school.');
        return;
      }
      setSubmitted(true);
      return;
    }
    if (!supabase) {
      setAuthError('Staff sign-in is not configured for this workspace.');
      return;
    }
    if (supabase) {
      if (!email.trim() || !password) {
        setAuthError('Enter your staff email and password to continue.');
        return;
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setAuthError(error.message);
        return;
      }
      setAccessToken(data.session?.access_token ?? '');
      if (role === 'Super administrator') {
        try {
          const identity = await jiibApi<{ role: string; email: string }>('/api/auth/super-admin');
          if (identity.role !== 'super_admin') throw new Error('This account is not a super administrator.');
          const schools = await jiibApi<School[]>('/api/schools/portfolio');
          if (!schools.length) throw new Error('There are no school workspaces in this portfolio yet.');
          localStorage.setItem('jiib.school', JSON.stringify(schools.find((item) => item.active) ?? schools[0]));
          localStorage.setItem('jiib.role', 'Super administrator');
          localStorage.setItem('jiib.userName', identity.email.split('@')[0] || 'Super administrator');
          setLocation('/super-admin');
          return;
        } catch (error) {
          setAuthError(error instanceof Error ? error.message : 'Could not verify super administrator access.');
          await supabase.auth.signOut();
          setAccessToken('');
          return;
        }
      }
    }
    setSubmitted(true);
  };

  // Once the school resolves, finish signing the person in. For staff roles
  // (admin/teacher) this VERIFIES the real role against the `allowed_users`
  // table on the server — the dropdown above is only a starting guess, never
  // the final word on what someone is allowed to access.
  useEffect(() => {
    if (!(submitted && schoolQuery.isSuccess) || verifying) return;
    const school = schoolQuery.data;

    async function finishLogin() {
      if (role === 'Parent / guardian') {
        setVerifying(true);
        try {
          await jiibApi(
            `/api/schools/${encodeURIComponent(school.id)}/parents/portal?phone=${encodeURIComponent(parentPhone.trim())}`,
          );
          localStorage.setItem('jiib.school', JSON.stringify(school));
          localStorage.setItem('jiib.role', 'Parent / guardian');
          localStorage.setItem('jiib.parentPhone', parentPhone.trim());
          localStorage.setItem('jiib.parentVerified', 'true');
          setLocation('/parent');
        } catch (error) {
          setAuthError(error instanceof Error ? error.message : 'Could not verify this parent account.');
          setSubmitted(false);
        } finally {
          setVerifying(false);
        }
        return;
      }

      if (role === 'Super administrator') {
        setVerifying(true);
        try {
          const result = await jiibApi<{ role: string; email: string }>('/api/auth/super-admin');
          if (result.role !== 'super_admin') throw new Error('This account is not a super administrator.');
          localStorage.setItem('jiib.school', JSON.stringify(school));
          localStorage.setItem('jiib.role', 'Super administrator');
          localStorage.setItem('jiib.userName', result.email.split('@')[0] || 'Super administrator');
          setLocation('/super-admin');
        } catch (error) {
          setAuthError(error instanceof Error ? error.message : 'Could not verify super administrator access.');
          setSubmitted(false);
        } finally {
          setVerifying(false);
        }
        return;
      }

      // School administrator / Teacher: verify against allowed_users.
      setVerifying(true);
      try {
        const allowed = await jiibApi<{ role: string; displayName?: string | null; subjects?: string[] }>(
          `/api/schools/${encodeURIComponent(school.id)}/users/${encodeURIComponent(email.trim().toLowerCase())}`,
        );
        const actualRole: 'School administrator' | 'Teacher' = allowed.role === 'admin' ? 'School administrator' : 'Teacher';

        if (actualRole !== role) {
          setAuthError(`This account is registered as a ${actualRole}. Please select "${actualRole}" above and sign in again.`);
          await supabase?.auth.signOut();
          setSubmitted(false);
          setVerifying(false);
          return;
        }

        localStorage.setItem('jiib.school', JSON.stringify(school));
        localStorage.setItem('jiib.role', actualRole);
        localStorage.setItem('jiib.userName', allowed.displayName || email.trim().split('@')[0]);
        localStorage.setItem('jiib.email', email.trim().toLowerCase());
        localStorage.setItem('jiib.subjects', JSON.stringify(allowed.subjects ?? []));
        setLocation('/dashboard');
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : 'Could not verify your account. Please check your connection and try again.');
        await supabase?.auth.signOut();
        setSubmitted(false);
        setVerifying(false);
      }
    }

    finishLogin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, schoolQuery.isSuccess]);

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
              <div><div className="font-display text-xl font-semibold">JIIB</div><div className="text-[10px] uppercase tracking-[.24em] text-muted-foreground">Score-sync</div></div>
            </div>
            <div className="mb-9">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[.2em] text-primary">Welcome back</p>
              <h2 className="font-display text-4xl font-semibold tracking-[-.04em]">Open your school Portal.</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">Resolve your school first, then continue to the right view for your role.</p>
            </div>
              <form onSubmit={resolve} className="space-y-6">
               {role !== 'Parent / guardian' && <div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="mb-2 block text-sm font-semibold">Staff email</span><input data-testid="input-login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jii@school.com" className="h-12 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label><label className="block"><span className="mb-2 block text-sm font-semibold">Password</span><input data-testid="input-login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" className="h-12 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label></div>}
              <label className="block"><span className="mb-2 block text-sm font-semibold">School slug</span><div className="flex items-center rounded-xl border border-input bg-card px-3 shadow-sm focus-within:ring-2 focus-within:ring-ring"><span className="text-sm text-muted-foreground">jiib.school/</span><input data-testid="input-school-slug" autoFocus value={slug} onChange={(e) => { setSlug(e.target.value); setSubmitted(false); }} placeholder="northbridge" className="h-12 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none" /></div></label>
               {role === 'Parent / guardian' && <label className="block"><span className="mb-2 block text-sm font-semibold">Parent phone</span><input data-testid="input-parent-phone" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} placeholder="Phone number on the school register" className="h-12 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>}
              <label className="block"><span className="mb-2 block text-sm font-semibold">Continue as</span><select data-testid="select-role" value={role} onChange={(e) => setRole(e.target.value)} className="h-12 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"><option>School administrator</option><option>Teacher</option><option>Parent / guardian</option><option>Super administrator</option></select></label>
              {submitted && schoolQuery.isPending && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" /> Looking up your school…</div>}
              {submitted && schoolQuery.isSuccess && verifying && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" /> Verifying your account…</div>}
              {submitted && schoolQuery.isError && <div data-testid="error-school-resolution" className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">We couldn’t find that school. Check the slug and try again.</div>}
               {authError && <div data-testid="error-login" className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{authError}</div>}
              <button data-testid="button-open-workspace" className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:bg-primary/90" type="submit">LOGIN <ArrowRight size={17} /></button>
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
  const userName = useActiveUserName();
  const role = useActiveRole();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const isTeacher = role === 'Teacher';
  const isParent = role === 'Parent / guardian';
  const isSuperAdmin = role === 'Super administrator';
  const [authReady, setAuthReady] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [syncRevision, setSyncRevision] = useState(0);
  const config = useGetSchoolConfig(school.id, {
    query: { enabled: !isParent, queryKey: getGetSchoolConfigQueryKey(school.id) },
  });

  useEffect(() => {
    let cancelled = false;
    const verifySession = async () => {
      if (isParent) {
        const verified = localStorage.getItem('jiib.parentVerified') === 'true'
          && Boolean(localStorage.getItem('jiib.parentPhone'));
        if (!verified) setLocation('/');
        if (!cancelled) setAuthReady(verified);
        return;
      }
      const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
      const authenticated = Boolean(data.session?.access_token && role);
      if (!authenticated) setLocation('/');
      if (!cancelled) setAuthReady(authenticated);
    };
    void verifySession();
    return () => { cancelled = true; };
  }, [isParent, role, setLocation]);

  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine);
    const updateSync = () => setSyncRevision((value) => value + 1);
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    window.addEventListener('jiib:sync', updateSync);
    return () => {
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
      window.removeEventListener('jiib:sync', updateSync);
    };
  }, []);

  useEffect(() => {
    setProfileOpen(false);
    if (isParent && location !== '/parent' && location !== '/parent-view') setLocation('/parent');
    else if (isSuperAdmin && location !== '/super-admin') setLocation('/super-admin');
    else if (!isSuperAdmin && location === '/super-admin') setLocation('/dashboard');
    else if (!isParent && location === '/parent') setLocation('/dashboard');
    else if (!isParent && !isSuperAdmin && isTeacher && ADMIN_ONLY_HREFS.includes(location)) setLocation('/dashboard');
    else if (!isParent && !isSuperAdmin && !isTeacher && TEACHER_ONLY_HREFS.includes(location)) setLocation('/dashboard');
  }, [location, isParent, isSuperAdmin, isTeacher, setLocation]);

  const visibleNavItems = navItems.filter((item) =>
    isParent || isSuperAdmin
      ? false
      : isTeacher ? !ADMIN_ONLY_HREFS.includes(item.href) : !TEACHER_ONLY_HREFS.includes(item.href),
  );

  const titleMap: Record<string, string> = {
    '/dashboard': 'Overview', '/students': 'Students', '/marks': 'Marks register', '/messages': 'Messages',
    '/settings': 'School settings', '/parent': 'Family view', '/parent-view': 'Family view', '/parent-messages': 'Parent conversations', '/super-admin': 'Portfolio',
    '/overview': 'Directory & news', '/parents-portal': 'Parents portal', '/user-management': 'User management',
    '/performance': 'Performance', '/report-studio': 'Report studio', '/print-marksheets': 'Print marksheets',
    '/term-management': 'Term management', '/manage-subjects': 'Manage subjects', '/grading-system': 'Grading system',
    '/publish-deadline': 'Publish deadline', '/school-events': 'School events', '/school-settings': 'School settings',
    '/system-settings': 'System settings',
  };
  const title = titleMap[location] ?? 'Portfolio';
  if (!authReady) return <main className="grid min-h-[100dvh] place-items-center bg-background text-sm text-muted-foreground">Checking account access…</main>;
  return (
    <div className="flex min-h-[100dvh] bg-background">
      {open && <button aria-label="Close navigation" data-testid="button-close-mobile-nav" className="fixed inset-0 z-30 bg-[#172b43]/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`${open ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'lg:w-[76px]' : 'lg:w-[248px]'} fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-200 lg:relative lg:translate-x-0`}>
        <div className="flex h-[78px] items-center justify-between border-b border-sidebar-border px-5">
          <Link href={isParent ? '/parent' : isSuperAdmin ? '/super-admin' : '/dashboard'} data-testid="link-brand" className={`flex items-center gap-3 ${collapsed ? 'lg:mx-auto' : ''}`}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><GraduationCap size={21} /></span>{!collapsed && <span><span className="block font-display text-lg font-semibold tracking-tight">JIIB</span><span className="block text-[9px] uppercase tracking-[.22em] text-sidebar-foreground/60">Core Sync</span></span>}</Link>
          <button data-testid="button-close-nav" onClick={() => { setCollapsed(!collapsed); setOpen(false); }} className="hidden rounded-lg p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground lg:block">{collapsed ? <Menu size={17} /> : <PanelLeftClose size={17} />}</button>
        </div>
        <div className={`mx-3 mt-5 rounded-xl bg-sidebar-accent/70 p-3 ${collapsed ? 'lg:p-2' : ''}`}><div className="flex items-center gap-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sidebar-primary/15 text-xs font-bold text-sidebar-primary">{initials(school.name)}</span>{!collapsed && <div className="min-w-0"><p data-testid="text-active-school" className="truncate text-sm font-semibold">{school.name}</p><p className="mt-0.5 text-[10px] uppercase tracking-widest text-sidebar-foreground/50">Active school</p></div>}</div></div>
        <nav className="mt-7 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 pb-4">{visibleNavItems.map(({ href, label, icon: Icon }) => <Link href={href} key={href} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`} onClick={() => setOpen(false)} className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${location === href ? 'bg-sidebar-primary font-semibold text-sidebar-primary-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground'} ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}><Icon size={18} strokeWidth={location === href ? 2.4 : 1.8} />{!collapsed && <span>{label}</span>}{href === '/messages' && !collapsed && <span className="ml-auto rounded-full bg-sidebar-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-sidebar-primary">3</span>}</Link>)}
          <div className="my-5 border-t border-sidebar-border" />
        </nav>
         {!collapsed && <div className="border-t border-sidebar-border p-4"><div className="rounded-xl bg-[#102238] p-3"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-sidebar-primary">Current term</p><p className="mt-1 text-sm font-semibold">{String((config.data?.data as SchoolConfig | undefined)?.terms?.[String((config.data?.data as SchoolConfig | undefined)?.activeTerm ?? '')]?.label ?? (config.data?.data as SchoolConfig | undefined)?.activeTerm ?? 'No active term')}</p><p data-sync-revision={syncRevision} className="mt-1 text-xs text-sidebar-foreground/55">{online ? `${getPendingMarks(school.id).length} marks waiting to sync` : 'Offline · changes are queued'}</p></div><button data-testid="button-sign-out" onClick={async () => { await supabase?.auth.signOut(); ['jiib.school', 'jiib.role', 'jiib.userName', 'jiib.email', 'jiib.parentPhone', 'jiib.parentVerified', 'jiib.subjects'].forEach((key) => localStorage.removeItem(key)); setLocation('/'); }} className="mt-4 flex w-full items-center gap-2 px-1 text-xs text-sidebar-foreground/55 hover:text-sidebar-foreground"><LogOut size={14} /> Sign out</button></div>}
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-[78px] items-center justify-between border-b border-border bg-background/90 px-5 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3"><button data-testid="button-open-mobile-nav" onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-muted lg:hidden"><Menu size={20} /></button><div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-muted-foreground">Workspace</p><h1 data-testid="text-page-title" className="font-display text-xl font-semibold tracking-tight">{title}</h1></div></div>
          <div className="flex items-center gap-3"><div data-sync-revision={syncRevision} className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground sm:flex"><span className={`h-2 w-2 rounded-full ${online ? 'bg-[#61b990]' : 'bg-accent'}`} />{online ? (getPendingMarks(school.id).length ? 'Sync pending' : 'Connected') : 'Offline · queued'}</div><div className="relative"><button data-testid="button-profile" aria-expanded={profileOpen} aria-label="Open user profile menu" onClick={() => setProfileOpen((value) => !value)} className="grid h-9 w-9 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{initials(userName)}</button>{profileOpen && <div role="menu" className="absolute right-0 top-12 z-50 w-64 rounded-xl border border-border bg-card p-3 shadow-xl"><div className="border-b border-border px-2 pb-3"><p className="truncate text-sm font-semibold">{userName}</p><p className="truncate text-xs text-muted-foreground">{localStorage.getItem('jiib.email') || role}</p><p className="mt-1 truncate text-xs text-muted-foreground">{school.name}</p></div><Link role="menuitem" href={isSuperAdmin || (!isTeacher && !isParent) ? '/support' : isParent ? '/parent-messages' : '/messages'} onClick={() => setProfileOpen(false)} className="mt-2 flex rounded-lg px-2 py-2 text-sm font-medium hover:bg-muted">{isSuperAdmin ? 'Support inbox' : isParent ? 'Contact the school' : isTeacher ? 'Messages to families' : 'Contact JIIB support'}</Link><p className="px-2 pt-2 text-[10px] uppercase tracking-wider text-muted-foreground">JIIB Core Sync · Version 8.2</p><button role="menuitem" onClick={async () => { await supabase?.auth.signOut(); ['jiib.school', 'jiib.role', 'jiib.userName', 'jiib.email', 'jiib.parentPhone', 'jiib.parentVerified', 'jiib.subjects'].forEach((key) => localStorage.removeItem(key)); setLocation('/'); }} className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-destructive hover:bg-destructive/5"><LogOut size={14} /> Sign out</button></div>}</div></div>
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
  const userName = useActiveUserName();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const summary = useGetDashboardSummary(school.id, { query: { queryKey: getGetDashboardSummaryQueryKey(school.id) } });
  const data = summary.data;
  const isTeacher = localStorage.getItem('jiib.role') === 'Teacher';
  const hour = now.getHours();
  const greeting = hour >= 7 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 16 ? 'Good afternoon' : hour >= 16 && hour < 23 ? 'Good evening' : 'Night shift';
  const completion = data && data.marksExpected > 0
    ? Math.round((data.marksEntered / data.marksExpected) * 100)
    : null;
  const subjects = data?.subjectCompletion ?? [];
  const events = (data?.events ?? []).filter((item) => {
    if (!item.date) return true;
    return new Date(`${item.date.slice(0, 10)}T23:59:59`).getTime() >= now.getTime();
  }).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  const subjectTotals = subjects.reduce((total, item) => ({
    entered: total.entered + item.entered,
    expected: total.expected + item.expected,
  }), { entered: 0, expected: 0 });
  const rankedSubjects = [...subjects].sort((a, b) =>
    a.className.localeCompare(b.className) || a.subject.localeCompare(b.subject),
  );
  const houseTotal = (data?.houses ?? []).reduce((total, house) => total + house.count, 0);
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '66%',
    plugins: {
      legend: { display: false },
      tooltip: { enabled: true },
    },
  };
  const subjectStatus = (item: SubjectCompletion) => item.expected > 0
    ? `${Math.min(100, Math.max(0, item.percentage))}%`
    : 'No entries expected';
  return <div className="fade-up"><PageHeader eyebrow={fmtHeaderDate()} title={`${greeting}, ${userName}`} description={`Here’s the operating picture for ${school.name}.`} action={<button data-testid="button-dashboard-refresh" onClick={() => summary.refetch()} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted"><RefreshCw size={15} /> Refresh</button>} />
    {summary.isLoading ? <div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map((item) => <SkeletonBlock key={item} className="h-32" />)}</div> : summary.isError ? <ErrorState retry={() => summary.refetch()} /> : data ? <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[{ label: 'Students enrolled', value: data.studentCount, icon: UsersRound, tone: 'text-primary' }, { label: 'Active classes', value: data.classCount, icon: BookOpen, tone: 'text-[#2e8c72]' }, { label: isTeacher ? 'Your marks entered' : 'Marks entered', value: `${data.marksEntered}/${data.marksExpected}`, icon: BarChart3, tone: 'text-[#c88e17]' }, { label: 'Houses', value: data.configuredHouseCount, icon: Building2, tone: 'text-[#a44f47]' }].map(({ label, value, icon: Icon, tone }) => <div key={label} data-testid={`card-metric-${label.toLowerCase().replaceAll(' ', '-')}`} className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_hsl(var(--foreground)/.03)]"><div className="flex items-start justify-between"><p className="text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">{label}</p><Icon size={18} className={tone} /></div><p className="mt-5 font-display text-3xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label.toLowerCase().includes('marks') ? `${completion === null ? 'No expected entries' : `${completion}% complete`} · ${data.activeTerm || 'active term'}` : 'Across the active school'}</p></div>)}</div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <section aria-labelledby="marks-overview-title" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="marks-overview-title" className="font-display text-lg font-semibold">{isTeacher ? 'Your marks completion' : 'Marks completion'}</h3><p className="mt-1 text-sm text-muted-foreground">{data.activeTerm ? `Active term · ${data.activeTerm}` : 'Assessment entry across the active term.'}</p></div><span className="font-display text-2xl font-semibold text-primary">{completion === null ? '—' : `${completion}%`}</span></div>
          <div className="mt-6 grid gap-6 sm:grid-cols-[180px_1fr] sm:items-center">
            <div className="relative mx-auto h-40 w-40">
              {data.marksExpected > 0 ? <Doughnut aria-label={`Marks completion: ${data.marksEntered} of ${data.marksExpected} entries`} role="img" data={{ labels: ['Entered', 'Remaining'], datasets: [{ data: [Math.min(data.marksEntered, data.marksExpected), Math.max(0, data.marksExpected - data.marksEntered)], backgroundColor: ['#284e80', '#e4eaf0'], borderWidth: 0, hoverOffset: 5, borderRadius: 3 }] }} options={chartOptions} /> : <div role="img" aria-label="No assessment entries expected" className="grid h-full w-full place-items-center rounded-full border-[14px] border-muted"><span className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">No expected<br />entries</span></div>}
              {data.marksExpected > 0 && <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center"><span className="font-display text-xl font-semibold">{completion}%</span></div>}
            </div>
            <div className="space-y-4">
              <p className="max-w-lg text-sm leading-6 text-muted-foreground">Marks recorded for the active term, against the expected assessment entries.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-[#eef3f8] p-3"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Entered</p><p className="mt-1 font-display text-xl font-semibold">{data.marksEntered}</p></div>
                <div className="rounded-xl bg-muted/60 p-3"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Remaining</p><p className="mt-1 font-display text-xl font-semibold">{Math.max(0, data.marksExpected - data.marksEntered)}</p></div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-[#284e80]" />Entered</span><span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-[#e4eaf0]" />Remaining</span></div>
            </div>
          </div>
        </section>
        <section aria-labelledby="house-chart-title" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4"><div><h3 id="house-chart-title" className="font-display text-lg font-semibold">Students by house</h3><p className="mt-1 text-sm text-muted-foreground">{data.configuredHouseCount} houses configured · {houseTotal} students counted</p></div><House size={18} className="mt-1 shrink-0 text-muted-foreground" /></div>
          {data.houses.length && houseTotal > 0 ? <div className="mt-5 grid gap-4 sm:grid-cols-[160px_1fr] sm:items-center">
            <div className="mx-auto h-40 w-40"><Doughnut role="img" aria-label={`Distribution of ${houseTotal} students across ${data.houses.length} houses`} data={{ labels: data.houses.map((house) => house.label), datasets: [{ data: data.houses.map((house) => house.count), backgroundColor: ['#284e80', '#d3a237', '#438b76', '#b65b50', '#7292a8', '#8c7197', '#c77a45'], borderWidth: 2, borderColor: '#ffffff', hoverOffset: 5 }] }} options={chartOptions} /></div>
            <ul className="space-y-2" aria-label="House student counts">{data.houses.map((house, index) => {
              const colors = ['#284e80', '#d3a237', '#438b76', '#b65b50', '#7292a8', '#8c7197', '#c77a45'];
              const share = Math.round((house.count / houseTotal) * 100);
              return <li key={house.label} className="flex items-center justify-between gap-3 text-xs"><span className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: colors[index % colors.length] }} /><span className="truncate font-medium">{house.label}</span></span><span className="shrink-0 text-muted-foreground">{house.count} <span className="text-foreground">· {share}%</span></span></li>;
            })}</ul>
          </div> : <div className="mt-5 grid min-h-40 place-items-center rounded-xl border border-dashed border-border px-4 text-center"><p className="max-w-xs text-sm leading-6 text-muted-foreground">{data.houses.length ? 'No students are currently counted in configured houses.' : 'No houses have been configured.'}</p></div>}
        </section>
      </div>
      <section aria-labelledby="subject-chart-title" className="mt-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[.18em] text-primary">Assessment progress</p>
            <h3 id="subject-chart-title" className="font-display text-lg font-semibold">Completion by subject</h3>
            <p className="mt-1 text-sm text-muted-foreground">All class and subject assignments · {data.activeTerm || 'active term'}</p>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">{rankedSubjects.length} subject rows</span>
        </div>
        {rankedSubjects.length ? <div className="mt-5 max-h-[520px] overflow-y-auto rounded-xl bg-muted/20 px-2 py-3">
          <div style={{ height: `${Math.max(220, rankedSubjects.length * 34)}px` }}>
            <Bar
              role="img"
              aria-label={`Marks completion for ${rankedSubjects.length} class and subject assignments`}
              data-testid="chart-subject-completion"
              data={{
                labels: rankedSubjects.map((item) => `${item.subject} · ${item.className}`),
                datasets: [{
                  label: 'Completion',
                  data: rankedSubjects.map((item) => item.expected > 0 ? Math.min(100, Math.max(0, item.percentage)) : 0),
                  backgroundColor: '#284e80',
                  borderRadius: 7,
                  barThickness: 18,
                  maxBarThickness: 22,
                }],
              }}
              options={{
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 350 },
                scales: {
                  x: {
                    beginAtZero: true,
                    max: 100,
                    grid: { color: 'rgba(40, 78, 128, 0.08)' },
                    ticks: { stepSize: 20, callback: (value) => `${value}%` },
                  },
                  y: {
                    grid: { display: false },
                    ticks: { autoSkip: false },
                  },
                },
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: (context) => {
                        const item = rankedSubjects[context.dataIndex];
                        return item
                          ? ` ${item.entered} / ${item.expected} entries (${item.expected > 0 ? Math.min(100, Math.max(0, item.percentage)) : 0}%)`
                          : '';
                      },
                    },
                  },
                },
              }}
            />
          </div>
        </div> : <div className="mt-5 grid min-h-40 place-items-center rounded-xl border border-dashed border-border px-4 text-center"><p className="max-w-md text-sm leading-6 text-muted-foreground">Subject completion charts will appear when the active term has configured subject assignments.</p></div>}
      </section>
      <section aria-labelledby="subject-completion-title" className="mt-5 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-col justify-between gap-3 border-b border-border px-5 py-5 sm:flex-row sm:items-end sm:px-6">
          <div><p className="mb-1 text-[10px] font-bold uppercase tracking-[.18em] text-primary">Active term · {data.activeTerm || 'current'}</p><h3 id="subject-completion-title" className="font-display text-xl font-semibold">{isTeacher ? 'Your subject completion' : 'Marks completion by subject'}</h3><p className="mt-1 text-sm text-muted-foreground">Every class and subject returned for this school term.</p></div>
          {subjects.length > 0 && <div className="text-left sm:text-right"><p className="text-xs text-muted-foreground">Across listed subjects</p><p className="font-display text-lg font-semibold">{subjectTotals.entered} <span className="text-sm font-medium text-muted-foreground">/ {subjectTotals.expected} entries</span></p></div>}
        </div>
        {rankedSubjects.length ? <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left">
            <caption className="sr-only">Marks completion for every class and subject in the active term</caption>
            <thead className="bg-muted/45 text-[10px] uppercase tracking-[.14em] text-muted-foreground"><tr><th scope="col" className="px-5 py-3 font-bold">Class</th><th scope="col" className="px-4 py-3 font-bold">Subject</th><th scope="col" className="px-4 py-3 font-bold">Teacher</th><th scope="col" className="min-w-52 px-4 py-3 font-bold">Completion</th><th scope="col" className="px-5 py-3 text-right font-bold">Entries</th></tr></thead>
            <tbody className="divide-y divide-border">{rankedSubjects.map((item, index) => {
              const percentage = item.expected > 0 ? Math.min(100, Math.max(0, item.percentage)) : 0;
              return <tr key={`${item.className}-${item.subject}-${index}`} data-testid={`row-subject-completion-${index}`} className="transition-colors hover:bg-muted/25">
                <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold">{item.className || '—'}</td>
                <td className="px-4 py-4 text-sm">{item.subject || '—'}</td>
                <td className="px-4 py-4 text-sm text-muted-foreground">{item.teacher || 'Unassigned'}</td>
                <td className="px-4 py-4"><div className="flex items-center gap-3"><div className="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${item.className} ${item.subject} marks completion`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percentage}%` }} /></div><span className="w-12 shrink-0 text-right text-xs font-semibold">{subjectStatus(item)}</span></div></td>
                <td className="whitespace-nowrap px-5 py-4 text-right text-sm font-semibold tabular-nums">{item.entered} <span className="font-normal text-muted-foreground">/ {item.expected}</span></td>
              </tr>;
            })}</tbody>
          </table>
        </div> : <div className="grid min-h-44 place-items-center px-5 py-9 text-center"><div><span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><ClipboardList size={19} /></span><p className="mt-3 text-sm font-semibold">{isTeacher ? 'No subject rows available' : 'No subject completion to show'}</p><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">{isTeacher ? 'There are no subject completion records for your account in the active term.' : 'The active term has no subject completion rows yet. Subject results will appear here when the API returns them.'}</p></div></div>}
      </section>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex items-center justify-between"><div><h3 className="font-display text-lg font-semibold">Upcoming events</h3><p className="mt-1 text-sm text-muted-foreground">School dates to keep in view.</p></div><CalendarDays size={18} className="text-muted-foreground" /></div>{events.length ? <div className="mt-5 space-y-3">{events.map((event) => <div key={event.id} className="flex gap-3 rounded-xl bg-muted/40 p-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><CalendarDays size={16} /></span><div><p className="text-sm font-semibold">{event.title}</p><p className="mt-1 text-xs text-muted-foreground">{event.date ? fmtDate(event.date) : 'Date to be announced'}</p></div></div>)}</div> : <p className="mt-5 text-sm text-muted-foreground">No upcoming events.</p>}</section>
        {!isTeacher && <section className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex items-center justify-between"><div><h3 className="font-display text-lg font-semibold">Recent activity</h3><p className="mt-1 text-sm text-muted-foreground">What changed recently.</p></div><Activity size={18} className="text-muted-foreground" /></div>{data.recentActivity.length ? <div className="mt-5 space-y-4">{data.recentActivity.slice(0, 5).map((item) => <div key={item.id} data-testid={`activity-${item.id}`} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" /><div className="min-w-0"><p className="text-sm leading-5">{item.label}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{item.detail} · {fmtDate(item.createdAt)}</p></div></div>)}</div> : <p className="mt-6 text-sm text-muted-foreground">No recent activity yet.</p>}</section>}
      </div>
    </> : <EmptyState icon={LayoutDashboard} title="Your overview is quiet" body="Once your school has records, the operating picture will appear here." />}
  </div>;
}

function SupportPage() {
  type SupportMessage = {
    id: string;
    schoolId: string;
    schoolName?: string;
    senderName: string;
    senderEmail?: string | null;
    message: string;
    direction: 'in' | 'out';
    createdAt: string;
  };
  const school = useActiveSchool();
  const queryClient = useQueryClient();
  const isSuperAdmin = localStorage.getItem('jiib.role') === 'Super administrator';
  const [draft, setDraft] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const supportQueryKey = isSuperAdmin ? ['portfolio-support-messages'] : ['school-support-messages', school.id];
  const query = useQuery({
    queryKey: supportQueryKey,
    queryFn: () => jiibApi<SupportMessage[]>(isSuperAdmin
      ? '/api/schools/portfolio/messages'
      : `/api/schools/${encodeURIComponent(school.id)}/help-messages`),
    enabled: isSuperAdmin || localStorage.getItem('jiib.role') === 'School administrator',
  });
  const messages = query.data ?? [];
  const selected = messages.find((item) => item.id === selectedId) ?? messages[0];
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    setError(''); setNotice('');
    try {
      if (isSuperAdmin) {
        if (!selected) {
          setError('Select a school support request before replying.');
          return;
        }
        await jiibApi('/api/schools/portfolio/messages', {
          method: 'POST',
          body: JSON.stringify({ message: draft.trim(), schoolIds: [selected.schoolId] }),
        });
      } else {
        await jiibApi(`/api/schools/${encodeURIComponent(school.id)}/help-messages`, {
          method: 'POST',
          body: JSON.stringify({ message: draft.trim() }),
        });
      }
      setDraft('');
      setNotice(isSuperAdmin ? 'Reply sent to the school.' : 'Your request was sent to JIIB support.');
      await queryClient.invalidateQueries({ queryKey: supportQueryKey });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The message could not be sent.');
    }
  };
  if (!isSuperAdmin && localStorage.getItem('jiib.role') !== 'School administrator') {
    return <div className="fade-up"><PageHeader eyebrow="Help" title="Contact support" description="This support area is available to school administrators and system administrators." /><EmptyState icon={ShieldCheck} title="Ask your school administrator" body="Your school administrator can send a support request to JIIB." /></div>;
  }
  return <div className="fade-up"><PageHeader eyebrow={isSuperAdmin ? 'System support' : 'School support'} title={isSuperAdmin ? 'Support inbox' : 'Contact JIIB support'} description={isSuperAdmin ? 'Review requests from school administrators and send replies to the relevant school.' : 'Send a request to the JIIB support team and review replies.'} />
    {error && <p role="alert" className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <section className="rounded-2xl border border-border bg-card p-5"><h3 className="font-display text-lg font-semibold">{isSuperAdmin ? 'Requests' : 'Support history'}</h3>{query.isLoading ? <p className="py-5 text-sm text-muted-foreground">Loading messages…</p> : query.isError ? <div className="py-5 text-sm text-destructive">Could not load messages. <button onClick={() => void query.refetch()} className="underline">Retry</button></div> : messages.length ? <div className="mt-4 space-y-2">{messages.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={`w-full rounded-xl border p-3 text-left ${selected?.id === item.id ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/40'}`}><p className="text-sm font-semibold">{isSuperAdmin ? item.schoolName ?? item.senderName : item.direction === 'out' ? 'JIIB support' : 'You'}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.message.replace(/^\[system administrator help\]\s*/i, '')}</p><p className="mt-2 text-[10px] text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</p></button>)}</div> : <p className="py-5 text-sm text-muted-foreground">No messages yet.</p>}</section>
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6"><h3 className="font-display text-lg font-semibold">{isSuperAdmin ? selected ? `Reply to ${selected.schoolName ?? selected.senderName}` : 'Select a request' : 'Send a support request'}</h3>{isSuperAdmin && selected && <div className="mt-4 rounded-xl bg-muted/40 p-4 text-sm leading-6">{selected.message.replace(/^\[system administrator help\]\s*/i, '')}<p className="mt-2 text-xs text-muted-foreground">{selected.senderEmail || selected.senderName}</p></div>}<form onSubmit={(event) => void submit(event)}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={7} maxLength={5000} placeholder={isSuperAdmin ? 'Write a reply to this school…' : 'Describe the issue or question…'} className="mt-4 w-full resize-y rounded-xl border border-input bg-background p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring" /><button disabled={!draft.trim() || (isSuperAdmin && !selected)} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Send size={15} /> {isSuperAdmin ? 'Send reply' : 'Send to support'}</button></form></section>
    </div>
  </div>;
}

function Students() {
  const school = useActiveSchool();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [house, setHouse] = useState('');
  const [className, setClassName] = useState('');
  const [editing, setEditing] = useState<Student | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkError, setBulkError] = useState('');
  const [bulkPending, setBulkPending] = useState(false);
  const config = useGetSchoolConfig(school.id, { query: { queryKey: getGetSchoolConfigQueryKey(school.id) } });
  const configData = (config.data?.data ?? {}) as SchoolConfig;
  const houses = configuredHouses(configData);
  const configuredClasses = configData.subjects && !Array.isArray(configData.subjects) && typeof configData.subjects === 'object'
    ? Object.keys(configData.subjects)
    : [];
  const query = useListStudents(school.id, { search: search || undefined, house: house || undefined, className: className || undefined });
  const create = useCreateStudent(); const update = useUpdateStudent(); const remove = useDeleteStudent();
  const students = query.data || [];
  const classes = Array.from(new Set([...configuredClasses, ...students.map((student) => student.className).filter(Boolean)])).sort();
  const allVisibleSelected = students.length > 0 && students.every((student) => selectedIds.includes(student.id));
  const toggleStudent = (studentId: string) => setSelectedIds((items) =>
    items.includes(studentId) ? items.filter((id) => id !== studentId) : [...items, studentId],
  );
  const bulkDelete = async () => {
    if (!selectedIds.length || !window.confirm(`Delete ${selectedIds.length} selected student record${selectedIds.length === 1 ? '' : 's'} and all linked marks? This cannot be undone.`)) return;
    setBulkError('');
    setBulkPending(true);
    try {
      for (const studentId of selectedIds) {
        await jiibApi(`/api/schools/${encodeURIComponent(school.id)}/students/${encodeURIComponent(studentId)}`, { method: 'DELETE' });
      }
      setSelectedIds([]);
      await qc.invalidateQueries({ queryKey: getListStudentsQueryKey(school.id) });
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : 'Some selected records could not be deleted.');
      await qc.invalidateQueries({ queryKey: getListStudentsQueryKey(school.id) });
    } finally {
      setBulkPending(false);
    }
  };
  const saveStudent = (payload: { name: string; className: string; house: string; parentPhone?: string | null; badges?: string[] }) => {
    if (!editing) return;
    update.mutate({ schoolId: school.id, studentId: editing.id, data: payload }, {
      onSuccess: async () => {
        await Promise.all([
          qc.invalidateQueries({ queryKey: getListStudentsQueryKey(school.id) }),
          qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey(school.id) }),
        ]);
        setEditing(null);
        setShowForm(false);
      },
    });
  };
  const createStudent = (payload: { name: string; className: string; house: string; parentPhone?: string | null; subjects?: string[] }) => {
    create.mutate({ schoolId: school.id, data: payload }, {
      onSuccess: async () => {
        await Promise.all([
          qc.invalidateQueries({ queryKey: getListStudentsQueryKey(school.id) }),
          qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey(school.id) }),
        ]);
        setShowForm(false);
      },
    });
  };
  const deleteStudent = (student: Student) => { if (window.confirm(`Delete ${student.name} from the register and remove all linked marks? This cannot be undone.`)) remove.mutate({ schoolId: school.id, studentId: student.id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListStudentsQueryKey(school.id) }) }); };
  if (showForm && !editing) {
    return <StudentCreatePage
      classes={classes}
      houses={houses}
      configData={configData}
      pending={create.isPending}
      error={create.error instanceof Error ? create.error.message : ''}
      onCancel={() => setShowForm(false)}
      onSave={createStudent}
    />;
  }
  return <div className="fade-up"><PageHeader eyebrow="School register" title="Students" description="Keep the school register accurate, searchable, and ready for every team." action={<div className="flex flex-wrap gap-2">{selectedIds.length > 0 && <button data-testid="button-delete-selected-students" onClick={() => void bulkDelete()} disabled={bulkPending} className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 px-4 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/5 disabled:opacity-50"><Trash2 size={15} /> {bulkPending ? 'Deleting…' : `Delete selected (${selectedIds.length})`}</button>}<button data-testid="button-add-student" onClick={() => { setEditing(null); setShowForm(true); }} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"><Plus size={16} /> Add student</button></div>} />
    <div className="mb-5 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search size={17} className="absolute left-3 top-3.5 text-muted-foreground" /><input data-testid="input-student-search" value={search} onChange={(e) => { setSearch(e.target.value); setSelectedIds([]); }} placeholder="Search by student name" className="h-11 w-full rounded-xl border border-input bg-card pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></div><select data-testid="select-student-class" value={className} onChange={(e) => { setClassName(e.target.value); setSelectedIds([]); }} className="h-11 rounded-xl border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"><option value="">All classes</option>{classes.map((item) => <option key={item} value={item}>{item}</option>)}</select><select data-testid="select-student-house" value={house} onChange={(e) => { setHouse(e.target.value); setSelectedIds([]); }} className="h-11 rounded-xl border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"><option value="">All houses</option>{houses.map((item) => <option key={item} value={item}>{item}</option>)}</select><button data-testid="button-filter-students" onClick={() => { setSearch(''); setClassName(''); setHouse(''); setSelectedIds([]); }} disabled={!search && !className && !house} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-input bg-card px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50"><SlidersHorizontal size={15} /> Clear filters</button></div>
    {bulkError && <p role="alert" className="mb-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{bulkError}</p>}
    <div className="overflow-hidden rounded-2xl border border-border bg-card">{query.isLoading ? <div className="space-y-3 p-5">{[1, 2, 3, 4].map((item) => <SkeletonBlock key={item} className="h-14" />)}</div> : query.isError ? <div className="p-5"><ErrorState retry={() => query.refetch()} /></div> : students.length === 0 ? <EmptyState icon={UsersRound} title="No students match" body={search || className || house ? 'Try a different search or clear the filters.' : 'Your register is ready for its first student.'} action={!search && !className && !house ? <button data-testid="button-empty-add-student" onClick={() => { setEditing(null); setShowForm(true); }} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Add first student</button> : undefined} /> : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left"><thead className="border-b border-border bg-muted/45 text-[10px] uppercase tracking-[.16em] text-muted-foreground"><tr><th className="px-4 py-4"><input aria-label="Select all visible students" type="checkbox" checked={allVisibleSelected} onChange={() => setSelectedIds(allVisibleSelected ? [] : students.map((student) => student.id))} /></th><th className="px-5 py-4 font-bold">Student</th><th className="px-5 py-4 font-bold">Class</th><th className="px-5 py-4 font-bold">House</th><th className="px-5 py-4 font-bold">Optional subjects</th><th className="px-5 py-4 font-bold">Parent contact</th><th className="px-5 py-4 text-right font-bold">Actions</th></tr></thead><tbody className="divide-y divide-border">{students.map((student) => <tr key={student.id} data-testid={`row-student-${student.id}`} className="group transition hover:bg-muted/25"><td className="px-4 py-4"><input aria-label={`Select ${student.name}`} type="checkbox" checked={selectedIds.includes(student.id)} onChange={() => toggleStudent(student.id)} /></td><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{initials(student.name)}</span><div><p data-testid={`text-student-${student.id}`} className="text-sm font-semibold uppercase">{student.name}</p><p className="mt-0.5 text-xs text-muted-foreground">Joined {fmtDate(student.createdAt)}</p></div></div></td><td className="px-5 py-4 text-sm">{student.className}</td><td className="px-5 py-4"><span className="rounded-full bg-[#f7edcf] px-2.5 py-1 text-xs font-semibold text-[#87631c]">{student.house}</span></td><td className="px-5 py-4"><div className="flex flex-wrap gap-1.5">{student.subjects?.length ? student.subjects.map((item) => <span key={item} className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">{item}</span>) : <span className="text-sm text-muted-foreground">None</span>}</div></td><td className="px-5 py-4 text-sm text-muted-foreground">{student.parentPhone || 'Not provided'}</td><td className="px-5 py-4"><div className="flex justify-end gap-1 opacity-70 group-hover:opacity-100"><button data-testid={`button-edit-student-${student.id}`} onClick={() => { setEditing(student); setShowForm(true); }} className="rounded-lg p-2 hover:bg-muted"><Pencil size={15} /></button><button data-testid={`button-delete-student-${student.id}`} onClick={() => deleteStudent(student)} className="rounded-lg p-2 text-destructive hover:bg-destructive/10"><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div>}</div>
    {showForm && editing && <StudentDialog student={editing} pending={update.isPending} classes={classes} houses={houses} defaultClass={className} onClose={() => { setShowForm(false); setEditing(null); }} onSave={saveStudent} />}
  </div>;
}

function StudentCreatePage({
  classes,
  houses,
  configData,
  pending,
  error,
  onCancel,
  onSave,
}: {
  classes: string[];
  houses: string[];
  configData: SchoolConfig;
  pending: boolean;
  error: string;
  onCancel: () => void;
  onSave: (data: { name: string; className: string; house: string; parentPhone?: string | null; subjects?: string[] }) => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [className, setClassName] = useState(classes[0] ?? '');
  const [house, setHouse] = useState(houses[0] ?? '');
  const [parentPhone, setParentPhone] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const availableSubjects = subjectNames(configData, className);
  const settings = configData.settings && typeof configData.settings === 'object'
    ? configData.settings
    : {};
  const optionalSubjectsClass = String(settings.optionalSubjectsClass ?? 'S.3');
  const classLevel = (value: string) => Number(value.match(/\d+/)?.[0] ?? 0);
  const canChooseOptionalSubjects = Boolean(className) &&
    classLevel(className) >= classLevel(optionalSubjectsClass);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first || !last || !className || !house.trim()) return;
    onSave({
      name: `${first} ${last}`,
      className,
      house: house.trim(),
      parentPhone: parentPhone.trim() || null,
      subjects: canChooseOptionalSubjects ? selectedSubjects : [],
    });
  };
  return <div className="fade-up">
    <PageHeader
      eyebrow="School register"
      title="Add a student"
      description="Create a student record for the active term. Optional subject choices are saved with the student."
      action={<button type="button" data-testid="button-back-to-students" onClick={onCancel} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted"><ArrowRight className="rotate-180" size={15} /> Back to students</button>}
    />
    <form onSubmit={submit} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-7">
        <div className="mb-6"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">Student profile</p><h3 className="mt-1 font-display text-xl font-semibold">Basic information</h3><p className="mt-1 text-sm text-muted-foreground">Enter the student’s name and school placement.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" value={firstName} onChange={setFirstName} testId="input-student-first-name" required />
          <Field label="Last name" value={lastName} onChange={setLastName} testId="input-student-last-name" required />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Class</span>
            <select data-testid="input-student-class" required disabled={!classes.length} value={className} onChange={(event) => { setClassName(event.target.value); setSelectedSubjects([]); }} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60">
              <option value="">{classes.length ? 'Select a class' : 'No classes configured'}</option>
              {classes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            {!classes.length && <Link href="/manage-subjects" className="mt-2 inline-block text-xs font-semibold text-primary hover:underline">Configure classes first</Link>}
          </label>
          {houses.length ? <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">House</span>
            <select data-testid="input-student-house-form" required value={house} onChange={(event) => setHouse(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
              <option value="">Select a house</option>
              {houses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label> : <Field label="House" value={house} onChange={setHouse} testId="input-student-house-form" required />}
        </div>
        <div className="mt-4 max-w-md"><Field label="Parent phone (optional)" value={parentPhone} onChange={setParentPhone} testId="input-student-parent-phone" /></div>
        {error && <p role="alert" className="mt-5 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        <div className="mt-7 flex flex-wrap justify-end gap-3 border-t border-border pt-5">
          <button type="button" data-testid="button-cancel-student" onClick={onCancel} className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
          <button type="submit" disabled={pending || !classes.length} data-testid="button-save-student" className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            {pending ? 'Adding student…' : 'Add student'}
          </button>
        </div>
      </section>
      <aside className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">Class choices</p><h3 className="mt-1 font-display text-lg font-semibold">Optional subjects</h3></div>
          <BookOpen size={18} className="mt-1 text-muted-foreground" />
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Choose any optional subjects this student takes. Leave them unchecked if none apply.</p>
        {canChooseOptionalSubjects ? availableSubjects.length ? <fieldset className="mt-5 space-y-2">
          <legend className="sr-only">Choose optional subjects</legend>
          {availableSubjects.map((subject) => <label key={subject} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-3 text-sm transition hover:bg-muted/40">
            <input
              type="checkbox"
              data-testid={`checkbox-optional-subject-${subject.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
              checked={selectedSubjects.includes(subject)}
              onChange={(event) => setSelectedSubjects((current) => event.target.checked
                ? [...current, subject]
                : current.filter((item) => item !== subject))}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <span className="font-medium">{subject}</span>
          </label>)}
        </fieldset> : <div className="mt-5 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          No subjects are configured for {className || 'this class'}. <Link href="/manage-subjects" className="font-semibold text-primary hover:underline">Manage subjects</Link>.
        </div> : <div className="mt-5 rounded-xl bg-muted/45 p-4 text-sm leading-6 text-muted-foreground">
          Optional subject choices begin in {optionalSubjectsClass}. Subjects for earlier classes are assigned from their class configuration.
        </div>}
        {canChooseOptionalSubjects && selectedSubjects.length > 0 && <p className="mt-4 text-xs font-medium text-muted-foreground">{selectedSubjects.length} selected</p>}
      </aside>
    </form>
  </div>;
}

function StudentDialog({ student, pending, classes, houses, defaultClass, onClose, onSave }: { student: Student | null; pending: boolean; classes: string[]; houses: string[]; defaultClass: string; onClose: () => void; onSave: (data: { name: string; className: string; house: string; parentPhone?: string | null; badges?: string[] }) => void }) {
  const [name, setName] = useState(student?.name || '');
  const [className, setClassName] = useState(student?.className || defaultClass || classes[0] || '');
  const [house, setHouse] = useState(student?.house || houses[0] || '');
  const [parentPhone, setParentPhone] = useState(student?.parentPhone || '');
  const submit = (event: FormEvent) => { event.preventDefault(); if (name.trim() && className.trim() && house.trim()) onSave({ name: name.trim(), className: className.trim(), house: house.trim(), parentPhone: parentPhone.trim() || null }); };
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#172b43]/45 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">{student ? 'Update record' : 'New record'}</p><h3 className="mt-1 font-display text-2xl font-semibold">{student ? 'Edit student' : 'Add student'}</h3></div><button data-testid="button-close-student-dialog" onClick={onClose} className="rounded-lg p-2 hover:bg-muted"><X size={18} /></button></div><form onSubmit={submit} className="mt-6 space-y-4"><Field label="Full name" value={name} onChange={setName} testId="input-student-name" required /><div className="grid gap-4 sm:grid-cols-2">{classes.length ? <label className="block"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Class</span><select data-testid="input-student-class" required value={className} onChange={(event) => setClassName(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">{className && !classes.includes(className) && <option value={className}>{className}</option>}{classes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label> : <Field label="Class" value={className} onChange={setClassName} testId="input-student-class" required />}{houses.length ? <label className="block"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">House</span><select data-testid="input-student-house-form" required value={house} onChange={(event) => setHouse(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">{house && !houses.includes(house) && <option value={house}>{house}</option>}{houses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label> : <Field label="House" value={house} onChange={setHouse} testId="input-student-house-form" required />}</div><Field label="Parent phone" value={parentPhone} onChange={setParentPhone} testId="input-student-parent-phone" /><div className="flex justify-end gap-3 pt-3"><button type="button" data-testid="button-cancel-student" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">Cancel</button><button disabled={pending} data-testid="button-save-student" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">{pending && <Loader2 size={15} className="animate-spin" />} {student ? 'Save changes' : 'Create student'}</button></div></form></div></div>;
}
function Field({ label, value, onChange, testId, required = false }: { label: string; value: string; onChange: (value: string) => void; testId: string; required?: boolean }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span><input data-testid={testId} required={required} value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>; }

function Marks() {
  const school = useActiveSchool(); const qc = useQueryClient(); const [term, setTerm] = useState(''); const [className, setClassName] = useState(''); const [subject, setSubject] = useState(''); const [search, setSearch] = useState(''); const [pendingMarks, setPendingMarks] = useState(() => getPendingMarks(school.id));
  const config = useGetSchoolConfig(school.id, { query: { queryKey: getGetSchoolConfigQueryKey(school.id) } });
  const configData = (config.data?.data ?? {}) as SchoolConfig;
  const termOptions = getTerms(configData);
  const selectedTerm = term || currentTerm(configData);
  const updateConfig = useUpdateSchoolConfig();
  const studentsQuery = useQuery({
    queryKey: ['students', school.id, selectedTerm, className, search],
    queryFn: () => jiibApi<Student[]>(
      `/api/schools/${encodeURIComponent(school.id)}/students?termKey=${encodeURIComponent(selectedTerm)}&className=${encodeURIComponent(className)}&search=${encodeURIComponent(search)}`,
    ),
  });
  const marksQuery = useListMarks(school.id, { termKey: selectedTerm, className: className || undefined, subject: subject || undefined });
  const upsert = useUpsertMark();
  const assignedSubjects = JSON.parse(localStorage.getItem('jiib.subjects') || '[]') as string[];
  const configuredSubjects = subjectNames(configData, className);
  const subjects = (configuredSubjects.length ? configuredSubjects : ['English', 'Mathematics', 'Science', 'Social Studies'])
    .filter((name) => localStorage.getItem('jiib.role') !== 'Teacher' || assignedSubjects.length === 0 || assignedSubjects.includes(name));
  useEffect(() => { if (!term && config.isSuccess) setTerm(currentTerm(configData)); }, [term, config.isSuccess, config.data]);
  useEffect(() => { setPendingMarks(getPendingMarks(school.id)); }, [school.id]);
  const students = studentsQuery.data || []; const marks = marksQuery.data || [];
  const locked = Boolean(configData.marksLocked || isTermLocked(configData, selectedTerm));
  const getMark = (studentId: string) => {
    const queued = pendingMarks.find((mark) => mark.studentId === studentId && mark.termKey === selectedTerm && (!subject || mark.subject === subject));
    return queued ?? marks.find((mark) => mark.studentId === studentId && (!subject || mark.subject === subject));
  };
  const save = (student: Student, key: 'aoi' | 'midterm' | 'end', value: string) => {
    const existing = getMark(student.id);
    const selectedSubject = subject || existing?.subject || subjects[0];
    if (!selectedSubject) return;
    const payload = {
      studentId: student.id,
      termKey: selectedTerm,
      subject: selectedSubject,
      aoi: existing?.aoi ?? 0,
      midterm: existing?.midterm ?? 0,
      end: existing?.end ?? 0,
      [key]: value === '' ? 0 : Math.min(key === 'aoi' ? 20 : key === 'midterm' ? 30 : 50, Math.max(0, Number(value) || 0)),
    };
    if (!navigator.onLine) {
      const queued = queueMark({ schoolId: school.id, ...payload });
      setPendingMarks(queued.filter((item) => item.schoolId === school.id));
      window.dispatchEvent(new Event('jiib:sync'));
      return;
    }
    upsert.mutate(
      { schoolId: school.id, data: payload },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: getListMarksQueryKey(school.id, { termKey: selectedTerm, className: className || undefined, subject: subject || undefined }) });
          localStorage.setItem('jiib.lastSyncAt', new Date().toISOString());
        },
        onError: () => {
          if (!navigator.onLine) {
            const queued = queueMark({ schoolId: school.id, ...payload });
            setPendingMarks(queued.filter((item) => item.schoolId === school.id));
          }
        },
      },
    );
  };
  const toggleLock = () => updateConfig.mutate({ schoolId: school.id, data: { data: { ...configData, marksLocked: !locked } } }, { onSuccess: (result) => qc.setQueryData(getGetSchoolConfigQueryKey(school.id), result) });
  const clearTerm = async () => { if (!window.confirm(`Clear all marks for ${selectedTerm}? This cannot be undone.`)) return; await jiibApi(`/api/schools/${encodeURIComponent(school.id)}/marks?termKey=${encodeURIComponent(selectedTerm)}`, { method: 'DELETE' }); await marksQuery.refetch(); };
  const isAdmin = localStorage.getItem('jiib.role') !== 'Teacher';
  return <div className="fade-up"><PageHeader eyebrow="Assessment desk" title="Marks register" description="Enter, review, and keep assessment records moving by class and subject." action={<div className="flex flex-wrap items-center gap-2"><span className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">{navigator.onLine ? `${pendingMarks.length} pending` : 'Offline · queued'}</span>{isAdmin && <button data-testid="button-toggle-marks-lock" onClick={toggleLock} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${locked ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-[#e4c66e] bg-[#fff7d9] text-[#755817]'}`}><LockKeyhole size={14} /> {locked ? 'Marks locked' : 'Unlock / lock marks'}</button>}{isAdmin && <button data-testid="button-clear-term-marks" onClick={() => void clearTerm()} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-muted"><Trash2 size={14} /> Clear term</button>}</div>} />
    <div className="mb-5 grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[1fr_1fr_1fr_1.3fr]"><label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Term</span><select data-testid="select-mark-term" value={selectedTerm} onChange={(e) => setTerm(e.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm">{(termOptions.length ? termOptions : [{ key: selectedTerm, label: selectedTerm, locked: false, active: true }]).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Class</span><input data-testid="input-mark-class" value={className} onChange={(e) => setClassName(e.target.value)} placeholder="All classes" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" /></label><label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Subject</span><select data-testid="select-mark-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm"><option value="">All subjects</option>{subjects.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Find student</span><div className="relative"><Search size={15} className="absolute left-3 top-3 text-muted-foreground" /><input data-testid="input-mark-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or student ID" className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm" /></div></label></div>
     <div className="overflow-hidden rounded-2xl border border-border bg-card">{studentsQuery.isLoading || marksQuery.isLoading ? <div className="space-y-3 p-5">{[1, 2, 3, 4].map((item) => <SkeletonBlock key={item} className="h-14" />)}</div> : studentsQuery.isError || marksQuery.isError ? <div className="p-5"><ErrorState retry={() => { studentsQuery.refetch(); marksQuery.refetch(); }} /></div> : students.length === 0 ? <EmptyState icon={ClipboardList} title="Nothing to enter yet" body="Students matching this class and search will appear here." /> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="border-b border-border bg-muted/45 text-[10px] uppercase tracking-[.16em] text-muted-foreground"><tr><th className="px-5 py-4 font-bold">Student</th><th className="px-3 py-4 font-bold">AOI <span className="font-normal normal-case tracking-normal">(20)</span></th><th className="px-3 py-4 font-bold">Midterm <span className="font-normal normal-case tracking-normal">(30)</span></th><th className="px-3 py-4 font-bold">End <span className="font-normal normal-case tracking-normal">(50)</span></th><th className="px-5 py-4 text-right font-bold">Total</th></tr></thead><tbody className="divide-y divide-border">{students.map((student) => { const mark = getMark(student.id); const total = (mark?.aoi || 0) + (mark?.midterm || 0) + (mark?.end || 0); return <tr key={student.id} data-testid={`row-mark-${student.id}`}><td className="px-5 py-3"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">{initials(student.name)}</span><div><p className="text-sm font-semibold">{student.name}</p><p className="text-xs text-muted-foreground">{student.className} · {mark?.subject || subject || subjects[0]}</p></div></div></td>{(['aoi', 'midterm', 'end'] as const).map((key) => <td key={key} className="px-3 py-3"><input disabled={locked} data-testid={`input-mark-${key}-${student.id}`} type="number" min="0" max={key === 'aoi' ? 20 : key === 'midterm' ? 30 : 50} defaultValue={mark?.[key] || ''} onBlur={(e) => save(student, key, e.target.value)} className="h-9 w-20 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" /></td>)}<td className="px-5 py-3 text-right"><span className={`font-display text-lg font-semibold ${total >= 50 ? 'text-[#2e8c72]' : 'text-foreground'}`}>{total}</span><span className="ml-1 text-xs text-muted-foreground">/ 100</span></td></tr>; })}</tbody></table></div>}</div>
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
  const school = useActiveSchool();
  const parentPhone = localStorage.getItem('jiib.parentPhone') || '';
  const [selectedTerm, setSelectedTerm] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [draft, setDraft] = useState('');
  const [chatError, setChatError] = useState('');
  const portal = useQuery({
    queryKey: ['parent-portal', school.id, parentPhone],
    queryFn: () => jiibApi<{
      activeTerm: string;
      students: Array<Student & { termKey: string }>;
      marks: Array<{ id: string; studentId: string; termKey: string; subject: string; aoi: number; midterm: number; end: number }>;
      terms: Array<{ key: string; label: string }>;
      schoolNews: { title?: string; body?: string } | string | null;
      events: Array<string | { id?: string; title?: string; date?: string }>;
    }>(`/api/schools/${encodeURIComponent(school.id)}/parents/portal?phone=${encodeURIComponent(parentPhone)}`),
    enabled: Boolean(parentPhone),
  });
  const term = selectedTerm || portal.data?.activeTerm || portal.data?.students[0]?.termKey || '';
  const familyStudents = (portal.data?.students ?? []).filter((student) => student.termKey === term);
  const studentId = selectedStudentId || familyStudents[0]?.id || '';
  const student = familyStudents.find((item) => item.id === studentId);
  const studentMarks = (portal.data?.marks ?? []).filter((mark) => mark.studentId === studentId && mark.termKey === term);
  const average = studentMarks.length
    ? Math.round(studentMarks.reduce((sum, item) => sum + item.aoi + item.midterm + item.end, 0) / studentMarks.length)
    : 0;
  const chat = useQuery({
    queryKey: ['parent-chat', school.id, parentPhone],
    queryFn: () => jiibApi<Array<{ id: string; sender: string; sender_name: string; text: string; ts: string }>>(
      `/api/schools/${encodeURIComponent(school.id)}/parents/chat?phone=${encodeURIComponent(parentPhone)}`,
    ),
    enabled: portal.isSuccess && Boolean(parentPhone),
    refetchInterval: 20_000,
  });
  useEffect(() => {
    if (!selectedTerm && portal.data?.activeTerm) setSelectedTerm(portal.data.activeTerm);
  }, [selectedTerm, portal.data?.activeTerm]);
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || !navigator.onLine) return;
    setChatError('');
    try {
      await jiibApi(`/api/schools/${encodeURIComponent(school.id)}/parents/chat`, {
        method: 'POST',
        body: JSON.stringify({ phone: parentPhone, text: draft.trim() }),
      });
      setDraft('');
      await chat.refetch();
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'Message could not be sent.');
    }
  };
  const news = portal.data?.schoolNews;
  const newsBody = typeof news === 'string' ? news : news?.body ?? '';
  return <div className="fade-up"><PageHeader eyebrow="Family view" title="A clear view of progress." description={`Welcome back. Here’s the latest from ${school.name}.`} action={<span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold"><span className="h-2 w-2 rounded-full bg-[#61b990]" /> Parent portal</span>} />
    {portal.isLoading ? <SkeletonBlock className="h-72" /> : portal.isError ? <ErrorState retry={() => void portal.refetch()} /> : <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs uppercase tracking-[.18em] text-muted-foreground">Student report</p><h3 className="mt-1 font-display text-2xl font-semibold">{student?.name || 'No student in this term'}</h3><p className="text-sm text-muted-foreground">{student ? `${student.className} · ${student.house} house` : 'Select another term or contact your school.'}</p></div>
          <div className="flex gap-2">{(portal.data?.terms ?? []).length > 0 && <select aria-label="Academic term" value={term} onChange={(e) => { setSelectedTerm(e.target.value); setSelectedStudentId(''); }} className="h-10 rounded-lg border border-input bg-background px-2 text-sm">{portal.data?.terms.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>}{familyStudents.length > 1 && <select aria-label="Student" value={studentId} onChange={(e) => setSelectedStudentId(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-2 text-sm">{familyStudents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}</div>
        </div>
        {student ? <><div className="mt-8 grid grid-cols-3 gap-3"><div className="rounded-xl bg-muted/55 p-4"><p className="text-xs text-muted-foreground">Subjects</p><p className="mt-2 font-display text-2xl font-semibold">{studentMarks.length}</p></div><div className="rounded-xl bg-muted/55 p-4"><p className="text-xs text-muted-foreground">Average</p><p className="mt-2 font-display text-2xl font-semibold text-primary">{average}</p></div><div className="rounded-xl bg-muted/55 p-4"><p className="text-xs text-muted-foreground">Term</p><p className="mt-2 truncate font-display text-lg font-semibold">{portal.data?.terms.find((item) => item.key === term)?.label ?? term}</p></div></div><div className="mt-8"><h4 className="mb-3 font-semibold">Subject performance</h4>{studentMarks.length ? <div className="space-y-3">{studentMarks.map((mark) => { const total = mark.aoi + mark.midterm + mark.end; return <div key={mark.id}><div className="mb-1 flex justify-between text-sm"><span>{mark.subject}</span><span className="font-semibold">{total}/100</span></div><div className="h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${total}%` }} /></div></div>; })}</div> : <p className="text-sm text-muted-foreground">No marks have been published for this term yet.</p>}</div></> : <div className="mt-8"><EmptyState icon={GraduationCap} title="No matching student record" body="The school does not currently have a student record linked to this phone number for this term." /></div>}
        {newsBody && <div className="mt-8 rounded-xl border border-border bg-muted/40 p-4"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{typeof news === 'object' && news?.title ? news.title : 'School news'}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{newsBody}</p></div>}
        {!!portal.data?.events.length && <div className="mt-5"><h4 className="mb-2 font-semibold">Upcoming events</h4><ul className="space-y-2 text-sm text-muted-foreground">{portal.data.events.map((event, index) => <li key={typeof event === 'object' ? event.id ?? index : `${event}-${index}`} className="rounded-lg bg-muted/40 p-3">{typeof event === 'string' ? event : `${event.title ?? 'School event'}${event.date ? ` · ${event.date}` : ''}`}</li>)}</ul></div>}
      </section>
      <section className="flex min-h-[26rem] flex-col rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex items-center justify-between"><div><h3 className="font-display text-lg font-semibold">Message the school</h3><p className="mt-1 text-sm text-muted-foreground">Messages are visible only to your family and school team.</p></div><MessageSquare size={18} className="text-primary" /></div>
        <div className="mt-5 flex-1 space-y-3 overflow-y-auto">{chat.isLoading ? <SkeletonBlock className="h-16" /> : chat.isError ? <ErrorState retry={() => void chat.refetch()} /> : chat.data?.length ? chat.data.map((message) => <div key={message.id} className={`max-w-[90%] rounded-xl p-3 ${message.sender === 'parent' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted'}`}><p className="whitespace-pre-wrap text-sm leading-5">{message.text}</p><p className={`mt-1 text-[10px] ${message.sender === 'parent' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{message.sender_name} · {fmtDate(message.ts)}</p></div>) : <p className="mt-8 text-sm text-muted-foreground">No messages yet. Send a message to start a conversation.</p>}</div>
        <form onSubmit={(event) => void send(event)} className="mt-4 border-t border-border pt-4"><textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} maxLength={2000} placeholder="Write a message to the school…" className="w-full resize-none rounded-lg border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" /><div className="mt-2 flex items-center justify-between"><span role="alert" className="text-xs text-destructive">{chatError || (!navigator.onLine ? 'Connect to the internet to send messages.' : '')}</span><button disabled={!draft.trim() || !navigator.onLine} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Send size={14} /> Send</button></div></form>
      </section>
    </div>}
  </div>;
}

function SuperAdmin() {
  type PortfolioSchool = School & { studentCount: number; classCount: number; marksCompletionPercent: number };
  type PortfolioMetrics = { schoolCount: number; activeSchoolCount: number; suspendedSchoolCount: number; staffCount: number; studentCount: number; marksCompletionPercent: number; schools: PortfolioSchool[] };
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } });
  const queryClient = useQueryClient();
  const [broadcast, setBroadcast] = useState('');
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);
  const [registering, setRegistering] = useState(false);
  const [schoolName, setSchoolName] = useState('');
  const [slug, setSlug] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const portfolio = useQuery({
    queryKey: ['portfolio-schools'],
    queryFn: () => jiibApi<School[]>('/api/schools/portfolio'),
  });
  const analytics = useQuery({
    queryKey: ['portfolio-analytics'],
    queryFn: () => jiibApi<PortfolioMetrics>('/api/schools/portfolio/analytics'),
  });
  const schools = portfolio.data ?? [];
  const refresh = () => {
    void portfolio.refetch();
    void analytics.refetch();
  };
  const registerSchool = async (event: FormEvent) => {
    event.preventDefault();
    setError(''); setNotice('');
    try {
      const created = await jiibApi<School & { invitationSent?: boolean }>('/api/schools', {
        method: 'POST',
        body: JSON.stringify({ name: schoolName.trim(), slug: slug.trim(), ...(adminEmail.trim() ? { initialAdminEmail: adminEmail.trim() } : {}) }),
      });
      setSchoolName(''); setSlug(''); setAdminEmail(''); setRegistering(false);
      setNotice(created.invitationSent === true
        ? 'School workspace registered and the administrator invitation was sent.'
        : created.invitationSent === false
          ? 'School workspace registered. The administrator already has an account and has been granted access.'
          : 'School workspace registered.');
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not register this school.');
    }
  };
  const setSchoolStatus = async (school: School) => {
    setError('');
    try {
      await jiibApi(`/api/schools/${encodeURIComponent(school.id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !school.active }),
      });
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update school status.');
    }
  };
  const sendBroadcast = async () => {
    if (!broadcast.trim()) return;
    setError(''); setNotice('');
    try {
      const result = await jiibApi<{ sentTo: number }>('/api/schools/portfolio/messages', {
        method: 'POST',
        body: JSON.stringify({ message: broadcast.trim(), ...(selectedSchools.length ? { schoolIds: selectedSchools } : {}) }),
      });
      setBroadcast('');
      setNotice(`Message sent to ${result.sentTo} school${result.sentTo === 1 ? '' : 's'}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send this message.');
    }
  };
  const metricCards = [
    ['Schools', analytics.data?.schoolCount ?? '—'],
    ['Active', analytics.data?.activeSchoolCount ?? '—'],
    ['Staff', analytics.data?.staffCount ?? '—'],
    ['Students', analytics.data?.studentCount ?? '—'],
    ['Marks completion', analytics.data ? `${analytics.data.marksCompletionPercent}%` : '—'],
  ];
  return <div className="fade-up"><PageHeader eyebrow="System oversight" title="Portfolio administration" description="Manage school workspaces, review portfolio-wide progress, and communicate with school administrators." action={<span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold"><span className={`h-2 w-2 rounded-full ${health.isSuccess ? 'bg-[#61b990]' : 'bg-accent'}`} /> {health.isSuccess ? 'All services operational' : 'Checking services'}</span>} />
    <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{metricCards.map(([label, value]) => <div key={label} className="rounded-xl border border-border bg-card p-4"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">{label}</p><p className="mt-2 font-display text-2xl font-semibold">{value}</p></div>)}</div>
    {error && <p role="alert" className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex items-center justify-between"><div><h3 className="font-display text-lg font-semibold">School portfolio</h3><p className="mt-1 text-sm text-muted-foreground">Select recipients for a broadcast and activate or suspend workspaces.</p></div><button data-testid="button-refresh-portfolio" onClick={refresh} className="rounded-lg border border-border p-2 hover:bg-muted"><RefreshCw size={16} /></button></div>
        {portfolio.isLoading ? <p className="py-6 text-sm text-muted-foreground">Loading portfolio…</p> : portfolio.isError ? <div className="py-6 text-sm text-destructive">Portfolio data could not be loaded. <button onClick={refresh} className="underline">Retry</button></div> : <div className="mt-5 space-y-3">{schools.map((school) => {
          const metrics = analytics.data?.schools.find((item) => item.id === school.id);
          const checked = selectedSchools.includes(school.id);
          return <div key={school.id} className="rounded-xl border border-border p-4"><div className="flex items-start gap-3"><input aria-label={`Select ${school.name} as message recipient`} type="checkbox" checked={checked} onChange={() => setSelectedSchools((items) => checked ? items.filter((id) => id !== school.id) : [...items, school.id])} /><div className="flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{school.name}</p><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${school.active ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>{school.active ? 'Active' : 'Suspended'}</span></div><p className="mt-1 text-xs text-muted-foreground">{school.slug} · {metrics?.studentCount ?? 0} students · {metrics?.classCount ?? 0} classes · {metrics?.marksCompletionPercent ?? 0}% marks complete</p></div><button onClick={() => void setSchoolStatus(school)} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">{school.active ? 'Suspend' : 'Activate'}</button></div></div>;
        })}</div>}
        <div className="mt-5 border-t border-border pt-4"><button data-testid="button-add-school" onClick={() => setRegistering((value) => !value)} className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted"><Plus size={15} /> {registering ? 'Cancel registration' : 'Register another school'}</button>
          {registering && <form onSubmit={(event) => void registerSchool(event)} className="mt-4 grid gap-3 sm:grid-cols-2"><input required value={schoolName} onChange={(event) => { setSchoolName(event.target.value); if (!slug) setSlug(event.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')); }} placeholder="School name" className="h-10 rounded-lg border border-input bg-background px-3 text-sm" /><input required value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="school-url-slug" className="h-10 rounded-lg border border-input bg-background px-3 text-sm" /><input type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} placeholder="Initial administrator email (optional)" className="h-10 rounded-lg border border-input bg-background px-3 text-sm sm:col-span-2" /><button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground sm:col-span-2"><Plus size={15} /> Create workspace</button></form>}
        </div>
      </section>
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/25 text-[#87631c]"><Send size={16} /></span><div><h3 className="font-display text-lg font-semibold">Cross-school note</h3><p className="mt-1 text-xs text-muted-foreground">{selectedSchools.length ? `${selectedSchools.length} schools selected` : 'All active schools will receive this message.'}</p></div></div><textarea data-testid="textarea-broadcast" value={broadcast} onChange={(event) => setBroadcast(event.target.value)} placeholder="Share an operational update with school administrators…" rows={6} className="mt-6 w-full resize-none rounded-xl border border-input bg-background p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring" /><button data-testid="button-send-broadcast" onClick={() => void sendBroadcast()} disabled={!broadcast.trim()} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Send size={15} /> Send to schools</button></section>
    </div>
  </div>;
}

export default App;