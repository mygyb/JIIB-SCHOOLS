export type PaperConfig = { name: string; max: number; weight?: number };
export type ALevelCategory = "principal" | "subsidiary" | "compulsory";
/** How an A-Level subject is examined: its category and the papers that make up its mark. */
export type ALevelSubject = { category: ALevelCategory; papers: PaperConfig[]; combine: "average" | "weighted" };
export type SubjectRecord = { name: string; teacher: string; aLevel?: ALevelSubject };
export type TermRecord = Record<string, unknown> & { label?: string; locked?: boolean; status?: string };
export type SchoolConfig = Record<string, unknown> & {
  activeTerm?: string;
  terms?: Record<string, TermRecord>;
  subjects?: Record<string, Array<string | SubjectRecord>> | string[];
  settings?: Record<string, unknown>;
  grading?: Array<Record<string, unknown>>;
};

export type AssessmentFieldId = "c1" | "c2" | "c3";
/** `max` is what the assessment counts for out of 100. `entryMax` (optional, defaults to max) is what marks are typed out of. */
export type AssessmentField = { name: string; max: number; field: AssessmentFieldId; entryMax?: number };

/** What teachers type this assessment out of. */
export function entryMaxOf(field: Pick<AssessmentField, "max" | "entryMax">) {
  return field.entryMax && field.entryMax > 0 ? field.entryMax : field.max;
}

/** A typed mark converted to what it counts for: mark / entryMax * max. Not rounded. */
export function weightedScore(raw: number, field: Pick<AssessmentField, "max" | "entryMax">) {
  const entry = entryMaxOf(field);
  if (entry === field.max) return raw; // normal assessment: the typed mark is the score, untouched
  return Math.round(((raw * field.max) / entry) * 1e9) / 1e9;
}

/** True when at least one assessment is typed out of something other than what it counts for. */
export function hasEntryScale(fields: Array<Pick<AssessmentField, "max" | "entryMax">>) {
  return fields.some((field) => entryMaxOf(field) !== field.max);
}

/** Sum of the converted scores of one subject's marks, rounded to a whole number only when a converted scale is in use. */
export function finalTotal(total: number, fields: Array<Pick<AssessmentField, "max" | "entryMax">>) {
  return hasEntryScale(fields) ? roundTotal(total) : total;
}

/** Converted score of a whole mark record: each assessment's typed mark converted to what it counts for, then added up. Not rounded. */
export function markTotal(mark: { aoi?: number; midterm?: number; end?: number }, fields: AssessmentField[]) {
  const alias = { c1: "aoi", c2: "midterm", c3: "end" } as const;
  return fields.reduce((sum, field) => sum + weightedScore(Number(mark[alias[field.field]] ?? 0), field), 0);
}

/** The only rounding in the system: a final total shown to people is a whole number (half rounds up). */
export function roundTotal(total: number) {
  return Math.round(Math.round(total * 1e6) / 1e6);
}

export const DEFAULT_ASSESSMENT_FIELDS: AssessmentField[] = [
  { name: "AOI", max: 10, field: "c1" },
  { name: "Midterm", max: 10, field: "c2" },
  { name: "End of Term", max: 80, field: "c3" },
];

export function getAssessmentStructure(config: SchoolConfig | null | undefined): AssessmentField[] {
  const settings = config?.settings && typeof config.settings === "object" ? config.settings : {};
  const raw = Array.isArray(settings.marksSchema) ? settings.marksSchema : [];
  const schema = raw.flatMap((entry): AssessmentField[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const field = String(item.field ?? "");
    const name = String(item.name ?? "").trim();
    const max = Number(item.max ?? 0);
    const entryMax = Number(item.entryMax);
    return name && ["c1", "c2", "c3"].includes(field) && Number.isFinite(max) && max > 0
      ? [{ name, max, field: field as AssessmentField["field"], ...(Number.isFinite(entryMax) && entryMax > 0 && Math.abs(entryMax - max) > 1e-9 ? { entryMax } : {}) }]
      : [];
  });
  return schema.length ? schema : DEFAULT_ASSESSMENT_FIELDS.map((field) => ({ ...field }));
}

export function getAssessmentFields(config: SchoolConfig | null | undefined): AssessmentField[] {
  const settings = config?.settings && typeof config.settings === "object" ? config.settings : {};
  const chosen = getAssessmentStructure(config);
  const active = settings.activeMarkColumns;
  return Array.isArray(active)
    ? chosen.filter((field) => active.map(String).includes(field.field))
    : chosen;
}

