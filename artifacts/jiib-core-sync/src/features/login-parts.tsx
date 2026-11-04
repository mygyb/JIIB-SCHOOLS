// Small pieces of the login page: remembered school, school search, staff/parent switch and the password box.
import { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, Search, School as SchoolIcon } from 'lucide-react';

export type SchoolChoice = { slug: string; name: string };
const LAST_SCHOOL_KEY = 'jiib.lastSchool';

export function readRememberedSchool(): SchoolChoice | null {
  try {
    const value = JSON.parse(localStorage.getItem(LAST_SCHOOL_KEY) ?? 'null') as Partial<SchoolChoice> | null;
    return value?.slug && value?.name ? { slug: value.slug, name: value.name } : null;
  } catch {
    return null;
  }
}

export function rememberSchool(choice: SchoolChoice) {
  try { localStorage.setItem(LAST_SCHOOL_KEY, JSON.stringify({ slug: choice.slug, name: choice.name })); } catch { /* storage unavailable */ }
}

export function forgetSchool() {
  try { localStorage.removeItem(LAST_SCHOOL_KEY); } catch { /* storage unavailable */ }
}

const fieldClass = 'h-12 w-full rounded-xl border border-input bg-card px-3 text-base outline-none focus:ring-2 focus:ring-ring sm:text-sm';

export function ModeSwitch({ mode, onChange }: { mode: 'staff' | 'parent'; onChange: (mode: 'staff' | 'parent') => void }) {
  return (
    <div role="tablist" aria-label="Who is signing in" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 text-sm font-semibold">
      {(['staff', 'parent'] as const).map((item) => (
        <button key={item} type="button" role="tab" aria-selected={mode === item} data-testid={`tab-login-${item}`} onClick={() => onChange(item)}
          className={`h-11 rounded-lg transition ${mode === item ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>
          {item === 'staff' ? 'Staff' : 'Parent'}
        </button>
      ))}
    </div>
  );
}

export function PasswordField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [shown, setShown] = useState(false);
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold">Password</span>
      <span className="relative block">
        <input data-testid="input-login-password" type={shown ? 'text' : 'password'} autoComplete="current-password" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Your password" className={`${fieldClass} pr-12`} />
        <button type="button" aria-label={shown ? 'Hide password' : 'Show password'} onClick={() => setShown(!shown)} className="absolute right-1 top-1 grid h-10 w-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted">
          {shown ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </span>
    </label>
  );
}

export function EmailField({ value, onChange, autoFocus }: { value: string; onChange: (value: string) => void; autoFocus?: boolean }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold">Email</span>
      <input data-testid="input-login-email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} placeholder="you@school.com" className={fieldClass} />
    </label>
  );
}

export function PhoneField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold">Phone number</span>
      <input data-testid="input-parent-phone" type="tel" inputMode="tel" autoComplete="tel" value={value} onChange={(e) => onChange(e.target.value)} placeholder="The number registered with the school" className={fieldClass} />
    </label>
  );
}

/** Shows the remembered school with a Change link, or lets the person search for their school by name. */
export function SchoolPicker({ choice, text, onText, onChoose }: {
  choice: SchoolChoice | null;
  text: string;
  onText: (value: string) => void;
  onChoose: (choice: SchoolChoice | null) => void;
}) {
  const [results, setResults] = useState<SchoolChoice[]>([]);
  const [searching, setSearching] = useState(false);
  const query = text.trim();

  useEffect(() => {
    if (choice || query.length < 2) { setResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/schools/search?q=${encodeURIComponent(query)}`);
        const rows = response.ok ? ((await response.json()) as SchoolChoice[]) : [];
        if (!cancelled) setResults(rows);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, choice]);

  if (choice) {
    return (
      <div data-testid="school-chosen" className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><SchoolIcon size={18} aria-hidden="true" /></span>
        <span className="min-w-0 flex-1"><span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Your school</span><span className="block truncate text-sm font-semibold">{choice.name}</span></span>
        <button type="button" data-testid="button-change-school" onClick={() => { onChoose(null); onText(''); }} className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-primary hover:bg-muted">Change</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <label className="block">
        <span className="mb-2 block text-sm font-semibold">Your school</span>
        <span className="relative block">
          <Search size={16} aria-hidden="true" className="absolute left-3 top-4 text-muted-foreground" />
          <input data-testid="input-school-slug" autoFocus autoComplete="off" autoCapitalize="none" value={text} onChange={(e) => onText(e.target.value)} placeholder="Type your school’s name" className={`${fieldClass} pl-10`} />
          {searching && <Loader2 size={16} className="absolute right-3 top-4 animate-spin text-muted-foreground" aria-hidden="true" />}
        </span>
      </label>
      {results.length > 0 && (
        <ul role="listbox" aria-label="Matching schools" className="mt-2 overflow-hidden rounded-xl border border-border bg-card shadow-md">
          {results.map((item) => (
            <li key={item.slug}><button type="button" role="option" aria-selected="false" data-testid={`school-option-${item.slug}`} onClick={() => onChoose(item)} className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm hover:bg-muted"><SchoolIcon size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate font-medium">{item.name}</span></button></li>
          ))}
        </ul>
      )}
      {query.length >= 2 && !searching && results.length === 0 && <p className="mt-2 text-xs text-muted-foreground">No school found yet. You can also type your school’s code.</p>}
    </div>
  );
}
