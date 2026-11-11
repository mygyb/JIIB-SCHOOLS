import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { notificationPermission } from '@/lib/pwa';
import { enablePush, pushSupported, syncPushSubscription } from '@/lib/push';

const SNOOZE_KEY = 'jiib.push-prompt-until';
const PUBLIC_PATHS = new Set(['/', '/login', '/signup']);
const read = (key: string) => { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } };

function signedInStaff(): { schoolId: string } | null {
  const role = read('jiib.role');
  if (!role || role === 'Parent / guardian' || role === 'Super administrator') return null;
  try {
    const school = JSON.parse(read('jiib.school') || 'null') as { id?: string } | null;
    return school?.id ? { schoolId: String(school.id) } : null;
  } catch { return null; }
}

/** Asks signed-in staff to turn on notifications once (marks deadlines and school messages, even when the app is closed),
 *  and keeps this phone registered for them afterwards. */
export function NotificationPrompt() {
  const [location] = useLocation();
  const [, refresh] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const staff = signedInStaff();
  const schoolId = staff?.schoolId ?? '';
  const permission = notificationPermission();
  const supported = pushSupported();

  // Already allowed? Keep this phone registered, and re-check when it comes back online or the app is reopened.
  useEffect(() => {
    if (!schoolId || !supported || permission !== 'granted') return;
    const sync = () => { void syncPushSubscription(schoolId); };
    sync();
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('online', sync); document.removeEventListener('visibilitychange', onVisible); };
  }, [schoolId, supported, permission, location]);

  const snoozed = Number(read(SNOOZE_KEY) || 0) > Date.now();
  if (!schoolId || !supported || permission !== 'default' || hidden || snoozed || PUBLIC_PATHS.has(location)) return null;

  const later = () => {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + 3 * 86_400_000)); } catch { /* storage unavailable */ }
    setHidden(true);
  };
  const turnOn = async () => {
    setBusy(true);
    try { await enablePush(schoolId); } finally { setBusy(false); setHidden(true); refresh((value) => value + 1); }
  };

  return (
    <div role="dialog" aria-label="Turn on notifications" data-testid="notification-prompt" className="fixed inset-x-3 bottom-4 z-[8000] mx-auto max-w-md rounded-2xl border border-border bg-card p-4 shadow-2xl sm:left-auto sm:right-4 sm:mx-0">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Bell size={18} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Get marks deadlines and school messages</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Turn on notifications and J-SCHOOLS can remind you, even when the app is closed or your phone was offline.</p>
          <div className="mt-3 flex gap-2">
            <button data-testid="button-notifications-on" disabled={busy} onClick={() => void turnOn()} className="rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60">{busy ? 'Turning on…' : 'Turn on'}</button>
            <button data-testid="button-notifications-later" onClick={later} className="rounded-lg border border-border px-3.5 py-2 text-xs font-semibold hover:bg-muted">Not now</button>
          </div>
        </div>
        <button aria-label="Close" onClick={later} className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X size={16} /></button>
      </div>
    </div>
  );
}
