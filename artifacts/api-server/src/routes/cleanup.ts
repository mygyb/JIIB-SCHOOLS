// Keeps the free database small.
//  1. When a school opens a new term, the detailed marks of terms older than the previous one are removed
//     (a small per-student summary is saved first). Fee payments, fee structures, receipts, report verification codes and the
//     student list of every term are kept: unpaid balances from earlier terms are worked out from them.
//  2. Every day, low-value records older than 30 days are deleted (teacher activity feed, notification log, SMS delivery details, login log).
//  3. The super administrator sees how much space everything uses (Storage panel) and can run the daily cleanup on demand.
import type { IRouter, Request, Response } from "express";
import { asRows, jsonBody, supabaseAdminRequest } from "../lib/supabase.js";

type Row = Record<string, unknown>;
type Config = Record<string, unknown>;
const enc = encodeURIComponent;
const DAY = 86_400_000;
export const LOW_VALUE_DAYS = 30;
const SMS_HISTORY_DAYS = 90;

const isMissingTable = (error: unknown) => /Could not find the (table|function)|schema cache|relation .* does not exist|PGRST20\d|42P01/i.test(error instanceof Error ? error.message : String(error));
const admin = <T = unknown>(path: string, init: RequestInit = {}) => supabaseAdminRequest<T>(path, init);

async function pagedRows(path: string): Promise<Row[]> {
  const all: Row[] = [];
  for (let offset = 0; offset < 500_000; offset += 1000) {
    const page = asRows(await admin(`${path}&limit=1000&offset=${offset}`));
    all.push(...page);
    if (page.length < 1000) break;
  }
  return all;
}

// ---- which term comes after which ----------------------------------------------------------------------------

/** Chronological number of a term from its key or label ("2026-T3", "Term 3, 2026"). Terms that cannot be read are never touched. */
export function termOrdinal(key: string, label: string): number | null {
  const year = Number(label.match(/\b(20\d{2})\b/)?.[1] ?? key.match(/\b(20\d{2})\b/)?.[1] ?? NaN);
  const number = Number(label.match(/\b(?:term|t)\s*([1-3])\b/i)?.[1] ?? key.match(/(?:term|t)[-_ ]?([1-3])\b/i)?.[1] ?? NaN);
  return Number.isFinite(year) && Number.isFinite(number) ? year * 3 + number : null;
}

/** Terms whose detailed marks should go: everything older than the term before the newly opened one. */
export function termsToPrune(terms: Record<string, Row>, activeKey: string): string[] {
  const ordinals = Object.entries(terms).map(([key, term]) => ({ key, ordinal: termOrdinal(key, String(term?.label ?? key)) }));
  const current = ordinals.find((item) => item.key === activeKey)?.ordinal;
  if (current === null || current === undefined) return [];
  // Only when the newly opened term really is the latest one; reopening an old term never deletes anything.
  if (ordinals.some((item) => item.ordinal !== null && item.ordinal > current)) return [];
  return ordinals.filter((item) => item.ordinal !== null && item.ordinal < current - 1 && item.key !== activeKey && !terms[item.key]?.dataCleared).map((item) => item.key);
}

// ---- the small summary kept for every student -----------------------------------------------------------------

type Field = { field: "c1" | "c2" | "c3"; max: number; entryMax?: number };
const DEFAULT_FIELDS: Field[] = [{ field: "c1", max: 10 }, { field: "c2", max: 10 }, { field: "c3", max: 80 }];

function assessmentFields(config: Config): Field[] {
  const settings = config.settings && typeof config.settings === "object" ? (config.settings as Row) : {};
  const raw = Array.isArray(settings.marksSchema) ? (settings.marksSchema as Row[]) : [];
  const chosen = raw.flatMap((entry): Field[] => {
    const field = String(entry?.field ?? "");
    const max = Number(entry?.max ?? 0);
    const entryMax = Number(entry?.entryMax);
    return ["c1", "c2", "c3"].includes(field) && Number.isFinite(max) && max > 0 ? [{ field: field as Field["field"], max, ...(Number.isFinite(entryMax) && entryMax > 0 ? { entryMax } : {}) }] : [];
  });
  const fields = chosen.length ? chosen : DEFAULT_FIELDS;
  const active = settings.activeMarkColumns;
  return Array.isArray(active) ? fields.filter((field) => active.map(String).includes(field.field)) : fields;
}

/** Same arithmetic as the report cards: each typed mark converted to what it counts for, then added. */
function markTotal(mark: Row, fields: Field[]): number {
  const alias = { c1: "aoi", c2: "midterm", c3: "end" } as const;
  return fields.reduce((sum, field) => {
    const raw = Number(mark[alias[field.field]] ?? 0);
    const entry = field.entryMax && field.entryMax > 0 ? field.entryMax : field.max;
    return sum + (entry === field.max ? raw : (raw * field.max) / entry);
  }, 0);
}