export function configuredHouses(config: SchoolConfig | null | undefined) {
  const settings = config?.settings && typeof config.settings === "object" ? config.settings : {};
  const raw = Array.isArray(settings.houses) ? settings.houses : Array.isArray(config?.houses) ? config.houses : [];
  return Array.from(new Set(raw.map((house) =>
    typeof house === "string" ? house.trim() :
      String((house as Record<string, unknown>)?.name ?? "").trim(),
  ).filter(Boolean)));
}

export function getTerms(config: SchoolConfig | null | undefined) {
  const terms = config?.terms;
  if (!terms || Array.isArray(terms) || typeof terms !== "object") return [];
  return Object.entries(terms).map(([key, value]) => ({
    key,
    label: String(value.label ?? key),
    locked: Boolean(value.locked || value.status === "closed"),
    active: config?.activeTerm === key,
  }));
}

export function subjectNames(config: SchoolConfig | null | undefined, className?: string) {
  const raw = config?.subjects;
  if (Array.isArray(raw)) return raw.map((item) => String(item));
  if (!raw || typeof raw !== "object") return [];
  const classes = raw as Record<string, unknown>;
  const values = className && className in classes ? [classes[className]] : Object.values(classes);
  return Array.from(new Set(values.flatMap((items) =>
    Array.isArray(items)
      ? items.map((item) => typeof item === "string" ? item : String((item as SubjectRecord)?.name ?? "")).filter(Boolean)
      : [],
  )));
}

export const A_LEVEL_CATEGORY_LABELS: Record<ALevelCategory, string> = {
  principal: "Principal subject",
  subsidiary: "Subsidiary subject",
  compulsory: "General Paper (compulsory)",
};

/** A-Level is off until the school switches it on in School settings. */
export function isALevelEnabled(config: SchoolConfig | null | undefined) {
  return Boolean(config?.settings && typeof config.settings === "object" && (config.settings as Record<string, unknown>).aLevelEnabled === true);
}

/** S.5 / S.6 style class names (S5, S.6, Senior 5, "S.5 Arts"). */
export function isALevelClass(className: string) {
  return /^s(enior)?[\s.]*[56](?!\d)/i.test(className.trim());
}

export function defaultALevel(category: ALevelCategory = "principal"): ALevelSubject {
  const count = category === "subsidiary" ? 1 : 2;
  return { category, papers: Array.from({ length: count }, (_, index) => ({ name: `Paper ${index + 1}`, max: 100 })), combine: "average" };
}

/** Why this paper set cannot be saved, or null when it is fine. */
export function aLevelProblem(value: ALevelSubject): string | null {
  if (!["principal", "subsidiary", "compulsory"].includes(value.category)) return "Choose a category.";
  if (!Array.isArray(value.papers) || value.papers.length < 1 || value.papers.length > 4) return "A subject has 1 to 4 papers.";
  const names = value.papers.map((paper) => String(paper.name ?? "").trim().toLowerCase());
  if (names.some((name) => !name || name.length > 30)) return "Every paper needs a name (up to 30 characters).";
  if (new Set(names).size !== names.length) return "Paper names must be different.";
  if (value.papers.some((paper) => !Number.isFinite(paper.max) || paper.max <= 0 || paper.max > 1000)) return "Each paper needs an out-of mark between 1 and 1000.";
  if (value.combine === "weighted") {
    if (value.papers.some((paper) => !Number.isFinite(paper.weight) || (paper.weight as number) <= 0)) return "Give every paper a weight above 0.";
    const total = value.papers.reduce((sum, paper) => sum + (paper.weight as number), 0);
    if (Math.abs(total - 100) > 0.001) return `Paper weights must add up to 100% (now ${Math.round(total * 100) / 100}%).`;
  } else if (value.combine !== "average") return "Choose how the papers combine.";
  return null;
}

function normalizeALevel(raw: unknown): ALevelSubject | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Partial<ALevelSubject>;
  const papers = Array.isArray(value.papers) ? value.papers.map((paper) => ({
    name: String(paper?.name ?? ""),
    max: Number(paper?.max),
    ...(paper?.weight !== undefined && paper?.weight !== null ? { weight: Number(paper.weight) } : {}),
  })) : [];
  return { category: (value.category as ALevelCategory) ?? "principal", papers, combine: value.combine === "weighted" ? "weighted" : "average" };
}

