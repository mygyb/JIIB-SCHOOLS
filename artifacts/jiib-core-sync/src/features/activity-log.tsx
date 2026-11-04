// Teacher activity (logins and marks entries) for a school, shown on the System settings page with filters.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, LogIn, RefreshCw, Search } from 'lucide-react';
import type { School } from '@workspace/api-client-react';
import { jiibApi } from '@/lib/jiib-api';

type Entry = { id: string; kind: 'login' | 'marks'; userName: string; userEmail: string; detail: string; at: string };

const KINDS = [['all', 'All'], ['login', 'Logins'], ['marks', 'Marks'] ] as const;
const RANGES = [[1, 'Today'], [7, '7 days'], [30, '30 days'], [0, 'All time']] as const;

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}
const timeLabel = (iso: string) => new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

const chip = (active: boolean) => `h-9 rounded-lg border px-3 text-xs font-semibold transition ${active ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted'}`;

export function ActivityLog({ school }: { school: School }) {
  const [kind, setKind] = useState<'all' | 'login' | 'marks'>('all');
  const [days, setDays] = useState<number>(7);
  const [teacher, setTeacher] = useState('');
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(40);

  const query = useQuery({
    queryKey: ['school-activity', school.id, kind, days],
    queryFn: () => jiibApi<Entry[]>(`/api/schools/${school.id}/activity?days=${days}${kind === 'all' ? '' : `&kind=${kind}`}`),
    refetchInterval: 60_000,
  });
  const entries = query.data ?? [];
  const teachers = useMemo(() => [...new Map(entries.map((entry) => [entry.userEmail, entry.userName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [entries]);
  const needle = search.trim().toLowerCase();
  const visible = entries.filter((entry) => (!teacher || entry.userEmail === teacher) && (!needle || `${entry.userName} ${entry.detail}`.toLowerCase().includes(needle)));
  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>();
    visible.slice(0, shown).forEach((entry) => { const key = dayLabel(entry.at); map.set(key, [...(map.get(key) ?? []), entry]); });
    return [...map.entries()];
  }, [visible, shown]);

  return (
    <section data-testid="activity-log" aria-labelledby="activity-title" className="mt-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="activity-title" className="font-display text-lg font-semibold">Teacher activity</h3>
          <p className="mt-1 text-sm text-muted-foreground">Every teacher login and marks entry at your school, newest first.</p>
        </div>
        <button type="button" data-testid="button-refresh-activity" onClick={() => void query.refetch()} disabled={query.isFetching} aria-label="Refresh activity" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border hover:bg-muted disabled:opacity-70"><RefreshCw size={16} className={query.isFetching ? 'animate-spin' : ''} aria-hidden="true" /></button>
      </div>

      <div className="mt-4 grid gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Type of activity">
          {KINDS.map(([id, label]) => <button key={id} type="button" data-testid={`activity-kind-${id}`} aria-pressed={kind === id} onClick={() => { setKind(id); setShown(40); }} className={chip(kind === id)}>{label}</button>)}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Period">
          {RANGES.map(([id, label]) => <button key={id} type="button" data-testid={`activity-range-${id}`} aria-pressed={days === id} onClick={() => { setDays(id); setShown(40); }} className={chip(days === id)}>{label}</button>)}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <select aria-label="Filter by teacher" data-testid="activity-teacher" value={teacher} onChange={(event) => { setTeacher(event.target.value); setShown(40); }} className="h-11 rounded-lg border border-input bg-background px-3 text-sm">
            <option value="">All teachers</option>
            {teachers.map(([email, name]) => <option key={email} value={email}>{name}</option>)}
          </select>
          <span className="relative block">
            <Search size={15} aria-hidden="true" className="absolute left-3 top-3.5 text-muted-foreground" />
            <input aria-label="Search activity" data-testid="activity-search" value={search} onChange={(event) => { setSearch(event.target.value); setShown(40); }} placeholder="Search a name, subject or class" className="h-11 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm" />
          </span>
        </div>
      </div>

      <div className="mt-5">
        {query.isLoading ? <div className="space-y-2">{[1, 2, 3].map((n) => <div key={n} className="h-12 animate-pulse rounded-xl bg-muted" />)}</div>
          : query.isError ? <p className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">Activity could not be loaded. Make sure the activity setup script has been run in Supabase.</p>
          : !visible.length ? <p className="text-sm text-muted-foreground">No activity matches these filters.</p>
          : <>
            <p className="mb-2 text-xs text-muted-foreground" data-testid="activity-count">{visible.length} {visible.length === 1 ? 'entry' : 'entries'}{entries.length >= 500 ? ' (showing the latest 500)' : ''}</p>
            {groups.map(([label, items]) => (
              <div key={label}>
                <h4 className="sticky top-0 bg-card py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</h4>
                <ul className="divide-y divide-border">
                  {items.map((entry) => (
                    <li key={entry.id} data-testid={`activity-${entry.kind}`} className="flex items-start gap-3 py-3">
                      <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${entry.kind === 'marks' ? 'bg-emerald-500/15 text-emerald-600' : 'bg-primary/10 text-primary'}`}>{entry.kind === 'marks' ? <ClipboardList size={15} aria-hidden="true" /> : <LogIn size={15} aria-hidden="true" />}</span>
                      <span className="min-w-0 flex-1"><span className="block text-sm font-medium leading-5">{entry.userName} {entry.kind === 'marks' ? 'entered marks' : 'logged in'}</span>{entry.detail && <span className="block truncate text-xs text-muted-foreground">{entry.detail}</span>}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{timeLabel(entry.at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {visible.length > shown && <button type="button" data-testid="activity-more" onClick={() => setShown(shown + 40)} className="mt-3 h-11 w-full rounded-xl border border-border text-sm font-semibold hover:bg-muted">Show more ({visible.length - shown} left)</button>}
          </>}
      </div>
    </section>
  );
}
