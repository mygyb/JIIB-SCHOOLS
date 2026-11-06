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
