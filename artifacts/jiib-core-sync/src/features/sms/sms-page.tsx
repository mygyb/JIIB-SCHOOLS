// /sms — the Bursar sends fee-balance reminders; the Head teacher sends announcements. Both see the school's SMS balance,
// can ask the system administrator for more, and see what has been sent.
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getGetSchoolConfigQueryKey, useGetSchoolConfig } from '@workspace/api-client-react';
import { AlertTriangle, CheckCircle2, MessageSquareText, Send } from 'lucide-react';
import { jiibApi } from '@/lib/jiib-api';
import { plainSms, smsSegments } from '@/lib/sms-count';
import { currentSchoolId, smsKey, useSmsStatus, type SmsHistory, type SmsStatus } from './sms-data';

type FeePreview = { balance: number; termLabel: string; recipients: number; segments: number; noPhone: number; students: Array<{ studentId: string; name: string; className: string; balance: number; phone: string | null; message: string; segments: number }> };
type AnnouncePreview = { balance: number; recipients: number; segments: number; segmentsEach: number; noPhone: number };
type SendResult = { recipients: number; sent: number; failed: number; refunded: number; balance: number; noPhone: number; error: string };

const card = 'rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_hsl(var(--foreground)/.03)] sm:p-6';
const field = 'w-full rounded-lg border border-input bg-background px-3 text-sm';
const ugx = (value: number) => `UGX ${Math.round(value).toLocaleString('en-US')}`;
const when = (value: string) => { const d = new Date(value); return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(d) : ''; };
const errorText = (cause: unknown, fallback: string) => (cause instanceof Error ? cause.message : fallback);

function useDebounced<T>(value: T, ms = 450): T {
  const [state, setState] = useState(value);
  useEffect(() => { const timer = window.setTimeout(() => setState(value), ms); return () => window.clearTimeout(timer); }, [value, ms]);
  return state;
}

