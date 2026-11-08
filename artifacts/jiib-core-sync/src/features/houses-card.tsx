// School settings → Houses: add and remove the school's houses. A house that still has students cannot be removed.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getGetSchoolConfigQueryKey } from '@workspace/api-client-react';
import { Plus, X } from 'lucide-react';
import { jiibApi } from '@/lib/jiib-api';

type House = { name: string; students: number };
type ConfigResult = { schoolId: string; data: Record<string, unknown>; updatedAt: string | Date };

export function HousesCard({ schoolId }: { schoolId: string }) {
  const queryClient = useQueryClient();
  const base = `/api/schools/${encodeURIComponent(schoolId)}/houses`;
  const houses = useQuery({ queryKey: ['houses', schoolId], queryFn: () => jiibApi<House[]>(base) });
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const list = houses.data ?? [];

  const save = async (next: string[]) => {
    setBusy(true);
    setError('');
    try {
      const result = await jiibApi<ConfigResult>(base, { method: 'PUT', body: JSON.stringify({ houses: next }) });
      queryClient.setQueryData(getGetSchoolConfigQueryKey(schoolId), { schoolId: result.schoolId, data: result.data, updatedAt: result.updatedAt });
      await queryClient.invalidateQueries({ queryKey: ['houses', schoolId] });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The houses could not be saved. Please try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) return;
    if (list.some((house) => house.name.toLowerCase() === clean.toLowerCase())) { setError(`${clean} is already a house.`); return; }
    if (await save([...list.map((house) => house.name), clean])) setName('');
  };

  return <section data-testid="houses-card" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
    <h3 className="font-display text-lg font-semibold">Houses</h3>
    <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">The houses students can belong to. A house with students in it can't be removed until they are moved.</p>
    {houses.isLoading ? <div className="mt-4 h-10 animate-pulse rounded-lg bg-muted" />
      : houses.isError ? <p role="alert" className="mt-4 text-sm text-destructive">{houses.error instanceof Error ? houses.error.message : 'Houses could not be loaded.'}</p>
      : <ul className="mt-4 flex flex-wrap gap-2" data-testid="house-list">
        {list.length === 0 && <li className="text-sm text-muted-foreground">No houses yet. Add the first one below.</li>}
        {list.map((house) => <li key={house.name} className="flex items-center gap-2 rounded-full border border-border bg-background py-1.5 pl-3.5 pr-1.5 text-sm">
          <span className="font-semibold">{house.name}</span>
          <span className="text-xs text-muted-foreground">{house.students} {house.students === 1 ? 'student' : 'students'}</span>
          <button type="button" data-testid={`button-remove-house-${house.name}`} aria-label={`Remove ${house.name}`} disabled={busy}
            onClick={() => { if (window.confirm(`Remove the ${house.name} house?`)) void save(list.filter((item) => item.name !== house.name).map((item) => item.name)); }}
            className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"><X size={14} /></button>
        </li>)}
      </ul>}
    <form className="mt-4 flex max-w-md gap-2" onSubmit={(event) => { event.preventDefault(); void add(); }}>
      <input data-testid="input-new-house" aria-label="New house name" value={name} maxLength={30} onChange={(event) => { setName(event.target.value); setError(''); }} placeholder="New house, e.g. Blue" className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
      <button type="submit" data-testid="button-add-house" disabled={busy || !name.trim()} className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Plus size={15} /> Add</button>
    </form>
    {error && <p role="alert" data-testid="houses-error" className="mt-3 text-xs font-medium text-destructive">{error}</p>}
  </section>;
}
