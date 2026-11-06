// Rescale marks: when a school changes the maximum score of an assessment (e.g. AOI from 10 to 20), the marks already
// entered are converted in proportion (7/10 becomes 14/20). Works on both places marks are kept: the `marks` table and
// the copy inside the school's settings record. Every change can be undone.
import type { Request } from "express";
import { asRows, jsonBody, supabaseRequest } from "./supabase.js";

export type FieldId = "c1" | "c2" | "c3";
export type Field = { name: string; max: number; field: FieldId; entryMax?: number };
/** The scale stored marks are on: what teachers type them out of (defaults to the maximum score). */
const scaleOf = (field: Field) => field.entryMax ?? field.max;
export type Conversion = { field: FieldId; name: string; oldName: string; from: number; to: number };

/** Column names a box can be stored under (current names first, legacy c1/c2/c3 second). */
const COLUMNS: Record<FieldId, string[]> = { c1: ["aoi", "c1"], c2: ["midterm", "c2"], c3: ["end", "c3"] };
const FIELD_IDS: FieldId[] = ["c1", "c2", "c3"];
const EPS = 1e-9;

export type Cell = { termKey: string; studentId: string; subject: string; field: FieldId; value: number };
export type MapResult = { value: number; rounded?: boolean; clamped?: boolean };
export type Mapper = (cell: Cell) => MapResult;

export function conversionsFor(oldFields: Field[], newFields: Field[]): Conversion[] {
  const out: Conversion[] = [];
  for (const next of newFields) {
    const previous = oldFields.find((field) => field.field === next.field);
    // Stored marks are on the "entered out of" scale, so only a change of THAT scale needs the marks converted.
    if (previous && Math.abs(scaleOf(previous) - scaleOf(next)) > EPS) {
      out.push({ field: next.field, name: next.name, oldName: previous.name, from: scaleOf(previous), to: scaleOf(next) });
    }
  }
  return out;
}

/** Marks are whole numbers in the marks register, so results are rounded to whole numbers and never exceed the new maximum. */
export function scaleValue(value: number, from: number, to: number) {
  const exact = Math.round((value * to / from) * 1e6) / 1e6;
  const whole = Math.round(exact);
  const rounded = Math.abs(exact - whole) > EPS;
  const capped = Math.min(to, Math.max(0, whole));
  return { value: capped, rounded, clamped: whole > to };
}

export type Stats = {
  perField: Record<string, { converted: number; rounded: number; clamped: number }>;
  perTerm: Record<string, number>;
  examples: Array<{ field: FieldId; before: number; after: number }>;
  total: number;
  roundedCells: Array<{ termKey: string; studentId: string; subject: string; field: FieldId; before: number; after: number }>;
  untouchedFields: Record<string, number>;
};

export function emptyStats(): Stats {
  return { perField: {}, perTerm: {}, examples: [], total: 0, roundedCells: [], untouchedFields: {} };
}

