import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Bar } from 'react-chartjs-2';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, CalendarDays, Check, Download, LockKeyhole, Megaphone, MessageSquare, Plus, Printer, Send, ShieldCheck, Trash2, UsersRound, X } from 'lucide-react';
import {
  getGetSchoolConfigQueryKey,
  getListMarksQueryKey,
  getListStudentsQueryKey,
  useActivateSchoolTerm,
  useClearSchoolTermMarks,
  useCreateSchoolTerm,
  useDeleteSchoolTerm,
  useGetSchoolConfig,
  useListMarks,
  useListStudents,
  useUpdateSchoolTerm,
  useUpdateSchoolConfig,
  useUpdateStudent,
} from '@workspace/api-client-react';
import type { School, SchoolConfig as SchoolConfigResponse, Student } from '@workspace/api-client-react';
import { jiibApi } from '@/lib/jiib-api';
import { currentTerm, getAssessmentFields, getTerms, normalizePhone, subjectNames, subjectRecords, type SchoolConfig } from '@/lib/school-data';

type Page =
  | 'overview'
  | 'parentsPortal'
  | 'parentMessages'
  | 'userManagement'
  | 'performance'
  | 'printMarksheets'
  | 'reportStudio'
  | 'termManagement'
  | 'manageSubjects'
  | 'gradingSystem'
  | 'publishDeadline'
  | 'schoolEvents'
  | 'schoolSettings'
  | 'systemSettings'
  | 'parentView';

type Config = Record<string, unknown>;

function useConfig(schoolId: string) {
  const queryClient = useQueryClient();
  const query = useGetSchoolConfig(schoolId, { query: { queryKey: getGetSchoolConfigQueryKey(schoolId), refetchInterval: 15_000 } });
  const update = useUpdateSchoolConfig();
  const data = (query.data?.data ?? {}) as Config;
  const save = (next: Config, onDone?: () => void) => {
    update.mutate(
      { schoolId, data: { data: next } },
      {
        onSuccess: (result) => {
          queryClient.setQueryData(getGetSchoolConfigQueryKey(schoolId), result);
          onDone?.();
        },
      },
    );
  };
  return { ...query, data, save, saving: update.isPending };
}

function ShellCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_hsl(var(--foreground)/.03)] sm:p-6 ${className}`}>{children}</section>;
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return <div className="mb-6"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">{eyebrow}</p><h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p></div>;
}

function LoadingOrError({ loading, error, retry }: { loading: boolean; error: boolean; retry: () => void }) {
  if (loading) return <div className="rounded-xl bg-muted p-6 text-sm text-muted-foreground">Loading records…</div>;
  if (error) return <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">This section could not load. <button className="ml-2 font-semibold underline" onClick={retry}>Retry</button></div>;
  return null;
}

function Overview({ school }: { school: School }) {
  const config = useConfig(school.id);
  const students = useListStudents(school.id, {});
  const [newsTitle, setNewsTitle] = useState('');
  const [newsBody, setNewsBody] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [saved, setSaved] = useState(false);
  const schoolNews = config.data.schoolNews && typeof config.data.schoolNews === 'object'
    ? config.data.schoolNews as Record<string, unknown>
    : {};
  const events = Array.isArray(config.data.events) ? config.data.events : [];
  const eventViews = events.map((event, index) => typeof event === 'string'
    ? { id: `legacy-${index}`, title: event, date: '' }
    : {
        id: String((event as Record<string, unknown>)?.id ?? `event-${index}`),
        title: String((event as Record<string, unknown>)?.title ?? ''),
        date: String((event as Record<string, unknown>)?.date ?? (event as Record<string, unknown>)?.eventDate ?? ''),
      });
  const publish = () => config.save({
    ...config.data,
    schoolNews: {
      ...schoolNews,
      title: newsTitle.trim() || String(schoolNews.title ?? ''),
      body: newsBody.trim(),
      updatedAt: new Date().toISOString(),
    },
  }, () => { setNewsTitle(''); setNewsBody(''); setSaved(true); setTimeout(() => setSaved(false), 1800); });
  const addEvent = () => {
    if (!eventTitle.trim()) return;
    config.save({
      ...config.data,
      events: [...events, { id: crypto.randomUUID(), title: eventTitle.trim(), date: eventDate, createdAt: new Date().toISOString() }],
    }, () => { setEventTitle(''); setEventDate(''); });
  };
  return <div className="fade-up">
    <SectionHeading eyebrow="Directory & news" title="Keep the school visible." body={`Publish a family-facing update and keep ${school.name}'s directory ready for the team.`} />
    <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
      <ShellCard>
        <div className="flex items-center justify-between"><div><h3 className="font-display text-lg font-semibold">School news</h3><p className="mt-1 text-sm text-muted-foreground">The latest message shown to families.</p></div><Megaphone size={18} className="text-primary" /></div>
        <input data-testid="input-school-news-title" value={newsTitle || String(schoolNews.title ?? '')} onChange={(e) => setNewsTitle(e.target.value)} placeholder="News headline" className="mt-5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" />
        <textarea data-testid="textarea-school-news" value={newsBody || String(schoolNews.body ?? '')} onChange={(e) => setNewsBody(e.target.value)} rows={5} className="mt-3 w-full resize-none rounded-xl border border-input bg-background p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring" placeholder="Share a clear update with families…" />
        <button data-testid="button-publish-news" onClick={publish} disabled={config.saving} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saved ? <Check size={15} /> : <Megaphone size={15} />} {saved ? 'Published' : 'Publish news'}</button>
      </ShellCard>
      <ShellCard>
        <div className="flex items-center justify-between"><div><h3 className="font-display text-lg font-semibold">School events</h3><p className="mt-1 text-sm text-muted-foreground">Visible dates and reminders.</p></div><CalendarDays size={18} className="text-primary" /></div>
        <div className="mt-5 space-y-2">{eventViews.length ? eventViews.map((item, index) => <div key={item.id} className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm"><CalendarDays size={14} className="text-primary" /><span className="flex-1">{item.title}{item.date ? ` · ${item.date}` : ''}</span><button aria-label={`Remove ${item.title}`} onClick={() => config.save({ ...config.data, events: events.filter((_, eventIndex) => eventIndex !== index) })} className="text-muted-foreground hover:text-destructive"><X size={14} /></button></div>) : <p className="text-sm text-muted-foreground">No events published yet.</p>}</div>
        <div className="mt-4 grid gap-2"><input data-testid="input-school-event" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} placeholder="Event title" className="h-10 rounded-lg border border-input bg-background px-3 text-sm" /><div className="flex gap-2"><input data-testid="input-school-event-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm" /><button data-testid="button-add-school-event" onClick={addEvent} disabled={!eventTitle.trim() || config.saving} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-input hover:bg-muted disabled:opacity-50"><Plus size={16} /></button></div></div>
      </ShellCard>
    </div>
    <ShellCard className="mt-5"><div className="flex items-center justify-between"><div><h3 className="font-display text-lg font-semibold">Student directory</h3><p className="mt-1 text-sm text-muted-foreground">A live view of the school register.</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{students.data?.length ?? 0} students</span></div><LoadingOrError loading={students.isLoading} error={students.isError} retry={() => students.refetch()} />{students.data?.length ? <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{students.data.slice(0, 12).map((student) => <div key={student.id} className="rounded-xl border border-border p-3"><p className="text-sm font-semibold">{student.name}</p><p className="mt-1 text-xs text-muted-foreground">{student.className} · {student.house}</p></div>)}</div> : null}</ShellCard>
  </div>;
}

