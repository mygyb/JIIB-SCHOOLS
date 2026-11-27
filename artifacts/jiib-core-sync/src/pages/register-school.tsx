import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { jiibApi } from '@/lib/jiib-api';

export function RegisterSchoolPage() {
  const [v, setV] = useState({ schoolName: '', adminName: '', email: '', phone: '', address: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => { document.title = 'Register your school | J-SCHOOLS'; }, []);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    if (v.password !== v.confirm) { setError('The passwords do not match.'); return; }
    setBusy(true);
    try { await jiibApi('/api/public/register-school', { method: 'POST', body: JSON.stringify({ ...v, confirm: undefined }) }); setDone(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not send your registration.'); }
    setBusy(false);
  };
  const field = 'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm';
  return <main className="grid min-h-[100dvh] place-items-center bg-[#edf2f6] p-4">
    <div className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-xl">
      <Link href="/" className="text-xs text-primary hover:underline">← Back to home</Link>
      <h1 className="mt-2 font-display text-2xl font-semibold">Register your school</h1>
      <p className="text-sm text-muted-foreground">Start with a free 21-day trial. We review every registration, then send you a welcome e-mail and SMS when your portal is ready.</p>
      {done ? <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900"><b>Registration received.</b><p className="mt-1">We will review it and contact you by e-mail and SMS once your school is approved. You do not need to register again.</p></div> :
      <form onSubmit={(e) => void submit(e)} className="mt-5 space-y-3">
        <input required className={field} placeholder="School name" value={v.schoolName} onChange={set('schoolName')} />
        <input required className={field} placeholder="Your full name" value={v.adminName} onChange={set('adminName')} />
        <input required type="email" className={field} placeholder="E-mail (your login)" value={v.email} onChange={set('email')} />
        <input required type="tel" className={field} placeholder="Phone, e.g. 0772 123456" value={v.phone} onChange={set('phone')} />
        <input className={field} placeholder="School address or district (optional)" value={v.address} onChange={set('address')} />
        <input required type="password" minLength={8} className={field} placeholder="Password (8+ characters)" value={v.password} onChange={set('password')} />
        <input required type="password" className={field} placeholder="Confirm password" value={v.confirm} onChange={set('confirm')} />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? 'Sending…' : 'Register school'}</button>
      </form>}
    </div>
  </main>;
}