export function buildSummary(schoolId: string, termKey: string, students: Row[], marks: Row[], fields: Field[]) {
  const maxTotal = fields.reduce((t, f) => t + f.max, 0) || 100;
  const perStudent = new Map<string, number[]>();
  for (const mark of marks) {
    const id = String(mark.student_id);
    const list = perStudent.get(id) ?? [];
    list.push((markTotal(mark, fields) / maxTotal) * 100);
    perStudent.set(id, list);
  }
  const rows = students.map((student) => {
    const scores = perStudent.get(String(student.id)) ?? [];
    const average = scores.length ? Math.round((scores.reduce((t, s) => t + s, 0) / scores.length) * 10) / 10 : null;
    return { school_id: schoolId, term_key: termKey, student_id: String(student.id), name: String(student.name ?? ""), class: String(student.class ?? ""), subjects: scores.length, average, position: null as number | null, class_size: 0 };
  });
  const byClass = new Map<string, typeof rows>();
  for (const row of rows) byClass.set(row.class, [...(byClass.get(row.class) ?? []), row]);
  for (const group of byClass.values()) {
    const ranked = group.filter((row) => row.average !== null).sort((a, b) => (b.average as number) - (a.average as number));
    ranked.forEach((row, index) => { row.position = index > 0 && row.average === ranked[index - 1].average ? ranked[index - 1].position : index + 1; });
    group.forEach((row) => { row.class_size = group.length; });
  }
  return rows;
}

// ---- 1. term pruning -----------------------------------------------------------------------------------------

async function log(kind: "daily" | "term", schoolId: string | null, detail: string) {
  await admin("/rest/v1/jsa_cleanup_log", { method: "POST", body: jsonBody({ kind, school_id: schoolId, detail }) }).catch(() => undefined);
}

