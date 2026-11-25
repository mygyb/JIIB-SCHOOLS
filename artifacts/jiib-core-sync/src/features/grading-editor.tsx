// The school's own grading: grade bands, pass mark, result categories and report-card remarks.
// Saved once for the whole school (never per term), so every term that is opened later keeps using the same grading.
import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { DEFAULT_CATEGORIES, DEFAULT_DESCRIPTIONS, readGrading, readScheme } from '@/features/report-studio/report-model';
import type { SchoolConfig } from '@/lib/school-data';

type Band = { grade: string; min: string; descriptor: string; description: string };
type Category = { label: string; text: string; minAverage: string };
type Remark = { min: string; classTeacher: string; headTeacher: string };

const TEMPLATES: Array<{ name: string; bands: Array<[string, number, string]> }> = [
  { name: 'A – E (standard)', bands: [['A', 80, 'Exceptional'], ['B', 70, 'Outstanding'], ['C', 60, 'Satisfactory'], ['D', 50, 'Basic'], ['E', 0, 'Elementary']] },
  { name: 'A – F', bands: [['A', 80, 'Excellent'], ['B', 70, 'Very good'], ['C', 60, 'Good'], ['D', 50, 'Average'], ['E', 40, 'Weak'], ['F', 0, 'Fail']] },
  { name: 'D1 – F9 (primary / UNEB)', bands: [['D1', 90, 'Distinction'], ['D2', 80, 'Distinction'], ['C3', 70, 'Credit'], ['C4', 60, 'Credit'], ['C5', 55, 'Credit'], ['C6', 50, 'Credit'], ['P7', 45, 'Pass'], ['P8', 40, 'Pass'], ['F9', 0, 'Fail']] },
  { name: 'Blank', bands: [['', 0, '']] },
];

const input = 'h-10 rounded-lg border border-input bg-background px-3 text-sm';

