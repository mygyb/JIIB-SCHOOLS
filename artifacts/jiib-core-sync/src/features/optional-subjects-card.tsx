// School settings → "Optional subjects start in": the first class where students pick the subjects they take.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetSchoolConfigQueryKey } from '@workspace/api-client-react';
import { jiibApi } from '@/lib/jiib-api';
import { classLevel, optionalSubjectsClassOf, type SchoolConfig } from '@/lib/school-data';

type ConfigResult = { schoolId: string; data: Record<string, unknown>; updatedAt: string | Date };
const DEFAULT_CLASSES = ['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6'];

export function OptionalSubjectsCard({ schoolId, config }: { schoolId: string; config: SchoolConfig }) {
  const queryClient = useQueryClient();
  const current = optionalSubjectsClassOf(config);
  const configured = Object.keys((config.subjects as Record<string, unknown> | undefined) ?? {});
  const options = Array.from(new Set([...DEFAULT_CLASSES, ...configured, current])).sort((a, b) => classLevel(a) - classLevel(b) || a.localeCompare(b));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const change = async (className: string) => {
    setBusy(true); setError(''); setSaved(false);
    try {
      const result = await jiibApi<ConfigResult>(`/api/schools/${encodeURIComponent(schoolId)}/optional-subjects-class`, { method: 'PATCH', body: JSON.stringify({ className }) });
      queryClient.setQueryData(getGetSchoolConfigQueryKey(schoolId), { schoolId: result.schoolId, data: result.data, updatedAt: result.updatedAt });
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The setting could not be saved. Please try again.');
    } finally { setBusy(false); }
  };

  return <section data-testid="optional-subjects-card" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
    <h3 className="font-display text-lg font-semibold">Optional subjects</h3>
    <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">Students choose the subjects they take from this class upward. Earlier classes take every subject of their class. Many schools start in S.3; some start in S.1.</p>
    <label className="mt-4 block max-w-xs"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Students start choosing optional subjects in</span>
      <select data-testid="select-optional-start" value={current} disabled={busy} onChange={(event) => void change(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-60">
        {options.map((name) => <option key={name} value={name}>{name}</option>)}
      </select></label>
    {error && <p role="alert" className="mt-3 text-xs font-medium text-destructive">{error}</p>}
    {saved && <p role="status" className="mt-3 text-xs font-medium text-[#2e8c72]">Saved. The student form, marks register and promotion now use {current} onward.</p>}
  </section>;
}
