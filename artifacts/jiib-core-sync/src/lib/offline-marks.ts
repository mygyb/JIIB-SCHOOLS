import { jiibApi } from "@/lib/jiib-api";

export type PendingMark = {
  schoolId: string;
  studentId: string;
  termKey: string;
  subject: string;
  // Only the boxes listed in `touched` were changed; the rest are left as they are on the server.
  // Older saved items have no `touched` and carry all three boxes.
  aoi?: number;
  midterm?: number;
  end?: number;
  enteredFields?: string[];
  touched?: Array<"c1" | "c2" | "c3">;
  queuedAt: number;
};

const STORAGE_OF = { c1: "aoi", c2: "midterm", c3: "end" } as const;

const QUEUE_KEY = "jiib.pendingMarks";

export function getPendingMarks(schoolId?: string): PendingMark[] {
  try {
    const items = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]") as PendingMark[];
    return schoolId ? items.filter((item) => item.schoolId === schoolId) : items;
  } catch {
    return [];
  }
}

export function queueMark(mark: Omit<PendingMark, "queuedAt">) {
  const items = getPendingMarks();
  const key = (item: PendingMark) =>
    `${item.schoolId}|${item.termKey}|${item.studentId}|${item.subject}`;
  const index = items.findIndex((item) => key(item) === key({ ...mark, queuedAt: 0 }));
  let next: PendingMark = { ...mark, queuedAt: Date.now() };
  const existing = index >= 0 ? items[index] : undefined;
  // Several boxes typed offline for the same student are kept together instead of replacing each other.
  if (existing?.touched && mark.touched) {
    const entered = new Set(existing.enteredFields ?? []);
    for (const field of mark.touched) {
      if (mark.enteredFields?.includes(field)) entered.add(field);
      else entered.delete(field);
    }
    next = {
      ...existing,
      ...mark,
      touched: [...new Set([...existing.touched, ...mark.touched])],
      enteredFields: [...entered],
      queuedAt: Date.now(),
    };
    for (const field of existing.touched) {
      const name = STORAGE_OF[field];
      if (!mark.touched.includes(field) && existing[name] !== undefined) next[name] = existing[name];
    }
  }
  if (index >= 0) items[index] = next;
  else items.push(next);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  return items;
}

export async function flushPendingMarks() {
  if (!navigator.onLine) return { synced: 0, pending: getPendingMarks().length };
  let items = getPendingMarks();
  let synced = 0;
  for (const item of items) {
    await jiibApi(
      `/api/schools/${encodeURIComponent(item.schoolId)}/marks`,
      {
        method: "PUT",
        body: JSON.stringify({
          studentId: item.studentId,
          termKey: item.termKey,
          subject: item.subject,
          // Send only the boxes that were changed (older saved items send all three).
          ...(!item.touched || item.touched.includes("c1") ? { aoi: item.aoi ?? 0 } : {}),
          ...(!item.touched || item.touched.includes("c2") ? { midterm: item.midterm ?? 0 } : {}),
          ...(!item.touched || item.touched.includes("c3") ? { end: item.end ?? 0 } : {}),
          enteredFields: item.enteredFields ?? [],
        }),
      },
    );
    items = items.filter((candidate) =>
      !(candidate.schoolId === item.schoolId &&
        candidate.termKey === item.termKey &&
        candidate.studentId === item.studentId &&
        candidate.subject === item.subject),
    );
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
    synced += 1;
  }
  return { synced, pending: items.length };
}