function ParentsPortal({ school }: { school: School }) {
  const config = useConfig(school.id);
  const students = useListStudents(school.id, {});
  const [search, setSearch] = useState('');
  const blockedValues = Array.isArray(config.data.blockedParents)
    ? config.data.blockedParents
    : Array.isArray(config.data.parentBlocks) ? config.data.parentBlocks : [];
  const blocked = blockedValues.map((phone) => normalizePhone(String(phone)));
  const filtered = (students.data ?? []).filter((student) => `${student.name} ${student.parentPhone ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const toggle = (phone: string) => {
    const normalized = normalizePhone(phone);
    if (!normalized) return;
    const next = blocked.includes(normalized)
      ? blocked.filter((value) => value !== normalized)
      : [...blocked, normalized];
    config.save({ ...config.data, blockedParents: next });
  };
  return <div className="fade-up"><SectionHeading eyebrow="People & roles" title="Parents portal" body="Find a family record, review access, and block a phone number when needed." /><ShellCard><div className="flex flex-col gap-3 sm:flex-row"><input data-testid="input-parent-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by student or phone" className="h-11 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /><span className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 text-xs font-semibold"><UsersRound size={15} /> {filtered.length} matches</span></div><LoadingOrError loading={students.isLoading} error={students.isError} retry={() => students.refetch()} /><div className="mt-5 divide-y divide-border">{filtered.map((student) => { const phone = student.parentPhone ?? ''; const isBlocked = blocked.includes(normalizePhone(phone)); return <div key={student.id} className="flex items-center gap-3 py-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-xs font-bold text-primary">{student.name.slice(0, 2).toUpperCase()}</span><div className="flex-1"><p className="text-sm font-semibold">{student.name}</p><p className="mt-1 text-xs text-muted-foreground">{student.className} · {phone || 'No phone on file'}</p></div><button data-testid={`button-block-parent-${student.id}`} onClick={() => toggle(phone)} disabled={!normalizePhone(phone) || config.saving} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${isBlocked ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-border hover:bg-muted'} disabled:opacity-40`}>{isBlocked ? 'Unblock' : 'Block access'}</button></div>; })}</div></ShellCard></div>;
}

