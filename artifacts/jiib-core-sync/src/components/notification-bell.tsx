// Unread school notices: a bell with a count in the header, and the same count on the installed app's icon.
import { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { jiibApi } from '@/lib/jiib-api';

export type Notice = { id: string; kind: string; title: string; body: string; createdAt: string };
const read = (key: string) => { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } };
const SEEN_EVENT = 'jiib-notices-seen';

type BadgeNav = Navigator & { setAppBadge?: (count?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
function showBadge(count: number) {
  const nav = navigator as BadgeNav;
  try {
    if (count > 0) void nav.setAppBadge?.(count)?.catch?.(() => undefined);
    else void nav.clearAppBadge?.()?.catch?.(() => undefined);
  } catch { /* badges are not supported on this device */ }
}

/** Recent notices for this person, which of them are unread, and a way to mark them read. Shared by the bell and the pop-up. */
export function useNotices(schoolId: string, email: string) {
  const seenKey = `jiib.notices-seen:${schoolId}:${email}`;
  const [notices, setNotices] = useState<Notice[]>([]);
  const [seenAt, setSeenAt] = useState(() => Number(read(seenKey) || 0) || Date.now() - 3 * 86_400_000);

  const load = useCallback(() => {
    void jiibApi<{ notices: Notice[] }>(`/api/schools/${encodeURIComponent(schoolId)}/push/notices`)
      .then((result) => setNotices(result.notices ?? []))
      .catch(() => undefined); // offline or not set up: the phone notification still works
  }, [schoolId]);

  useEffect(() => {
    load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    const onMessage = (event: MessageEvent) => { if (event.data?.type === 'jiib-push') load(); };
    const onSeen = () => setSeenAt(Number(read(seenKey) || 0));
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60_000);
    window.addEventListener('online', load);
    window.addEventListener(SEEN_EVENT, onSeen);
    document.addEventListener('visibilitychange', onVisible);
    navigator.serviceWorker?.addEventListener?.('message', onMessage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', load);
      window.removeEventListener(SEEN_EVENT, onSeen);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker?.removeEventListener?.('message', onMessage);
    };
  }, [load, seenKey]);

  const unread = notices.filter((notice) => Date.parse(notice.createdAt) > seenAt);
  useEffect(() => { showBadge(unread.length); }, [unread.length]);

  const markAllRead = useCallback(() => {
    const latest = Math.max(...notices.map((notice) => Date.parse(notice.createdAt)), Date.now());
    write(seenKey, String(latest));
    setSeenAt(latest);
    window.dispatchEvent(new Event(SEEN_EVENT));
  }, [notices, seenKey]);

  return { notices, unread, seenAt, markAllRead };
}

const when = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export function NotificationBell({ schoolId, email }: { schoolId: string; email: string }) {
  const { notices, unread, seenAt, markAllRead } = useNotices(schoolId, email);
  const [open, setOpen] = useState(false);
  const count = unread.length;
  return <div className="relative">
    <button type="button" data-testid="button-notifications" aria-label={count ? `${count} new notification${count === 1 ? '' : 's'}` : 'Notifications'} aria-expanded={open}
      onClick={() => setOpen((value) => !value)} className="relative grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground">
      <Bell size={17} />
      {count > 0 && <span data-testid="notification-count" className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white">{count > 9 ? '9+' : count}</span>}
    </button>
    {open && <>
      <button type="button" aria-label="Close notifications" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
      <div role="dialog" aria-label="Notifications" data-testid="notification-panel" className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3"><p className="text-sm font-semibold">Notifications</p>
          {count > 0 && <button type="button" data-testid="button-mark-all-read" onClick={markAllRead} className="text-xs font-semibold text-primary hover:underline">Mark all as read</button>}</div>
        <ul className="max-h-80 divide-y divide-border overflow-y-auto">
          {notices.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">No notifications yet.</li>}
          {notices.map((notice) => {
            const isNew = Date.parse(notice.createdAt) > seenAt;
            return <li key={notice.id} className={`px-4 py-3 ${isNew ? 'bg-primary/5' : ''}`}>
              <div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold">{isNew && <span aria-hidden="true" className="mr-1.5 inline-block h-2 w-2 rounded-full bg-destructive align-middle" />}{notice.title}</p><span className="shrink-0 text-[11px] text-muted-foreground">{when(notice.createdAt)}</span></div>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{notice.body}</p>
            </li>;
          })}
        </ul>
      </div>
    </>}
  </div>;
}