function numeric(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Runs the mapper over a list of mark records (rows or config copies). Mutates nothing; returns the changes. */
function transform(
  records: Array<Record<string, unknown>>,
  termOf: (record: Record<string, unknown>) => string,
  mapper: Mapper,
  convertible: Set<FieldId>,
  stats: Stats,
  countStats: boolean,
) {
  const changes: Array<{ index: number; set: Record<string, number>; original: Record<string, number> }> = [];
  records.forEach((record, index) => {
    const termKey = termOf(record);
    const studentId = String(record.student_id ?? record.studentId ?? "");
    const subject = String(record.subject ?? "");
    const set: Record<string, number> = {};
    const original: Record<string, number> = {};
    for (const field of FIELD_IDS) {
      const keys = COLUMNS[field].filter((key) => key in record);
      for (const key of keys) {
        const value = numeric(record[key]);
        if (value <= 0) continue;
        if (!convertible.has(field)) {
          if (countStats) stats.untouchedFields[field] = (stats.untouchedFields[field] ?? 0) + 1;
          continue;
        }
        const result = mapper({ termKey, studentId, subject, field, value });
        const next = result.value;
        if (next === value) continue;
        set[key] = next;
        original[key] = value;
        if (countStats) {
          const bucket = (stats.perField[field] ??= { converted: 0, rounded: 0, clamped: 0 });
          bucket.converted += 1;
          if (result.rounded) {
            bucket.rounded += 1;
            stats.roundedCells.push({ termKey, studentId, subject, field, before: value, after: next });
          }
          if (result.clamped) bucket.clamped += 1;
          stats.total += 1;
          stats.perTerm[termKey] = (stats.perTerm[termKey] ?? 0) + 1;
          if (stats.examples.filter((item) => item.field === field).length < 4 && !stats.examples.some((item) => item.field === field && item.before === value)) {
            stats.examples.push({ field, before: value, after: next });
          }
        }
      }
    }
    if (Object.keys(set).length) changes.push({ index, set, original });
  });
  return changes;
}

const PAGE = 1000;

async function loadAllMarks(req: Request, schoolId: string) {
  const rows: Array<Record<string, unknown>> = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = asRows(await supabaseRequest(
      req, "marks", {},
      `?school_id=eq.${encodeURIComponent(schoolId)}&select=*&order=id&limit=${PAGE}&offset=${offset}`,
    ));
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

type Patch = { ids: string[]; body: Record<string, number> };

/** Groups rows that receive identical values, so thousands of marks become a few hundred requests. */
function groupPatches(changes: Array<{ id: string; values: Record<string, number> }>): Patch[] {
  const groups = new Map<string, Patch>();
  for (const change of changes) {
    const keys = Object.keys(change.values).sort();
    const signature = keys.map((key) => `${key}=${change.values[key]}`).join("&");
    const group = groups.get(signature) ?? { ids: [], body: Object.fromEntries(keys.map((key) => [key, change.values[key]])) };
    group.ids.push(change.id);
    groups.set(signature, group);
  }
  const patches: Patch[] = [];
  for (const group of groups.values()) {
    for (let i = 0; i < group.ids.length; i += 80) patches.push({ ids: group.ids.slice(i, i + 80), body: group.body });
  }
  return patches;
}

async function runPatches(req: Request, schoolId: string, patches: Patch[], done: Patch[]) {
  for (let i = 0; i < patches.length; i += 6) {
    const batch = patches.slice(i, i + 6);
    // Wait for every request in the batch to finish (even after one fails) so `done` is exact before any rollback.
    const results = await Promise.allSettled(batch.map(async (patch) => {
      await supabaseRequest(
        req, "marks",
        { method: "PATCH", headers: { Prefer: "return=minimal" }, body: jsonBody({ ...patch.body, updated_at: new Date().toISOString() }) },
        `?school_id=eq.${encodeURIComponent(schoolId)}&id=in.(${patch.ids.map(encodeURIComponent).join(",")})`,
      );
      done.push(patch);
    }));
    const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failed) throw failed.reason;
  }
}

export type TermsConfig = Record<string, Record<string, unknown>>;

/** Applies the mapper to the config copy. Pure: returns new terms and the number of cells changed. */
export function convertConfigTerms(terms: TermsConfig, mapper: Mapper, convertible: Set<FieldId>) {
  let changed = 0;
  const next: TermsConfig = {};
  for (const [termKey, term] of Object.entries(terms)) {
    if (!term || !Array.isArray(term.marks)) { next[termKey] = term; continue; }
    const marks = term.marks as Array<Record<string, unknown>>;
    const changes = transform(marks, () => termKey, mapper, convertible, emptyStats(), false);
    const byIndex = new Map(changes.map((change) => [change.index, change.set]));
    changed += changes.reduce((sum, change) => sum + Object.keys(change.set).length, 0);
    next[termKey] = { ...term, marks: marks.map((mark, index) => byIndex.has(index) ? { ...mark, ...byIndex.get(index) } : mark) };
  }
  return { terms: next, changed };
}

/** Counts what a conversion would do, without changing anything. */
export async function planRescale(req: Request, schoolId: string, mapper: Mapper, convertible: Set<FieldId>) {
  const rows = await loadAllMarks(req, schoolId);
  const stats = emptyStats();
  transform(rows, (row) => String(row.term_key ?? ""), mapper, convertible, stats, true);
  return { stats, rowCount: rows.length };
}

/**
 * Converts every mark in the marks table. If any request fails, everything already written is put back and the error is
 * thrown, so the school is never left with half its marks on the old scale. Returns what is needed to roll back later.
 */
export async function convertTable(req: Request, schoolId: string, mapper: Mapper, convertible: Set<FieldId>) {
  const rows = await loadAllMarks(req, schoolId);
  const stats = emptyStats();
  const changes = transform(rows, (row) => String(row.term_key ?? ""), mapper, convertible, stats, true);
  const forward = groupPatches(changes.map((change) => ({ id: String(rows[change.index].id), values: change.set })));
  const backward = groupPatches(changes.map((change) => ({ id: String(rows[change.index].id), values: change.original })));
  const done: Patch[] = [];
  try {
    await runPatches(req, schoolId, forward, done);
  } catch (error) {
    // Put back whatever was already converted.
    const doneIds = new Set(done.flatMap((patch) => patch.ids));
    const undoPatches = groupPatches(changes
      .filter((change) => doneIds.has(String(rows[change.index].id)))
      .map((change) => ({ id: String(rows[change.index].id), values: change.original })));
    try { await runPatches(req, schoolId, undoPatches, []); } catch { /* best effort; the original error is what matters */ }
    throw error;
  }
  return {
    stats,
    rowsChanged: changes.length,
    rollback: async () => { await runPatches(req, schoolId, backward, []); },
  };
}

/** Distinct key for a mark cell, used to find the exact originals of rounded marks. */
export function cellKey(cell: { termKey: string; studentId: string; subject: string; field: FieldId }) {
  return `${cell.termKey}|${cell.studentId}|${cell.subject}|${cell.field}`;
}

/** Mapper that multiplies each converted box by to/from (a plain rescale). */
export function scaleMapper(conversions: Conversion[]): { mapper: Mapper; convertible: Set<FieldId> } {
  const byField = new Map(conversions.map((conversion) => [conversion.field, conversion]));
  return {
    convertible: new Set(conversions.map((conversion) => conversion.field)),
    mapper: (cell) => {
      const conversion = byField.get(cell.field);
      if (!conversion) return { value: cell.value };
      const { value, rounded, clamped } = scaleValue(cell.value, conversion.from, conversion.to);
      return { value, rounded, clamped };
    },
  };
}