/**
 * Combines a student's paper marks into one subject mark out of 100. Each paper is first turned into a percentage of its own
 * out-of mark, then averaged (or weighted). Papers not entered yet (null) are left out. Returns null if none are entered.
 */
export function combinePapers(scores: Array<number | null | undefined>, subject: ALevelSubject): number | null {
  let weighted = 0;
  let weights = 0;
  subject.papers.forEach((paper, index) => {
    const score = scores[index];
    if (score === null || score === undefined || !Number.isFinite(score)) return;
    const weight = subject.combine === "weighted" ? (paper.weight ?? 0) : 1;
    weighted += (score / paper.max) * 100 * weight;
    weights += weight;
  });
  return weights > 0 ? Math.round((weighted / weights) * 1e6) / 1e6 : null;
}

export function subjectRecords(config: SchoolConfig | null | undefined, className: string) {
  const raw = config?.subjects;
  if (!raw || Array.isArray(raw) || typeof raw !== "object") return [] as SubjectRecord[];
  const entries = (raw as Record<string, unknown>)[className];
  if (!Array.isArray(entries)) return [];
  return entries.map((item): SubjectRecord => {
    if (typeof item === "string") return { name: item, teacher: "" };
    const record = item as SubjectRecord;
    const aLevel = normalizeALevel(record?.aLevel);
    return { name: String(record?.name ?? ""), teacher: String(record?.teacher ?? ""), ...(aLevel ? { aLevel } : {}) };
  }).filter((item) => item.name);
}

export function currentTerm(config: SchoolConfig | null | undefined) {
  const terms = getTerms(config);
  const selected = terms.find((term) => term.key === config?.activeTerm);
  return selected?.key ?? terms[0]?.key ?? "2026-T1";
}

export function isTermLocked(config: SchoolConfig | null | undefined, termKey: string) {
  return Boolean(config?.terms?.[termKey]?.locked || config?.terms?.[termKey]?.status === "closed");
}

export function normalizePhone(value: string) {
  return value.replace(/\D/g, "").replace(/^0+/, "").slice(-9);
}

// ---- A-Level streams, combinations and student enrolment ----
export type Stream = "sciences" | "arts";
export const STREAM_LABELS: Record<Stream, string> = { sciences: "Sciences", arts: "Arts" };
export type Combination = { id: string; name: string; stream: Stream; subjects: string[] };
export type Enrolment = { stream: Stream; combination: string; subsidiary?: string };

export function combinationsOf(config: SchoolConfig | null | undefined): Combination[] {
  const block = config?.aLevel as { combinations?: unknown } | undefined;
  return Array.isArray(block?.combinations) ? (block.combinations as Combination[]) : [];
}

function aLevelSubjects(config: SchoolConfig | null | undefined) {
  const out: Array<{ name: string; category: string }> = [];
  const map = config?.subjects;
  if (!map || Array.isArray(map) || typeof map !== "object") return out;
  for (const className of Object.keys(map)) {
    if (!isALevelClass(className)) continue;
    for (const record of subjectRecords(config, className)) if (record.aLevel) out.push({ name: record.name, category: record.aLevel.category });
  }
  return out;
}
const uniqueNames = (values: string[]) => Array.from(new Set(values));
export const principalSubjectNames = (config: SchoolConfig | null | undefined) => uniqueNames(aLevelSubjects(config).filter((item) => item.category === "principal").map((item) => item.name));
export const subsidiarySubjectNames = (config: SchoolConfig | null | undefined) => uniqueNames(aLevelSubjects(config).filter((item) => item.category === "subsidiary").map((item) => item.name));
export const compulsorySubjectNames = (config: SchoolConfig | null | undefined) => {
  const names = uniqueNames(aLevelSubjects(config).filter((item) => item.category === "compulsory").map((item) => item.name));
  return names.length ? names : ["General Paper"];
};

/** The subjects an enrolled student takes: three principals, the chosen subsidiary and the compulsory subject(s). Matches the server. */
export function enrolmentSubjects(config: SchoolConfig | null | undefined, combination: Combination | undefined, subsidiary?: string) {
  if (!combination) return [] as string[];
  return uniqueNames([...combination.subjects, ...(subsidiary ? [subsidiary] : []), ...compulsorySubjectNames(config)]);
}

