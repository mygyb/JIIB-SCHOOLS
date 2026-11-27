// Data check (dry run) for the planned move of learners and marks out of each school's saved-settings record and into the real tables.
// It only READS and reports counts: it writes nothing, and it never returns names or marks.
import type { IRouter, Request, Response } from "express";
import { asRows, supabaseAdminRequest } from "../lib/supabase.js";

type Row = Record<string, unknown>;
const enc = encodeURIComponent;
const text = (value: unknown) => String(value ?? "").trim();
const COLUMNS: Record<string, string[]> = { c1: ["aoi", "c1"], c2: ["midterm", "c2"], c3: ["end", "c3"] };

async function pagedRows(path: string): Promise<Row[]> {
  const all: Row[] = [];
  for (let offset = 0; offset < 500_000; offset += 1000) {
    const page = asRows(await supabaseAdminRequest(`${path}&limit=1000&offset=${offset}`));
    all.push(...page);
    if (page.length < 1000) break;
  }
  return all;
}
const subjectNames = (value: unknown) => (Array.isArray(value) ? value : [])
  .map((item) => text(typeof item === "object" && item ? (item as Row).name : item)).filter(Boolean).sort().join("|");
const markValue = (row: Row, field: string) => Number(COLUMNS[field].map((column) => row[column]).find((v) => v !== undefined && v !== null) ?? 0) || 0;

