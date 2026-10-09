import { jiibApi } from "@/lib/jiib-api";

export type PendingMark = {
  schoolId: string;
  studentId: string;
  termKey: string;
  subject: string;
  aoi: number;
  midterm: number;
  end: number;
  enteredFields: string[];
  queuedAt: number;
};

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
  const next = {
    ...mark,
    queuedAt: Date.now(),
  };
  const index = items.findIndex((item) => key(item) === key(next));
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
          aoi: item.aoi,
          midterm: item.midterm,
          end: item.end,
          enteredFields: item.enteredFields,
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