async function pruneOne(schoolId: string, termKey: string): Promise<{ ok: boolean; marks: number; detail: string }> {
  const dataRow = asRows(await admin(`/rest/v1/school_data?school_id=eq.${enc(schoolId)}&select=data&limit=1`))[0];
  const config = (dataRow?.data && typeof dataRow.data === "object" ? dataRow.data : {}) as Config;
  const [students, marks] = await Promise.all([
    pagedRows(`/rest/v1/students?school_id=eq.${enc(schoolId)}&term_key=eq.${enc(termKey)}&select=id,name,class&order=id.asc`),
    pagedRows(`/rest/v1/marks?school_id=eq.${enc(schoolId)}&term_key=eq.${enc(termKey)}&select=id,student_id,aoi,midterm,end&order=id.asc`),
  ]);
  // The summary must be safely saved before anything is deleted.
  const summary = buildSummary(schoolId, termKey, students, marks, assessmentFields(config));
  for (let start = 0; start < summary.length; start += 500) {
    await admin("/rest/v1/jsa_term_summary?on_conflict=school_id,term_key,student_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: jsonBody(summary.slice(start, start + 500)) });
  }
  await admin(`/rest/v1/marks?school_id=eq.${enc(schoolId)}&term_key=eq.${enc(termKey)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  await admin(`/rest/v1/jsa_alevel_marks?school_id=eq.${enc(schoolId)}&term_key=eq.${enc(termKey)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch((error) => { if (!isMissingTable(error)) throw error; });
  // Read the settings again just before writing, so a change made a moment ago is not lost.
  const fresh = asRows(await admin(`/rest/v1/school_data?school_id=eq.${enc(schoolId)}&select=data&limit=1`))[0];
  const current = (fresh?.data && typeof fresh.data === "object" ? fresh.data : config) as Config;
  const terms = (current.terms && typeof current.terms === "object" ? current.terms : {}) as Record<string, Row>;
  if (terms[termKey]) {
    await admin("/rest/v1/school_data?on_conflict=school_id", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: jsonBody({ school_id: schoolId, data: { ...current, terms: { ...terms, [termKey]: { ...terms[termKey], marks: [], dataCleared: true, dataClearedAt: new Date().toISOString() } } }, updated_at: new Date().toISOString(), updated_by: "cleanup" }),
    });
  }
  return { ok: true, marks: marks.length, detail: `${termKey}: ${marks.length} marks removed, summary of ${summary.length} students kept` };
}

/** Called after a term becomes the active one. Never throws: a failed cleanup must not break opening a term. */
export async function pruneOldTerms(schoolId: string, activeKey: string): Promise<string[]> {
  const done: string[] = [];
  try {
    const row = asRows(await admin(`/rest/v1/school_data?school_id=eq.${enc(schoolId)}&select=data&limit=1`))[0];
    const terms = ((row?.data as Config | undefined)?.terms ?? {}) as Record<string, Row>;
    for (const termKey of termsToPrune(terms, activeKey)) {
      try {
        const result = await pruneOne(schoolId, termKey);
        done.push(termKey);
        await log("term", schoolId, result.detail);
      } catch (error) {
        if (isMissingTable(error)) return done; // storage-setup.sql has not been run yet: keep everything
        await log("term", schoolId, `${termKey}: skipped (${error instanceof Error ? error.message.slice(0, 120) : "error"})`);
      }
    }
  } catch { /* nothing deleted */ }
  return done;
}

// ---- 2. daily cleanup ----------------------------------------------------------------------------------------

export async function runDailyCleanup(): Promise<{ cleaned: string[] }> {
  const cutoff = new Date(Date.now() - LOW_VALUE_DAYS * DAY).toISOString();
  const smsCutoff = new Date(Date.now() - SMS_HISTORY_DAYS * DAY).toISOString();
  const cleaned: string[] = [];
  const del = async (label: string, path: string) => {
    try { await admin(path, { method: "DELETE", headers: { Prefer: "return=minimal" } }); cleaned.push(label); }
    catch (error) { if (!isMissingTable(error)) cleaned.push(`${label} (failed)`); }
  };
  await del("teacher activity", `/rest/v1/jsa_activity?at=lt.${enc(cutoff)}`);
  await del("notification log", `/rest/v1/jsa_push_log?created_at=lt.${enc(cutoff)}&kind=neq.update`);
  await del("login log", `/rest/v1/jhq_logins?at=lt.${enc(cutoff)}`);
  try {
    // SMS delivery details go after 30 days; the short history line of each send stays for 90 days.
    const old = asRows(await admin(`/rest/v1/jsa_sms_messages?created_at=lt.${enc(cutoff)}&select=id&limit=1000`));
    for (let start = 0; start < old.length; start += 100) {
      const ids = old.slice(start, start + 100).map((row) => String(row.id)).join(",");
      await admin(`/rest/v1/jsa_sms_recipients?message_id=in.(${ids})`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    }
    cleaned.push("SMS delivery details");
  } catch (error) { if (!isMissingTable(error)) cleaned.push("SMS delivery details (failed)"); }
  await del("old SMS history", `/rest/v1/jsa_sms_messages?created_at=lt.${enc(smsCutoff)}`);
  await del("cleanup log", `/rest/v1/jsa_cleanup_log?at=lt.${enc(smsCutoff)}`);
  await log("daily", null, cleaned.length ? `Removed records older than ${LOW_VALUE_DAYS} days: ${cleaned.join(", ")}` : "Nothing to clean");
  return { cleaned };
}

// ---- 3. storage panel (super administrator) -------------------------------------------------------------------

type Report = { databaseBytes: number; tables: Array<{ name: string; bytes: number; rows: number }>; schools: Record<string, number> };

export function registerCleanupRoutes(router: IRouter, deps: { authorizeSuperAdmin: (req: Request, res: Response) => Promise<unknown>; sendError: (res: Response, error: unknown) => void }) {
  router.get("/storage-admin/overview", async (req, res) => {
    try {
      if (!await deps.authorizeSuperAdmin(req, res)) return;
      let report: Report | null = null;
      let problem = "";
      try { report = await admin<Report>("/rest/v1/rpc/jsa_storage_report", { method: "POST", body: "{}" }); }
      catch (error) { problem = isMissingTable(error) ? "Run supabase/storage-setup.sql once to see storage." : "Could not read the storage size."; }
      const [schools, logRows] = await Promise.all([
        admin("/rest/v1/schools?select=id,name&order=name.asc&limit=1000"),
        admin("/rest/v1/jsa_cleanup_log?select=at,kind,school_id,detail&order=at.desc&limit=15").catch(() => []),
      ]);
      const names = new Map(asRows(schools).map((row) => [String(row.id), String(row.name ?? "")]));
      const limitMb = Number(process.env.DB_LIMIT_MB) > 0 ? Number(process.env.DB_LIMIT_MB) : 500;
      res.json({
        problem, limitBytes: limitMb * 1024 * 1024, usedBytes: report ? Number(report.databaseBytes) : 0, lowValueDays: LOW_VALUE_DAYS,
        tables: (report?.tables ?? []).map((t) => ({ name: t.name, bytes: Number(t.bytes), rows: Number(t.rows) })).sort((a, b) => b.bytes - a.bytes),
        schools: Object.entries(report?.schools ?? {}).map(([id, bytes]) => ({ id, name: names.get(id) ?? "Removed school", bytes: Math.round(Number(bytes)) })).sort((a, b) => b.bytes - a.bytes),
        log: asRows(logRows).map((row) => ({ at: String(row.at), kind: String(row.kind), school: row.school_id ? names.get(String(row.school_id)) ?? "" : "", detail: String(row.detail ?? "") })),
      });
    } catch (error) { deps.sendError(res, error); }
  });

  router.post("/storage-admin/cleanup", async (req, res) => {
    try {
      if (!await deps.authorizeSuperAdmin(req, res)) return;
      res.json(await runDailyCleanup());
    } catch (error) { deps.sendError(res, error); }
  });
}
