// Nursery marks register view: the class teacher rates every pupil on the learning activities and adds a behaviour comment.
// These feed the nursery report card, so nobody has to open each pupil in the report studio.
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { jiibApi } from "@/lib/jiib-api";
import { NURSERY_ACTIVITIES, NURSERY_RATINGS, type NurseryExtras } from "@/features/report-studio/nursery-card";

type Pupil = { id: string; name: string };
type Entries = Record<string, NurseryExtras>;
const box = "h-9 w-full min-w-[110px] rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60";

function PupilRow({ pupil, saved, disabled, onSave }: { pupil: Pupil; saved: NurseryExtras | undefined; disabled: boolean; onSave: (pupil: Pupil, next: NurseryExtras) => Promise<void> }) {
  const [draft, setDraft] = useState<NurseryExtras>(saved ?? {});
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const dirty = useRef(false);
  const signature = JSON.stringify(saved ?? {});
  useEffect(() => { if (!dirty.current) setDraft(saved ?? {}); }, [signature]);
  const commit = async (next: NurseryExtras) => {
    dirty.current = false;
    setState("saving");
    try { await onSave(pupil, next); setState("saved"); setTimeout(() => setState((current) => current === "saved" ? "idle" : current), 2000); } catch { dirty.current = true; setState("error"); }
  };
  const change = (patch: (current: NurseryExtras) => NurseryExtras) => { dirty.current = true; setDraft(patch); setState("idle"); };
  const blur = () => { if (dirty.current && JSON.stringify(draft) !== signature) void commit(draft); };
  return <div data-testid={`nursery-row-${pupil.id}`} className="rounded-xl border border-border bg-card p-3">
    <div className="mb-2 flex items-center justify-between gap-2">
      <p className="text-sm font-semibold uppercase">{pupil.name}</p>
      <span aria-live="polite" className="inline-flex items-center gap-1 text-xs font-semibold">
        {state === "saving" && <><Loader2 size={13} className="animate-spin" aria-hidden="true" /> Saving…</>}
        {state === "saved" && <span className="inline-flex items-center gap-1 text-emerald-700"><Check size={13} aria-hidden="true" /> Saved</span>}
        {state === "error" && <button type="button" onClick={() => void commit(draft)} className="text-destructive underline">Not saved — retry</button>}
      </span>
    </div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
      {NURSERY_ACTIVITIES.map((item) => <label key={item.id} className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{item.icon} {item.label}</span>
        <input list="nursery-ratings-list" disabled={disabled} maxLength={24} value={draft.activities?.[item.id] ?? ""} onChange={(event) => change((current) => ({ ...current, activities: { ...(current.activities ?? {}), [item.id]: event.target.value } }))} onBlur={blur} className={box} /></label>)}
      <label className="col-span-2 block sm:col-span-3 xl:col-span-5"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Behaviour / cleanliness</span>
        <input disabled={disabled} maxLength={160} value={draft.behaviour ?? ""} onChange={(event) => change((current) => ({ ...current, behaviour: event.target.value }))} onBlur={blur} className={box} /></label>
    </div>
  </div>;
}

export function NurseryRatingsTable({ schoolId, termKey, pupils, locked }: { schoolId: string; termKey: string; pupils: Pupil[]; locked: boolean }) {
  const queryClient = useQueryClient();
  const key = ["nursery-extras", schoolId, termKey];
  const query = useQuery({ queryKey: key, queryFn: () => jiibApi<{ entries: Entries }>(`/api/schools/${encodeURIComponent(schoolId)}/nursery-extras?termKey=${encodeURIComponent(termKey)}`), enabled: Boolean(termKey) });
  const save = async (pupil: Pupil, next: NurseryExtras) => {
    await jiibApi(`/api/schools/${encodeURIComponent(schoolId)}/nursery-extras`, { method: "PUT", body: JSON.stringify({ termKey, studentId: pupil.id, extras: next }) });
    queryClient.setQueryData<{ entries: Entries }>(key, (old) => ({ entries: { ...(old?.entries ?? {}), [pupil.id]: { ...(old?.entries?.[pupil.id] ?? {}), ...next } } }));
  };
  if (query.isLoading) return <div className="grid place-items-center p-10"><Loader2 className="animate-spin" aria-label="Loading" /></div>;
  if (query.isError) return <p role="alert" className="p-6 text-center text-sm text-destructive">The ratings could not be loaded. Please refresh.</p>;
  if (!pupils.length) return <p className="p-8 text-center text-sm text-muted-foreground">No pupils in this class.</p>;
  return <div data-testid="nursery-ratings" className="space-y-3 p-3">
    <datalist id="nursery-ratings-list">{NURSERY_RATINGS.map((item) => <option key={item} value={item} />)}</datalist>
    <p className="px-1 text-xs leading-5 text-muted-foreground">Rate each pupil on the learning activities. Pick a suggestion or type your own word. Each change saves when you move to the next box, and appears on the nursery report card.</p>
    {pupils.map((pupil) => <PupilRow key={pupil.id} pupil={pupil} saved={query.data?.entries?.[pupil.id]} disabled={locked} onSave={save} />)}
  </div>;
}
