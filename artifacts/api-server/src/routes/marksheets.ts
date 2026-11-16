// Marksheets: for every class and subject, the learners who take it (A-Z) with any marks already entered, ready to print as PDF.
// The school administrator and the Head teacher get every subject; a teacher only gets the subjects assigned to them.
import type { IRouter, Request, Response } from "express";
import { asRows } from "../lib/supabase.js";
import { level, pages } from "./marks-progress.js";

type Row = Record<string, unknown>;
const enc = encodeURIComponent;
const DEFAULT_FIELDS = [{ field: "c1", name: "AOI", max: 10 }, { field: "c2", name: "Midterm", max: 10 }, { field: "c3", name: "End of Term", max: 80 }];
const COLUMNS: Record<string, string[]> = { c1: ["aoi", "c1"], c2: ["midterm", "c2"], c3: ["end", "c3"] };
const text = (value: unknown) => String(value ?? "").trim();

export function registerMarksheetRoutes(router: IRouter, deps: { readSchoolConfig: (req: Request, schoolId: string) => Promise<Row> }) {
  router.get("/schools/:schoolId/marksheets", async (req: Request, res: Response) => {
    try {
      const role = res.locals.jiibRole;
      if (role !== "admin" && role !== "headteacher" && role !== "teacher") {
        res.status(403).json({ error: "Marksheets are available to the school administrator, the Head teacher and teachers." });
        return;
      }
      const schoolId = String(req.params.schoolId);
      const config = await deps.readSchoolConfig(req, schoolId);
      const termKey = text(req.query.termKey) || text(config.activeTerm);
      const settings = (config.settings && typeof config.settings === "object" ? config.settings : {}) as Row;
      const schema = Array.isArray(settings.marksSchema)
        ? (settings.marksSchema as Row[]).filter((item) => ["c1", "c2", "c3"].includes(text(item?.field)) && text(item?.name) && Number(item?.max) > 0)
            .map((item) => ({ field: text(item.field), name: text(item.name), max: Number(item.max), entryMax: Number(item.entryMax) > 0 ? Number(item.entryMax) : Number(item.max) }))
        : [];
      const structure = (schema.length ? schema : DEFAULT_FIELDS.map((f) => ({ ...f, entryMax: f.max })));
      const active = Array.isArray(settings.activeMarkColumns) ? (settings.activeMarkColumns as unknown[]).map(String) : null;
      const fields = active ? structure.filter((item) => active.includes(item.field)) : structure;
      const optionalFrom = level(text(settings.optionalSubjectsClass) || "S.3");

      const [studentRows, markRows, userRows] = await Promise.all([
        pages(req, "students", `?school_id=eq.${enc(schoolId)}&term_key=eq.${enc(termKey)}&select=id,name,class,subjects&order=id.asc`),
        pages(req, "marks", `?school_id=eq.${enc(schoolId)}&term_key=eq.${enc(termKey)}&select=*&order=id.asc`),
        pages(req, "allowed_users", `?school_id=eq.${enc(schoolId)}&select=email,display_name,role,subjects&order=email.asc`),
      ]);
      const terms = config.terms && typeof config.terms === "object" ? (config.terms as Record<string, Row>) : {};
      const term = terms[termKey] ?? {};

      const students = new Map<string, { className: string; name: string; subjects: string[] }>();
      const addStudent = (id: string, className: string, subjects: unknown, name: string) => {
        if (!id) return;
        const list = Array.isArray(subjects) ? subjects.map((s) => text(typeof s === "object" && s ? (s as Row).name : s)).filter(Boolean) : [];
        const existing = students.get(id);
        if (existing) { if (!existing.subjects.length && list.length) existing.subjects = list; if (!existing.name && name) existing.name = name; return; }
        students.set(id, { className, name, subjects: list });
      };
      for (const row of studentRows) addStudent(String(row.id), text(row.class), row.subjects, text(row.name));
      if (Array.isArray(term.students)) for (const item of term.students as Row[]) addStudent(text(item?.id), text(item?.class ?? item?.className), item?.subjects, text(item?.name));

      // marks[studentId|subject][field] = the typed mark (the table's value wins over the settings copy)
      const marks = new Map<string, Record<string, number>>();
      const put = (studentId: string, subject: string, field: string, value: number, force = false) => {
        const key = `${studentId}|${subject}`;
        const record = marks.get(key) ?? {};
        if (value > 0 || force) { if (value > 0 || record[field] === undefined) record[field] = value; }
        marks.set(key, record);
      };
      if (Array.isArray(term.marks)) {
        for (const mark of term.marks as Row[]) {
          for (const field of ["c1", "c2", "c3"]) {
            const value = Number(COLUMNS[field].map((column) => mark?.[column]).find((v) => v !== undefined && v !== null) ?? 0);
            const flagged = Array.isArray(mark?.enteredFields) && (mark.enteredFields as unknown[]).map(String).includes(field);
            if (Number.isFinite(value)) put(text(mark?.studentId), text(mark?.subject), field, value, flagged);
          }
        }
      }
      for (const row of markRows) {
        for (const field of ["c1", "c2", "c3"]) {
          const value = Number(COLUMNS[field].map((column) => row[column]).find((v) => v !== undefined && v !== null) ?? 0);
          if (Number.isFinite(value) && value > 0) { const key = `${text(row.student_id)}|${text(row.subject)}`; const record = marks.get(key) ?? {}; record[field] = value; marks.set(key, record); }
        }
      }

      const teachers = userRows.filter((row) => text(row.role || "teacher") === "teacher");
      const pairsOf = (row: Row) => (Array.isArray(row.subjects) ? (row.subjects as unknown[]) : []).flatMap((item) =>
        item && typeof item === "object" ? [{ className: text((item as Row).class), subject: text((item as Row).subject) }] : []);
      const teacherOf = (className: string, subject: string) => teachers.find((row) => pairsOf(row).some((pair) => pair.className === className && pair.subject === subject));
      let allowed: Array<{ className: string; subject: string }> | null = null;
      if (role === "teacher") {
        const email = text(req.headers["x-verified-user-email"]).toLowerCase();
        const me = userRows.find((row) => text(row.email).toLowerCase() === email);
        allowed = me ? pairsOf(me) : [];
      }

      const subjectsByClass = config.subjects && typeof config.subjects === "object" && !Array.isArray(config.subjects) ? (config.subjects as Record<string, unknown>) : {};
      const sheets: Array<Record<string, unknown>> = [];
      for (const [className, list] of Object.entries(subjectsByClass).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))) {
        if (!Array.isArray(list)) continue;
        const classStudents = Array.from(students.entries()).filter(([, s]) => s.className === className);
        const usesChoices = level(className) >= optionalFrom && classStudents.some(([, s]) => s.subjects.length > 0);
        for (const item of list) {
          const subject = text(typeof item === "string" ? item : (item as Row)?.name);
          if (!subject) continue;
          if (allowed && !allowed.some((pair) => pair.className === className && pair.subject === subject)) continue;
          const takers = classStudents.filter(([id, s]) => level(className) < optionalFrom
            ? true
            : s.subjects.length ? s.subjects.includes(subject) : !usesChoices || marks.has(`${id}|${subject}`))
            .sort(([, a], [, b]) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
          if (!takers.length) continue;
          const teacher = teacherOf(className, subject);
          sheets.push({
            className, subject,
            teacherName: teacher ? text(teacher.display_name) || text(teacher.email) : null,
            learners: takers.map(([id, s]) => {
              const record = marks.get(`${id}|${subject}`) ?? {};
              return { id, name: s.name, marks: Object.fromEntries(fields.map((f) => [f.field, record[f.field] ?? null])) };
            }),
          });
        }
      }
      res.json({
        termKey, termLabel: text(term.label) || termKey, year: text(settings.reportYear), address: text(settings.address), motto: text(settings.motto),
        fields, teacherView: role === "teacher", sheets,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Could not load the marksheets." });
    }
  });
}
