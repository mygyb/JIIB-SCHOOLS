// Fields the nursery report card needs that are not marks: activity ratings, attendance and comments.
import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { NURSERY_ACTIVITIES, NURSERY_RATINGS, type NurseryExtras } from "./nursery-card";

const box = "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm";

export function NurseryEntry({ name, extras, saving, saved, onSave }: { name: string; extras: NurseryExtras | undefined; saving: boolean; saved: boolean; onSave: (next: NurseryExtras) => void }) {
  const [draft, setDraft] = useState<NurseryExtras>(extras ?? {});
  const signature = JSON.stringify(extras ?? {});
  useEffect(() => { setDraft(extras ?? {}); }, [signature]);
  const setActivity = (id: string, value: string) => setDraft((current) => ({ ...current, activities: { ...(current.activities ?? {}), [id]: value } }));
  return <section className="rounded-2xl border border-border bg-card p-4" data-testid="nursery-entry">
    <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Nursery report details</p>
    <p className="mb-3 text-xs leading-5 text-muted-foreground">Ratings, attendance and comments for {name}. They appear on the nursery report card for this term.</p>
    <datalist id="nursery-ratings">{NURSERY_RATINGS.map((item) => <option key={item} value={item} />)}</datalist>
    <div className="grid grid-cols-2 gap-2">
      {NURSERY_ACTIVITIES.map((item) => <label key={item.id} className="block"><span className="mb-1 block text-[11px] font-semibold text-muted-foreground">{item.icon} {item.label}</span><input list="nursery-ratings" value={draft.activities?.[item.id] ?? ""} maxLength={24} onChange={(event) => setActivity(item.id, event.target.value)} className={box} /></label>)}
    </div>
    <div className="mt-3 grid grid-cols-3 gap-2">
      {([["daysAttended", "Days attended"], ["daysAbsent", "Absent"], ["totalDays", "Total days"]] as const).map(([key, text]) => <label key={key} className="block"><span className="mb-1 block text-[11px] font-semibold text-muted-foreground">{text}</span><input inputMode="numeric" value={draft[key] ?? ""} maxLength={3} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value.replace(/\D/g, "") }))} className={box} /></label>)}
    </div>
    <label className="mt-3 block"><span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Behaviour / cleanliness</span><input value={draft.behaviour ?? ""} maxLength={160} onChange={(event) => setDraft((current) => ({ ...current, behaviour: event.target.value }))} className={box} /></label>
    <label className="mt-3 block"><span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Head teacher's comment <span className="font-normal">(leave empty for the standard wording)</span></span><input value={draft.headComment ?? ""} maxLength={200} onChange={(event) => setDraft((current) => ({ ...current, headComment: event.target.value }))} className={box} /></label>
    <button type="button" data-testid="button-save-nursery" disabled={saving} onClick={() => onSave(draft)} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : saved ? <Check size={16} aria-hidden="true" /> : null}{saved ? "Saved" : "Save for this learner"}</button>
  </section>;
}
