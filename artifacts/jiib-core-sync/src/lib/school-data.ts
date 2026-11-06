export type SubjectRecord = { name: string; teacher: string };
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

export function subjectRecords(config: SchoolConfig | null | undefined, className: string) {
  const raw = config?.subjects;
  if (!raw || Array.isArray(raw) || typeof raw !== "object") return [] as SubjectRecord[];
  const entries = (raw as Record<string, unknown>)[className];
  if (!Array.isArray(entries)) return [];
  return entries.map((item) =>
    typeof item === "string"
      ? { name: item, teacher: "" }
      : { name: String((item as SubjectRecord)?.name ?? ""), teacher: String((item as SubjectRecord)?.teacher ?? "") },
  ).filter((item) => item.name);
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
