// Turns the school's students, marks, subjects and grading into the numbers printed on a report.
// Ported from the Report Studio design file, using the app's own data instead of browser storage.
import { getAssessmentFields, type AssessmentField, type AssessmentFieldId, type SchoolConfig } from "@/lib/school-data";

export type ReportType = "midterm" | "endterm";

export type ReportStudent = { id: string; name: string; className: string; house: string; subjects: string[] };
export type ReportMarkRow = { studentId: string; subject: string; aoi?: number; midterm?: number; end?: number; enteredFields?: string[] };

export type GradeBand = { grade: string; min: number; max: number; descriptor: string };
export type Descriptor = { label: string; cls: "rc-descriptor-outstanding" | "rc-descriptor-moderate" | "rc-descriptor-basic" };

export type SubjectResult = {
  name: string;
  teacher: string;
  cols: Partial<Record<AssessmentFieldId, number | null>>;
  total: number | null;
  grade: GradeBand | null;
  descriptor: Descriptor | null;
  outOf3: string;
};

export type StudentReport = {
  student: ReportStudent;
  type: ReportType;
  fields: AssessmentField[];
  /** The columns that count towards this report (midterm slips leave out the last one, End of Term). */
  countedFields: AssessmentField[];
  maxPossible: number;
  subjects: SubjectResult[];
  grandTotal: number;
  average: string;
  percentage: string;
  rank: number | null;
  classSize: number;
  badgeRank: number | null;
  overallOutOf3: string;
  overallDescriptor: Descriptor | null;
  resultCategory: string;
  weakSubjects: string[];
  lowestPercent: number | null;
};

export type ReportDataset = {
  students: ReportStudent[];
  fields: AssessmentField[];
  grading: GradeBand[];
  reports: (type: ReportType) => Map<string, StudentReport>;
};

const ALIAS: Record<AssessmentFieldId, "aoi" | "midterm" | "end"> = { c1: "aoi", c2: "midterm", c3: "end" };
const norm = (value: string) => value.trim().toLowerCase();

export const DEFAULT_GRADING: GradeBand[] = [
  { grade: "A", min: 80, max: 100, descriptor: "EXCEPTIONAL" },
  { grade: "B", min: 70, max: 79, descriptor: "OUTSTANDING" },
  { grade: "C", min: 60, max: 69, descriptor: "SATISFACTORY" },
  { grade: "D", min: 50, max: 59, descriptor: "BASIC" },
  { grade: "E", min: 0, max: 49, descriptor: "ELEMENTARY" },
];

/** Reads the school's grading table (works whether or not each band stores a max). */
export function readGrading(config: SchoolConfig | null | undefined): GradeBand[] {
  const raw = Array.isArray(config?.grading) ? config.grading : [];
  const parsed = raw.flatMap((item) => {
    const grade = String(item?.grade ?? "").trim();
    const min = Number(item?.min);
    return grade && Number.isFinite(min) ? [{ grade, min, descriptor: String(item?.descriptor ?? "").trim(), rawMax: Number(item?.max) }] : [];
  }).sort((a, b) => b.min - a.min);
  if (!parsed.length) return DEFAULT_GRADING;
  return parsed.map((band, index) => ({
    grade: band.grade,
    min: band.min,
    max: Number.isFinite(band.rawMax) ? band.rawMax : index === 0 ? 100 : parsed[index - 1].min - 1,
    descriptor: band.descriptor,
  }));
}

export function gradeFor(total: number, grading: GradeBand[]): GradeBand {
  return grading.find((band) => total >= band.min) ?? grading[grading.length - 1] ?? DEFAULT_GRADING[4];
}

const DESCRIPTOR_BY_GRADE: Record<string, string> = { A: "EXCEPTIONAL", B: "OUTSTANDING", C: "SATISFACTORY", D: "BASIC", E: "ELEMENTARY" };

