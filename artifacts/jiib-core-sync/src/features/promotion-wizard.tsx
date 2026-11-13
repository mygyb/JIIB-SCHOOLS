// Year-end promotion wizard: pick the classes, decide each student, choose subjects, review, confirm. Every batch can be undone for 60 days.
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getGetSchoolConfigQueryKey, useGetSchoolConfig, type School } from '@workspace/api-client-react';
import { ArrowLeft, ArrowRight, Check, Undo2 } from 'lucide-react';
import { jiibApi } from '@/lib/jiib-api';
import {
  classLevel, combinationsOf, isPrimarySchool, primaryStage, enrolmentLabel, isALevelClass, isALevelEnabled, optionalSubjectsClassOf, STREAM_LABELS, subjectNames, subsidiarySubjectNames,
  type Enrolment, type SchoolConfig, type Stream,
} from '@/lib/school-data';

type Person = { id: string; name: string; className: string; house?: string; subjects?: string[]; aLevel?: Enrolment | null };
type Batch = { id: string; at: string; by?: string; fromClass: string; toClass: string; movedCount: number; stayed: number; undoneAt?: string; moved?: unknown[] };
type ConfigEnvelope = { schoolId: string; data: Record<string, unknown>; updatedAt: string | Date };
type Draft = { stream: Stream | ''; combination: string; subsidiary: string };

const UNDO_DAYS = 60;
const select = 'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm';
const label = 'mb-1.5 block text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground';