function UserManagement({ school }: { school: School }) {
  const config = useConfig(school.id);
  const configData = config.data as SchoolConfig;
  const roster = useQuery({
    queryKey: ['allowed-users', school.id],
    queryFn: () => jiibApi<Array<{ email: string; displayName?: string | null; role: string; subjects?: Array<string | { class?: string; subject?: string }> }>>(
      `/api/schools/${encodeURIComponent(school.id)}/users`,
    ),
  });
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'teacher' | 'admin'>('teacher');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const users = roster.data ?? [];
  const subjectOptions = configData.subjects && typeof configData.subjects === 'object' && !Array.isArray(configData.subjects)
    ? Object.keys(configData.subjects).flatMap((className) =>
        subjectRecords(configData, className).map((item) => ({ className, subject: item.name })),
      )
    : [];
  const pairKey = (className: string, subject: string) => `${className}::${subject}`;
  const ownerFor = (className: string, subject: string) => users.find((user) =>
    user.email.toLowerCase() !== email.trim().toLowerCase() &&
    user.role !== 'admin' &&
    (user.subjects ?? []).some((item) => typeof item === 'object'
      ? item.class === className && item.subject === subject
      : item === subject),
  );
  const add = async () => {
    if (!email.trim() || !name.trim()) return;
    setError('');
    setSuccess('');
    if (role === 'teacher' && selectedSubjects.length === 0) {
      setError('Choose at least one class and subject for this teacher.');
      return;
    }
    try {
      const result = await jiibApi<{ invitationSent?: boolean }>(`/api/schools/${encodeURIComponent(school.id)}/users`, {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          displayName: name.trim(),
          role,
          subjects: role === 'teacher' ? selectedSubjects.map((key) => {
            const [className, subject] = key.split('::', 2);
            return { class: className, subject };
          }) : [],
        }),
      });
      setEmail(''); setName(''); setSelectedSubjects([]);
      setSuccess(result.invitationSent ? 'Invitation email sent. The staff member can finish setting up their sign-in from that message.' : 'School access added. This email already has a sign-in account, so no invitation was needed.');
      await roster.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not grant school access.');
    }
  };
  const remove = async (userEmail: string) => {
    if (!window.confirm(`Remove ${userEmail} from this school's staff access?`)) return;
    try {
      await jiibApi(`/api/schools/${encodeURIComponent(school.id)}/users/${encodeURIComponent(userEmail)}`, { method: 'DELETE' });
      await roster.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove this staff account.');
    }
  };
  return <div className="fade-up"><SectionHeading eyebrow="People & roles" title="User management" body="Invite staff, assign class subjects, and manage who can access the school's workspace." /><div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><ShellCard><h3 className="font-display text-lg font-semibold">Invite staff</h3><p className="mt-1 text-sm text-muted-foreground">A secure Supabase invitation email lets new staff finish setting up their sign-in.</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><input data-testid="input-teacher-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="h-11 rounded-lg border border-input bg-background px-3 text-sm" /><input data-testid="input-teacher-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teacher@school.org" className="h-11 rounded-lg border border-input bg-background px-3 text-sm" /><select aria-label="Staff role" value={role} onChange={(e) => { setRole(e.target.value as 'teacher' | 'admin'); setSelectedSubjects([]); }} className="h-11 rounded-lg border border-input bg-background px-3 text-sm"><option value="teacher">Teacher</option><option value="admin">School administrator</option></select></div>{role === 'teacher' && <div className="mt-4 rounded-xl border border-border p-3"><p className="mb-2 text-xs font-semibold">Assign class subjects</p>{subjectOptions.length ? <div className="grid max-h-52 gap-1 overflow-y-auto sm:grid-cols-2">{subjectOptions.map((option) => { const key = pairKey(option.className, option.subject); const owner = ownerFor(option.className, option.subject); const checked = selectedSubjects.includes(key); return <label key={key} className={`flex items-center gap-2 rounded-lg px-2 py-2 text-xs ${owner ? 'opacity-50' : 'hover:bg-muted'}`}><input type="checkbox" checked={checked} disabled={Boolean(owner)} onChange={() => setSelectedSubjects((items) => checked ? items.filter((item) => item !== key) : [...items, key])} /><span className="flex-1">{option.className} · {option.subject}{owner && <span className="block text-[10px] text-muted-foreground">Assigned to {owner.displayName || owner.email}</span>}</span></label>; })}</div> : <p className="text-xs text-muted-foreground">Add class subjects in Manage subjects before inviting teachers.</p>}</div>}<button data-testid="button-add-teacher" onClick={() => void add()} disabled={!email.trim() || !name.trim() || config.saving || roster.isLoading} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Plus size={15} /> Send invitation</button>{error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}{success && <p role="status" className="mt-3 text-sm text-emerald-700">{success}</p>}</ShellCard><ShellCard><h3 className="font-display text-lg font-semibold">Access rules</h3><p className="mt-1 text-sm text-muted-foreground">Teachers can enter marks only for their assigned classes and subjects. Administrators manage the school register, settings, and staff.</p><div className="mt-5 rounded-xl bg-muted/50 p-4 text-sm"><p className="font-semibold">Invitation delivery</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Supabase Auth must have email invitations enabled. A server-only service key is required; it is never sent to the browser.</p></div></ShellCard></div><ShellCard className="mt-5"><LoadingOrError loading={roster.isLoading} error={roster.isError} retry={() => void roster.refetch()} /><div className="divide-y divide-border">{users.length ? users.map((user) => { const assigned = (user.subjects ?? []).map((item) => typeof item === 'string' ? item : `${item.class ?? 'Class'}: ${item.subject ?? ''}`).join(', '); return <div key={user.email} className="flex items-center gap-3 py-4"><span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{(user.displayName || user.email).slice(0, 2).toUpperCase()}</span><div className="flex-1"><p className="text-sm font-semibold">{user.displayName || user.email}</p><p className="text-xs text-muted-foreground">{user.email} · {user.role}{assigned ? ` · ${assigned}` : ''}</p></div><button aria-label={`Remove ${user.email}`} onClick={() => void remove(user.email)} className="rounded-lg p-2 text-destructive hover:bg-destructive/10"><Trash2 size={15} /></button></div>; }) : !roster.isLoading && !roster.isError ? <p className="py-5 text-sm text-muted-foreground">No staff accounts have access yet.</p> : null}</div></ShellCard></div>;
}

