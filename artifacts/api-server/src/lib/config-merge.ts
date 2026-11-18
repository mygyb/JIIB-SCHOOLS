// Three-way merge of the school settings record, so a save never wipes out someone else's change.
const isPlain = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const idOf = (value: unknown) => (isPlain(value) && value.id !== undefined && value.id !== null ? String(value.id) : null);

/** Three-way merge: `base` is what the writer read, `ours` what it wants to save, `theirs` what is stored now. */
export function mergeConfig(base: unknown, ours: unknown, theirs: unknown): unknown {
  if (sameJson(ours, base)) return theirs; // we changed nothing here: keep the newest
  if (sameJson(theirs, base)) return ours; // nobody else changed this part: ours
  if (isPlain(ours) && isPlain(theirs)) {
    const baseObject = isPlain(base) ? base : {};
    const out: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(ours), ...Object.keys(theirs), ...Object.keys(baseObject)])) {
      const inOurs = key in ours, inTheirs = key in theirs, inBase = key in baseObject;
      if (!inOurs) { if (inTheirs && !(inBase && sameJson(theirs[key], baseObject[key]))) out[key] = theirs[key]; continue; } // we removed it
      if (!inTheirs) { if (!inBase) out[key] = ours[key]; else if (!sameJson(ours[key], baseObject[key])) out[key] = ours[key]; continue; } // they removed it
      out[key] = mergeConfig(baseObject[key], ours[key], theirs[key]);
    }
    return out;
  }
  if (Array.isArray(ours) && Array.isArray(theirs) && [...ours, ...theirs].every((item) => idOf(item) !== null)) {
    const baseArray = Array.isArray(base) ? base : [];
    const byId = (list: unknown[]) => new Map(list.map((item) => [idOf(item)!, item]));
    const baseMap = byId(baseArray), ourMap = byId(ours), theirMap = byId(theirs);
    const out: unknown[] = [];
    for (const id of new Set([...theirMap.keys(), ...ourMap.keys()])) {
      const inBase = baseMap.has(id), inOurs = ourMap.has(id), inTheirs = theirMap.has(id);
      if (inOurs && inTheirs) out.push(mergeConfig(baseMap.get(id), ourMap.get(id), theirMap.get(id)));
      else if (inOurs) { if (!inBase || !sameJson(ourMap.get(id), baseMap.get(id))) out.push(ourMap.get(id)); } // we added or edited it
      else if (inTheirs) { if (!inBase) out.push(theirMap.get(id)); else if (!sameJson(theirMap.get(id), baseMap.get(id))) out.push(theirMap.get(id)); } // they added or edited it; we removed it only if they did not touch it
    }
    return out;
  }
  return ours; // the same value was changed by both: the later save wins, for that value only
}

