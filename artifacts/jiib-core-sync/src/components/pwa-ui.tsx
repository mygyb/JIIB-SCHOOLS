import { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { useLocation } from 'wouter';
import { APK_URL, applyUpdate, installApp, installGuide, useApkAvailable, isStandalone, shouldOfferInstall, snoozeInstall, usePwa } from '@/lib/pwa';

/** Install sheet (offered when someone taps Log in on the website), required-update screen, and launch-screen fade-out. */
export function PwaUi() {
  const pwa = usePwa();
  const [location, setLocation] = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);

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
      {pwa.updateReady && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="update-title" data-testid="update-banner" className="fixed inset-0 z-[10000] flex flex-col bg-white text-slate-900" onKeyDown={(event) => event.stopPropagation()}>
          <h2 id="update-title" className="px-6 pt-10 text-center text-lg font-semibold text-primary">Update J-SCHOOLS</h2>
          <div className="flex flex-1 items-center justify-center">
            <div className="grid h-32 w-32 place-items-center rounded-full bg-primary text-primary-foreground" aria-hidden="true"><Download size={56} strokeWidth={2.5} /></div>
          </div>
          <div className="px-8 pb-10 text-center">
            <p className="text-base">This version of J-SCHOOLS is <span className="font-bold">out of date</span>. Tap "Update" below to get the latest version.</p>
            <p className="mt-5 text-xs text-slate-500">Marks you saved on this phone while offline are kept and will still be sent.</p>
            <button type="button" autoFocus data-testid="button-update-now" onClick={applyUpdate} className="mt-8 h-12 rounded-full bg-primary px-12 text-base font-semibold text-primary-foreground">Update</button>
          </div>
        </div>
      )}
    </>
  );
}

/** "Install app" button for the public website (header and footer). Hidden once the app is installed or when running as the app. */
export function InstallButton({ className = '', testId }: { className?: string; testId: string }) {
  const pwa = usePwa();
  const [help, setHelp] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const apk = useApkAvailable();
  const guide = installGuide();
  const open = () => { setShowSteps(false); setHelp(true); };
  if (pwa.installed || isStandalone()) return null;
  return (
    <>
      <button type="button" data-testid={testId} onClick={() => (apk || !pwa.canInstall ? open() : void installApp())} className={`install-chip ${className}`}>
        <Download size={14} aria-hidden="true" /> Install app
      </button>
      {help && (
        <div className="fixed inset-0 z-[9000] flex items-end justify-center bg-black/50 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="install-help-title" onClick={() => setHelp(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-slate-900 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-4">
              <img src="/icons/icon-192.png" alt="" width={56} height={56} className="h-14 w-14 rounded-2xl" />
              <h2 id="install-help-title" className="text-lg font-semibold">Install J-SCHOOLS</h2>
            </div>
            {apk && !showSteps ? <>
              <p className="mt-4 text-sm text-slate-600">Get the Android app. It opens straight to login and updates itself with the system.</p>
              <a href={APK_URL} download="J-SCHOOLS.apk" data-testid="link-download-apk" onClick={() => setHelp(false)} style={{ color: '#fff' }} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold"><Download size={16} aria-hidden="true" /> Download Android app (APK)</a>
              <p className="mt-2 text-xs text-slate-500">When the download finishes, open it. If your phone asks, allow installs from this browser, then tap Install.</p>
              <button type="button" data-testid="button-install-from-browser" onClick={() => { if (pwa.canInstall) { setHelp(false); void installApp(); } else setShowSteps(true); }} className="mt-4 h-11 w-full rounded-xl border border-slate-300 text-sm font-semibold text-slate-700">Install from the browser instead</button>
            </> : <>
            <p className="mt-4 text-sm text-slate-600">Your browser ({guide.browser}) installs apps from its own menu. Follow these steps:</p>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600">
              {guide.steps.map((step) => <li key={step}>{step.split(/\*\*(.+?)\*\*/g).map((part, n) => (n % 2 ? <strong key={n}>{part}</strong> : part))}</li>)}
            </ol>
            </>}
            <button type="button" onClick={() => setHelp(false)} className="mt-5 h-11 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white">Got it</button>
          </div>
        </div>
      )}
    </>
  );
}