export function GradingEditor({ data, saving, save }: { data: SchoolConfig; saving: boolean; save: (next: SchoolConfig, onDone?: () => void, onError?: (error: unknown) => void) => void }) {
  const initial = useMemo(() => {
    const bands = readGrading(data);
    const scheme = readScheme(data);
    return {
      bands: bands.map((band): Band => ({ grade: band.grade, min: String(band.min), descriptor: band.descriptor, description: scheme.descriptions[band.grade] ?? (DEFAULT_DESCRIPTIONS[band.grade] && band.descriptor.toUpperCase() === ({ A: 'EXCEPTIONAL', B: 'OUTSTANDING', C: 'SATISFACTORY', D: 'BASIC', E: 'ELEMENTARY' } as Record<string, string>)[band.grade] ? DEFAULT_DESCRIPTIONS[band.grade] : '') })),
      passMark: String(scheme.passMark),
      categories: (scheme.categories.length ? scheme.categories : DEFAULT_CATEGORIES).map((item): Category => ({ label: item.label, text: item.text, minAverage: item.minAverage === null ? '' : String(item.minAverage) })),
      remarks: scheme.remarks.map((item): Remark => ({ min: String(item.min), classTeacher: item.classTeacher, headTeacher: item.headTeacher })),
    };
  }, [data]);
  const signature = JSON.stringify(initial);
  const [bands, setBands] = useState<Band[]>(initial.bands);
  const [passMark, setPassMark] = useState(initial.passMark);
  const [categories, setCategories] = useState<Category[]>(initial.categories);
  const [remarks, setRemarks] = useState<Remark[]>(initial.remarks);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (dirty) return;
    setBands(initial.bands); setPassMark(initial.passMark); setCategories(initial.categories); setRemarks(initial.remarks);
  }, [signature, dirty]);

  const touch = () => { setDirty(true); setNotice(''); setError(''); };
  const sorted = [...bands].sort((a, b) => Number(b.min) - Number(a.min));
  const problems: string[] = [];
  if (!bands.length) problems.push('Add at least one grade.');
  if (bands.some((band) => !band.grade.trim())) problems.push('Every grade needs a name.');
  if (new Set(bands.map((band) => band.grade.trim().toLowerCase())).size !== bands.length) problems.push('Grade names must be different.');
  if (bands.some((band) => band.min.trim() === '' || !Number.isFinite(Number(band.min)) || Number(band.min) < 0 || Number(band.min) > 100)) problems.push('Each minimum score must be between 0 and 100.');
  if (new Set(bands.map((band) => Number(band.min))).size !== bands.length) problems.push('Two grades cannot start at the same score.');
  if (bands.length && !bands.some((band) => Number(band.min) === 0)) problems.push('The lowest grade must start at 0 so every score gets a grade.');
  if (!(Number(passMark) >= 0 && Number(passMark) <= 100) || passMark.trim() === '') problems.push('Pass mark must be between 0 and 100.');
  if (categories.some((item) => !item.label.trim())) problems.push('Every result category needs a name.');

  const rangeOf = (band: Band) => {
    const index = sorted.indexOf(band);
    const upper = index <= 0 ? 100 : Number(sorted[index - 1].min) - 1;
    return `${band.min || '?'} – ${upper}`;
  };

  const apply = (template: (typeof TEMPLATES)[number]) => {
    setBands(template.bands.map(([grade, min, descriptor]) => ({ grade, min: String(min), descriptor, description: '' })));
    touch();
  };

  const submit = () => {
    if (problems.length) return;
    const grading = sorted.map((band, index) => ({
      grade: band.grade.trim(), min: Number(band.min), max: index === 0 ? 100 : Number(sorted[index - 1].min) - 1, descriptor: band.descriptor.trim(),
    }));
    const settings = data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings) ? data.settings as Record<string, unknown> : {};
    const gradingScheme = {
      passMark: Number(passMark),
      descriptions: Object.fromEntries(bands.filter((band) => band.grade.trim()).map((band) => [band.grade.trim(), band.description.trim()])),
      categories: categories.filter((item) => item.label.trim()).map((item) => ({ label: item.label.trim(), text: item.text.trim(), minAverage: item.minAverage.trim() === '' ? null : Number(item.minAverage) })),
      remarks: remarks.filter((item) => item.min.trim() !== '' && Number.isFinite(Number(item.min))).map((item) => ({ min: Number(item.min), classTeacher: item.classTeacher.trim(), headTeacher: item.headTeacher.trim() })),
    };
    save({ ...data, grading, settings: { ...settings, gradingScheme } } as SchoolConfig,
      () => { setDirty(false); setNotice('Grading saved. It is used on every report card and stays in place for all terms, including new ones.'); },
      (cause) => setError(cause instanceof Error ? cause.message : 'Grading could not be saved. Please try again.'));
  };

  const card = 'rounded-2xl border border-border bg-card p-5 sm:p-6';
  return <div className="grid gap-5">
    <section className={card}>
      <h3 className="font-display text-lg font-semibold">Grade bands</h3>
      <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">Set the grades this school uses. The scores, achievement words and descriptions below are printed on the report card exactly as written here.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-muted-foreground">Start from:</span>
        {TEMPLATES.map((template) => <button key={template.name} type="button" onClick={() => apply(template)} className="rounded-full border border-border px-3 py-1.5 font-semibold hover:bg-muted">{template.name}</button>)}
      </div>
      <div className="mt-4 space-y-3">
        {sorted.map((band) => {
          const index = bands.indexOf(band);
          const update = (patch: Partial<Band>) => { setBands((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item)); touch(); };
          return <div key={index} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[90px_110px_1fr_auto]">
            <label><span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Grade</span><input data-testid="input-grade-name" value={band.grade} maxLength={6} onChange={(event) => update({ grade: event.target.value })} className={`${input} w-full`} /></label>
            <label><span className="mb-1 block text-[11px] font-semibold text-muted-foreground">From score (%)</span><input data-testid="input-grade-min" type="number" min="0" max="100" value={band.min} onChange={(event) => update({ min: event.target.value })} className={`${input} w-full`} /></label>
            <label><span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Achievement word <span className="font-normal">· range {rangeOf(band)}</span></span><input value={band.descriptor} maxLength={30} onChange={(event) => update({ descriptor: event.target.value })} className={`${input} w-full`} /></label>
            <button type="button" aria-label={`Remove grade ${band.grade}`} onClick={() => { setBands((current) => current.filter((_, i) => i !== index)); touch(); }} className="self-end justify-self-end pb-2 text-destructive"><Trash2 size={16} /></button>
            <label className="sm:col-span-4"><span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Description printed in the grading scale <span className="font-normal">(optional)</span></span><input value={band.description} maxLength={160} onChange={(event) => update({ description: event.target.value })} className={`${input} w-full`} /></label>
          </div>;
        })}
      </div>
      <button data-testid="button-add-grade" type="button" onClick={() => { setBands((current) => [...current, { grade: '', min: '', descriptor: '', description: '' }]); touch(); }} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted"><Plus size={15} /> Add grade</button>
      <label className="mt-5 block max-w-[200px]"><span className="mb-1 block text-xs font-semibold text-muted-foreground">Pass mark (%)</span><input data-testid="input-pass-mark" type="number" min="0" max="100" value={passMark} onChange={(event) => { setPassMark(event.target.value); touch(); }} className={`${input} w-full`} /></label>
    </section>

    <section className={card}>
      <h3 className="font-display text-lg font-semibold">Result categories</h3>
      <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">Printed in the “Result categories” box on the report card. Give a category a minimum overall average to have learners placed in it automatically; leave it empty for a category that is only explained on the card.</p>
      <div className="mt-4 space-y-3">
        {categories.map((item, index) => {
          const update = (patch: Partial<Category>) => { setCategories((current) => current.map((entry, i) => i === index ? { ...entry, ...patch } : entry)); touch(); };
          return <div key={index} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[140px_130px_1fr_auto]">
            <label><span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Name</span><input value={item.label} maxLength={30} onChange={(event) => update({ label: event.target.value })} className={`${input} w-full`} /></label>
            <label><span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Average from (%)</span><input type="number" min="0" max="100" value={item.minAverage} placeholder="none" onChange={(event) => update({ minAverage: event.target.value })} className={`${input} w-full`} /></label>
            <label><span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Meaning</span><input value={item.text} maxLength={220} onChange={(event) => update({ text: event.target.value })} className={`${input} w-full`} /></label>
            <button type="button" aria-label="Remove category" onClick={() => { setCategories((current) => current.filter((_, i) => i !== index)); touch(); }} className="self-end justify-self-end pb-2 text-destructive"><Trash2 size={16} /></button>
          </div>;
        })}
      </div>
      <button type="button" onClick={() => { setCategories((current) => [...current, { label: '', text: '', minAverage: '' }]); touch(); }} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted"><Plus size={15} /> Add category</button>
    </section>

    <section className={card}>
      <h3 className="font-display text-lg font-semibold">Report card remarks</h3>
      <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">Write the class teacher's and head teacher's comments by overall average. Each learner gets the remark of the highest band their average reaches. Use {'{name}'} for the learner's first name and {'{weak}'} for weak subjects. With no remarks here, the standard wording is used.</p>
      <div className="mt-4 space-y-3">
        {[...remarks].sort((a, b) => Number(b.min) - Number(a.min)).map((item) => {
          const index = remarks.indexOf(item);
          const update = (patch: Partial<Remark>) => { setRemarks((current) => current.map((entry, i) => i === index ? { ...entry, ...patch } : entry)); touch(); };
          return <div key={index} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[130px_1fr_1fr_auto]">
            <label><span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Average from (%)</span><input type="number" min="0" max="100" value={item.min} onChange={(event) => update({ min: event.target.value })} className={`${input} w-full`} /></label>
            <label><span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Class teacher</span><input value={item.classTeacher} maxLength={200} onChange={(event) => update({ classTeacher: event.target.value })} className={`${input} w-full`} /></label>
            <label><span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Head teacher</span><input value={item.headTeacher} maxLength={200} onChange={(event) => update({ headTeacher: event.target.value })} className={`${input} w-full`} /></label>
            <button type="button" aria-label="Remove remark" onClick={() => { setRemarks((current) => current.filter((_, i) => i !== index)); touch(); }} className="self-end justify-self-end pb-2 text-destructive"><Trash2 size={16} /></button>
          </div>;
        })}
      </div>
      <button type="button" onClick={() => { setRemarks((current) => [...current, { min: current.length ? '' : '0', classTeacher: '', headTeacher: '' }]); touch(); }} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted"><Plus size={15} /> Add remark band</button>
    </section>

    <div className="flex flex-wrap items-center gap-3">
      <button data-testid="button-save-grading" onClick={submit} disabled={!dirty || saving || problems.length > 0} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"><Check size={15} /> {saving ? 'Saving…' : 'Save grading'}</button>
      {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
    {problems.length > 0 && dirty && <ul role="alert" className="list-disc pl-5 text-sm text-destructive">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>}
    <p className="text-xs text-muted-foreground">This grading belongs to the whole school. It is not tied to a term, so every term you open later uses it automatically.</p>
  </div>;
}
