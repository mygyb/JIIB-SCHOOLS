// Pieces shared by the Finance screens: school/term context, data hook, sub-navigation, small UI parts.
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getGetSchoolConfigQueryKey, useGetSchoolConfig } from '@workspace/api-client-react';
import { X } from 'lucide-react';
import { jiibApi } from '@/lib/jiib-api';
import { getTerms, type SchoolConfig } from '@/lib/school-data';

let rememberedTerm = '';

export function useFinance() {
  let school: { id?: string; name?: string } = {};
  try { school = JSON.parse(localStorage.getItem('jiib.school') || 'null') ?? {}; } catch { /* no saved school */ }
  const schoolId = String(school.id ?? '');
  const canEdit = localStorage.getItem('jiib.role') === 'Bursar';
  const config = useGetSchoolConfig(schoolId, { query: { queryKey: getGetSchoolConfigQueryKey(schoolId), enabled: Boolean(schoolId) } });
  const cfg = config.data?.data as SchoolConfig | undefined;
  const terms = getTerms(cfg);
  const [picked, setPicked] = useState(rememberedTerm);
  const termKey = picked || String(cfg?.activeTerm ?? '');
  const queryClient = useQueryClient();
  const base = `/api/schools/${encodeURIComponent(schoolId)}/finance`;
  return {
    schoolId, schoolName: String(school.name ?? 'School'), canEdit, terms, termKey, base,
    termLabel: terms.find((term) => term.key === termKey)?.label ?? termKey,
    ready: Boolean(schoolId && termKey),
    setTermKey: (key: string) => { rememberedTerm = key; setPicked(key); },
    refresh: () => queryClient.invalidateQueries({ queryKey: ['fin', schoolId] }),
    call: <T,>(path: string, method = 'GET', body?: unknown) => jiibApi<T>(`${base}${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }),
  };
}
export type FinanceContext = ReturnType<typeof useFinance>;

export function useFin<T>(fin: FinanceContext, key: string, path: string) {
  return useQuery({ queryKey: ['fin', fin.schoolId, fin.termKey, key, path], queryFn: () => fin.call<T>(path), enabled: fin.ready, placeholderData: (previous) => previous });
}

export function FinanceTabs({ location, canEdit }: { location: string; canEdit: boolean }) {
  const tabs = [
    { href: '/finance', label: 'Overview' },
    { href: '/finance/fees', label: 'Fee structures' },
    { href: '/finance/accounts', label: 'Student fees' },
    ...(canEdit ? [{ href: '/finance/payments', label: 'Record payment' }] : []),
    { href: '/finance/defaulters', label: 'Defaulters' },
    { href: '/finance/reports', label: 'Reports' },
  ];
  return <nav aria-label="Finance sections" className="-mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
    {tabs.map((tab) => <Link key={tab.href} href={tab.href} aria-current={location === tab.href ? 'page' : undefined}
      className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${location === tab.href ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}>{tab.label}</Link>)}
  </nav>;
}

export function PageHeader({ eyebrow, title, intro, fin, children }: { eyebrow: string; title: string; intro?: string; fin: FinanceContext; children?: ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.22em] text-primary">{eyebrow}</p>
      <h2 className="font-display text-2xl font-semibold tracking-[-.02em] sm:text-3xl">{title}</h2>
      {intro && <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{intro}</p>}</div>
    <div className="flex items-center gap-2">{children}<TermPicker fin={fin} /></div>
  </div>;
}

export function TermPicker({ fin }: { fin: FinanceContext }) {
  if (fin.terms.length < 2) return fin.termLabel ? <span className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold">{fin.termLabel}</span> : null;
  return <select aria-label="Term" data-testid="select-fin-term" value={fin.termKey} onChange={(event) => fin.setTermKey(event.target.value)} className="h-10 rounded-lg border border-border bg-card px-3 text-sm font-semibold">
    {fin.terms.map((term) => <option key={term.key} value={term.key}>{term.label}{term.active ? ' (current)' : ''}</option>)}
  </select>;
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return <div className="space-y-3" aria-busy="true">{Array.from({ length: rows }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>;
}

export function ErrorNote({ error }: { error: unknown }) {
  return <p role="alert" data-testid="finance-error" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error instanceof Error ? error.message : 'Something went wrong. Please try again.'}</p>;
}

export function Stat({ label, value, note, tone = '' }: { label: string; value: string; note?: string; tone?: string }) {
  return <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
    <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{label}</p>
    <p className={`ledger-figure mt-3 font-display text-xl font-semibold tracking-tight sm:text-2xl ${tone}`}>{value}</p>
    {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
  </div>;
}

export function Bar({ percent }: { percent: number }) {
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} /></div>;
}

export function TypeBadge({ type }: { type: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${type === 'boarding' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>{type === 'boarding' ? 'Boarding' : 'Day'}</span>;
}

/** A panel that slides in from the right on large screens and fills the screen on phones. */
export function Sheet({ title, onClose, children, testId }: { title: string; onClose: () => void; children: ReactNode; testId?: string }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside role="dialog" aria-modal="true" aria-label={title} data-testid={testId} className="flex h-full w-full max-w-xl flex-col bg-background shadow-2xl">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4"><h3 className="min-w-0 truncate font-display text-lg font-semibold">{title}</h3>
        <button type="button" aria-label="Close" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted"><X size={18} /></button></header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
    </aside>
  </div>;
}
