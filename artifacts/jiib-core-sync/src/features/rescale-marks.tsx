import { useState } from 'react';
import { RotateCcw, Scale } from 'lucide-react';
import { jiibApi } from '@/lib/jiib-api';
import type { AssessmentField, SchoolConfig } from '@/lib/school-data';

export type RescalePreview = {
  conversions: Array<{ field: string; name: string; oldName: string; from: number; to: number }>;
  totalMarks: number;
  perField: Record<string, { converted: number; rounded: number; clamped: number }>;
  terms: Array<{ termKey: string; label: string; count: number }>;
  examples: Array<{ field: string; before: number; after: number }>;
  hiddenFields: Array<{ field: string; name: string; count: number }>;
  roundedMarks: number;
  clampedMarks: number;
};

type ConfigResult = { schoolId: string; data: Record<string, unknown>; updatedAt: string | Date };
type HistoryEntry = {
  id: string; at: string; by: string; total: number; undone?: boolean;
  conversions: Array<{ field: string; name: string; oldName: string; from: number; to: number }>;
};

const base = (schoolId: string) => `/api/schools/${encodeURIComponent(schoolId)}/assessment-settings/rescale`;

export function previewRescale(schoolId: string, fields: AssessmentField[]) {
  return jiibApi<RescalePreview>(base(schoolId), { method: 'POST', body: JSON.stringify({ marksSchema: fields }) });
}

function describe(conversion: { name: string; oldName: string; from: number; to: number }) {
  const label = conversion.oldName === conversion.name ? conversion.name : `${conversion.oldName} (now ${conversion.name})`;
  const factor = Math.round((conversion.to / conversion.from) * 1000) / 1000;
  return `${label}: typed out of ${conversion.from} becomes out of ${conversion.to} (each mark × ${factor})`;
}

/** Shown when the maximum score of an assessment changes and marks already exist: preview, confirm, convert. */
export function RescalePanel({ schoolId, fields, preview, onCancel, onDone }: {
  schoolId: string; fields: AssessmentField[]; preview: RescalePreview; onCancel: () => void; onDone: (result: ConfigResult) => void;
}) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const apply = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await jiibApi<ConfigResult>(base(schoolId), {
        method: 'POST',
        body: JSON.stringify({
          marksSchema: fields,
          confirm: true,
          expectedFrom: preview.conversions.map((item) => ({ field: item.field, from: item.from })),
        }),
      });
      onDone(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The marks could not be converted. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };
  return <section data-testid="rescale-panel" role="alertdialog" aria-labelledby="rescale-title" className="mt-5 rounded-2xl border-2 border-amber-300 bg-amber-50/60 p-5">
    <div className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800"><Scale size={20} aria-hidden="true" /></span>
      <div className="min-w-0">
        <h4 id="rescale-title" className="font-display text-base font-semibold">Convert the marks already entered?</h4>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">You changed what marks are entered out of, and <strong>{preview.totalMarks}</strong> marks are already saved on the old scale. They will be converted in proportion so each student keeps the same result.</p>
      </div>
    </div>
    <ul className="mt-4 space-y-1.5 text-sm">
      {preview.conversions.map((item) => <li key={item.field} data-testid={`rescale-line-${item.field}`} className="rounded-lg bg-white/80 px-3 py-2 font-medium">{describe(item)}{preview.perField[item.field] ? <span className="ml-1 font-normal text-muted-foreground">· {preview.perField[item.field].converted} marks</span> : null}</li>)}
    </ul>
    {preview.examples.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Examples: {preview.examples.slice(0, 6).map((item) => {
      const conversion = preview.conversions.find((c) => c.field === item.field);
      return `${item.before}/${conversion?.from} → ${item.after}/${conversion?.to}`;
    }).join(' · ')}</p>}
    {preview.terms.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Terms covered (the scale is shared by all terms): {preview.terms.map((term) => `${term.label} (${term.count})`).join(', ')}.</p>}
    {preview.roundedMarks > 0 && <p role="note" className="mt-3 rounded-lg bg-white/80 p-2.5 text-xs text-amber-900">{preview.roundedMarks} marks do not convert to a whole number and will be rounded to the nearest whole mark. If you undo, they return to exactly what they were.</p>}
    {preview.clampedMarks > 0 && <p role="note" className="mt-2 rounded-lg bg-white/80 p-2.5 text-xs text-amber-900">{preview.clampedMarks} marks were already above the old maximum and will be capped at the new maximum.</p>}
    {preview.hiddenFields.length > 0 && <p role="note" className="mt-2 rounded-lg bg-white/80 p-2.5 text-xs text-amber-900">{preview.hiddenFields.map((item) => `${item.name} still holds ${item.count} marks. They are kept, but are not shown while that assessment is switched off.`).join(' ')}</p>}
    <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm">
      <input data-testid="checkbox-rescale-ready" type="checkbox" checked={ready} onChange={(event) => setReady(event.target.checked)} className="mt-0.5 accent-primary" />
      <span>Teachers are not entering marks right now, and any marks saved offline on phones have been sent.</span>
    </label>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" data-testid="button-rescale-apply" onClick={() => void apply()} disabled={!ready || busy} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"><Scale size={15} /> {busy ? 'Converting…' : 'Convert marks and save'}</button>
      <button type="button" data-testid="button-rescale-cancel" onClick={onCancel} disabled={busy} className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
    </div>
  </section>;
}

/** The latest conversion, with a button to undo it. */
export function RescaleHistory({ schoolId, config, onChanged }: { schoolId: string; config: SchoolConfig | undefined; onChanged: (result: ConfigResult) => void }) {
  const settings = config?.settings && typeof config.settings === 'object' ? config.settings as Record<string, unknown> : {};
  const entries = Array.isArray(settings.rescaleHistory) ? settings.rescaleHistory as HistoryEntry[] : [];
  const latest = [...entries].reverse().find((entry) => !entry.undone);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!latest) return null;
  const undo = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await jiibApi<ConfigResult>(`${base(schoolId)}/undo`, { method: 'POST', body: JSON.stringify({ id: latest.id }) });
      setConfirming(false);
      onChanged(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The conversion could not be undone. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };
  return <div data-testid="rescale-history" className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
    <p className="text-xs font-bold uppercase tracking-[.14em] text-muted-foreground">Last mark conversion</p>
    <p className="mt-1.5 text-sm">{new Date(latest.at).toLocaleString()} · {latest.total} marks · {latest.conversions.map((item) => `${item.oldName}: /${item.from} → /${item.to}`).join(', ')}</p>
    {!confirming
      ? <button type="button" data-testid="button-rescale-undo" onClick={() => setConfirming(true)} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-muted"><RotateCcw size={14} /> Undo this conversion</button>
      : <div className="mt-3 rounded-lg bg-white/80 p-3 text-sm">
        <p>Undo puts every mark and the assessment settings back as they were before. Marks typed since then are converted back in proportion.</p>
        <div className="mt-3 flex gap-2">
          <button type="button" data-testid="button-rescale-undo-confirm" onClick={() => void undo()} disabled={busy} className="rounded-lg bg-destructive px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Undoing…' : 'Yes, undo'}</button>
          <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">Keep it</button>
        </div>
      </div>}
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
  </div>;
}