/** "PCM · Sciences" style label for a student's enrolment, or null. */
export function enrolmentLabel(config: SchoolConfig | null | undefined, enrolment: Enrolment | null | undefined) {
  if (!enrolment) return null;
  const combination = combinationsOf(config).find((item) => item.id === enrolment.combination);
  return combination ? `${combination.name} · ${STREAM_LABELS[combination.stream]}` : STREAM_LABELS[enrolment.stream];
}

// ---- A-Level grading: each principal subject earns a grade and points from its combined mark; subsidiaries and General
// Paper earn 1 point for a pass and 0 for a fail. Everything below is adjustable by the school (Settings → A-Level).
export type PrincipalBand = { grade: string; min: number; points: number };
export type ALevelGrading = { principal: PrincipalBand[]; subsidiaryPass: number };

export const DEFAULT_ALEVEL_GRADING: ALevelGrading = {
  principal: [
    { grade: "A", min: 80, points: 6 }, { grade: "B", min: 70, points: 5 }, { grade: "C", min: 60, points: 4 },
    { grade: "D", min: 50, points: 3 }, { grade: "E", min: 40, points: 2 }, { grade: "O", min: 35, points: 1 }, { grade: "F", min: 0, points: 0 },
  ],
  subsidiaryPass: 50,
};

export function aLevelGrading(config: SchoolConfig | null | undefined): ALevelGrading {
  const raw = (config?.settings as Record<string, unknown> | undefined)?.aLevelGrading as Partial<ALevelGrading> | undefined;
  const bands = Array.isArray(raw?.principal)
    ? raw!.principal!.filter((band) => band && typeof band.grade === "string" && Number.isFinite(band.min) && Number.isFinite(band.points))
    : [];
  if (bands.length < 2) return DEFAULT_ALEVEL_GRADING;
  const pass = Number(raw?.subsidiaryPass);
  return { principal: [...bands].sort((a, b) => b.min - a.min), subsidiaryPass: Number.isFinite(pass) ? pass : DEFAULT_ALEVEL_GRADING.subsidiaryPass };
}

const EPS = 1e-9;
/** Grade and points for a principal subject's combined mark (not rounded first), or null when nothing is entered. */
export function principalResult(percent: number | null, grading: ALevelGrading) {
  if (percent === null) return null;
  const band = grading.principal.find((item) => percent + EPS >= item.min) ?? grading.principal[grading.principal.length - 1];
  return { grade: band.grade, points: band.points };
}

export function subsidiaryResult(percent: number | null, grading: ALevelGrading) {
  if (percent === null) return null;
  const pass = percent + EPS >= grading.subsidiaryPass;
  return { pass, points: pass ? 1 : 0 };
}

export type ALevelResultRow = {
  subject: string;
  category: ALevelCategory;
  papers: Array<{ name: string; max: number; score: number | null }>;
  percent: number | null;
  grade: string | null; // principal: the grade letter; subsidiary / compulsory: "Pass" or "Fail"
  points: number | null;
};
export type ALevelStudentResult = { rows: ALevelResultRow[]; totalPoints: number; maxPoints: number; complete: boolean };

/** One student's A-Level results. `marks` is every paper mark of the term: subject → paper name → score. */
export function aLevelStudentResult(
  config: SchoolConfig | null | undefined,
  student: { className: string; subjects: string[] },
  marks: Map<string, Map<string, number>>,
): ALevelStudentResult {
  const grading = aLevelGrading(config);
  const order: Record<ALevelCategory, number> = { principal: 0, subsidiary: 1, compulsory: 2 };
  const records = subjectRecords(config, student.className)
    .filter((record) => record.aLevel && student.subjects.includes(record.name))
    .sort((a, b) => order[a.aLevel!.category] - order[b.aLevel!.category]);
  const topPoints = Math.max(...grading.principal.map((band) => band.points));
  let totalPoints = 0;
  let maxPoints = 0;
  let complete = records.length > 0;
  const rows = records.map((record): ALevelResultRow => {
    const subject = record.aLevel!;
    const typed = marks.get(record.name);
    const scores = subject.papers.map((paper) => typed?.get(paper.name) ?? null);
    const percent = combinePapers(scores, subject);
    let grade: string | null = null;
    let points: number | null = null;
    if (subject.category === "principal") {
      const result = principalResult(percent, grading);
      grade = result?.grade ?? null;
      points = result?.points ?? null;
      maxPoints += topPoints;
    } else {
      const result = subsidiaryResult(percent, grading);
      grade = result ? (result.pass ? "Pass" : "Fail") : null;
      points = result?.points ?? null;
      maxPoints += 1;
    }
    if (points === null) complete = false;
    else totalPoints += points;
    return { subject: record.name, category: subject.category, papers: subject.papers.map((paper, index) => ({ name: paper.name, max: paper.max, score: scores[index] })), percent, grade, points };
  });
  return { rows, totalPoints, maxPoints, complete };
}

