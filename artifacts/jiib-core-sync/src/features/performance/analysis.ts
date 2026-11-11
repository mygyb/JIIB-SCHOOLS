// The numbers behind the Performance page: student averages, class ranking (ties share a rank), grades, class summaries and subject results.
// An average is the mean of a student's subject totals as a percentage of the assessment maximum, the same rule the page always used.
import { markTotal, type AssessmentField } from '@/lib/school-data';
import { gradeFor, type GradeBand } from '@/features/report-studio/report-model';

export type PerfStudent = { id: string; name: string; className: string };
export type PerfMark = { studentId: string; subject: string; aoi?: number; midterm?: number; end?: number };
export type SubjectScore = { subject: string; percent: number };

export type StudentRow = {
  id: string;
  name: string;
  className: string;
  average: number; // percent, one decimal
  subjects: number;
  grade: string;
  rank: number; // position within the class (ties share a position)
  best?: SubjectScore;
  weakest?: SubjectScore;
};

export type ClassSummary = {
  className: string;
  enrolled: number;
  ranked: number; // students who have marks
  average: number;
  highest: number;
  lowest: number;
  passRate: number; // percent of ranked students at or above the pass mark
  giants: number;
  support: number;
  top?: StudentRow;
};

export type SubjectRow = {
  subject: string; average: number; highest: number; entries: number;
  byClass: Record<string, number>; // average in each class
  classDetail: Record<string, { highest: number; entries: number }>;
};

export type PerformanceSettings = {
  giantMin: number; // average needed to count as an academic giant
  passMark: number; // below this a student needs support
};

export type Performance = {
  rows: StudentRow[]; // every ranked student, best first
  byClass: Map<string, StudentRow[]>; // each class, best first
  classes: ClassSummary[];
  subjects: SubjectRow[]; // best first
  overall: { enrolled: number; ranked: number; average: number; passRate: number; giants: number; support: number; highest?: StudentRow };
};

const oneDecimal = (value: number) => Math.round(value * 10) / 10;
const naturalCompare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

