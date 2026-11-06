import { A_LEVEL_CATEGORY_LABELS, aLevelProblem, defaultALevel, type ALevelCategory, type ALevelSubject } from '@/lib/school-data';

const inputClass = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';

/** Equal weights that add up to exactly 100 (the last paper takes the rounding remainder). */
function equalWeights(count: number) {
  const each = Math.floor((100 / count) * 100) / 100;
  return Array.from({ length: count }, (_, index) => index === count - 1 ? Math.round((100 - each * (count - 1)) * 100) / 100 : each);
}

/** Category, number of papers, paper names and out-of marks, and how the papers combine. Used when adding or editing an A-Level subject. */
export function ALevelFields({ value, onChange, idPrefix }: { value: ALevelSubject; onChange: (next: ALevelSubject) => void; idPrefix: string }) {
  const problem = aLevelProblem(value);
  const weighted = value.combine === 'weighted';
  const setCount = (count: number) => {
    const papers = Array.from({ length: count }, (_, index) => value.papers[index] ?? { name: `Paper ${index + 1}`, max: 100 });
    const weights = equalWeights(count);
    onChange({ ...value, papers: weighted ? papers.map((paper, index) => ({ ...paper, weight: weights[index] })) : papers.map(({ weight: _weight, ...rest }) => rest) });
  };
  const setCombine = (combine: 'average' | 'weighted') => {
    if (combine === value.combine) return;
    const weights = equalWeights(value.papers.length);
    onChange({
      ...value,
      combine,
      papers: value.papers.map((paper, index) => combine === 'weighted' ? { ...paper, weight: weights[index] } : { name: paper.name, max: paper.max }),
    });
  };
  const setPaper = (index: number, patch: Partial<{ name: string; max: number; weight: number }>) =>
    onChange({ ...value, papers: value.papers.map((paper, position) => position === index ? { ...paper, ...patch } : paper) });
  const weightTotal = Math.round(value.papers.reduce((sum, paper) => sum + (paper.weight ?? 0), 0) * 100) / 100;

  return <div data-testid={`${idPrefix}-alevel`} className="mt-3 rounded-xl border border-border bg-muted/30 p-4">
    <p className="text-xs font-bold uppercase tracking-[.14em] text-muted-foreground">A-Level setup</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Category</span>
        <select data-testid={`${idPrefix}-category`} value={value.category} onChange={(event) => {
          const category = event.target.value as ALevelCategory;
          // A new category starts from that category's usual number of papers, unless the user already shaped them.
          onChange({ ...value, category });
        }} className={inputClass}>
          {(Object.keys(A_LEVEL_CATEGORY_LABELS) as ALevelCategory[]).map((key) => <option key={key} value={key}>{A_LEVEL_CATEGORY_LABELS[key]}</option>)}
        </select></label>
      <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Number of papers</span>
        <select data-testid={`${idPrefix}-paper-count`} value={value.papers.length} onChange={(event) => setCount(Number(event.target.value))} className={inputClass}>
          {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count} {count === 1 ? 'paper' : 'papers'}</option>)}
        </select></label>
    </div>
    <div className="mt-3 space-y-2">
      {value.papers.map((paper, index) => <div key={index} className={`grid items-end gap-2 ${weighted ? 'grid-cols-[1fr_5.5rem_5.5rem]' : 'grid-cols-[1fr_6rem]'}`}>
        <label><span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Paper {index + 1} name</span>
          <input data-testid={`${idPrefix}-paper-name-${index}`} value={paper.name} onChange={(event) => setPaper(index, { name: event.target.value })} className={inputClass} /></label>
        <label><span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Out of</span>
          <input data-testid={`${idPrefix}-paper-max-${index}`} type="number" inputMode="decimal" min={1} max={1000} value={Number.isFinite(paper.max) ? paper.max : ''} onChange={(event) => setPaper(index, { max: event.target.value === '' ? NaN : Number(event.target.value) })} className={inputClass} /></label>
        {weighted && <label><span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Weight %</span>
          <input data-testid={`${idPrefix}-paper-weight-${index}`} type="number" inputMode="decimal" min={0} max={100} value={Number.isFinite(paper.weight) ? paper.weight : ''} onChange={(event) => setPaper(index, { weight: event.target.value === '' ? NaN : Number(event.target.value) })} className={inputClass} /></label>}
      </div>)}
    </div>
    <fieldset className="mt-4">
      <legend className="mb-1.5 text-xs font-semibold text-muted-foreground">How the papers make the subject mark</legend>
      <div className="flex flex-wrap gap-2">
        {([['average', 'Average of the papers (default)'], ['weighted', 'Custom weights']] as const).map(([key, label]) => <label key={key} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${value.combine === key ? 'border-primary bg-primary/5 font-semibold' : 'border-border'}`}>
          <input data-testid={`${idPrefix}-combine-${key}`} type="radio" name={`${idPrefix}-combine`} checked={value.combine === key} onChange={() => setCombine(key)} className="accent-primary" />{label}
        </label>)}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{weighted
        ? `Each paper is turned into a percentage, then counted by its weight. Weights total ${weightTotal}%.`
        : 'Each paper is turned into a percentage of its own out-of mark, then the percentages are averaged.'}</p>
    </fieldset>
    {problem && <p role="alert" data-testid={`${idPrefix}-problem`} className="mt-3 text-xs font-medium text-destructive">{problem}</p>}
  </div>;
}

export { defaultALevel };

/** One-line summary for the subject list, e.g. "Principal subject · 3 papers · average". */
export function aLevelSummary(value: ALevelSubject) {
  const papers = `${value.papers.length} ${value.papers.length === 1 ? 'paper' : 'papers'}`;
  return `${A_LEVEL_CATEGORY_LABELS[value.category]} · ${papers} (${value.papers.map((paper) => `${paper.name} /${paper.max}`).join(', ')}) · ${value.combine === 'weighted' ? 'custom weights' : 'average'}`;
}
