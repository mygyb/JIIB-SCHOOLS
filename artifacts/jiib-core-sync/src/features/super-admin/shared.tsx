import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Laptop, Smartphone, Tablet } from 'lucide-react';
import { jiibApi } from '@/lib/jiib-api';

export type School = { id: string; name: string; slug: string; active: boolean; logoUrl?: string | null };
export type PortfolioSchool = School & { studentCount: number; classCount: number; marksCompletionPercent: number };
export type Portfolio = { schoolCount: number; activeSchoolCount: number; suspendedSchoolCount: number; staffCount: number; studentCount: number; marksCompletionPercent: number; schools: PortfolioSchool[] };
export type Staff = { schoolId: string; email: string; displayName: string | null; role: 'admin' | 'teacher'; schoolName: string };
export type Device = {
  deviceId: string; email: string | null; label: string | null; role: string | null; schoolId: string | null; schoolName: string | null;
  deviceType: string; os: string; browser: string; isApp: boolean; ip: string | null; firstSeen: string; lastSeen: string;
  loginCount: number; revoked: boolean; blocked: boolean; online: boolean;
};
export type Blocked = { email: string; reason: string; blockedAt: string };
export type AuditEntry = { at: string; actor: string; action: string; target: string; detail: string };
export type HelpMessage = { id: string; schoolId: string; schoolName: string; senderName: string; senderEmail: string | null; message: string; direction: 'in' | 'out'; createdAt: string };

export function useHq() {
  const analytics = useQuery({ queryKey: ['hq', 'analytics'], queryFn: async () => {
      // The server names the school key `schoolId`; the portal works with `id`.
      const raw = await jiibApi<Omit<Portfolio, 'schools'> & { schools: Array<PortfolioSchool & { schoolId?: string }> }>('/api/schools/portfolio/analytics');
      return { ...raw, schools: raw.schools.map((s) => ({ ...s, id: s.id ?? s.schoolId ?? '' })) } as Portfolio;
    }, refetchInterval: 60_000 });
  const staff = useQuery({ queryKey: ['hq', 'staff'], queryFn: () => jiibApi<Staff[]>('/api/schools/portfolio/users') });
  const devices = useQuery({ queryKey: ['hq', 'devices'], queryFn: () => jiibApi<Device[]>('/api/hq/devices'), refetchInterval: 30_000, retry: false });
  const blocked = useQuery({ queryKey: ['hq', 'blocked'], queryFn: () => jiibApi<Blocked[]>('/api/hq/blocked'), retry: false });
  const audit = useQuery({ queryKey: ['hq', 'audit'], queryFn: () => jiibApi<AuditEntry[]>('/api/hq/audit'), retry: false });
  const inbox = useQuery({ queryKey: ['hq', 'inbox'], queryFn: () => jiibApi<HelpMessage[]>('/api/schools/portfolio/messages'), refetchInterval: 60_000 });
  return { analytics, staff, devices, blocked, audit, inbox };
}
export type Hq = ReturnType<typeof useHq>;

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 90) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  if (seconds < 86400 * 30) return `${Math.round(seconds / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}

export function Panel({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-border bg-card p-4 sm:p-5 ${className}`}>
      {(title || action) && <div className="mb-3 flex items-center justify-between gap-3">{title && <h2 className="font-display text-base font-semibold">{title}</h2>}{action}</div>}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone = '' }: { label: string; value: ReactNode; hint?: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold ${tone}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'green' | 'red' | 'amber' | 'blue' }) {
  const tones = { muted: 'bg-muted text-muted-foreground', green: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', red: 'bg-red-500/15 text-red-700 dark:text-red-300', amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', blue: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
}

export function DeviceIcon({ type, size = 18 }: { type: string; size?: number }) {
  const Icon = type === 'phone' ? Smartphone : type === 'tablet' ? Tablet : Laptop;
  return <Icon size={size} aria-hidden="true" />;
}

export function Bar({ percent, tone = 'bg-primary' }: { percent: number; tone?: string }) {
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} /></div>;
}

export function QueryState({ query, children, empty }: { query: UseQueryResult<unknown>; children: ReactNode; empty?: ReactNode }) {
  if (query.isLoading) return <div className="space-y-2">{[1, 2, 3].map((n) => <div key={n} className="h-12 animate-pulse rounded-xl bg-muted" />)}</div>;
  if (query.isError) return <p className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{query.error instanceof Error ? query.error.message : 'Could not load this.'}</p>;
  return <>{empty ?? children}</>;
}

export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/50" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="flex h-full w-full max-w-lg flex-col bg-background shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border p-4"><h2 className="font-display text-lg font-semibold">{title}</h2><button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-muted">Close</button></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
