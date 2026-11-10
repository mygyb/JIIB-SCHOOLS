// Edits a list of fee items (name + amount in UGX) with a running total. Used for class structures and a student's own structure.
import { Plus, X } from 'lucide-react';
import { AmountInput } from './amount-input';
import { COMMON_ITEMS, num, parseUgx, ugx } from './money';

export type DraftItem = { name: string; amount: string };
export const toDraft = (items: Array<{ name: string; amount: number }>): DraftItem[] => items.map((item) => ({ name: item.name, amount: num(item.amount) }));

/** Returns the items as numbers, or a message explaining what to fix. */
export function readDraft(items: DraftItem[]): { items: Array<{ name: string; amount: number }> } | { error: string } {
  const out: Array<{ name: string; amount: number }> = [];
  for (const [index, item] of items.entries()) {
    const name = item.name.trim().replace(/\s+/g, ' ');
    if (!name && !item.amount.trim()) continue;
    if (!name) return { error: `Give item ${index + 1} a name.` };
    const amount = parseUgx(item.amount);
    if (amount === null) return { error: `Enter ${name} as a whole number of shillings.` };
    out.push({ name, amount });
  }
  if (new Set(out.map((item) => item.name.toLowerCase())).size !== out.length) return { error: 'Each fee item name can be used once.' };
  return { items: out };
}

export function ItemsEditor({ items, onChange }: { items: DraftItem[]; onChange: (items: DraftItem[]) => void }) {
  const total = items.reduce((sum, item) => sum + (parseUgx(item.amount) ?? 0), 0);
  const unused = COMMON_ITEMS.filter((name) => !items.some((item) => item.name.trim().toLowerCase() === name.toLowerCase()));
  const set = (index: number, patch: Partial<DraftItem>) => onChange(items.map((item, at) => (at === index ? { ...item, ...patch } : item)));
  return <div data-testid="items-editor">
    <ul className="space-y-2">
      {items.map((item, index) => <li key={index} className="grid grid-cols-[1fr_9.5rem_2.25rem] items-center gap-2">
        <input aria-label={`Fee item ${index + 1} name`} data-testid={`item-name-${index}`} value={item.name} maxLength={60} placeholder="e.g. Tuition" onChange={(event) => set(index, { name: event.target.value })} className="h-11 min-w-0 rounded-lg border border-border bg-background px-3 text-sm" />
        <AmountInput label={`${item.name || `Item ${index + 1}`} amount`} testId={`item-amount-${index}`} value={item.amount} onChange={(amount) => set(index, { amount })} />
        <button type="button" aria-label={`Remove ${item.name || `item ${index + 1}`}`} onClick={() => onChange(items.filter((_, at) => at !== index))} className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive"><X size={16} /></button></li>)}
    </ul>
    {unused.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-1.5"><span className="text-xs text-muted-foreground">Add:</span>
      {unused.map((name) => <button key={name} type="button" onClick={() => onChange([...items.filter((item) => item.name.trim() || item.amount.trim()), { name, amount: '' }])} className="rounded-full border border-border px-2.5 py-1 text-xs font-medium hover:border-primary hover:text-primary">{name}</button>)}</div>}
    <button type="button" data-testid="button-add-item" onClick={() => onChange([...items, { name: '', amount: '' }])} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary"><Plus size={15} />Add another item</button>
    <div className="mt-4 flex items-center justify-between rounded-lg bg-muted px-4 py-3"><span className="text-sm font-semibold">Total</span><span data-testid="items-total" className="ledger-figure font-display text-lg font-semibold">{ugx(total)}</span></div>
  </div>;
}
