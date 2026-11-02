import { useEffect, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { applyUpdate, installApp, installGuide, isStandalone, shouldOfferInstall, snoozeInstall, usePwa } from '@/lib/pwa';

/** Install sheet (offered when someone taps Log in on the website), "update ready" bar, and launch-screen fade-out. */
export function PwaUi() {
  const pwa = usePwa();
  const [location, setLocation] = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  // Fade the launch screen away once the app has drawn its first page.
  useEffect(() => {
    const splash = document.getElementById('jiib-splash');
    if (!splash) return;
    const timer = window.setTimeout(() => { splash.classList.add('hide'); window.setTimeout(() => splash.remove(), 400); }, 900);
    return () => window.clearTimeout(timer);
  }, []);

  // On the public website, the first tap on "Log in" offers the install sheet. Ignoring it carries straight on to login.
  useEffect(() => {
    if (location !== '/') return;
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[href="/login"]');
      if (!link || !shouldOfferInstall()) return;
      event.preventDefault();
      event.stopPropagation();
      setSheetOpen(true);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [location]);

  const skip = () => { snoozeInstall(); setSheetOpen(false); setLocation('/login'); };
  const install = async () => { setSheetOpen(false); await installApp(); };

  return (
    <>
      {sheetOpen && (
        <div className="fixed inset-0 z-[9000] flex items-end justify-center bg-black/50 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="install-title" data-testid="install-sheet">
          <div className="w-full max-w-sm rounded-2xl bg-card p-5 text-card-foreground shadow-2xl">
            <div className="flex items-center gap-4">
              <img src="/icons/icon-192.png" alt="" width={64} height={64} className="h-16 w-16 rounded-2xl" />
              <div>
                <h2 id="install-title" className="font-display text-lg font-semibold">Install J-SCHOOLS</h2>
                <p className="mt-1 text-sm text-muted-foreground">Open it from your home screen like any other app, with no browser bar.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-2">
              <button type="button" data-testid="button-install-app" onClick={install} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground"><Download size={17} /> Install app</button>
              <button type="button" data-testid="button-install-skip" onClick={skip} className="h-11 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted">Not now, continue to log in</button>
            </div>
          </div>
        </div>
      )}
      {pwa.updateReady && !updateDismissed && (
        <div role="status" data-testid="update-banner" className="fixed inset-x-3 bottom-3 z-[9000] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-card p-3 pl-4 text-card-foreground shadow-2xl">
          <RefreshCw size={18} className="shrink-0 text-primary" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm"><span className="font-semibold">Update available.</span> A newer version of J-SCHOOLS is ready.</p>
          <button type="button" data-testid="button-update-now" onClick={applyUpdate} className="h-9 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground">Update</button>
          <button type="button" aria-label="Later" onClick={() => setUpdateDismissed(true)} className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><X size={16} /></button>
        </div>
      )}
    </>
  );
}

/** "Install app" button for the public website (header and footer). Hidden once the app is installed or when running as the app. */
export function InstallButton({ className = '', testId }: { className?: string; testId: string }) {
  const pwa = usePwa();
  const [help, setHelp] = useState(false);
  const guide = installGuide();
  if (pwa.installed || isStandalone()) return null;
  return (
    <>
      <button type="button" data-testid={testId} onClick={() => (pwa.canInstall ? void installApp() : setHelp(true))} className={`install-chip ${className}`}>
        <Download size={14} aria-hidden="true" /> Install app
      </button>
      {help && (
        <div className="fixed inset-0 z-[9000] flex items-end justify-center bg-black/50 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="install-help-title" onClick={() => setHelp(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-slate-900 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-4">
              <img src="/icons/icon-192.png" alt="" width={56} height={56} className="h-14 w-14 rounded-2xl" />
              <h2 id="install-help-title" className="text-lg font-semibold">Install J-SCHOOLS</h2>
            </div>
            <p className="mt-4 text-sm text-slate-600">Your browser ({guide.browser}) installs apps from its own menu. Follow these steps:</p>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600">
              {guide.steps.map((step) => <li key={step}>{step.split(/\*\*(.+?)\*\*/g).map((part, n) => (n % 2 ? <strong key={n}>{part}</strong> : part))}</li>)}
            </ol>
            <button type="button" onClick={() => setHelp(false)} className="mt-5 h-11 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white">Got it</button>
          </div>
        </div>
      )}
    </>
  );
}
