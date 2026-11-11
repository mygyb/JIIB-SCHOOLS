// Phone-side push notifications: registers this phone with the school so notifications arrive even when the app is closed.
// Everything here quietly does nothing where the browser lacks support (for example Safari on iPhone until the app is added to the Home Screen).
import { jiibApi } from '@/lib/jiib-api';
import { enableNotifications, getPwaRegistration, notificationsSupported } from '@/lib/pwa';

const SYNC_KEY = 'jiib.push-sync';
const SYNC_EVERY_MS = 12 * 60 * 60 * 1000;

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && notificationsSupported() && 'PushManager' in window;
}

function keyBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((value, index) => value === b[index]);
const read = (key: string) => { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } };

async function registration() {
  return getPwaRegistration() ?? (await navigator.serviceWorker.getRegistration()) ?? null;
}

/** Makes sure this phone is registered for the signed-in person and school. Safe to call often (it re-checks at most every 12 hours). */
export async function syncPushSubscription(schoolId: string, force = false): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted' || !schoolId) return false;
  const stamp = `${schoolId}|${read('jiib.email')}`;
  try {
    const last = JSON.parse(read(SYNC_KEY) || 'null') as { stamp?: string; at?: number } | null;
    if (!force && last?.stamp === stamp && Date.now() - Number(last.at ?? 0) < SYNC_EVERY_MS) return true;
  } catch { /* re-sync */ }
  try {
    const reg = await registration();
    if (!reg) return false;
    const { publicKey } = await jiibApi<{ publicKey: string }>('/api/push/public-key');
    const wanted = keyBytes(publicKey);
    let subscription = await reg.pushManager.getSubscription();
    if (subscription) {
      const have = subscription.options?.applicationServerKey ? new Uint8Array(subscription.options.applicationServerKey) : null;
      if (!have || !same(have, wanted)) { await subscription.unsubscribe(); subscription = null; }
    }
    subscription ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wanted as BufferSource });
    const json = subscription.toJSON();
    await jiibApi(`/api/schools/${encodeURIComponent(schoolId)}/push/subscribe`, {
      method: 'POST',
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent.slice(0, 250) }),
    });
    try { localStorage.setItem(SYNC_KEY, JSON.stringify({ stamp, at: Date.now() })); } catch { /* storage unavailable */ }
    return true;
  } catch {
    return false;
  }
}

/** Asks the phone for permission, then registers it. */
export async function enablePush(schoolId: string): Promise<NotificationPermission | 'unsupported'> {
  const result = await enableNotifications();
  if (result === 'granted') await syncPushSubscription(schoolId, true);
  return result;
}

/** On sign-out: stop notifications for the person who is leaving (the next person to sign in on this phone registers again). */
export async function dropPushSubscription(schoolId: string): Promise<void> {
  if (!pushSupported()) return;
  try {
    const work = (async () => {
      const subscription = await (await registration())?.pushManager.getSubscription();
      if (!subscription) return;
      if (schoolId) await jiibApi(`/api/schools/${encodeURIComponent(schoolId)}/push/unsubscribe`, { method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => undefined);
      await subscription.unsubscribe();
      try { localStorage.removeItem(SYNC_KEY); } catch { /* storage unavailable */ }
    })();
    await Promise.race([work, new Promise((resolve) => window.setTimeout(resolve, 2500))]); // never hold up signing out
  } catch { /* best effort */ }
}
