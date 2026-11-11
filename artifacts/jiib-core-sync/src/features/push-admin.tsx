// Publish to teachers → notifications: write a message that appears on teachers' phones (even when the app is closed),
// see how many teachers have notifications turned on, and re-send the marks-deadline notice.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing, Send } from 'lucide-react';
import { jiibApi } from '@/lib/jiib-api';

export type PushResult = { sent: number; failed: number; removed: number; devices: number };
type PushStatus = {
  teachers: { total: number; enabled: number };
  staffDevices: number;
  history: Array<{ id: string; kind: string; title: string; body: string; audience: string | null; sentBy: string | null; recipients: number; failed: number; createdAt: string }>;
};

const MAX_TITLE = 60;
const MAX_BODY = 240;
const KIND_LABEL: Record<string, string> = { message: 'Message', deadline: 'Deadline', reminder: 'Auto reminder' };

export const pushStatusKey = (schoolId: string) => ['push-status', schoolId];

/** Plain-words result of a send, for the confirmation line. */
export function describePush(result: PushResult): string {
  if (result.devices === 0) return 'No phones have notifications turned on yet, so nothing was delivered.';
  const phones = (n: number) => `${n} phone${n === 1 ? '' : 's'}`;
  return `Sent to ${phones(result.sent)}.${result.failed ? ` ${phones(result.failed)} could not be reached right now${result.removed ? ` (${result.removed} no longer has the app)` : ''}.` : ''}`;
}

export function sendDeadlineNotice(schoolId: string, mode: 'published' | 'reminder') {
  return jiibApi<PushResult>(`/api/schools/${encodeURIComponent(schoolId)}/push/deadline`, { method: 'POST', body: JSON.stringify({ mode }) });
}

const when = (value: string) => { const d = new Date(value); return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(d) : ''; };

export function TeacherNotifications({ schoolId, hasDeadline }: { schoolId: string; hasDeadline: boolean }) {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: pushStatusKey(schoolId), queryFn: () => jiibApi<PushStatus>(`/api/schools/${encodeURIComponent(schoolId)}/push/status`), retry: 1 });
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'teachers' | 'staff'>('teachers');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const teachers = status.data?.teachers;

  const run = async (action: () => Promise<string>) => {
    setBusy(true); setError(''); setNotice('');
    try { setNotice(await action()); await queryClient.invalidateQueries({ queryKey: pushStatusKey(schoolId) }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The notification could not be sent. Please try again.'); }
    finally { setBusy(false); }
  };
  const send = () => run(async () => {
    const result = await jiibApi<PushResult>(`/api/schools/${encodeURIComponent(schoolId)}/push/send`, { method: 'POST', body: JSON.stringify({ title: title.trim(), body: body.trim(), audience }) });
    if (result.devices > 0) { setTitle(''); setBody(''); }
    return describePush(result);
  });
  const remind = () => run(async () => describePush(await sendDeadlineNotice(schoolId, 'reminder')));
  const ready = title.trim().length > 0 && body.trim().length > 0 && !busy;

  return <section data-testid="card-teacher-notifications" className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_hsl(var(--foreground)/.03)] sm:p-6 xl:col-span-2">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><BellRing size={18} className="text-primary" /> Send a notification</h3>
        <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">Appears on teachers' phones even when the app is closed. If a phone is offline, it arrives as soon as the phone has internet again (held for up to 2 days).</p>
      </div>
      <span data-testid="text-notification-coverage" className={`rounded-full px-3 py-1.5 text-xs font-semibold ${teachers && teachers.enabled > 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
        {status.isLoading ? 'Checking…' : status.isError ? 'Not available' : `${teachers?.enabled ?? 0} of ${teachers?.total ?? 0} teachers have notifications on`}
      </span>
    </div>
    {status.isError && <p role="alert" data-testid="text-notification-unavailable" className="mt-4 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{status.error instanceof Error ? status.error.message : 'Notifications are unavailable right now.'}</p>}
    {teachers && teachers.total > teachers.enabled && <p className="mt-3 text-xs leading-5 text-muted-foreground">Teachers turn notifications on from the prompt that appears after they sign in (or from their profile menu). Ask the others to do it once.</p>}
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <div>
        <label className="block"><span className="mb-2 block text-sm font-semibold">Title</span>
          <input data-testid="input-notification-title" value={title} maxLength={MAX_TITLE} onChange={(e) => { setTitle(e.target.value); setNotice(''); }} placeholder="e.g. Staff meeting today" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" /></label>
        <label className="mt-4 block"><span className="mb-2 flex justify-between text-sm font-semibold">Message<span className="text-xs font-normal text-muted-foreground">{body.length}/{MAX_BODY}</span></span>
          <textarea data-testid="input-notification-body" value={body} maxLength={MAX_BODY} rows={4} onChange={(e) => { setBody(e.target.value); setNotice(''); }} placeholder="Write the message teachers will see on their phones" className="w-full resize-y rounded-lg border border-input bg-background p-3 text-sm leading-6" /></label>
        <label className="mt-4 block"><span className="mb-2 block text-sm font-semibold">Send to</span>
          <select data-testid="select-notification-audience" value={audience} onChange={(e) => setAudience(e.target.value as 'teachers' | 'staff')} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
            <option value="teachers">Teachers</option>
            <option value="staff">All staff (teachers, head teacher, bursar)</option>
          </select></label>
        <div className="mt-5 flex flex-wrap gap-2">
          <button data-testid="button-send-notification" disabled={!ready} onClick={() => void send()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"><Send size={15} /> {busy ? 'Sending…' : 'Send notification'}</button>
          <button data-testid="button-send-deadline-reminder" disabled={busy || !hasDeadline} onClick={() => void remind()} title={hasDeadline ? undefined : 'Publish a marks deadline first'} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"><Bell size={15} /> Remind about the deadline</button>
        </div>
        {error && <p role="alert" data-testid="text-notification-error" className="mt-3 text-sm text-destructive">{error}</p>}
        {notice && <p role="status" data-testid="text-notification-notice" className="mt-3 text-sm text-emerald-800">{notice}</p>}
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Recently sent</p>
        {status.data?.history.length ? <ul data-testid="list-notification-history" className="divide-y divide-border rounded-xl border border-border">
          {status.data.history.map((item) => <li key={item.id} className="p-3 text-sm">
            <div className="flex items-start justify-between gap-2"><p className="font-semibold">{item.title}</p><span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{KIND_LABEL[item.kind] ?? item.kind}</span></div>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{item.body}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{when(item.createdAt)} · {item.recipients} phone{item.recipients === 1 ? '' : 's'}</p>
          </li>)}
        </ul> : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{status.isLoading ? 'Loading…' : 'Nothing sent yet.'}</p>}
      </div>
    </div>
  </section>;
}
