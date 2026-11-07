// Editable A-Level grading: the mark each grade starts at, the points it earns, and the subsidiary pass mark.
import { useState } from 'react';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { jiibApi } from '@/lib/jiib-api';
import { aLevelGrading, DEFAULT_ALEVEL_GRADING, type ALevelGrading, type SchoolConfig } from '@/lib/school-data';

type ConfigResult = { schoolId: string; data: Record<string, unknown>; updatedAt: string | Date };
type Row = { grade: string; min: string; points: string };

const toRows = (grading: ALevelGrading): Row[] => grading.principal.map((band) => ({ grade: band.grade, min: String(band.min), points: String(band.points) }));

function problemWith(rows: Row[], pass: string) {
  if (rows.length < 2) return 'Keep at least two grades.';
  if (rows.some((row) => !row.grade.trim() || row.grade.trim().length > 3)) return 'Every grade needs a short letter (up to 3 characters).';
  if (new Set(rows.map((row) => row.grade.trim().toUpperCase())).size !== rows.length) return 'Each grade letter can be used once.';
  const mins = rows.map((row) => Number(row.min));
  const points = rows.map((row) => Number(row.points));
  if (rows.some((row) => row.min.trim() === '' || row.points.trim() === '') || mins.some((n) => !Number.isFinite(n) || n < 0 || n > 100)) return 'Marks must be numbers from 0 to 100.';
  if (points.some((n) => !Number.isInteger(n) || n < 0 || n > 9)) return 'Points must be whole numbers from 0 to 9.';
  if (new Set(mins).size !== rows.length) return 'Each grade needs a different starting mark.';
  if (Math.min(...mins) !== 0) return 'The lowest grade must start at 0 so every mark gets a grade.';
  const sorted = rows.map((row, index) => ({ min: mins[index], points: points[index] })).sort((a, b) => b.min - a.min);
  if (sorted.some((band, index) => index > 0 && band.points > sorted[index - 1].points)) return 'A higher mark can never earn fewer points than a lower one.';
  const passMark = Number(pass);
  if (pass.trim() === '' || !Number.isFinite(passMark) || passMark < 0 || passMark > 100) return 'The subsidiary pass mark must be from 0 to 100.';
  return null;
}

export function ALevelGradingCard({ schoolId, config, onChanged }: { schoolId: string; config: SchoolConfig; onChanged: (result: ConfigResult) => void }) {
  const current = aLevelGrading(config);
  const [rows, setRows] = useState<Row[]>(() => toRows(current));
  const [pass, setPass] = useState(String(current.subsidiaryPass));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const problem = problemWith(rows, pass);
  const edit = (index: number, patch: Partial<Row>) => { setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row))); setNotice(''); };

  const save = async () => {
    if (problem) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await jiibApi<ConfigResult>(`/api/schools/${encodeURIComponent(schoolId)}/a-level-grading`, {
        method: 'PATCH',
        body: JSON.stringify({ principal: rows.map((row) => ({ grade: row.grade.trim(), min: Number(row.min), points: Number(row.points) })), subsidiaryPass: Number(pass) }),
      });
      onChanged(result);
      setNotice('Grading saved. Results and report cards now use it.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The grading could not be saved. Please try again.');
    } finally { setBusy(false); }
  };

  const input = 'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm';
  return <section data-testid="alevel-grading" className="mt-6 rounded-2xl border border-border bg-card p-5 sm:p-6">
    <h3 className="font-display text-lg font-semibold">Grading and points</h3>
    <p className="mt-1 text-sm text-muted-foreground">Each principal subject earns a grade and points from its combined mark. Subsidiary subjects and General Paper earn 1 point for a pass and 0 for a fail.</p>
    <div className="mt-5 grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground"><span>Grade</span><span>From mark</span><span>Points</span><span className="w-10" /></div>
    <div className="mt-2 space-y-2">
      {rows.map((row, index) => <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
        <input aria-label={`Grade ${index + 1}`} data-testid={`input-grade-${index}`} className={input} value={row.grade} maxLength={3} onChange={(event) => edit(index, { grade: event.target.value })} />
        <input aria-label={`From mark for grade ${index + 1}`} data-testid={`input-grade-min-${index}`} className={input} type="number" inputMode="decimal" min="0" max="100" value={row.min} onChange={(event) => edit(index, { min: event.target.value })} />
        <input aria-label={`Points for grade ${index + 1}`} data-testid={`input-grade-points-${index}`} className={input} type="number" inputMode="numeric" min="0" max="9" value={row.points} onChange={(event) => edit(index, { points: event.target.value })} />
        <button type="button" aria-label={`Remove grade ${index + 1}`} disabled={rows.length <= 2} onClick={() => { setRows(rows.filter((_, i) => i !== index)); setNotice(''); }} className="grid h-10 w-10 place-items-center rounded-lg text-destructive hover:bg-destructive/10 disabled:opacity-30"><Trash2 size={15} /></button>
      </div>)}
    </div>
    <button type="button" onClick={() => { setRows([...rows, { grade: '', min: '', points: '0' }]); setNotice(''); }} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"><Plus size={13} /> Add a grade</button>
    <label className="mt-5 block max-w-xs"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Subsidiary / General Paper pass mark (%)</span>
      <input data-testid="input-subsidiary-pass" className={input} type="number" inputMode="decimal" min="0" max="100" value={pass} onChange={(event) => { setPass(event.target.value); setNotice(''); }} /></label>
    {(problem || error) && <p role="alert" data-testid="grading-error" className="mt-4 text-xs font-medium text-destructive">{error || problem}</p>}
    {notice && <p role="status" className="mt-4 text-xs font-medium text-[#2e8c72]">{notice}</p>}
    <div className="mt-5 flex flex-wrap gap-2">
      <button type="button" data-testid="button-save-grading" disabled={busy || Boolean(problem)} onClick={() => void save()} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? 'Saving…' : 'Save grading'}</button>
      <button type="button" onClick={() => { setRows(toRows(DEFAULT_ALEVEL_GRADING)); setPass(String(DEFAULT_ALEVEL_GRADING.subsidiaryPass)); setNotice(''); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-sm font-semibold hover:bg-muted"><RotateCcw size={14} /> Use the standard grading</button>
    </div>
  </section>;
}