export function PromotionWizard({ school }: { school: School }) {
  const queryClient = useQueryClient();
  const configQuery = useGetSchoolConfig(school.id, { query: { queryKey: getGetSchoolConfigQueryKey(school.id) } });
  const config = (configQuery.data?.data ?? {}) as SchoolConfig;
  const optionalFrom = optionalSubjectsClassOf(config);
  const aLevelOn = isALevelEnabled(config);
  const combinations = combinationsOf(config);

  const classes = useMemo(() => Array.from(new Set(Object.keys((config.subjects as Record<string, unknown> | undefined) ?? {}))).sort((a, b) => classLevel(a) - classLevel(b) || a.localeCompare(b)), [config.subjects]);
  const [step, setStep] = useState(0);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [action, setAction] = useState<Record<string, 'promote' | 'stay'>>({});
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const [enrol, setEnrol] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ promoted: number; stayed: number; toClass: string } | null>(null);

  const students = useQuery({
    queryKey: ['promotion-students', school.id, from],
    enabled: Boolean(from),
    queryFn: () => jiibApi<Person[]>(`/api/schools/${encodeURIComponent(school.id)}/students?className=${encodeURIComponent(from)}`),
  });
  const roster = students.data ?? [];
  const promoting = roster.filter((student) => (action[student.id] ?? 'promote') === 'promote');
  const toSubjects = to ? subjectNames(config, to) : [];
  const aLevelDestination = aLevelOn && Boolean(to) && isALevelClass(to);
  const optionalStep = Boolean(to) && !aLevelDestination && !/^leavers/i.test(to) && classLevel(to) >= classLevel(optionalFrom);
  const hasSubjectStep = optionalStep || aLevelDestination;
  const steps = ['Classes', 'Students', ...(hasSubjectStep ? [aLevelDestination ? 'Streams' : 'Subjects'] : []), 'Review'];
  const stepName = steps[step];

  // Primary: pupils finishing P.7 leave the school. They move into a "Leavers <year>" group so their records are kept.
  const leaversFor = (className: string) => (isPrimarySchool(school) && primaryStage(className) === 'ple' ? `Leavers ${new Date().getFullYear()}` : '');
  const suggestNext = (className: string) => classes.find((item) => classLevel(item) === classLevel(className) + 1) ?? leaversFor(className);
  const chooseFrom = (value: string) => { setFrom(value); setTo(suggestNext(value)); setAction({}); setChosen({}); setEnrol({}); setError(''); };

  // Subjects / enrolment each promoted student starts with: what they had, where it still applies.
  const prepare = () => {
    const nextChosen: Record<string, string[]> = {};
    const nextEnrol: Record<string, Draft> = {};
    for (const student of promoting) {
      nextChosen[student.id] = chosen[student.id] ?? (student.subjects ?? []).filter((subject) => toSubjects.includes(subject));
      nextEnrol[student.id] = enrol[student.id] ?? { stream: student.aLevel?.stream ?? '', combination: student.aLevel?.combination ?? '', subsidiary: student.aLevel?.subsidiary ?? '' };
    }
    setChosen(nextChosen); setEnrol(nextEnrol);
  };

  const problems: string[] = [];
  if (optionalStep) {
    const none = promoting.filter((student) => !(chosen[student.id]?.length));
    if (none.length) problems.push(`${none.length} ${none.length === 1 ? 'student has' : 'students have'} no subjects chosen yet.`);
  }
  if (aLevelDestination) {
    if (!combinations.length) problems.push('No A-Level combinations exist yet. Create them on the A-Level page first.');
    const missing = promoting.filter((student) => !enrol[student.id]?.combination);
    if (combinations.length && missing.length) problems.push(`${missing.length} ${missing.length === 1 ? 'student has' : 'students have'} no stream and combination yet.`);
  }
  const blocking = aLevelDestination && (!combinations.length || promoting.some((student) => !enrol[student.id]?.combination));

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const result = await jiibApi<{ promoted: number; stayed: number; config: ConfigEnvelope }>(`/api/schools/${encodeURIComponent(school.id)}/promotion`, {
        method: 'POST',
        body: JSON.stringify({
          fromClass: from, toClass: to,
          students: roster.map((student) => {
            const decision = action[student.id] ?? 'promote';
            if (decision === 'stay') return { id: student.id, action: 'stay' };
            if (aLevelDestination) {
              const draft = enrol[student.id];
              return { id: student.id, action: 'promote', aLevel: { stream: draft.stream, combination: draft.combination, ...(draft.subsidiary ? { subsidiary: draft.subsidiary } : {}) } };
            }
            return { id: student.id, action: 'promote', ...(optionalStep ? { subjects: chosen[student.id] ?? [] } : {}) };
          }),
        }),
      });
      queryClient.setQueryData(getGetSchoolConfigQueryKey(school.id), result.config);
      void queryClient.invalidateQueries();
      setDone({ promoted: result.promoted, stayed: result.stayed, toClass: to });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The promotion could not be completed. Nothing was changed.');
    } finally { setBusy(false); }
  };

  const reset = () => { setStep(0); setFrom(''); setTo(''); setAction({}); setChosen({}); setEnrol({}); setDone(null); setError(''); };
  const canNext = stepName === 'Classes' ? Boolean(from && to && from !== to) && roster.length > 0 && !students.isLoading
    : stepName === 'Students' ? promoting.length > 0 : true;
  const goNext = () => { if (steps[step + 1] === 'Subjects' || steps[step + 1] === 'Streams') prepare(); setStep(step + 1); setError(''); };

  const toggleSubject = (id: string, subject: string) => setChosen((current) => {
    const list = current[id] ?? [];
    return { ...current, [id]: list.includes(subject) ? list.filter((item) => item !== subject) : [...list, subject] };
  });
  const setDraft = (id: string, patch: Partial<Draft>) => setEnrol((current) => ({ ...current, [id]: { ...(current[id] ?? { stream: '', combination: '', subsidiary: '' }), ...patch } }));

  return <div className="fade-up" data-testid="promotion-wizard">
    <p className="mb-2 text-[10px] font-bold uppercase tracking-[.22em] text-primary">Academics & marks</p>
    <h2 className="font-display text-3xl font-semibold tracking-[-.035em] sm:text-4xl">Promote students</h2>
    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Move a class up at the end of the year. Marks stay with the term they were entered in, and every promotion can be undone for {UNDO_DAYS} days.</p>

    {done
      ? <div data-testid="promotion-done" className="mt-6 rounded-2xl border border-border bg-card p-6 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#eef8f4] text-[#2e8c72]"><Check size={22} /></span>
        <h3 className="mt-3 font-display text-xl font-semibold">{done.promoted} {done.promoted === 1 ? 'student' : 'students'} promoted to {done.toClass}</h3>
        {done.stayed > 0 && <p className="mt-1 text-sm text-muted-foreground">{done.stayed} stayed in {from}.</p>}
        <p className="mt-2 text-sm text-muted-foreground">Made a mistake? Use Undo in the history below within {UNDO_DAYS} days.</p>
        <button type="button" onClick={reset} className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Promote another class</button>
      </div>
      : <div className="mt-6 rounded-2xl border border-border bg-card p-4 sm:p-6">
        <ol className="flex flex-wrap items-center gap-2 text-xs font-semibold" aria-label="Steps">
          {steps.map((name, index) => <li key={name} aria-current={index === step ? 'step' : undefined} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${index === step ? 'bg-primary text-primary-foreground' : index < step ? 'bg-[#eef8f4] text-[#2e8c72]' : 'bg-muted text-muted-foreground'}`}>
            <span>{index < step ? <Check size={12} /> : index + 1}</span>{name}</li>)}
        </ol>

        {configQuery.isLoading ? <div className="mt-6 h-24 animate-pulse rounded-xl bg-muted" /> : <div className="mt-6">
          {stepName === 'Classes' && <div className="grid gap-4 sm:grid-cols-2">
            <label><span className={label}>Promote the students of</span>
              <select data-testid="select-promote-from" value={from} onChange={(event) => chooseFrom(event.target.value)} className={select}><option value="">Choose a class</option>{classes.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
            <label><span className={label}>Into</span>
              <select data-testid="select-promote-to" value={to} disabled={!from} onChange={(event) => { setTo(event.target.value); setChosen({}); setEnrol({}); }} className={`${select} disabled:opacity-60`}><option value="">Choose a class</option>{classes.filter((name) => name !== from).map((name) => <option key={name} value={name}>{name}</option>)}{leaversFor(from) && !classes.includes(leaversFor(from)) && <option value={leaversFor(from)}>{leaversFor(from)} (completed P.7)</option>}</select></label>
            {from && <p className="text-sm text-muted-foreground sm:col-span-2" data-testid="promote-count">{students.isLoading ? 'Counting students…' : `${roster.length} ${roster.length === 1 ? 'student' : 'students'} in ${from}.`}{from && to && classLevel(to) <= classLevel(from) && <span className="ml-1 font-semibold text-destructive">{to} is not higher than {from}.</span>}</p>}
            {from && !classes.length && <p className="text-sm text-muted-foreground">Add classes and subjects in Manage subjects first.</p>}
          </div>}

          {stepName === 'Students' && <div>
            <div className="flex flex-wrap items-center gap-2"><button type="button" data-testid="promote-all" onClick={() => setAction({})} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">Promote everyone</button>
              <button type="button" onClick={() => setAction(Object.fromEntries(roster.map((student) => [student.id, 'stay' as const])))} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">Keep everyone in {from}</button>
              <span data-testid="promote-summary" className="ml-auto text-xs text-muted-foreground">{promoting.length} promoting · {roster.length - promoting.length} staying</span></div>
            <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
              {roster.map((student) => {
                const decision = action[student.id] ?? 'promote';
                return <li key={student.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold uppercase">{student.name}</p><p className="text-xs text-muted-foreground">{student.house || 'No house'}</p></div>
                  <div role="group" aria-label={`Decision for ${student.name}`} className="inline-flex overflow-hidden rounded-lg border border-input text-xs font-semibold">
                    <button type="button" data-testid={`promote-${student.id}`} aria-pressed={decision === 'promote'} onClick={() => setAction((current) => ({ ...current, [student.id]: 'promote' }))} className={`h-9 px-3 ${decision === 'promote' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}>Promote</button>
                    <button type="button" data-testid={`stay-${student.id}`} aria-pressed={decision === 'stay'} onClick={() => setAction((current) => ({ ...current, [student.id]: 'stay' }))} className={`h-9 px-3 ${decision === 'stay' ? 'bg-destructive text-white' : 'bg-background'}`}>Stay</button>
                  </div>
                </li>;
              })}
            </ul>
          </div>}

          {stepName === 'Subjects' && <div>
            <p className="text-sm text-muted-foreground">Tick the subjects each student takes in {to}. Subjects they already took are ticked for you.</p>
            <div className="mt-3 flex flex-wrap gap-2"><button type="button" data-testid="subjects-all" onClick={() => setChosen(Object.fromEntries(promoting.map((student) => [student.id, [...toSubjects]])))} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">Everyone takes every subject</button>
              <button type="button" onClick={() => setChosen(Object.fromEntries(promoting.map((student) => [student.id, []])))} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">Clear all</button></div>
            {!toSubjects.length && <p className="mt-4 text-sm text-muted-foreground">{to} has no subjects yet. <Link href="/manage-subjects" className="font-semibold text-primary hover:underline">Manage subjects</Link>.</p>}
            <div className="mt-4 space-y-3">{promoting.map((student) => <div key={student.id} className="rounded-xl border border-border p-3">
              <p className="text-sm font-semibold uppercase">{student.name}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{toSubjects.map((subject) => {
                const on = (chosen[student.id] ?? []).includes(subject);
                return <button key={subject} type="button" data-testid={`subject-${student.id}-${subject.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} aria-pressed={on} onClick={() => toggleSubject(student.id, subject)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background'}`}>{subject}</button>;
              })}</div></div>)}</div>
          </div>}

          {stepName === 'Streams' && <div>
            <p className="text-sm text-muted-foreground">Place each student in a stream and combination for {to}. Their subjects follow automatically.</p>
            {!combinations.length && <p className="mt-3 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">No combinations exist yet. <Link href="/a-level" className="font-semibold text-primary hover:underline">Create them on the A-Level page</Link>, then come back.</p>}
            <div className="mt-4 space-y-3">{promoting.map((student) => {
              const draft = enrol[student.id] ?? { stream: '', combination: '', subsidiary: '' };
              return <div key={student.id} className="rounded-xl border border-border p-3">
                <p className="text-sm font-semibold uppercase">{student.name}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <select aria-label={`Stream for ${student.name}`} data-testid={`stream-${student.id}`} value={draft.stream} onChange={(event) => setDraft(student.id, { stream: event.target.value as Stream | '', combination: '' })} className={select}><option value="">Stream</option>{(['sciences', 'arts'] as Stream[]).map((key) => <option key={key} value={key}>{STREAM_LABELS[key]}</option>)}</select>
                  <select aria-label={`Combination for ${student.name}`} data-testid={`combination-${student.id}`} value={draft.combination} disabled={!draft.stream} onChange={(event) => setDraft(student.id, { combination: event.target.value })} className={`${select} disabled:opacity-60`}><option value="">{draft.stream ? 'Combination' : 'Stream first'}</option>{combinations.filter((item) => item.stream === draft.stream).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                  <select aria-label={`Subsidiary for ${student.name}`} value={draft.subsidiary} onChange={(event) => setDraft(student.id, { subsidiary: event.target.value })} className={select}><option value="">No subsidiary</option>{subsidiarySubjectNames(config).map((name) => <option key={name} value={name}>{name}</option>)}</select>
                </div></div>;
            })}</div>
          </div>}

          {stepName === 'Review' && <div data-testid="promotion-review">
            <h3 className="font-display text-lg font-semibold">Ready to promote</h3>
            <ul className="mt-3 space-y-1.5 text-sm"><li><b>{promoting.length}</b> {promoting.length === 1 ? 'student' : 'students'} move from <b>{from}</b> to <b>{to}</b>.</li>
              {roster.length - promoting.length > 0 && <li><b>{roster.length - promoting.length}</b> stay in {from}.</li>}
              {optionalStep && <li>Subjects are saved as chosen.</li>}
              {aLevelDestination && <li>Streams and combinations are saved as chosen.</li>}</ul>
            {problems.length > 0 && <ul data-testid="promotion-problems" className="mt-4 space-y-1 rounded-lg border border-[#e6c27a]/50 bg-[#fff8e8] p-3 text-xs text-[#7a5a10]">{problems.map((text) => <li key={text}>{text}</li>)}</ul>}
            {promoting.length <= 12 && aLevelDestination && <ul className="mt-3 text-xs text-muted-foreground">{promoting.map((student) => <li key={student.id}>{student.name}: {enrolmentLabel(config, { stream: (enrol[student.id]?.stream || 'sciences') as Stream, combination: enrol[student.id]?.combination ?? '' }) || '—'}</li>)}</ul>}
            <p className="mt-4 text-xs text-muted-foreground">You can undo this for {UNDO_DAYS} days from the history below.</p>
          </div>}
          {error && <p role="alert" data-testid="promotion-error" className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        </div>}

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
          <button type="button" data-testid="promote-back" disabled={step === 0 || busy} onClick={() => { setStep(step - 1); setError(''); }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted disabled:opacity-40"><ArrowLeft size={15} /> Back</button>
          {stepName === 'Review'
            ? <button type="button" data-testid="promote-confirm" disabled={busy || blocking || promoting.length === 0} onClick={() => void submit()} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? 'Promoting…' : `Promote ${promoting.length} ${promoting.length === 1 ? 'student' : 'students'}`}</button>
            : <button type="button" data-testid="promote-next" disabled={!canNext} onClick={goNext} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">Next <ArrowRight size={15} /></button>}
        </div>
      </div>}

    <PromotionHistory schoolId={school.id} config={config} />
  </div>;
}