export function compute(input: {
  students: PerfStudent[];
  marks: PerfMark[];
  fields: AssessmentField[];
  grading: GradeBand[];
  settings: PerformanceSettings;
}): Performance {
  const { students, marks, fields, grading, settings } = input;
  const maxTotal = Math.max(1, fields.reduce((total, field) => total + field.max, 0));
  const percentOf = (mark: PerfMark) => (markTotal(mark, fields) / maxTotal) * 100;

  const marksByStudent = new Map<string, PerfMark[]>();
  for (const mark of marks) {
    const list = marksByStudent.get(mark.studentId);
    if (list) list.push(mark); else marksByStudent.set(mark.studentId, [mark]);
  }

  const unranked: Omit<StudentRow, 'rank'>[] = [];
  for (const student of students) {
    const items = marksByStudent.get(student.id);
    if (!items?.length) continue;
    const scores = items.map((mark) => ({ subject: mark.subject, percent: oneDecimal(percentOf(mark)) }));
    const average = oneDecimal(items.reduce((sum, mark) => sum + percentOf(mark), 0) / items.length);
    const sorted = [...scores].sort((a, b) => b.percent - a.percent);
    unranked.push({
      id: student.id, name: student.name, className: student.className, average, subjects: items.length,
      grade: gradeFor(average, grading).grade,
      best: sorted[0], weakest: sorted.length > 1 ? sorted[sorted.length - 1] : undefined,
    });
  }

  const byClassRaw = new Map<string, Omit<StudentRow, 'rank'>[]>();
  for (const row of unranked) {
    const list = byClassRaw.get(row.className);
    if (list) list.push(row); else byClassRaw.set(row.className, [row]);
  }
  const byClass = new Map<string, StudentRow[]>();
  for (const className of [...byClassRaw.keys()].sort(naturalCompare)) {
    const sorted = [...byClassRaw.get(className)!].sort((a, b) => b.average - a.average || a.name.localeCompare(b.name));
    let previous = Number.NaN;
    let rank = 0;
    byClass.set(className, sorted.map((row, index) => {
      if (row.average !== previous) { rank = index + 1; previous = row.average; }
      return { ...row, rank };
    }));
  }

  const enrolledByClass = new Map<string, number>();
  for (const student of students) enrolledByClass.set(student.className, (enrolledByClass.get(student.className) ?? 0) + 1);

  const classes: ClassSummary[] = [...byClass.entries()].map(([className, list]) => ({
    className,
    enrolled: enrolledByClass.get(className) ?? list.length,
    ranked: list.length,
    average: oneDecimal(list.reduce((sum, row) => sum + row.average, 0) / list.length),
    highest: list[0].average,
    lowest: list[list.length - 1].average,
    passRate: Math.round((list.filter((row) => row.average >= settings.passMark).length / list.length) * 100),
    giants: list.filter((row) => row.average >= settings.giantMin).length,
    support: list.filter((row) => row.average < settings.passMark).length,
    top: list[0],
  }));

  const rows = [...byClass.values()].flat().sort((a, b) => b.average - a.average || a.name.localeCompare(b.name));

  const subjectMap = new Map<string, { sum: number; count: number; highest: number; classes: Map<string, { sum: number; count: number; highest: number }> }>();
  const classOf = new Map(students.map((student) => [student.id, student.className]));
  for (const mark of marks) {
    const className = classOf.get(mark.studentId);
    if (!className) continue;
    const percent = percentOf(mark);
    const entry = subjectMap.get(mark.subject) ?? { sum: 0, count: 0, highest: 0, classes: new Map() };
    entry.sum += percent; entry.count += 1; entry.highest = Math.max(entry.highest, percent);
    const cls = entry.classes.get(className) ?? { sum: 0, count: 0, highest: 0 };
    cls.sum += percent; cls.count += 1; cls.highest = Math.max(cls.highest, percent); entry.classes.set(className, cls);
    subjectMap.set(mark.subject, entry);
  }
  const subjects: SubjectRow[] = [...subjectMap.entries()].map(([subject, entry]) => ({
    subject,
    average: oneDecimal(entry.sum / entry.count),
    highest: oneDecimal(entry.highest),
    entries: entry.count,
    byClass: Object.fromEntries([...entry.classes].map(([name, value]) => [name, oneDecimal(value.sum / value.count)])),
    classDetail: Object.fromEntries([...entry.classes].map(([name, value]) => [name, { highest: oneDecimal(value.highest), entries: value.count }])),
  })).sort((a, b) => b.average - a.average || a.subject.localeCompare(b.subject));

  return {
    rows, byClass, classes, subjects,
    overall: {
      enrolled: students.length,
      ranked: rows.length,
      average: rows.length ? oneDecimal(rows.reduce((sum, row) => sum + row.average, 0) / rows.length) : 0,
      passRate: rows.length ? Math.round((rows.filter((row) => row.average >= settings.passMark).length / rows.length) * 100) : 0,
      giants: rows.filter((row) => row.average >= settings.giantMin).length,
      support: rows.filter((row) => row.average < settings.passMark).length,
      highest: rows[0],
    },
  };
}

/** The students to feature for one class: everyone at or above the giants mark, or simply the top N. */
export function featured(list: StudentRow[], mode: 'giants' | number, giantMin: number): StudentRow[] {
  if (mode === 'giants') return list.filter((row) => row.average >= giantMin);
  // Top N keeps ties together, so nobody who shares the last place is left out.
  const cut = list[Math.min(mode, list.length) - 1]?.average;
  return cut === undefined ? [] : list.filter((row) => row.average >= cut);
}

export const fmt = (value: number) => `${value.toFixed(1)}%`;

/** How many students fall in each score band. */
export function distributionOf(rows: Array<{ average: number }>): Array<{ label: string; count: number; low: boolean }> {
  const bands = [
    { label: '80% and above', test: (v: number) => v >= 80, low: false },
    { label: '70 – 79%', test: (v: number) => v >= 70 && v < 80, low: false },
    { label: '60 – 69%', test: (v: number) => v >= 60 && v < 70, low: false },
    { label: '50 – 59%', test: (v: number) => v >= 50 && v < 60, low: false },
    { label: 'Below 50%', test: (v: number) => v < 50, low: true },
  ];
  return bands.map((band) => ({ label: band.label, low: band.low, count: rows.filter((row) => band.test(row.average)).length }));
}
