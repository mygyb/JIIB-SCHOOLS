import { useState } from 'react';
import { Link } from 'wouter';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { jiibApi } from '@/lib/jiib-api';
import {
  combinationsOf, compulsorySubjectNames, principalSubjectNames, STREAM_LABELS, subsidiarySubjectNames,
  type Combination, type SchoolConfig, type Stream,
} from '@/lib/school-data';

type ConfigResult = { schoolId: string; data: Record<string, unknown>; updatedAt: string | Date; refreshedStudents?: number };
type Draft = { id?: string; name: string; stream: Stream; subjects: [string, string, string] };

const select = 'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm';

function draftProblem(draft: Draft, others: Combination[]) {
  const name = draft.name.trim();
  if (!name) return 'Give the combination a name, for example PCM.';
  if (name.length > 30) return 'Keep the name to 30 characters or fewer.';
  if (others.some((item) => item.id !== draft.id && item.name.toLowerCase() === name.toLowerCase())) return `There is already a combination called ${name}.`;
  if (draft.subjects.some((subject) => !subject)) return 'Choose all three principal subjects.';
  if (new Set(draft.subjects).size !== 3) return 'The three principal subjects must be different.';
  return null;
}

/** Streams (Sciences / Arts) and their combinations. Students pick one of these when they are enrolled. */
export function ALevelSetup({ schoolId, config, enrolledByCombination, onChanged }: {
  schoolId: string;
  config: SchoolConfig;
  enrolledByCombination: Record<string, number>;
  onChanged: (result: ConfigResult) => void;
}) {
  const combinations = combinationsOf(config);
  const principals = principalSubjectNames(config);
  const subsidiaries = subsidiarySubjectNames(config);
  const compulsory = compulsorySubjectNames(config);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const save = async (list: Combination[], message: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await jiibApi<ConfigResult>(`/api/schools/${encodeURIComponent(schoolId)}/a-level/combinations`, {
        method: 'PUT',
        body: JSON.stringify({ combinations: list.map(({ id, name, stream, subjects }) => ({ id, name, stream, subjects })) }),
      });
      onChanged(result);
      setDraft(null);
      setNotice(result.refreshedStudents ? `${message} ${result.refreshedStudents} enrolled ${result.refreshedStudents === 1 ? 'student was' : 'students were'} updated.` : message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The combinations could not be saved. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const submit = () => {
    if (!draft || draftProblem(draft, combinations)) return;
    const next: Combination = { id: draft.id ?? '', name: draft.name.trim(), stream: draft.stream, subjects: [...draft.subjects] };
    const list = draft.id ? combinations.map((item) => item.id === draft.id ? next : item) : [...combinations, next];
    void save(list.map((item) => item.id ? item : { ...item, id: undefined as unknown as string }), draft.id ? 'Combination updated.' : 'Combination added.');
  };
  const problem = draft ? draftProblem(draft, combinations) : null;
  const blank = (stream: Stream): Draft => ({ name: '', stream, subjects: ['', '', ''] });

  return <div data-testid="alevel-setup" className="space-y-5">
    {principals.length === 0 && <div role="note" className="rounded-2xl border border-amber-300 bg-amber-50/60 p-5 text-sm">
      <p className="font-semibold">Set up your S.5 and S.6 subjects first</p>
      <p className="mt-1 text-muted-foreground">Combinations are built from principal subjects. In <Link href="/manage-subjects" className="font-semibold text-primary hover:underline">Manage subjects</Link>, pick an S.5 or S.6 class and add each subject with its category (Principal, Subsidiary or General Paper) and papers.</p>
    </div>}
    <div className="grid gap-5 md:grid-cols-2">
      {(['sciences', 'arts'] as Stream[]).map((stream) => {
        const list = combinations.filter((item) => item.stream === stream);
        const students = list.reduce((sum, item) => sum + (enrolledByCombination[item.id] ?? 0), 0);
        return <section key={stream} data-testid={`stream-${stream}`} className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">Stream</p><h3 className="mt-1 font-display text-xl font-semibold">{STREAM_LABELS[stream]}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{list.length} {list.length === 1 ? 'combination' : 'combinations'} · {students} {students === 1 ? 'student' : 'students'}</p></div>
            <button type="button" data-testid={`button-add-combination-${stream}`} onClick={() => { setDraft(blank(stream)); setError(''); setNotice(''); }} disabled={principals.length < 3 || busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"><Plus size={14} /> Add combination</button>
          </div>
          <div className="mt-4 divide-y divide-border">
            {list.length === 0 && <p className="py-3 text-sm text-muted-foreground">No {STREAM_LABELS[stream]} combinations yet.</p>}
            {list.map((item) => <div key={item.id} data-testid={`combination-${item.name}`} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{item.name} <span className="ml-1 text-xs font-normal text-muted-foreground">{enrolledByCombination[item.id] ?? 0} enrolled</span></p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">{item.subjects.map((subject) => <span key={subject} className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">{subject}</span>)}</div>
              </div>
              <button type="button" aria-label={`Edit ${item.name}`} onClick={() => { setDraft({ id: item.id, name: item.name, stream: item.stream, subjects: [item.subjects[0] ?? '', item.subjects[1] ?? '', item.subjects[2] ?? ''] }); setError(''); setNotice(''); }} className="rounded-md border border-border p-2 hover:bg-muted"><Pencil size={14} /></button>
              <button type="button" aria-label={`Remove ${item.name}`} disabled={busy} onClick={() => { if (window.confirm(`Remove the ${item.name} combination?`)) void save(combinations.filter((other) => other.id !== item.id), `${item.name} removed.`); }} className="rounded-md p-2 text-destructive hover:bg-destructive/10 disabled:opacity-50"><Trash2 size={14} /></button>
            </div>)}
          </div>
        </section>;
      })}
    </div>

    {draft && <section data-testid="combination-form" className="rounded-2xl border-2 border-primary/30 bg-card p-5">
      <h3 className="font-display text-lg font-semibold">{draft.id ? 'Edit combination' : 'New combination'}</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Name</span>
          <input data-testid="input-combination-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. PCM" maxLength={30} className={select} /></label>
        <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Stream</span>
          <select data-testid="select-combination-stream" value={draft.stream} onChange={(event) => setDraft({ ...draft, stream: event.target.value as Stream })} className={select}>
            {(['sciences', 'arts'] as Stream[]).map((stream) => <option key={stream} value={stream}>{STREAM_LABELS[stream]}</option>)}</select></label>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((index) => <label key={index}><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Principal subject {index + 1}</span>
          <select data-testid={`select-combination-subject-${index}`} value={draft.subjects[index]} onChange={(event) => { const subjects = [...draft.subjects] as Draft['subjects']; subjects[index] = event.target.value; setDraft({ ...draft, subjects }); }} className={select}>
            <option value="">Choose…</option>{principals.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>)}
      </div>
      {problem && draft.name.trim() && <p role="alert" data-testid="combination-problem" className="mt-3 text-xs font-medium text-destructive">{problem}</p>}
      <div className="mt-4 flex gap-2">
        <button type="button" data-testid="button-save-combination" onClick={submit} disabled={busy || Boolean(problem)} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? 'Saving…' : 'Save combination'}</button>
        <button type="button" onClick={() => setDraft(null)} disabled={busy} className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
      </div>
    </section>}
    {error && <p role="alert" data-testid="alevel-error" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-display text-lg font-semibold">Every student also takes</h3>
      <p className="mt-1 text-sm text-muted-foreground">These come from the subjects you set up in Manage subjects. Each student chooses one subsidiary when they are enrolled.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div><p className="text-xs font-semibold text-muted-foreground">Compulsory</p><div className="mt-1.5 flex flex-wrap gap-1.5">{compulsory.map((name) => <span key={name} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{name}</span>)}</div></div>
        <div><p className="text-xs font-semibold text-muted-foreground">Subsidiary (choose one)</p><div className="mt-1.5 flex flex-wrap gap-1.5">{subsidiaries.length ? subsidiaries.map((name) => <span key={name} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{name}</span>) : <span className="text-xs text-muted-foreground">None set up yet.</span>}</div></div>
      </div>
    </section>
  </div>;
}