export function SmsPage() {
  const schoolId = currentSchoolId();
  const role = localStorage.getItem('jiib.role');
  const isBursar = role === 'Bursar';
  const status = useSmsStatus(schoolId);
  return <div data-testid="sms-page" className="fade-up space-y-5">
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[.2em] text-primary">{isBursar ? "Bursar's office" : 'Head teacher'}</p>
      <h2 className="font-display text-2xl font-semibold tracking-tight">{isBursar ? 'Fee reminders by SMS' : 'Announcements by SMS'}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{isBursar ? 'Send each parent their child’s fees balance as a text message. Parents see it on any phone, with or without internet.' : 'Send a message to parents, teachers or both. It arrives as a normal text message on their phones.'}</p>
    </div>
    {status.isError && <p role="alert" data-testid="sms-unavailable" className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">{errorText(status.error, 'SMS is unavailable right now.')}</p>}
    {status.data && <>
      <BalanceCard schoolId={schoolId} status={status.data} isBursar={isBursar} />
      {isBursar ? <FeeReminders schoolId={schoolId} status={status.data} /> : <Announcements schoolId={schoolId} status={status.data} />}
      <History items={status.data.history} />
    </>}
  </div>;
}

function BalanceCard({ schoolId, status, isBursar }: { schoolId: string; status: SmsStatus; isBursar: boolean }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(300);
  const [open, setOpen] = useState(false);
  const [payCode, setPayCode] = useState(status.payCode);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  useEffect(() => setPayCode(status.payCode), [status.payCode]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: smsKey(schoolId) });
  const run = async (action: () => Promise<string>) => { setBusy(true); setError(''); setNote(''); try { setNote(await action()); await refresh(); } catch (cause) { setError(errorText(cause, 'That did not work. Please try again.')); } finally { setBusy(false); } };
  const empty = status.balance <= 0;
  return <section data-testid="sms-balance-card" className={card}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">SMS your school can send</p>
        <p data-testid="sms-balance-big" className={`font-display text-4xl font-semibold ${empty ? 'text-destructive' : ''}`}>{status.balance.toLocaleString('en-US')}</p>
        {empty && <p className="mt-1 flex items-center gap-1.5 text-sm text-destructive"><AlertTriangle size={15} /> No SMS left. Request a recharge to send messages.</p>}
        {status.pendingRequest && <p data-testid="sms-pending" className="mt-1 text-sm text-muted-foreground">Recharge of {status.pendingRequest.amount.toLocaleString('en-US')} SMS requested on {when(status.pendingRequest.createdAt)}. Waiting for the system administrator.</p>}
      </div>
      <button type="button" data-testid="sms-request-open" onClick={() => setOpen((value) => !value)} className="h-10 rounded-lg border border-primary px-4 text-sm font-semibold text-primary hover:bg-primary/5">Request more SMS</button>
    </div>
    {open && <div data-testid="sms-request-form" className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
      <p className="text-sm font-medium">How many SMS does the school need?</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {[100, 300, 500, 1000].map((n) => <button key={n} type="button" onClick={() => setAmount(n)} className={`h-9 rounded-full border px-4 text-sm font-semibold ${amount === n ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}>{n}</button>)}
        <input data-testid="sms-request-amount" type="number" min={1} value={amount} onChange={(event) => setAmount(Math.max(0, Math.round(Number(event.target.value) || 0)))} className={`${field} h-9 w-28`} aria-label="Number of SMS" />
        <button type="button" data-testid="sms-request-send" disabled={busy || amount < 1} onClick={() => void run(async () => { await jiibApi(`/api/schools/${encodeURIComponent(schoolId)}/sms/request`, { method: 'POST', body: JSON.stringify({ amount }) }); setOpen(false); return 'Request sent. The system administrator will add the SMS to your school.'; })} className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">Send request</button>
      </div>
    </div>}
    {isBursar && <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
      <label className="block min-w-[220px] flex-1"><span className="mb-1 block text-xs font-semibold text-muted-foreground">School pay code (printed in every fee reminder)</span>
        <input data-testid="sms-paycode" value={payCode} maxLength={40} onChange={(event) => setPayCode(event.target.value)} placeholder="e.g. 7001234" className={`${field} h-10`} /></label>
      <button type="button" data-testid="sms-paycode-save" disabled={busy || !payCode.trim() || payCode.trim() === status.payCode} onClick={() => void run(async () => { await jiibApi(`/api/schools/${encodeURIComponent(schoolId)}/sms/pay-code`, { method: 'PUT', body: JSON.stringify({ payCode: payCode.trim() }) }); return 'Pay code saved.'; })} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">Save pay code</button>
    </div>}
    {note && <p role="status" className="mt-3 text-sm text-emerald-700">{note}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {!status.providerReady && <p data-testid="sms-provider-warning" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">Sending is not switched on yet by the system administrator. You can prepare messages, but they cannot be sent until it is.</p>}
  </section>;
}

function ResultNote({ result }: { result: SendResult }) {
  return <div role="status" data-testid="sms-result" className={`rounded-xl border p-4 text-sm ${result.failed ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
    <p className="flex items-center gap-2 font-semibold"><CheckCircle2 size={16} /> {result.sent} message{result.sent === 1 ? '' : 's'} sent.</p>
    {result.failed > 0 && <p className="mt-1">{result.failed} could not be sent{result.error ? ` (${result.error})` : ''}. Those SMS were given back to your balance.</p>}
    {result.noPhone > 0 && <p className="mt-1">{result.noPhone} had no valid phone number and were skipped.</p>}
    <p className="mt-1">SMS left: <strong>{result.balance.toLocaleString('en-US')}</strong></p>
  </div>;
}

/* ------------------------------------------------ Bursar ------------------------------------------------ */
function FeeReminders({ schoolId, status }: { schoolId: string; status: SmsStatus }) {
  const queryClient = useQueryClient();
  const [template, setTemplate] = useState(status.defaultTemplate);
  const [className, setClassName] = useState('');
  const [minBalance, setMinBalance] = useState(1);
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SendResult | null>(null);
  const debounced = useDebounced(template);
  const base = `/api/schools/${encodeURIComponent(schoolId)}/sms/fees`;
  const preview = useQuery({
    queryKey: ['sms-fees-preview', schoolId, debounced, className, minBalance, status.payCode],
    queryFn: () => jiibApi<FeePreview>(base, { method: 'POST', body: JSON.stringify({ template: debounced, className: className || undefined, minBalance, dryRun: true }) }),
    enabled: debounced.trim().length >= 10, placeholderData: (previous) => previous, retry: false,
  });
  const all = preview.data?.students ?? [];
  const classes = useQuery({ queryKey: ['sms-fees-classes', schoolId], queryFn: () => jiibApi<FeePreview>(base, { method: 'POST', body: JSON.stringify({ template: 'Fee balance for {student} ({class}): {balance}.', dryRun: true }) }), retry: false, staleTime: 60_000 }).data?.students.map((s) => s.className) ?? [];
  const classOptions = Array.from(new Set(classes)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const selected = all.filter((s) => s.phone && !unticked.has(s.studentId));
  const segments = selected.reduce((total, s) => total + s.segments, 0);
  const balance = status.balance;
  const short = segments > balance;
  const insert = (tag: string) => setTemplate((value) => `${value.trimEnd()} ${tag}`);
  const noPayCode = /\{paycode\}/i.test(template) && !status.payCode;

  const send = async () => {
    if (!selected.length) return;
    if (!window.confirm(`Send ${selected.length} fee reminder${selected.length === 1 ? '' : 's'} using ${segments} SMS?\n\nSMS left after sending: ${(balance - segments).toLocaleString('en-US')}`)) return;
    setBusy(true); setError(''); setResult(null);
    try {
      setResult(await jiibApi<SendResult>(base, { method: 'POST', body: JSON.stringify({ template, className: className || undefined, minBalance, studentIds: selected.map((s) => s.studentId) }) }));
      await queryClient.invalidateQueries({ queryKey: smsKey(schoolId) });
    } catch (cause) { setError(errorText(cause, 'The messages could not be sent.')); await queryClient.invalidateQueries({ queryKey: smsKey(schoolId) }); }
    finally { setBusy(false); }
  };

  return <section data-testid="sms-fees" className={card}>
    <h3 className="font-display text-lg font-semibold">Fee balance message</h3>
    <p className="mt-1 text-sm text-muted-foreground">You can change the words. The bracketed parts are filled in for each student. A text message cannot show bold, so the key words are sent in CAPITALS.</p>
    <textarea data-testid="sms-template" value={template} onChange={(event) => setTemplate(event.target.value)} rows={4} maxLength={640} className={`${field} mt-3 py-2 leading-6`} aria-label="Fee message" />
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">Add:</span>
      {['{student}', '{class}', '{balance}', '{term}', '{school}', '{paycode}'].map((tag) => <button key={tag} type="button" onClick={() => insert(tag)} className="rounded-full border border-border bg-muted px-2.5 py-1 font-mono hover:bg-muted/70">{tag}</button>)}
      <button type="button" data-testid="sms-template-reset" onClick={() => setTemplate(status.defaultTemplate)} className="ml-auto text-primary underline">Use the standard message</button>
    </div>
    {noPayCode && <p data-testid="sms-paycode-warning" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Save the school pay code above first, so parents know where to pay.</p>}

    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <label className="block"><span className="mb-1 block text-xs font-semibold text-muted-foreground">Class</span>
        <select data-testid="sms-class" value={className} onChange={(event) => { setClassName(event.target.value); setUnticked(new Set()); }} className={`${field} h-10`}><option value="">All classes</option>{classOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
      <label className="block"><span className="mb-1 block text-xs font-semibold text-muted-foreground">Only balances of at least (UGX)</span>
        <input data-testid="sms-min-balance" type="number" min={1} value={minBalance} onChange={(event) => setMinBalance(Math.max(1, Math.round(Number(event.target.value) || 1)))} className={`${field} h-10`} /></label>
    </div>

    {preview.isError && <p role="alert" className="mt-4 text-sm text-destructive">{errorText(preview.error, 'Could not prepare the list.')}</p>}
    {preview.data && <>
      {all[0] && <div className="mt-5"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What the first parent will receive</p>
        <p data-testid="sms-example" className="mt-1 whitespace-pre-wrap rounded-xl border border-border bg-muted/40 p-3 text-sm leading-6">{all.find((s) => s.phone)?.message ?? all[0].message}</p>
        <p className="mt-1 text-xs text-muted-foreground">{all.find((s) => s.phone)?.segments ?? all[0].segments} SMS per parent (about 160 characters each).</p></div>}
      <div className="mt-5 flex items-center justify-between gap-2"><p className="text-sm font-semibold">{all.length} student{all.length === 1 ? '' : 's'} with a balance</p>
        <div className="flex gap-3 text-xs"><button type="button" className="text-primary underline" onClick={() => setUnticked(new Set())}>Tick all</button><button type="button" className="text-primary underline" onClick={() => setUnticked(new Set(all.map((s) => s.studentId)))}>Untick all</button></div></div>
      <div data-testid="sms-student-list" className="mt-2 max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border">
        {all.length === 0 && <p className="p-4 text-sm text-muted-foreground">No students match. Check the class and balance filters, and that fee structures are set.</p>}
        {all.map((s) => <label key={s.studentId} className={`flex items-center gap-3 px-3 py-2.5 text-sm ${s.phone ? '' : 'bg-amber-50/60'}`}>
          <input type="checkbox" disabled={!s.phone} checked={Boolean(s.phone) && !unticked.has(s.studentId)} onChange={(event) => setUnticked((current) => { const next = new Set(current); if (event.target.checked) next.delete(s.studentId); else next.add(s.studentId); return next; })} className="h-4 w-4" />
          <span className="min-w-0 flex-1"><span className="block truncate font-medium">{s.name}</span><span className="block text-xs text-muted-foreground">{s.className} · {s.phone ? `+${s.phone}` : 'No valid parent phone number'}</span></span>
          <span className="font-semibold tabular-nums">{ugx(s.balance)}</span></label>)}
      </div>
      <div className={`mt-4 rounded-xl border p-4 text-sm ${short ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-muted/40'}`} data-testid="sms-summary">
        <p><strong>{selected.length}</strong> parent{selected.length === 1 ? '' : 's'} · <strong>{segments}</strong> SMS · you have <strong>{balance.toLocaleString('en-US')}</strong> · left after sending <strong>{Math.max(0, balance - segments).toLocaleString('en-US')}</strong></p>
        {preview.data.noPhone > 0 && <p className="mt-1 text-amber-800">{preview.data.noPhone} student{preview.data.noPhone === 1 ? ' has' : 's have'} no valid parent phone number and will be skipped. Add the numbers on the Students page.</p>}
        {short && <p className="mt-1 text-destructive">Not enough SMS. Request a recharge or untick some students.</p>}
      </div>
    </>}
    {error && <p role="alert" data-testid="sms-error" className="mt-3 text-sm text-destructive">{error}</p>}
    {result && <div className="mt-3"><ResultNote result={result} /></div>}
    <button type="button" data-testid="sms-send-fees" disabled={busy || !selected.length || short || noPayCode} onClick={() => void send()} className="mt-4 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Send size={16} />{busy ? 'Sending…' : `Send to ${selected.length} parent${selected.length === 1 ? '' : 's'}`}</button>
  </section>;
}

/* ------------------------------------------------ Head teacher ------------------------------------------------ */
const TEMPLATES = [
  { label: 'Meeting', text: 'Dear parent, there will be a PARENTS MEETING on [date] at [time] at the school. Your attendance is important. Thank you.' },
  { label: 'Closing day', text: 'Dear parent, the term closes on [date]. Please come to collect your child’s report. Thank you.' },
  { label: 'Event', text: 'Dear parent, the school will hold [event] on [date] at [time]. Everyone is welcome. Thank you.' },
];

function Announcements({ schoolId, status }: { schoolId: string; status: SmsStatus }) {
  const queryClient = useQueryClient();
  const school = (() => { try { return String((JSON.parse(localStorage.getItem('jiib.school') || 'null') ?? {}).name ?? ''); } catch { return ''; } })();
  const config = useGetSchoolConfig(schoolId, { query: { queryKey: getGetSchoolConfigQueryKey(schoolId), enabled: Boolean(schoolId) } });
  const cfg = config.data?.data as { subjects?: unknown } | undefined;
  const classNames = cfg?.subjects && typeof cfg.subjects === 'object' && !Array.isArray(cfg.subjects) ? Object.keys(cfg.subjects as Record<string, unknown>) : [];
  const [audience, setAudience] = useState<'parents' | 'teachers' | 'both'>('parents');
  const [classes, setClasses] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SendResult | null>(null);
  const debounced = useDebounced(message);
  const base = `/api/schools/${encodeURIComponent(schoolId)}/sms/announce`;
  const ready = debounced.trim().length >= 3;
  const preview = useQuery({
    queryKey: ['sms-announce-preview', schoolId, debounced, audience, classes.join('|')],
    queryFn: () => jiibApi<AnnouncePreview>(base, { method: 'POST', body: JSON.stringify({ message: debounced, audience, classes: audience === 'teachers' ? undefined : classes, dryRun: true }) }),
    enabled: ready, placeholderData: (previous) => previous, retry: false,
  });
  const text = plainSms(message);
  const each = smsSegments(message);
  const data = preview.data;
  const needed = data ? data.segments : 0;
  const short = Boolean(data) && needed > status.balance;
  const send = async () => {
    if (!data || !data.recipients) return;
    if (!window.confirm(`Send this message to ${data.recipients} ${data.recipients === 1 ? 'person' : 'people'} using ${data.segments} SMS?\n\nSMS left after sending: ${(status.balance - data.segments).toLocaleString('en-US')}`)) return;
    setBusy(true); setError(''); setResult(null);
    try {
      setResult(await jiibApi<SendResult>(base, { method: 'POST', body: JSON.stringify({ message, audience, classes: audience === 'teachers' ? undefined : classes }) }));
      setMessage('');
    } catch (cause) { setError(errorText(cause, 'The messages could not be sent.')); }
    finally { setBusy(false); await queryClient.invalidateQueries({ queryKey: smsKey(schoolId) }); }
  };
  return <section data-testid="sms-announce" className={card}>
    <h3 className="font-display text-lg font-semibold">New announcement</h3>
    <fieldset className="mt-3"><legend className="mb-1 text-xs font-semibold text-muted-foreground">Send to</legend>
      <div className="flex flex-wrap gap-2">{([['parents', 'Parents'], ['teachers', 'Teachers'], ['both', 'Parents and teachers']] as const).map(([value, label]) =>
        <button key={value} type="button" data-testid={`sms-aud-${value}`} aria-pressed={audience === value} onClick={() => setAudience(value)} className={`h-9 rounded-full border px-4 text-sm font-semibold ${audience === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}>{label}</button>)}</div></fieldset>
    {audience !== 'teachers' && classNames.length > 0 && <div className="mt-3"><p className="mb-1 text-xs font-semibold text-muted-foreground">Parents of which classes? <span className="font-normal">(leave empty for the whole school)</span></p>
      <div className="flex flex-wrap gap-1.5">{classNames.map((name) => { const on = classes.includes(name); return <button key={name} type="button" aria-pressed={on} onClick={() => setClasses((current) => on ? current.filter((n) => n !== name) : [...current, name])} className={`h-8 rounded-full border px-3 text-xs font-semibold ${on ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground'}`}>{name}</button>; })}</div></div>}
    <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs"><span className="text-muted-foreground">Start from:</span>
      {TEMPLATES.map((item) => <button key={item.label} type="button" onClick={() => setMessage(school ? `${item.text} - ${school}` : item.text)} className="rounded-full border border-border bg-muted px-3 py-1 font-medium hover:bg-muted/70">{item.label}</button>)}</div>
    <textarea data-testid="sms-message" value={message} onChange={(event) => setMessage(event.target.value)} rows={5} maxLength={640} placeholder="Type your message. Keep it short and clear." className={`${field} mt-2 py-2 leading-6`} aria-label="Message" />
    <p data-testid="sms-counter" className="mt-1 text-xs text-muted-foreground">{text.length} characters · {each} SMS per person{each > 1 ? ' (long messages use more SMS)' : ''}</p>
    {data && ready && <div data-testid="sms-summary" className={`mt-4 rounded-xl border p-4 text-sm ${short ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-muted/40'}`}>
      <p><strong>{data.recipients}</strong> {data.recipients === 1 ? 'person' : 'people'} · <strong>{data.segments}</strong> SMS · you have <strong>{status.balance.toLocaleString('en-US')}</strong> · left after sending <strong>{Math.max(0, status.balance - data.segments).toLocaleString('en-US')}</strong></p>
      {data.noPhone > 0 && <p className="mt-1 text-amber-800">{data.noPhone} {data.noPhone === 1 ? 'has' : 'have'} no valid phone number and will be skipped. {audience !== 'parents' ? 'Teachers’ numbers are added in User management. ' : ''}Parents’ numbers are on the Students page.</p>}
      {data.recipients === 0 && <p className="mt-1 text-destructive">Nobody in this group has a valid phone number yet.</p>}
      {short && <p className="mt-1 text-destructive">Not enough SMS. Request a recharge or choose fewer classes.</p>}
    </div>}
    {preview.isError && ready && <p role="alert" className="mt-3 text-sm text-destructive">{errorText(preview.error, 'Could not prepare the list.')}</p>}
    {error && <p role="alert" data-testid="sms-error" className="mt-3 text-sm text-destructive">{error}</p>}
    {result && <div className="mt-3"><ResultNote result={result} /></div>}
    <button type="button" data-testid="sms-send" disabled={busy || !ready || !data || !data.recipients || short || message.trim() !== debounced.trim()} onClick={() => void send()} className="mt-4 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Send size={16} />{busy ? 'Sending…' : 'Send message'}</button>
  </section>;
}

/* ------------------------------------------------ History ------------------------------------------------ */
function History({ items }: { items: SmsHistory[] }) {
  return <section data-testid="sms-history" className={card}>
    <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><MessageSquareText size={18} className="text-primary" /> Sent messages</h3>
    {items.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nothing has been sent yet.</p> : <ul className="mt-3 divide-y divide-border">
      {items.map((item) => <li key={item.id} className="py-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{item.audience || (item.kind === 'fees' ? 'Fee reminders' : 'Announcement')}</p><p className="text-xs text-muted-foreground">{when(item.createdAt)}</p></div>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.text}</p>
        <p className="mt-1 text-xs text-muted-foreground">{item.recipients} sent to · {item.segments} SMS{item.failed ? ` · ${item.failed} failed` : ''} · by {item.sentBy}</p>
      </li>)}
    </ul>}
  </section>;
}
