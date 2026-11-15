// Marks progress: for the assessments switched on in the assessment filter, which teachers and subjects have entered full marks,
// partial marks, or nothing yet. Read-only; for the school administrator and the Head teacher.
import type { IRouter, Request, Response } from "express";
import { asRows, supabaseRequest } from "../lib/supabase.js";

type Row = Record<string, unknown>;
const enc = encodeURIComponent;
const DEFAULT_FIELDS = [{ field: "c1", name: "AOI" }, { field: "c2", name: "Midterm" }, { field: "c3", name: "End of Term" }];
const COLUMNS: Record<string, string[]> = { c1: ["aoi", "c1"], c2: ["midterm", "c2"], c3: ["end", "c3"] };

async function pages(req: Request, table: string, query: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; offset < 200_000; offset += 1000) {
    const page = asRows(await supabaseRequest(req, table, {}, `${query}&limit=1000&offset=${offset}`));
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}
const level = (value: string) => Number(value.match(/\d+/)?.[0] ?? 0);

export function registerMarksProgressRoutes(router: IRouter, deps: { readSchoolConfig: (req: Request, schoolId: string) => Promise<Row> }) {
  router.get("/schools/:schoolId/marks-progress", async (req: Request, res: Response) => {
    try {
      const role = res.locals.jiibRole;
      if (role !== "admin" && role !== "super_admin" && role !== "headteacher") {
        res.status(403).json({ error: "Only the school administrator and the Head teacher can see marks progress." });
        return;
      }
      const schoolId = String(req.params.schoolId);
      const config = await deps.readSchoolConfig(req, schoolId);
      const termKey = String(req.query.termKey ?? "").trim() || String(config.activeTerm ?? "");
      const settings = (config.settings && typeof config.settings === "object" ? config.settings : {}) as Row;
      const schema = Array.isArray(settings.marksSchema)
        ? (settings.marksSchema as Row[]).filter((item) => ["c1", "c2", "c3"].includes(String(item?.field)) && String(item?.name ?? "").trim())
            .map((item) => ({ field: String(item.field), name: String(item.name).trim() }))
        : [];
      const structure = schema.length ? schema : DEFAULT_FIELDS;
      const active = Array.isArray(settings.activeMarkColumns) ? (settings.activeMarkColumns as unknown[]).map(String) : null;
      const fields = active ? structure.filter((item) => active.includes(item.field)) : structure;
      const optionalFrom = level(String(settings.optionalSubjectsClass ?? "S.3"));

      const [studentRows, markRows, userRows] = await Promise.all([
        pages(req, "students", `?school_id=eq.${enc(schoolId)}&term_key=eq.${enc(termKey)}&select=id,class,subjects&order=id.asc`),
        pages(req, "marks", `?school_id=eq.${enc(schoolId)}&term_key=eq.${enc(termKey)}&select=*&order=id.asc`),
        pages(req, "allowed_users", `?school_id=eq.${enc(schoolId)}&select=email,display_name,role,subjects&order=email.asc`),
      ]);
      const terms = config.terms && typeof config.terms === "object" ? (config.terms as Record<string, Row>) : {};
      const term = terms[termKey] ?? {};

      const students = new Map<string, { className: string; subjects: string[] }>();
      const addStudent = (id: string, className: string, subjects: unknown) => {
        if (!id || students.has(id)) return;
        students.set(id, { className, subjects: Array.isArray(subjects) ? subjects.map((s) => String(typeof s === "object" && s ? (s as Row).name ?? "" : s)).filter(Boolean) : [] });
      };
      for (const row of studentRows) addStudent(String(row.id), String(row.class ?? ""), row.subjects);
      if (Array.isArray(term.students)) for (const item of term.students as Row[]) addStudent(String(item?.id ?? ""), String(item?.class ?? item?.className ?? ""), item?.subjects);

      // entered[studentId|subject] = set of field ids that hold a mark
      const entered = new Map<string, Set<string>>();
      const note = (studentId: string, subject: string, field: string) => {
        const k = `${studentId}|${subject}`;
        const set = entered.get(k) ?? new Set<string>();
        set.add(field);
        entered.set(k, set);
      };
      if (Array.isArray(term.marks)) {
        for (const mark of term.marks as Row[]) {
          const studentId = String(mark?.studentId ?? ""), subject = String(mark?.subject ?? "");
          for (const field of ["c1", "c2", "c3"]) {
            if (COLUMNS[field].some((column) => Number(mark?.[column] ?? 0) > 0) || (Array.isArray(mark?.enteredFields) && (mark.enteredFields as unknown[]).map(String).includes(field))) note(studentId, subject, field);
          }
        }
      }
      for (const row of markRows) {
        const studentId = String(row.student_id ?? ""), subject = String(row.subject ?? "");
        for (const field of ["c1", "c2", "c3"]) if (COLUMNS[field].some((column) => Number(row[column] ?? 0) > 0)) note(studentId, subject, field);
      }

      const staff = userRows.filter((row) => String(row.role ?? "teacher") === "teacher");
      const teacherOf = (className: string, subject: string) => staff.find((row) => Array.isArray(row.subjects) && (row.subjects as unknown[]).some((item) =>
        item && typeof item === "object" && String((item as Row).class ?? "") === className && String((item as Row).subject ?? "") === subject));

      const subjectsByClass = config.subjects && typeof config.subjects === "object" && !Array.isArray(config.subjects) ? (config.subjects as Record<string, unknown>) : {};
      const rows: Array<Record<string, unknown>> = [];
      for (const [className, list] of Object.entries(subjectsByClass).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))) {
        if (!Array.isArray(list)) continue;
        const classStudents = Array.from(students.entries()).filter(([, s]) => s.className === className);
        for (const item of list) {
          const subject = String(typeof item === "string" ? item : (item as Row)?.name ?? "").trim();
          if (!subject) continue;
          const takers = classStudents.filter(([, s]) => level(className) < optionalFrom || !s.subjects.length || s.subjects.includes(subject));
          let complete = 0, partial = 0, empty = 0;
          const perField: Record<string, number> = Object.fromEntries(fields.map((f) => [f.field, 0]));
          for (const [id] of takers) {
            const set = entered.get(`${id}|${subject}`) ?? new Set<string>();
            const count = fields.filter((f) => set.has(f.field)).length;
            for (const f of fields) if (set.has(f.field)) perField[f.field] += 1;
            if (count === fields.length && fields.length > 0) complete += 1; else if (count > 0) partial += 1; else empty += 1;
          }
          const teacher = teacherOf(className, subject);
          const status = takers.length === 0 ? "no_students" : complete === takers.length ? "complete" : empty === takers.length ? "none" : "partial";
          rows.push({ className, subject, teacherEmail: teacher ? String(teacher.email) : null, teacherName: teacher ? String(teacher.display_name || teacher.email) : null, students: takers.length, complete, partial, empty, perField, status });
        }
      }
      res.json({ termKey, termLabel: String(term.label ?? termKey), fields, rows });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Could not load marks progress." });
    }
  });
}