// ---- Classes and optional subjects ----
/** The number in a class name: "S.3" -> 3. */
// Nursery sections sit below P.1 so promotion and sorting run Baby, Middle, Top, P.1 ... P.7.
export const classLevel = (value: string) => {
  const text = String(value).trim();
  if (/^baby/i.test(text)) return -2;
  if (/^middle/i.test(text)) return -1;
  if (/^top\b/i.test(text)) return 0;
  return Number(text.match(/\d+/)?.[0] ?? 0);
};

/** The class where students begin choosing optional subjects (S.3 unless the school changed it). */
export function optionalSubjectsClassOf(config: SchoolConfig | null | undefined) {
  const settings = config?.settings && typeof config.settings === "object" ? (config.settings as Record<string, unknown>) : {};
  return String(settings.optionalSubjectsClass ?? "S.3");
}

// ---- School type (set by the super administrator) ----
export type SchoolType = "primary" | "secondary";
export const isPrimarySchool = (school: { schoolType?: string } | null | undefined) => school?.schoolType === "primary";
/** Wording used in a primary school's menus: pupils instead of students. */
export function primaryLabel(text: string) {
  return text.replace(/\bStudents\b/g, "Pupils").replace(/\bstudents\b/g, "pupils").replace(/\bStudent\b/g, "Pupil");
}

// ---- Primary school stages, PLE grades and competence ratings ----
export type PrimaryStage = "nursery" | "lower" | "upper" | "ple";
/** Nursery (Baby/Middle/Top), lower primary P.1-P.3, upper primary P.4-P.6 and P.7 (the PLE class). Null for other class names. */
export function primaryStage(className: string): PrimaryStage | null {
  const text = String(className).trim();
  if (/^(baby|middle|top\b|nursery|kg)/i.test(text)) return "nursery";
  const match = /^p(?:rimary)?[\s.]*([1-7])(?!\d)/i.exec(text);
  if (!match) return null;
  const level = Number(match[1]);
  return level <= 3 ? "lower" : level === 7 ? "ple" : "upper";
}

/** Fixed UNEB-style points, used when the school's own grade names are not D1...F9. */
export function plePointsFor(percent: number): number {
  return percent >= 90 ? 1 : percent >= 80 ? 2 : percent >= 70 ? 3 : percent >= 60 ? 4 : percent >= 55 ? 5 : percent >= 50 ? 6 : percent >= 45 ? 7 : percent >= 40 ? 8 : 9;
}
/** PLE division from the aggregate of the four subjects (4 best = 4, worst = 36). */
export function pleDivision(aggregate: number): string {
  return aggregate <= 12 ? "Division 1" : aggregate <= 23 ? "Division 2" : aggregate <= 29 ? "Division 3" : aggregate <= 34 ? "Division 4" : "Ungraded (U)";
}
/** Wording for lower primary and nursery, where a competence rating goes beside the marks. */
export function competenceFor(percent: number): { label: string; short: string } {
  return percent >= 80 ? { label: "HIGHLY COMPETENT", short: "Highly competent" }
    : percent >= 60 ? { label: "COMPETENT", short: "Competent" }
      : percent >= 40 ? { label: "DEVELOPING", short: "Developing" }
        : { label: "BEGINNING", short: "Beginning" };
}
/** The four PLE subjects are found by name: English, Mathematics, Science and Social Studies. */
export function pleSubjectKind(subject: string): "english" | "maths" | "science" | "sst" | null {
  const text = subject.toLowerCase();
  return /english/.test(text) ? "english" : /math/.test(text) ? "maths" : /science/.test(text) ? "science" : /social|sst/.test(text) ? "sst" : null;
}

/** Class order for lists: nursery, then P.1 upward (or S.1 upward), then streams by name. */
export const compareClasses = (a: string, b: string) => classLevel(a) - classLevel(b) || a.localeCompare(b, undefined, { numeric: true });
