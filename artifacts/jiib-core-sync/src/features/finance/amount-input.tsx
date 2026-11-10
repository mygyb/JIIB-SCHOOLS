import { num, parseUgx } from './money';

/** A text box for whole shillings that shows thousands separators as you type. */
export function AmountInput({ value, onChange, label, testId, placeholder = '0', invalid }: { value: string; onChange: (value: string) => void; label: string; testId?: string; placeholder?: string; invalid?: boolean }) {
  return <input aria-label={label} data-testid={testId} inputMode="numeric" autoComplete="off" value={value} placeholder={placeholder}
    onChange={(event) => {
      const raw = event.target.value;
      const parsed = parseUgx(raw);
      onChange(raw.trim() === '' ? '' : parsed === null ? raw.replace(/[^\d,\s]/g, '') : num(parsed));
    }}
    className={`ledger-figure h-11 w-full rounded-lg border bg-background px-3 text-right text-sm font-semibold ${invalid ? 'border-destructive' : 'border-border'}`} />;
}
