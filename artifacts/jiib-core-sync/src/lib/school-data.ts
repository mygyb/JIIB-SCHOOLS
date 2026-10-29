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
export type AssessmentField = { name: string; max: number; field: AssessmentFieldId };

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
    return name && ["c1", "c2", "c3"].includes(field) && Number.isFinite(max) && max > 0
      ? [{ name, max, field: field as AssessmentField["field"] }]
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
