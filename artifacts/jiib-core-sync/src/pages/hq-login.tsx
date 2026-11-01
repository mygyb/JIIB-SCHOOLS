import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { Loader2, Mail, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { jiibApi } from '@/lib/jiib-api';

/** Private sign-in for the system administrator: email, then a one-time code sent to that address. */
export function HqLogin() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    document.title = 'Sign in';
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
    return () => { robots.remove(); };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const sendCode = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/hq/request-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) });
      if (response.status === 429) throw new Error('Too many attempts. Please wait a few minutes and try again.');
      setStep('code'); setCooldown(60);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !supabase) return;
    setBusy(true); setError('');
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.replace(/\s+/g, ''), type: 'email' });
      if (verifyError || !data.session) throw new Error('That code did not work.');
      const identity = await jiibApi<{ role: string; email: string }>('/api/auth/super-admin');
      if (identity.role !== 'super_admin') throw new Error('That code did not work.');
      localStorage.setItem('jiib.role', 'Super administrator');
      localStorage.setItem('jiib.userName', 'System administrator');
      localStorage.setItem('jiib.email', identity.email.toLowerCase());
      localStorage.removeItem('jiib.school');
      sessionStorage.setItem('jiib.launched', '1');
      setLocation('/super-admin');
    } catch (cause) {
      await supabase.auth.signOut().catch(() => undefined);
      setError(cause instanceof Error ? cause.message : 'That code did not work.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[#0b1220] p-4 text-slate-100">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#111a2e] p-6 shadow-2xl">
        <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-white/10"><ShieldCheck size={22} aria-hidden="true" /></div>
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-slate-400">{step === 'email' ? 'Enter your email to receive a sign-in code.' : 'Enter the code we sent to your email.'}</p>
        {step === 'email' ? (
          <form onSubmit={sendCode} className="mt-5 space-y-3">
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-400">Email</span>
              <input data-testid="hq-email" type="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 w-full rounded-xl border border-white/15 bg-[#0b1220] px-3 text-sm outline-none focus:border-sky-400" /></label>
            {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
            <button data-testid="hq-send" disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-500 text-sm font-semibold text-slate-950 disabled:opacity-60">{busy ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />} Send code</button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-5 space-y-3">
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-400">Code</span>
              <input data-testid="hq-code" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={10} value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))} className="h-14 w-full rounded-xl border border-white/15 bg-[#0b1220] px-3 text-center text-2xl tracking-[.4em] outline-none focus:border-sky-400" /></label>
            {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
            <button data-testid="hq-verify" disabled={busy || code.length < 6} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-500 text-sm font-semibold text-slate-950 disabled:opacity-60">{busy && <Loader2 size={16} className="animate-spin" />} Continue</button>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <button type="button" onClick={() => { setStep('email'); setCode(''); setError(''); }} className="hover:text-slate-200">Change email</button>
              <button type="button" disabled={cooldown > 0 || busy} onClick={() => void sendCode()} className="hover:text-slate-200 disabled:opacity-50">{cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}</button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