function ParentMessages({ school }: { school: School }) {
  type ChatMessage = { id: string; phone: string; sender: string; sender_name: string; text: string; ts: string };
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['parent-chat-admin', school.id],
    queryFn: () => jiibApi<ChatMessage[]>(`/api/schools/${encodeURIComponent(school.id)}/parent-chat`),
    refetchInterval: 20_000,
  });
  const students = useListStudents(school.id, {});
  const [selectedPhone, setSelectedPhone] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const messages = query.data ?? [];
  const threads = Array.from(new Set(messages.map((message) => normalizePhone(message.phone)).filter(Boolean)));
  const phone = threads.includes(selectedPhone) ? selectedPhone : threads[0] ?? '';
  const conversation = messages
    .filter((message) => normalizePhone(message.phone) === phone)
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  const family = (students.data ?? []).filter((student) => normalizePhone(student.parentPhone ?? '') === phone);
  const title = family.map((student) => student.name).join(', ') || conversation.find((message) => message.sender === 'parent')?.sender_name || phone;
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!phone || !draft.trim()) return;
    setError('');
    try {
      await jiibApi(`/api/schools/${encodeURIComponent(school.id)}/parent-chat`, {
        method: 'POST',
        body: JSON.stringify({ phone, text: draft.trim() }),
      });
      setDraft('');
      await queryClient.invalidateQueries({ queryKey: ['parent-chat-admin', school.id] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the reply.');
    }
  };
  const clearConversation = async () => {
    if (!phone || !window.confirm(`Delete the entire conversation with ${title}? This cannot be undone.`)) return;
    try {
      await jiibApi(`/api/schools/${encodeURIComponent(school.id)}/parent-chat?phone=${encodeURIComponent(phone)}`, { method: 'DELETE' });
      setSelectedPhone('');
      await queryClient.invalidateQueries({ queryKey: ['parent-chat-admin', school.id] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete this conversation.');
    }
  };
  return <div className="fade-up"><SectionHeading eyebrow="Communication centre" title="Parent conversations" body="Reply to a family's phone-verified portal conversation." />
    {query.isError ? <LoadingOrError loading={false} error retry={() => void query.refetch()} /> : <div className="grid min-h-[34rem] gap-4 lg:grid-cols-[17rem_1fr]">
      <ShellCard className="!p-3"><h3 className="px-2 py-2 text-sm font-semibold">Conversations</h3>{query.isLoading ? <p className="p-2 text-sm text-muted-foreground">Loading…</p> : threads.length ? <div className="space-y-1">{threads.map((thread) => { const first = messages.find((message) => normalizePhone(message.phone) === thread); const threadFamily = (students.data ?? []).filter((student) => normalizePhone(student.parentPhone ?? '') === thread); return <button key={thread} onClick={() => setSelectedPhone(thread)} className={`w-full rounded-lg p-3 text-left ${thread === phone ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}><p className="truncate text-sm font-semibold">{threadFamily.map((student) => student.name).join(', ') || first?.sender_name || thread}</p><p className="mt-1 truncate text-xs text-muted-foreground">{first?.text ?? thread}</p></button>; })}</div> : <p className="p-3 text-sm text-muted-foreground">No parent conversations yet.</p>}</ShellCard>
      <section className="flex min-h-[34rem] flex-col overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4"><div><h3 className="font-display text-lg font-semibold">{phone ? title : 'Select a conversation'}</h3>{phone && <p className="text-xs text-muted-foreground">{phone}</p>}</div>{phone && <button onClick={() => void clearConversation()} aria-label="Delete parent conversation" className="rounded-lg p-2 text-destructive hover:bg-destructive/10"><Trash2 size={16} /></button>}</div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">{conversation.map((message) => <div key={message.id} className={`max-w-[85%] rounded-xl p-3 ${message.sender === 'admin' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted'}`}><p className="whitespace-pre-wrap text-sm leading-5">{message.text}</p><p className={`mt-1 text-[10px] ${message.sender === 'admin' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{message.sender_name} · {new Date(message.ts).toLocaleString()}</p></div>)}</div>
        <form onSubmit={(event) => void send(event)} className="border-t border-border p-4"><textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} rows={3} placeholder={phone ? 'Write a reply to this family…' : 'Select a parent conversation first'} disabled={!phone} className="w-full resize-none rounded-lg border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" /><div className="mt-2 flex items-center justify-between"><span role="alert" className="text-xs text-destructive">{error}</span><button disabled={!phone || !draft.trim()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Send size={14} /> Reply</button></div></form>
      </section>
    </div>}
  </div>;
}

function Performance({ school }: { school: School }) {
  const config = useConfig(school.id);
  const students = useListStudents(school.id, {});
  const termKey = currentTerm(config.data as SchoolConfig);
  const marks = useListMarks(school.id, { termKey });
  const configData = config.data as SchoolConfig;
  const fields = getAssessmentFields(configData);
  const maxTotal = Math.max(1, fields.reduce((total, field) => total + field.max, 0));
  const [className, setClassName] = useState('');
  const classOptions = Array.from(new Set((students.data ?? []).map((student) => student.className))).filter(Boolean).sort();
  const classStudents = (students.data ?? []).filter((student) => !className || student.className === className);
  const rows = useMemo(() => classStudents.map((student) => {
    const items = (marks.data ?? []).filter((mark) => mark.studentId === student.id);
    const average = items.length
      ? Math.round(items.reduce((sum, mark) => sum + mark.aoi + mark.midterm + mark.end, 0) / items.length / maxTotal * 100)
      : 0;
    return { id: student.id, name: student.name, className: student.className, average, subjects: items.length };
  }).filter((row) => row.subjects > 0).sort((a, b) => b.average - a.average), [classStudents, marks.data, maxTotal]);
  const subjectRows = useMemo(() => {
    const names = className ? [className] : classOptions;
    return names.flatMap((name) => {
      const classIds = new Set((students.data ?? []).filter((student) => student.className === name).map((student) => student.id));
      const bySubject = new Map<string, { total: number; count: number }>();
      for (const mark of marks.data ?? []) {
        if (!classIds.has(mark.studentId)) continue;
        const current = bySubject.get(mark.subject) ?? { total: 0, count: 0 };
        current.total += mark.aoi + mark.midterm + mark.end;
        current.count += 1;
        bySubject.set(mark.subject, current);
      }
      return Array.from(bySubject, ([subject, value]) => ({
        className: name,
        subject,
        average: Math.round(value.total / Math.max(1, value.count) / maxTotal * 100),
      }));
    }).sort((a, b) => b.average - a.average);
  }, [className, classOptions.join('|'), students.data, marks.data, maxTotal]);
  const highPerformers = rows.filter((row) => row.average >= 80).length;
  const supportNeeded = rows.filter((row) => row.average < 50).length;
  return <div className="fade-up"><SectionHeading eyebrow="Academics & marks" title="Performance" body={`Review ${termKey} results, compare class averages, and identify students and subjects needing support.`} />
    <div className="mb-5 flex flex-col gap-3 sm:flex-row"><label className="flex-1"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Class</span><select data-testid="select-performance-class" value={className} onChange={(event) => setClassName(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm"><option value="">All classes</option>{classOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button data-testid="button-export-performance" onClick={() => window.print()} className="inline-flex h-11 items-center justify-center gap-2 self-end rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:bg-muted print:hidden"><Download size={15} /> Export PDF</button></div>
    <LoadingOrError loading={students.isLoading || marks.isLoading} error={students.isError || marks.isError} retry={() => { void students.refetch(); void marks.refetch(); }} />
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[{ label: 'Class average', value: rows.length ? `${Math.round(rows.reduce((sum, row) => sum + row.average, 0) / rows.length)}%` : '—' }, { label: 'Students with marks', value: rows.length }, { label: 'Giants · 80%+', value: highPerformers }, { label: 'Dwarfs · below 50%', value: supportNeeded }].map((item) => <div key={item.label} className="rounded-xl border border-border bg-card p-4"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">{item.label}</p><p className="mt-2 font-display text-2xl font-semibold">{item.value}</p></div>)}</div>
    <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <ShellCard><div className="flex items-center justify-between"><div><h3 className="font-display text-lg font-semibold">Student averages</h3><p className="mt-1 text-sm text-muted-foreground">{className || 'All classes'} · {rows.length} students</p></div><Archive size={18} className="text-primary" /></div>{rows.length ? <div className="mt-6 h-80"><Bar data={{ labels: rows.slice(0, 15).map((row) => row.name.toUpperCase()), datasets: [{ label: 'Average', data: rows.slice(0, 15).map((row) => row.average), backgroundColor: '#284e80', borderRadius: 7 }] }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100, ticks: { callback: (value) => `${value}%` } } } }} /></div> : <p className="mt-6 text-sm text-muted-foreground">Enter marks to see performance analytics.</p>}</ShellCard>
      <ShellCard><h3 className="font-display text-lg font-semibold">Best subjects</h3><p className="mt-1 text-sm text-muted-foreground">Average score by subject.</p>{subjectRows.length ? <div className="mt-4 space-y-3">{subjectRows.slice(0, 8).map((item) => <div key={`${item.className}-${item.subject}`}><div className="flex justify-between gap-2 text-sm"><span>{item.subject}{!className && <span className="text-muted-foreground"> · {item.className}</span>}</span><span className="font-semibold">{item.average}%</span></div><div className="mt-1.5 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-[#2e8c72]" style={{ width: `${item.average}%` }} /></div></div>)}</div> : <p className="mt-4 text-sm text-muted-foreground">No subject results yet.</p>}</ShellCard>
    </div>
    <ShellCard className="mt-5"><h3 className="font-display text-lg font-semibold">Students needing support</h3><p className="mt-1 text-sm text-muted-foreground">Students with an average below 50% for the selected term.</p>{rows.filter((row) => row.average < 50).length ? <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{rows.filter((row) => row.average < 50).map((row) => <div key={row.id} className="rounded-xl border border-border p-3"><p className="text-sm font-semibold uppercase">{row.name}</p><p className="mt-1 text-xs text-muted-foreground">{row.className} · {row.average}%</p></div>)}</div> : <p className="mt-4 text-sm text-muted-foreground">No students currently fall below 50%.</p>}</ShellCard>
  </div>;
}

function PrintMarksheets({ school, report = false }: { school: School; report?: boolean }) {
  const config = useConfig(school.id);
  const students = useListStudents(school.id, {});
  const configData = config.data as SchoolConfig;
  const termKey = currentTerm(configData);
  const fields = getAssessmentFields(configData);
  const marks = useListMarks(school.id, { termKey });
  const [className, setClassName] = useState('');
  const classes = Array.from(new Set((students.data ?? []).map((student) => student.className))).filter(Boolean);
  const filtered = (students.data ?? []).filter((student) => !className || student.className === className);
  const printClasses = className ? [className] : classes;
  const print = () => window.print();
  return <div className="fade-up"><SectionHeading eyebrow="Academics & marks" title={report ? 'Report studio' : 'Print marksheets'} body={`${report ? 'Prepare printable reports' : 'Print assessment sheets'} using the active term's configured classes, subjects, and assessment components.`} /><ShellCard><div className="flex flex-col gap-3 sm:flex-row sm:items-end print:hidden"><label className="flex-1"><span className="mb-2 block text-xs font-semibold text-muted-foreground">Class</span><select data-testid="select-print-class" value={className} onChange={(e) => setClassName(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"><option value="">All classes</option>{classes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button data-testid="button-print-marksheets" onClick={print} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Printer size={15} /> Print / save PDF</button></div><div className="mt-6 space-y-8">{printClasses.map((group) => { const groupStudents = filtered.filter((student) => student.className === group); const groupSubjects = subjectNames(configData, group); return <section key={group} className="break-inside-avoid"><div className="mb-3 border-b border-border pb-2"><h3 className="font-display text-xl font-semibold">{school.name} · {group}</h3><p className="text-xs text-muted-foreground">{String((configData.terms as Record<string, Record<string, unknown>> | undefined)?.[termKey]?.label ?? termKey)} · {report ? 'Student report' : 'Class marksheet'}</p></div>{groupSubjects.length ? groupSubjects.map((subject) => <div key={`${group}-${subject}`} className="mb-5 overflow-x-auto"><h4 className="mb-2 text-sm font-semibold">{subject}</h4><table className="w-full min-w-[600px] text-left text-xs"><thead className="border-b border-border bg-muted/40 uppercase tracking-wide text-muted-foreground"><tr><th className="px-2 py-2">Student</th>{fields.map((field) => <th key={field.field} className="px-2 py-2">{field.name} / {field.max}</th>)}<th className="px-2 py-2 text-right">Total / {fields.reduce((sum, field) => sum + field.max, 0)}</th></tr></thead><tbody className="divide-y divide-border">{groupStudents.map((student) => { const mark = (marks.data ?? []).find((item) => item.studentId === student.id && item.subject === subject); const values = { c1: mark?.aoi ?? 0, c2: mark?.midterm ?? 0, c3: mark?.end ?? 0 }; const total = fields.reduce((sum, field) => sum + values[field.field], 0); return <tr key={student.id}><td className="px-2 py-2 font-semibold uppercase">{student.name}</td>{fields.map((field) => <td key={field.field} className="px-2 py-2">{mark?.enteredFields?.includes(field.field) || values[field.field] > 0 ? values[field.field] : '—'}</td>)}<td className="px-2 py-2 text-right font-semibold">{total}</td></tr>; })}</tbody></table></div>) : <p className="text-sm text-muted-foreground">No subjects are configured for {group}.</p>}</section>; })}{!filtered.length && <p className="text-sm text-muted-foreground">No students are available for this term.</p>}</div></ShellCard></div>;
}

function TermManagement({ school }: { school: School }) {
  const config = useConfig(school.id);
  const queryClient = useQueryClient();
  const createTerm = useCreateSchoolTerm();
  const updateTerm = useUpdateSchoolTerm();
  const activateTerm = useActivateSchoolTerm();
  const clearTermMarks = useClearSchoolTermMarks();
  const deleteTermMutation = useDeleteSchoolTerm();
  const terms = (config.data.terms && typeof config.data.terms === 'object' && !Array.isArray(config.data.terms) ? config.data.terms : {}) as Record<string, Record<string, unknown>>;
  const [term, setTerm] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const activeTerm = String(config.data.activeTerm ?? '');
  const saving = createTerm.isPending || updateTerm.isPending || activateTerm.isPending ||
    clearTermMarks.isPending || deleteTermMutation.isPending;
  const invalidateSchoolData = () => queryClient.invalidateQueries({
    predicate: (query) => query.queryKey.includes(school.id),
  });
  const performTermAction = async (
    request: () => Promise<SchoolConfigResponse>,
    successMessage: string,
    options: { optimisticConfig?: Config; onSuccess?: () => void } = {},
  ) => {
    setError('');
    setNotice('');
    const configKey = getGetSchoolConfigQueryKey(school.id);
    const previous = queryClient.getQueryData<SchoolConfigResponse>(configKey);
    if (previous && options.optimisticConfig) {
      queryClient.setQueryData<SchoolConfigResponse>(configKey, {
        ...previous,
        data: options.optimisticConfig,
        updatedAt: new Date().toISOString(),
      });
    }
    try {
      const saved = await request();
      queryClient.setQueryData(configKey, saved);
      await invalidateSchoolData();
      setNotice(successMessage);
      options.onSuccess?.();
    } catch (cause) {
      if (previous && options.optimisticConfig) queryClient.setQueryData(configKey, previous);
      setError(cause instanceof Error ? cause.message : 'The term change could not be saved.');
    }
  };
  const add = () => {
    const label = term.trim();
    if (!label) return;
    const key = label.replace(/\s+/g, '-');
    if (terms[key]) return;
    void performTermAction(
      () => createTerm.mutateAsync({ schoolId: school.id, data: { termKey: key, label } }),
      'Term added.',
      { onSuccess: () => setTerm('') },
    );
  };
  const setStatus = (key: string, isLocked: boolean) => void performTermAction(
    () => updateTerm.mutateAsync({
      schoolId: school.id,
      termKey: key,
      data: { status: isLocked ? 'open' : 'closed' },
    }),
    isLocked ? 'Term reopened.' : 'Term closed.',
  );
  const clearMarks = async (key: string) => {
    if (!window.confirm(`Clear marks for closed term ${key}? This cannot be undone.`)) return;
    try {
      await clearTermMarks.mutateAsync({ schoolId: school.id, termKey: key });
      await invalidateSchoolData();
      setNotice('Term marks cleared.');
      setError('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not clear term marks.');
    }
  };
  const deleteTerm = async (key: string) => {
    const label = String(terms[key]?.label ?? key);
    if (!window.confirm(`Delete ${label}, including all student records and marks saved for this term? This cannot be undone.`)) return;
    try {
      await deleteTermMutation.mutateAsync({ schoolId: school.id, termKey: key });
      await invalidateSchoolData();
      setNotice(`${label} deleted.`);
      setError('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not delete the term.');
    }
  };
  return <div className="fade-up">
    <SectionHeading eyebrow="Academics & marks" title="Term management" body="Create terms, choose the active term, and lock completed assessment records. Closing the active term opens the next term automatically." />
    <ShellCard>
      <div className="flex gap-2">
        <input data-testid="input-new-term" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="e.g. Term 2, 2026" className="h-11 flex-1 rounded-lg border border-input bg-background px-3 text-sm" />
        <button data-testid="button-add-term" onClick={add} disabled={!term.trim() || saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Plus size={15} /> Add term</button>
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      <div className="mt-6 divide-y divide-border">
        {Object.entries(terms).length ? Object.entries(terms).map(([key, item]) => {
          const isLocked = Boolean(item.locked || item.status === 'closed');
          const isActive = activeTerm === key;
          return <div key={key} className="flex flex-wrap items-center gap-3 py-4">
            <CalendarDays size={17} className="text-primary" />
            <div className="flex-1">
              <p className="text-sm font-semibold">{String(item.label ?? key)} {isActive && <span className="ml-2 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">Active</span>}</p>
              <p className="mt-1 text-xs text-muted-foreground">{isLocked ? 'Closed · marks are read-only' : 'Open for marks entry'}</p>
            </div>
            {!isActive && <button data-testid={`button-set-active-${key}`} onClick={() => void performTermAction(
              () => activateTerm.mutateAsync({ schoolId: school.id, termKey: key }),
              `${String(item.label ?? key)} is now active.`,
              { optimisticConfig: { ...config.data, activeTerm: key } },
            )} disabled={saving} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50">Set active</button>}
            <button data-testid={`button-close-term-${key}`} onClick={() => setStatus(key, !isLocked)} disabled={saving} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50">{isLocked ? 'Reopen' : 'Close term'}</button>
            {isLocked && <button onClick={() => void clearMarks(key)} disabled={saving} className="rounded-lg border border-destructive/30 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/5 disabled:opacity-50">Clear marks</button>}
            <button onClick={() => void deleteTerm(key)} disabled={saving} className="rounded-lg border border-destructive/30 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/5 disabled:opacity-50">Delete term</button>
          </div>;
        }) : <p className="py-5 text-sm text-muted-foreground">No configured terms yet.</p>}
      </div>
    </ShellCard>
  </div>;
}

function ManageSubjects({ school }: { school: School }) {
  const config = useConfig(school.id);
  const students = useListStudents(school.id, {});
  const configData = config.data as SchoolConfig;
  const subjectMap = configData.subjects && typeof configData.subjects === 'object' && !Array.isArray(configData.subjects)
    ? configData.subjects as Record<string, Array<string | { name: string; teacher?: string }>>
    : {};
  const classes = Array.from(new Set([...Object.keys(subjectMap), ...(students.data ?? []).map((student) => student.className)])).filter(Boolean).sort();
  const [className, setClassName] = useState('');
  const [newClass, setNewClass] = useState('');
  const [subject, setSubject] = useState('');
  const [teacher, setTeacher] = useState('');
  const [editing, setEditing] = useState<{ original: string; name: string; teacher: string } | null>(null);
  const selectedClass = newClass.trim() || className || classes[0] || '';
  const subjects = subjectRecords(configData, selectedClass);
  const saveClass = (records: Array<{ name: string; teacher: string }>) => config.save({
    ...config.data,
    subjects: { ...subjectMap, [selectedClass]: records },
  });
  const add = () => {
    if (!selectedClass || !subject.trim() || subjects.some((value) => value.name.toLowerCase() === subject.trim().toLowerCase())) return;
    saveClass([...subjects, { name: subject.trim(), teacher: teacher.trim() }]);
    setSubject('');
    setTeacher('');
  };
  const saveEdit = () => {
    if (!editing?.name.trim() || subjects.some((item) => item.name.toLowerCase() === editing.name.trim().toLowerCase() && item.name !== editing.original)) return;
    saveClass(subjects.map((item) => item.name === editing.original ? { name: editing.name.trim(), teacher: editing.teacher.trim() } : item));
    setEditing(null);
  };
  return <div className="fade-up"><SectionHeading eyebrow="Academics & marks" title="Manage subjects" body="Choose a class to review or edit its subjects and teacher assignments. Subject options feed marks entry and reports." /><ShellCard><div className="grid gap-3 md:grid-cols-3"><label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Filter by class</span><select data-testid="input-subject-class" value={className || classes[0] || ''} onChange={(event) => { setClassName(event.target.value); setNewClass(''); setEditing(null); }} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"><option value="">Select class</option>{classes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Add new class (optional)</span><input value={newClass} onChange={(event) => setNewClass(event.target.value)} placeholder="e.g. S1" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" /></label><div className="hidden md:block" /></div><div className="mt-4 grid gap-3 md:grid-cols-2"><input data-testid="input-manage-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject name" className="h-11 rounded-lg border border-input bg-background px-3 text-sm" /><input data-testid="input-subject-teacher" value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="Teacher name (optional)" className="h-11 rounded-lg border border-input bg-background px-3 text-sm" /></div><button data-testid="button-manage-subject-add" onClick={add} disabled={!selectedClass || !subject.trim() || config.saving} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Plus size={15} /> Add subject</button><div className="mt-6 divide-y divide-border">{subjects.map((item) => editing?.original === item.name ? <div key={item.name} className="grid gap-2 py-3 sm:grid-cols-[1fr_1fr_auto_auto]"><input aria-label="Edit subject name" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} className="h-9 rounded-md border border-input bg-background px-2 text-sm" /><input aria-label="Edit assigned teacher" value={editing.teacher} onChange={(event) => setEditing({ ...editing, teacher: event.target.value })} className="h-9 rounded-md border border-input bg-background px-2 text-sm" /><button onClick={saveEdit} disabled={config.saving} className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Save</button><button onClick={() => setEditing(null)} className="rounded-md border border-border px-3 py-2 text-xs font-semibold">Cancel</button></div> : <div key={item.name} className="flex items-center gap-3 py-3"><div className="flex-1"><p className="text-sm font-semibold">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.teacher ? `Assigned to ${item.teacher}` : 'No teacher assigned'}</p></div><button aria-label={`Edit ${item.name}`} onClick={() => setEditing({ original: item.name, name: item.name, teacher: item.teacher })} className="rounded-md border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">Edit</button><button aria-label={`Remove ${item.name}`} onClick={() => saveClass(subjects.filter((value) => value.name !== item.name))} className="text-muted-foreground hover:text-destructive"><X size={15} /></button></div>)}</div>{classes.length === 0 && !selectedClass && <p className="mt-5 text-sm text-muted-foreground">Add a class name above to create its first subject list.</p>}</ShellCard></div>;
}

function GradingSystem({ school }: { school: School }) {
  const config = useConfig(school.id);
  const grades = Array.isArray(config.data.grading) ? (config.data.grading as Array<Record<string, unknown>>) : [];
  const [grade, setGrade] = useState(''); const [min, setMin] = useState('');
  const add = () => { if (!grade.trim() || !min) return; config.save({ ...config.data, grading: [...grades, { grade: grade.trim(), min: Number(min), descriptor: 'Custom descriptor' }] }, () => { setGrade(''); setMin(''); }); };
  return <div className="fade-up"><SectionHeading eyebrow="Academics & marks" title="Grading system" body="Define the thresholds and descriptors used in school reports." /><ShellCard><div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input data-testid="input-grade-name" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Grade" className="h-11 rounded-lg border border-input bg-background px-3 text-sm" /><input data-testid="input-grade-min" type="number" min="0" max="100" value={min} onChange={(e) => setMin(e.target.value)} placeholder="Minimum score" className="h-11 rounded-lg border border-input bg-background px-3 text-sm" /><button data-testid="button-add-grade" onClick={add} disabled={!grade.trim() || !min || config.saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Plus size={15} /> Add</button></div><div className="mt-6 divide-y divide-border">{[...grades].sort((a, b) => Number(b.min) - Number(a.min)).map((item) => <div key={String(item.grade)} className="flex items-center gap-3 py-4"><span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 font-display font-semibold text-primary">{String(item.grade)}</span><div className="flex-1"><p className="text-sm font-semibold">From {String(item.min)} points</p><p className="text-xs text-muted-foreground">{String(item.descriptor ?? '')}</p></div><button aria-label={`Remove grade ${String(item.grade)}`} onClick={() => config.save({ ...config.data, grading: grades.filter((value) => value.grade !== item.grade) })} className="text-destructive"><Trash2 size={15} /></button></div>)}</div>{!grades.length && <p className="mt-4 text-sm text-muted-foreground">No grading bands are configured yet.</p>}</ShellCard></div>;
}

function PublishDeadline({ school }: { school: School }) {
  const config = useConfig(school.id);
  const [deadline, setDeadline] = useState(String(config.data.deadline ?? ''));
  const save = () => config.save({ ...config.data, deadline });
  return <div className="fade-up"><SectionHeading eyebrow="Communication" title="Publish to teachers" body="Set a marks deadline and make it visible across the teaching team." /><ShellCard className="max-w-xl"><label><span className="mb-2 block text-sm font-semibold">Marks entry deadline</span><input data-testid="input-publish-deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" /></label><div className="mt-5 flex gap-2"><button data-testid="button-save-deadline" onClick={save} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><Check size={15} /> Publish deadline</button><button data-testid="button-clear-deadline" onClick={() => { setDeadline(''); config.save({ ...config.data, deadline: null }); }} className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Clear</button></div></ShellCard></div>;
}

function SchoolSettings({ school }: { school: School }) {
  const config = useConfig(school.id);
  const settings = config.data.settings && typeof config.data.settings === 'object'
    ? config.data.settings as Record<string, unknown>
    : {};
  const [address, setAddress] = useState(String(settings.address ?? ''));
  const [phone, setPhone] = useState(String(settings.phone ?? ''));
  useEffect(() => {
    setAddress(String(settings.address ?? ''));
    setPhone(String(settings.phone ?? ''));
  }, [settings.address, settings.phone]);
  return <div className="fade-up"><SectionHeading eyebrow="Settings" title="School settings" body="Keep the school's public identity and communication details current." /><ShellCard className="max-w-2xl"><div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-2 block text-xs font-semibold text-muted-foreground">School name</span><input value={school.name} readOnly className="h-11 w-full rounded-lg border border-input bg-muted px-3 text-sm" /></label><label><span className="mb-2 block text-xs font-semibold text-muted-foreground">Workspace slug</span><input value={school.slug} readOnly className="h-11 w-full rounded-lg border border-input bg-muted px-3 text-sm" /></label><label><span className="mb-2 block text-xs font-semibold text-muted-foreground">Address</span><input data-testid="input-school-address" value={address} onChange={(e) => setAddress(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" /></label><label><span className="mb-2 block text-xs font-semibold text-muted-foreground">Office phone</span><input data-testid="input-school-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" /></label></div><button data-testid="button-save-school-profile" onClick={() => config.save({ ...config.data, settings: { ...settings, address, phone } })} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><Check size={15} /> Save school profile</button></ShellCard></div>;
}

function SystemSettings({ school }: { school: School }) {
  const config = useConfig(school.id);
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'));
  const toggleDark = () => { const next = !dark; setDark(next); document.documentElement.classList.toggle('dark', next); localStorage.setItem('jiib.darkMode', String(next)); };
  const exportBackup = () => { const blob = new Blob([JSON.stringify({ school, config: config.data, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${school.slug}-backup.json`; anchor.click(); URL.revokeObjectURL(url); };
  return <div className="fade-up"><SectionHeading eyebrow="Settings" title="System settings" body="Control local preferences, configuration backups, and account security." /><div className="grid gap-5 lg:grid-cols-2"><ShellCard><div className="flex items-center gap-3"><ShieldCheck className="text-primary" size={20} /><div><h3 className="font-display text-lg font-semibold">Workspace preferences</h3><p className="mt-1 text-sm text-muted-foreground">These preferences apply to this browser.</p></div></div><button data-testid="button-toggle-dark-mode" onClick={toggleDark} className="mt-6 flex w-full items-center justify-between rounded-xl border border-border p-4 text-left hover:bg-muted"><span><span className="block text-sm font-semibold">Dark mode</span><span className="mt-1 block text-xs text-muted-foreground">{dark ? 'On' : 'Off'}</span></span><span className={`h-6 w-11 rounded-full p-1 transition ${dark ? 'bg-primary' : 'bg-muted'}`}><span className={`block h-4 w-4 rounded-full bg-white transition ${dark ? 'translate-x-5' : ''}`} /></span></button><button data-testid="button-export-backup" onClick={exportBackup} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted"><Download size={15} /> Export configuration backup</button></ShellCard><ShellCard><div className="flex items-center gap-3"><LockKeyhole className="text-primary" size={20} /><div><h3 className="font-display text-lg font-semibold">Account security</h3><p className="mt-1 text-sm text-muted-foreground">Staff access requires a verified Supabase account and an assigned school role. Parent portal access is verified against a student's family phone number.</p></div></div></ShellCard></div></div>;
}

export function OperationsPage({ page, school }: { page: Page; school: School }) {
  switch (page) {
    case 'overview': return <Overview school={school} />;
    case 'parentsPortal': return <ParentsPortal school={school} />;
    case 'parentMessages': return <ParentMessages school={school} />;
    case 'userManagement': return <UserManagement school={school} />;
    case 'performance': return <Performance school={school} />;
    case 'printMarksheets': return <PrintMarksheets school={school} />;
    case 'reportStudio': return <PrintMarksheets school={school} report />;
    case 'termManagement': return <TermManagement school={school} />;
    case 'manageSubjects': return <ManageSubjects school={school} />;
    case 'gradingSystem': return <GradingSystem school={school} />;
    case 'publishDeadline': return <PublishDeadline school={school} />;
    case 'schoolEvents': return <Overview school={school} />;
    case 'schoolSettings': return <SchoolSettings school={school} />;
    case 'systemSettings': return <SystemSettings school={school} />;
    case 'parentView': return <PrintMarksheets school={school} report />;
    default: return null;
  }
}