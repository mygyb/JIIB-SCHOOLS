// Tells the system which device is signed in, and signs this device out if the system administrator asks.
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { isStandalone } from '@/lib/pwa';

const DEVICE_KEY = 'jiib.device-id';
const NOTICE_KEY = 'jiib.signout-notice';

export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return `volatile-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
}

export function takeSignOutNotice(): string {
  try {
    const notice = sessionStorage.getItem(NOTICE_KEY) ?? localStorage.getItem(NOTICE_KEY) ?? '';
    sessionStorage.removeItem(NOTICE_KEY);
    localStorage.removeItem(NOTICE_KEY);
    return notice;
  } catch {
    return '';
  }
}

export async function forceSignOut(reason: 'revoked' | 'blocked') {
  try {
    localStorage.setItem(NOTICE_KEY, reason === 'blocked'
      ? 'This account has been blocked. Please contact your school administrator.'
      : 'You were signed out by the system administrator. Please log in again.');
  } catch { /* storage unavailable */ }
  try { await supabase?.auth.signOut(); } catch { /* already signed out */ }
  ['jiib.school', 'jiib.role', 'jiib.userName', 'jiib.email', 'jiib.parentPhone', 'jiib.parentVerified', 'jiib.subjects'].forEach((key) => {
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
  });
  window.location.assign('/login');
}

type Identity = { role: string; schoolId?: string; schoolName?: string; label?: string };

async function beat(event: 'login' | 'open' | 'ping', who: Identity) {
  try {
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
    const response = await fetch('/api/devices/heartbeat', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        deviceId: deviceId(),
        event,
        role: who.role,
        schoolId: /^[0-9a-f-]{36}$/i.test(who.schoolId ?? '') ? who.schoolId : null,
        schoolName: who.schoolName ?? null,
        userLabel: who.label ?? null,
        isApp: isStandalone(),
      }),
    });
    if (!response.ok) return;
    const { status } = (await response.json()) as { status?: string };
    if (status === 'revoked' || status === 'blocked') await forceSignOut(status);
  } catch { /* offline: try again on the next beat */ }
}

/** Registers this device when someone is signed in, then checks in every minute while the app is visible. */
export function useDeviceHeartbeat(who: Identity | null) {
  const key = who ? `${who.role}|${who.schoolId}|${who.label}` : '';
  useEffect(() => {
    if (!who) return;
    const first = sessionStorage.getItem('jiib.hb-session') ? 'open' : 'login';
    try { sessionStorage.setItem('jiib.hb-session', '1'); } catch { /* storage unavailable */ }
    void beat(first, who);
    const tick = () => { if (document.visibilityState === 'visible' && navigator.onLine) void beat('ping', who); };
    const timer = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('online', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener('online', tick); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
