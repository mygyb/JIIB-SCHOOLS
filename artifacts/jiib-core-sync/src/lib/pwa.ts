// Install-as-app, update notices and reminders for J-SCHOOLS. Everything here is a no-op where the browser lacks support.
import { useSyncExternalStore } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type PwaState = { canInstall: boolean; updateReady: boolean; installed: boolean };

let state: PwaState = { canInstall: false, updateReady: false, installed: false };
let installEvent: BeforeInstallPromptEvent | null = null;
let registration: ServiceWorkerRegistration | null = null;
let reloadOnControllerChange = false;
const listeners = new Set<() => void>();

function setState(patch: Partial<PwaState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function usePwa(): PwaState {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => state,
    () => state,
  );
}

export function isStandalone(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

const INSTALL_SNOOZE_KEY = 'jiib.install-snoozed-until';

/** True when the install sheet may be shown: installable, not already installed, and not waved away recently. */
export function shouldOfferInstall(): boolean {
  if (!state.canInstall || state.installed || isStandalone()) return false;
  try {
    return Number(localStorage.getItem(INSTALL_SNOOZE_KEY) ?? 0) < Date.now();
  } catch {
    return true;
  }
}

export function snoozeInstall(days = 3) {
  try { localStorage.setItem(INSTALL_SNOOZE_KEY, String(Date.now() + days * 86_400_000)); } catch { /* storage unavailable */ }
}

export async function installApp(): Promise<boolean> {
  if (!installEvent) return false;
  const event = installEvent;
  installEvent = null;
  setState({ canInstall: false });
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === 'accepted') setState({ installed: true });
  else snoozeInstall();
  return outcome === 'accepted';
}

export function applyUpdate() {
  const waiting = registration?.waiting;
  if (!waiting) { window.location.reload(); return; }
  reloadOnControllerChange = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

export function checkForUpdate() {
  if (navigator.onLine) registration?.update().catch(() => undefined);
}

function watchForUpdate(reg: ServiceWorkerRegistration) {
  const flagIfReady = () => {
    if (reg.waiting && navigator.serviceWorker.controller) {
      setState({ updateReady: true });
      void notify('J-SCHOOLS update ready', 'A new version is available. Open the app to update.', { tag: 'jiib-update', url: '/', onlyWhenHidden: true });
    }
  };
  flagIfReady();
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    worker?.addEventListener('statechange', () => { if (worker.state === 'installed') flagIfReady(); });
  });
}

export function registerPwa() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installEvent = event as BeforeInstallPromptEvent;
    setState({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => { installEvent = null; setState({ installed: true, canInstall: false }); });

  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloadOnControllerChange) window.location.reload(); });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      registration = reg;
      watchForUpdate(reg);
      // Look for a new release when the phone comes back online, when the app is reopened, and every 30 minutes.
      window.addEventListener('online', checkForUpdate);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
      window.setInterval(checkForUpdate, 30 * 60_000);
    }).catch(() => undefined);
  });
}

// ---- Notifications -------------------------------------------------------------------------------

export function notificationsSupported(): boolean {
  return typeof Notification !== 'undefined' && 'serviceWorker' in navigator;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

export async function enableNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  const result = await Notification.requestPermission();
  listeners.forEach((listener) => listener());
  return result;
}

export async function notify(title: string, body: string, options: { tag: string; url?: string; onlyWhenHidden?: boolean }): Promise<boolean> {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  if (options.onlyWhenHidden && document.visibilityState === 'visible') return false;
  try {
    const reg = registration ?? (await navigator.serviceWorker.getRegistration());
    if (!reg) return false;
    await reg.showNotification(title, {
      body,
      tag: options.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      data: { url: options.url ?? '/marks' },
    });
    return true;
  } catch {
    return false;
  }
}

/** Shows each marks reminder once per deadline: when it is first published, and again when less than a day is left. */
export async function remindAboutDeadline(deadline: string, noticeId: string, formatted: string) {
  const due = new Date(deadline).getTime();
  if (!Number.isFinite(due) || due < Date.now() || Notification.permission !== 'granted') return;
  const stage = due - Date.now() < 86_400_000 ? 'soon' : 'published';
  const key = `jiib.reminded:${noticeId}:${stage}`;
  try { if (localStorage.getItem(key)) return; } catch { /* storage unavailable */ }
  const shown = await notify(
    stage === 'soon' ? 'Marks are due soon' : 'Marks deadline set',
    stage === 'soon' ? `Please finish entering your marks before ${formatted}.` : `Please complete your marks by ${formatted}.`,
    { tag: `jiib-deadline-${stage}`, url: '/marks' },
  );
  if (shown) { try { localStorage.setItem(key, '1'); } catch { /* storage unavailable */ } }
}
