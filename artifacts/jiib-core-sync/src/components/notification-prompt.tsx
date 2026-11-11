import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { jiibApi } from '@/lib/jiib-api';
import { notificationPermission } from '@/lib/pwa';
import { enablePush, pushSupported, syncPushSubscription } from '@/lib/push';

const ASKED_KEY = 'jiib.push-asked-at';
const PUBLIC_PATHS = new Set(['/', '/login', '/signup']);
const read = (key: string) => { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } };

function signedInStaff(): { schoolId: string; email: string } | null {
  const role = read('jiib.role');
  if (!role || role === 'Parent / guardian' || role === 'Super administrator') return null;
  try {
    const school = JSON.parse(read('jiib.school') || 'null') as { id?: string } | null;
    return school?.id ? { schoolId: String(school.id), email: read('jiib.email') } : null;
  } catch { return null; }
}

type Notice = { id: string; kind: string; title: string; body: string; createdAt: string };

/** Phone notifications for signed-in staff. No switch to find: the phone's own "Allow notifications?" box appears on the first tap
 *  after signing in (browsers do not allow asking sooner). Once allowed, this phone stays registered. */
export function NotificationPrompt() {
  const [location] = useLocation();
  const staff = signedInStaff();
  const schoolId = staff?.schoolId ?? '';
  const permission = notificationPermission();
  const supported = pushSupported();
  const onPublicPage = PUBLIC_PATHS.has(location);

  // Not decided yet: ask on the first tap (at most once a day, so a person who ignores it is not nagged).
  useEffect(() => {
    if (!schoolId || !supported || permission !== 'default' || onPublicPage) return;
    if (Date.now() - Number(read(ASKED_KEY) || 0) < 86_400_000) return;
    const ask = () => { write(ASKED_KEY, String(Date.now())); void enablePush(schoolId); };
    document.addEventListener('pointerdown', ask, { once: true, capture: true });
    return () => document.removeEventListener('pointerdown', ask, { capture: true });
  }, [schoolId, supported, permission, onPublicPage, location]);

  // Already allowed: keep this phone registered, and re-check when it comes back online or the app is reopened.
  useEffect(() => {
    if (!schoolId || !supported || permission !== 'granted') return;
    const sync = () => { void syncPushSubscription(schoolId); };
    sync();
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('online', sync); document.removeEventListener('visibilitychange', onVisible); };
  }, [schoolId, supported, permission, location]);

  return schoolId && !onPublicPage ? <InAppNotices schoolId={schoolId} email={staff?.email ?? ''} /> : null;
}

/** School messages shown inside the app, so everyone gets them even if they never allowed phone notifications. */
function InAppNotices({ schoolId, email }: { schoolId: string; email: string }) {
  const seenKey = `jiib.notices-seen:${schoolId}:${email}`;
  const [notices, setNotices] = useState<Notice[]>([]);
  const [seenAt, setSeenAt] = useState(() => Number(read(seenKey) || 0) || Date.now() - 3 * 86_400_000);

  useEffect(() => {
    let alive = true;
    const load = () => {
      void jiibApi<{ notices: Notice[] }>(`/api/schools/${encodeURIComponent(schoolId)}/push/notices`)
        .then((result) => { if (alive) setNotices(result.notices ?? []); })
        .catch(() => undefined); // offline or not set up: the phone notification still works
    };
    load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('online', load);
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; window.removeEventListener('online', load); document.removeEventListener('visibilitychange', onVisible); };
  }, [schoolId]);

  const unseen = notices.filter((notice) => Date.parse(notice.createdAt) > seenAt).slice(0, 3);
  if (!unseen.length) return null;
  const dismiss = () => {
    const latest = Math.max(...notices.map((notice) => Date.parse(notice.createdAt)), Date.now());
    write(seenKey, String(latest));
    setSeenAt(latest);
  };
  return (
    <div role="region" aria-label="School notices" data-testid="in-app-notices" className="fixed inset-x-3 top-3 z-[8000] mx-auto flex max-w-md flex-col gap-2 sm:left-auto sm:right-4 sm:mx-0">
      {unseen.map((notice) => (
        <div key={notice.id} data-testid="in-app-notice" className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-2xl">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Bell size={16} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{notice.title}</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{notice.body}</p>
          </div>
          <button data-testid="button-dismiss-notices" aria-label="Mark as read" onClick={dismiss} className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X size={16} /></button>
        </div>
      ))}
    </div>
  );
}