function PromotionHistory({ schoolId, config }: { schoolId: string; config: SchoolConfig }) {
  const queryClient = useQueryClient();
  const history = (Array.isArray((config as Record<string, unknown>).promotionHistory) ? ((config as Record<string, unknown>).promotionHistory as Batch[]) : []).slice(0, 8);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  if (!history.length) return null;

  const undo = async (batch: Batch) => {
    if (!window.confirm(`Undo the promotion of ${batch.fromClass} to ${batch.toClass}? Students who have since moved on again are left where they are.`)) return;
    setBusy(batch.id); setError(''); setMessage('');
    try {
      const result = await jiibApi<{ restored: number; skipped: number; config: ConfigEnvelope }>(`/api/schools/${encodeURIComponent(schoolId)}/promotion/${encodeURIComponent(batch.id)}/undo`, { method: 'POST' });
      queryClient.setQueryData(getGetSchoolConfigQueryKey(schoolId), result.config);
      void queryClient.invalidateQueries();
      setMessage(`${result.restored} ${result.restored === 1 ? 'student was' : 'students were'} moved back to ${batch.fromClass}${result.skipped ? ` (${result.skipped} left as they are)` : ''}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The promotion could not be undone.');
    } finally { setBusy(''); }
  };

  return <section data-testid="promotion-history" className="mt-8">
    <h3 className="font-display text-lg font-semibold">Promotion history</h3>
    <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card">
      {history.map((batch) => {
        const ageDays = (Date.now() - new Date(batch.at).getTime()) / 86_400_000;
        const left = Math.max(0, Math.ceil(UNDO_DAYS - ageDays));
        const canUndo = !batch.undoneAt && ageDays <= UNDO_DAYS && Array.isArray(batch.moved);
        return <li key={batch.id} data-testid={`history-${batch.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{batch.fromClass} → {batch.toClass}</p>
            <p className="text-xs text-muted-foreground">{new Date(batch.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · {batch.movedCount} promoted{batch.stayed ? `, ${batch.stayed} stayed` : ''}{batch.undoneAt ? ' · undone' : canUndo ? ` · undo for ${left} more ${left === 1 ? 'day' : 'days'}` : ' · can no longer be undone'}</p></div>
          {canUndo && <button type="button" data-testid={`undo-${batch.id}`} disabled={busy === batch.id} onClick={() => void undo(batch)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"><Undo2 size={13} /> {busy === batch.id ? 'Undoing…' : 'Undo'}</button>}
        </li>;
      })}
    </ul>
    {message && <p role="status" className="mt-3 text-sm font-medium text-[#2e8c72]">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </section>;
}