export function descriptorFor(percent: number, gradeLetter?: string): Descriptor {
  const label = (gradeLetter && DESCRIPTOR_BY_GRADE[gradeLetter.toUpperCase()])
    || (percent >= 80 ? "EXCEPTIONAL" : percent >= 70 ? "OUTSTANDING" : percent >= 60 ? "SATISFACTORY" : percent >= 50 ? "BASIC" : "ELEMENTARY");
  return { label, cls: label === "EXCEPTIONAL" || label === "OUTSTANDING" ? "rc-descriptor-outstanding" : label === "ELEMENTARY" ? "rc-descriptor-basic" : "rc-descriptor-moderate" };
}

function numberFromClass(value: string) {
  const match = value.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function subjectRecordsFor(config: SchoolConfig, className: string) {
  const raw = config.subjects;
  if (!raw || Array.isArray(raw) || typeof raw !== "object") return [] as { name: string; teacher: string }[];
  const entries = (raw as Record<string, unknown>)[className];
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((item) => {
    const name = typeof item === "string" ? item : String((item as { name?: unknown })?.name ?? "");
    const teacher = typeof item === "string" ? "" : String((item as { teacher?: unknown })?.teacher ?? "");
    return name.trim() ? [{ name: name.trim(), teacher: teacher.trim() }] : [];
  });
}

export function buildDataset(students: ReportStudent[], marks: ReportMarkRow[], config: SchoolConfig): ReportDataset {
  const fields = getAssessmentFields(config);
  const grading = readGrading(config);
  const settings = (config.settings && typeof config.settings === "object" ? config.settings : {}) as Record<string, unknown>;
  const optionalFrom = numberFromClass(String(settings.optionalSubjectsClass ?? "S.3"));

  const markIndex = new Map<string, ReportMarkRow>();
  marks.forEach((mark) => markIndex.set(`${mark.studentId}|${norm(mark.subject)}`, mark));

  const subjectsFor = (student: ReportStudent) => {
    const all = subjectRecordsFor(config, student.className);
    const classNumber = numberFromClass(student.className);
    const optional = classNumber !== null && optionalFrom !== null && classNumber >= optionalFrom;
    if (!optional) return all;
    // Upper classes: only subjects the student is actually enrolled in appear on the report.
    const assigned = new Set(student.subjects.map(norm));
    return all.filter((subject) => assigned.has(norm(subject.name)));
  };

  const fieldValue = (mark: ReportMarkRow | undefined, field: AssessmentField): number | null => {
    if (!mark) return null;
    const value = mark[ALIAS[field.field]];
    if (Array.isArray(mark.enteredFields) && mark.enteredFields.length) return mark.enteredFields.includes(field.field) ? Number(value ?? 0) : null;
    return value === undefined || value === null || Number(value) === 0 ? null : Number(value);
  };

  const build = (type: ReportType): Map<string, StudentReport> => {
    const counted = type === "midterm" && fields.length > 1 ? fields.slice(0, -1) : fields;
    const maxPossible = type === "midterm" ? counted.reduce((sum, field) => sum + field.max, 0) : 100;

    const partial = students.map((student) => {
      const results: SubjectResult[] = subjectsFor(student).map((subject) => {
        const mark = markIndex.get(`${student.id}|${norm(subject.name)}`);
        const cols: SubjectResult["cols"] = {};
        let sum = 0;
        let any = false;
        counted.forEach((field) => {
          const value = fieldValue(mark, field);
          cols[field.field] = value;
          if (value !== null) { sum += value; any = true; }
        });
        const total = any ? (type === "endterm" ? Math.min(100, sum) : sum) : null;
        const percent = total === null ? null : (total / maxPossible) * 100;
        const grade = total === null ? null : gradeFor(type === "endterm" ? total : percent ?? 0, grading);
        const descriptor = percent === null ? null : descriptorFor(percent, grade?.grade);
        const outOf3 = total === null ? "" : Math.min(3, (total / maxPossible) * 3).toFixed(2);
        return { name: subject.name, teacher: subject.teacher, cols, total, grade, descriptor, outOf3 };
      });
      const scored = results.filter((item) => item.total !== null);
      const grandTotal = scored.reduce((sum, item) => sum + (item.total ?? 0), 0);
      // Class position is ranked on the average over all of the student's subjects, as in the studio file.
      const rankScore = results.length ? grandTotal / results.length : 0;
      return { student, results, scored, grandTotal, rankScore };
    });

    const byClass = new Map<string, typeof partial>();
    partial.forEach((item) => byClass.set(item.student.className, [...(byClass.get(item.student.className) ?? []), item]));

    const out = new Map<string, StudentReport>();
    partial.forEach(({ student, results, scored, grandTotal, rankScore }) => {
      const mates = byClass.get(student.className) ?? [];
      const better = mates.filter((mate) => mate.rankScore > rankScore).length;
      const rank = scored.length ? better + 1 : null;
      const subjectCount = scored.length;
      const averageValue = subjectCount ? grandTotal / subjectCount : 0;
      const overall = subjectCount ? Math.min(3, (averageValue / maxPossible) * 3) : null;
      const counts = new Map<string, { d: Descriptor; n: number }>();
      scored.forEach((item) => {
        const key = item.descriptor!.label;
        counts.set(key, { d: item.descriptor!, n: (counts.get(key)?.n ?? 0) + 1 });
      });
      // Most frequent descriptor; when several tie, the one closest to the student's average level wins.
      const levels = ["ELEMENTARY", "BASIC", "SATISFACTORY", "OUTSTANDING", "EXCEPTIONAL"];
      const averageLevel = levels.indexOf(descriptorFor((averageValue / maxPossible) * 100).label);
      const overallDescriptor = [...counts.values()].sort((a, b) => b.n - a.n || Math.abs(levels.indexOf(a.d.label) - averageLevel) - Math.abs(levels.indexOf(b.d.label) - averageLevel))[0]?.d ?? null;

      const lowest = scored.length ? Math.min(...scored.map((item) => item.total!)) : null;
      const weakSubjects = lowest === null ? [] : scored.filter((item) => item.total === lowest && lowest > 0).map((item) => item.name);

      out.set(student.id, {
        student,
        type,
        fields,
        countedFields: counted,
        maxPossible,
        subjects: results,
        grandTotal,
        average: subjectCount ? averageValue.toFixed(1) : "0",
        percentage: subjectCount ? `${Math.min(100, Math.round((grandTotal / (subjectCount * maxPossible)) * 100))}%` : "0%",
        rank,
        classSize: mates.length,
        badgeRank: rank !== null && rank <= 3 ? rank : null,
        overallOutOf3: overall === null ? "—" : overall.toFixed(2),
        overallDescriptor,
        resultCategory: overall === null ? "—" : overall >= 2 ? "RESULT 1" : "RESULT 2",
        weakSubjects,
        lowestPercent: lowest === null ? null : (lowest / maxPossible) * 100,
      });
    });
    return out;
  };

  const cache = new Map<ReportType, Map<string, StudentReport>>();
  return {
    students,
    fields,
    grading,
    reports: (type) => {
      if (!cache.has(type)) cache.set(type, build(type));
      return cache.get(type)!;
    },
  };
}

/** Class overview shown in the control panel. */
export function classOverview(dataset: ReportDataset, className: string) {
  const reports = [...dataset.reports("endterm").values()].filter((report) => report.student.className === className);
  const expected = reports.reduce((sum, report) => sum + report.subjects.length * report.fields.length, 0);
  const filled = reports.reduce((sum, report) => sum + report.subjects.reduce((inner, subject) => inner + report.fields.filter((field) => subject.cols[field.field] !== null && subject.cols[field.field] !== undefined).length, 0), 0);
  const averages = reports.filter((report) => report.subjects.some((subject) => subject.total !== null)).map((report) => report.grandTotal / Math.max(1, report.subjects.filter((subject) => subject.total !== null).length));
  return {
    students: reports.length,
    average: averages.length ? (averages.reduce((sum, value) => sum + value, 0) / averages.length).toFixed(1) : "—",
    complete: expected ? Math.round((filled / expected) * 100) : 0,
  };
}