export function registerDataCheckRoutes(router: IRouter, deps: { authorizeSuperAdmin: (req: Request, res: Response) => Promise<unknown>; sendError: (res: Response, error: unknown) => void }) {
  router.get("/storage-admin/data-check", async (req, res) => {
    try {
      if (!await deps.authorizeSuperAdmin(req, res)) return;
      const schoolId = text(req.query.schoolId);
      if (!/^[0-9a-f-]{36}$/i.test(schoolId)) { res.status(400).json({ error: "Choose a school." }); return; }
      const [configRows, studentRows, markRows] = await Promise.all([
        supabaseAdminRequest(`/rest/v1/school_data?school_id=eq.${enc(schoolId)}&select=data&limit=1`),
        pagedRows(`/rest/v1/students?school_id=eq.${enc(schoolId)}&select=id,term_key,name,class,house,parent_phone,subjects&order=id.asc`),
        pagedRows(`/rest/v1/marks?school_id=eq.${enc(schoolId)}&select=*&order=id.asc`),
      ]);
      const config = (asRows(configRows)[0]?.data ?? {}) as Row;
      const terms = (config.terms && typeof config.terms === "object" ? config.terms : {}) as Record<string, Row>;
      const keys = new Set<string>([...Object.keys(terms), ...studentRows.map((r) => text(r.term_key)), ...markRows.map((r) => text(r.term_key))]);
      const out = [];
      for (const termKey of keys) {
        const term = terms[termKey] ?? {};
        const record = Array.isArray(term.students) ? (term.students as Row[]) : [];
        const table = studentRows.filter((r) => text(r.term_key) === termKey);
        const tableById = new Map(table.map((r) => [text(r.id), r]));
        const recordIds = new Set(record.map((r) => text(r.id)));
        const differ = { name: 0, class: 0, house: 0, phone: 0, subjects: 0 };
        let subjectsToCopy = 0;
        for (const item of record) {
          const row = tableById.get(text(item.id));
          if (!row) continue;
          if (text(item.name) && text(item.name) !== text(row.name)) differ.name += 1;
          if (text(item.class ?? item.className) && text(item.class ?? item.className) !== text(row.class)) differ.class += 1;
          if (text(item.house) !== text(row.house)) differ.house += 1;
          if (text(item.parentPhone) && text(item.parentPhone) !== text(row.parent_phone)) differ.phone += 1;
          const a = subjectNames(item.subjects), b = subjectNames(row.subjects);
          if (a && !b) subjectsToCopy += 1; else if (a && b && a !== b) differ.subjects += 1;
        }
        const alevel = record.filter((r) => r.aLevel && typeof r.aLevel === "object").length;
        const marksTable = markRows.filter((r) => text(r.term_key) === termKey);
        const tableMarks = new Map(marksTable.map((r) => [`${text(r.student_id)}|${text(r.subject)}`, r]));
        const recordMarks = (Array.isArray(term.marks) ? (term.marks as Row[]) : []).filter((m) =>
          ["c1", "c2", "c3"].some((f) => markValue(m, f) > 0) || (Array.isArray(m.enteredFields) && m.enteredFields.length > 0));
        let marksOnlyInRecord = 0, marksDiffer = 0;
        for (const mark of recordMarks) {
          const row = tableMarks.get(`${text(mark.studentId)}|${text(mark.subject)}`);
          if (!row) { marksOnlyInRecord += 1; continue; }
          if (["c1", "c2", "c3"].some((f) => markValue(mark, f) > 0 && markValue(row, f) > 0 && markValue(mark, f) !== markValue(row, f))) marksDiffer += 1;
        }
        out.push({
          termKey, label: text(term.label) || termKey,
          students: { inTable: table.length, inRecord: record.length, onlyInRecord: record.filter((r) => !tableById.has(text(r.id))).length, onlyInTable: table.filter((r) => !recordIds.has(text(r.id))).length, subjectsToCopy, aLevelToCopy: alevel, differ },
          marks: { inTable: marksTable.length, inRecord: recordMarks.length, onlyInRecord: marksOnlyInRecord, differ: marksDiffer },
        });
      }
      out.sort((a, b) => a.termKey.localeCompare(b.termKey, undefined, { numeric: true }));
      res.json({ schoolId, recordBytes: JSON.stringify(config).length, terms: out });
    } catch (error) { deps.sendError(res, error); }
  });

  // Copies what exists only in the record into the learners table. The record's subject list wins (it is the newer copy);
  // marks are never touched, nothing is deleted from the record, and running it again changes nothing more.
  router.post("/storage-admin/data-check/copy", async (req, res) => {
    try {
      if (!await deps.authorizeSuperAdmin(req, res)) return;
      const schoolId = text(req.body?.schoolId);
      if (!/^[0-9a-f-]{36}$/i.test(schoolId)) { res.status(400).json({ error: "Choose a school." }); return; }
      const [configRows, studentRows] = await Promise.all([
        supabaseAdminRequest(`/rest/v1/school_data?school_id=eq.${enc(schoolId)}&select=data&limit=1`),
        pagedRows(`/rest/v1/students?school_id=eq.${enc(schoolId)}&select=id,term_key,name,class,subjects&order=id.asc`),
      ]);
      const config = (asRows(configRows)[0]?.data ?? {}) as Row;
      const terms = (config.terms && typeof config.terms === "object" ? config.terms : {}) as Record<string, Row>;
      const nameClass = new Set(studentRows.map((r) => `${text(r.name).toLowerCase()}|${text(r.class).toLowerCase()}`));
      let legacyMatchesTable = 0, mapped = 0, ambiguous = 0;
      const byNameClass = new Map<string, Set<string>>();
      const anyTermIds = new Set(studentRows.map((r) => text(r.id)));
      let sameIdOtherTerm = 0, tableIdShape = "";
      for (const r of studentRows) { const k = `${text(r.name).toLowerCase()}|${text(r.class).toLowerCase()}`; (byNameClass.get(k) ?? byNameClass.set(k, new Set()).get(k)!).add(text(r.id)); }
      const tableKey = new Map(studentRows.map((r) => [`${text(r.term_key)}|${text(r.id)}`, r]));
      let inserted = 0, subjectsUpdated = 0, skipped = 0;
      const why = { badId: 0, noName: 0, noClass: 0 }; let sampleKeys: string[] = []; let sampleId = "";
      const toInsert: Row[] = [];
      for (const [termKey, term] of Object.entries(terms)) {
        for (const item of Array.isArray(term.students) ? (term.students as Row[]) : []) {
          const id = text(item.id), name = text(item.name), className = text(item.class ?? item.className);
          const names = (Array.isArray(item.subjects) ? item.subjects : []).map((s) => text(typeof s === "object" && s ? (s as Row).name : s)).filter(Boolean);
          const row = tableKey.get(`${termKey}|${id}`);
          if (!row) {
            let useId = id;
            const shape = (v: string) => v.replace(/[0-9a-z]/gi, (c) => (/\d/.test(c) ? "9" : "x")).slice(0, 40);
            if (anyTermIds.has(id)) { sameIdOtherTerm += 1; if (!tableIdShape) tableIdShape = shape(id); }
            else if (name && className) {
              const ids = byNameClass.get(`${name.toLowerCase()}|${className.toLowerCase()}`);
              if (ids && ids.size === 1) { useId = [...ids][0]; mapped += 1; } else if (ids && ids.size > 1) ambiguous += 1;
            }
            if (!useId || !name || !className) {
              skipped += 1;
              if (!/^[0-9a-f-]{36}$/i.test(id)) why.badId += 1; if (!name) why.noName += 1; if (!className) why.noClass += 1;
              if (!/^[0-9a-f-]{36}$/i.test(id) && nameClass.has(`${name.toLowerCase()}|${className.toLowerCase()}`)) legacyMatchesTable += 1;
              if (!sampleKeys.length) { sampleKeys = Object.keys(item); sampleId = id.replace(/[0-9a-z]/gi, (c) => (/\d/.test(c) ? "9" : "x")).slice(0, 40); }
              continue;
            }
            toInsert.push({ id: useId, school_id: schoolId, term_key: termKey, name, class: className, house: text(item.house), parent_phone: text(item.parentPhone ?? item.parent_phone) || null, subjects: names.length ? names : null });
            continue;
          }
          if (names.length && subjectNames(names) !== subjectNames(row.subjects)) {
            await supabaseAdminRequest(`/rest/v1/students?id=eq.${enc(id)}&school_id=eq.${enc(schoolId)}&term_key=eq.${enc(termKey)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ subjects: names }) });
            subjectsUpdated += 1;
          }
        }
      }
      for (let i = 0; i < toInsert.length; i += 200) {
        await supabaseAdminRequest(`/rest/v1/students?on_conflict=id,school_id,term_key`, { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(toInsert.slice(i, i + 200)) });
        inserted += Math.min(200, toInsert.length - i);
      }
      res.json({ schoolId, inserted, subjectsUpdated, skipped, why, sampleKeys, sampleId, legacyMatchesTable, mapped, ambiguous, sameIdOtherTerm, tableIdShape });
    } catch (error) { deps.sendError(res, error); }
  });
}
