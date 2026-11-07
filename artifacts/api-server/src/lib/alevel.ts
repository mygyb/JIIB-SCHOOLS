// A-Level setup: validation of each subject's category and papers (kept in step with the app's own checks).
export type ALevelPaper = { name: string; max: number; weight?: number };
export type ALevelSubjectConfig = { category: string; papers: ALevelPaper[]; combine: string };

/** Why this A-Level subject setup is not acceptable, or null when it is fine. */
export function aLevelProblem(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "A-Level subject setup is not valid.";
  const subject = value as Partial<ALevelSubjectConfig>;
  if (!["principal", "subsidiary", "compulsory"].includes(String(subject.category))) return "Choose a category for the A-Level subject.";
  if (!Array.isArray(subject.papers) || subject.papers.length < 1 || subject.papers.length > 4) return "A subject has 1 to 4 papers.";
  const names = subject.papers.map((paper) => String(paper?.name ?? "").trim().toLowerCase());
  if (names.some((name) => !name || name.length > 30)) return "Every paper needs a name (up to 30 characters).";
  if (new Set(names).size !== names.length) return "Paper names must be different.";
  if (subject.papers.some((paper) => typeof paper?.max !== "number" || !Number.isFinite(paper.max) || paper.max <= 0 || paper.max > 1000)) {
    return "Each paper needs an out-of mark between 1 and 1000.";
  }
  if (subject.combine === "weighted") {
    if (subject.papers.some((paper) => typeof paper.weight !== "number" || !Number.isFinite(paper.weight) || paper.weight <= 0)) return "Give every paper a weight above 0.";
    const total = subject.papers.reduce((sum, paper) => sum + (paper.weight as number), 0);
    if (Math.abs(total - 100) > 0.001) return "Paper weights must add up to 100%.";
  } else if (subject.combine !== "average") return "Choose how the papers combine.";
  return null;
}

/** First problem found in any subject's A-Level setup inside a school's subjects map, or null. */
export function subjectsProblem(subjects: unknown): string | null {
  if (!subjects || typeof subjects !== "object" || Array.isArray(subjects)) return null;
  for (const [className, list] of Object.entries(subjects as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== "object" || !("aLevel" in item) || (item as Record<string, unknown>).aLevel === undefined) continue;
      const problem = aLevelProblem((item as Record<string, unknown>).aLevel);
      if (problem) return `${className} · ${String((item as Record<string, unknown>).name ?? "subject")}: ${problem}`;
    }
  }
  return null;
}

// ---- Streams, combinations and student enrolment ----
export type Stream = "sciences" | "arts";
export type Combination = { id: string; name: string; stream: Stream; subjects: string[] };
export type Enrolment = { stream: Stream; combination: string; subsidiary?: string };
type Config = Record<string, unknown>;

/** S.5 / S.6 style class names (S5, S.6, Senior 5, "S.5 Arts"). Same rule as the app. */
export function isALevelClass(className: string) {
  return /^s(enior)?[\s.]*[56](?!\d)/i.test(className.trim());
}

export function aLevelEnabled(config: Config) {
  const settings = config.settings;
  return Boolean(settings && typeof settings === "object" && (settings as Record<string, unknown>).aLevelEnabled === true);
}

export function combinationsOf(config: Config): Combination[] {
  const block = config.aLevel;
  const list = block && typeof block === "object" ? (block as Record<string, unknown>).combinations : undefined;
  return Array.isArray(list) ? list as Combination[] : [];
}

/** Subject entries across the S.5 / S.6 style classes that carry an A-Level setup, with their category. */
function aLevelSubjects(config: Config) {
  const out: Array<{ name: string; category: string }> = [];
  const subjects = config.subjects;
  if (!subjects || typeof subjects !== "object" || Array.isArray(subjects)) return out;
  for (const [className, list] of Object.entries(subjects as Record<string, unknown>)) {
    if (!isALevelClass(className) || !Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const setup = record.aLevel as Record<string, unknown> | undefined;
      if (record.name && setup && typeof setup.category === "string") out.push({ name: String(record.name), category: setup.category });
    }
  }
  return out;
}

const unique = (values: string[]) => Array.from(new Set(values));
export const principalNames = (config: Config) => unique(aLevelSubjects(config).filter((item) => item.category === "principal").map((item) => item.name));
export const subsidiaryNames = (config: Config) => unique(aLevelSubjects(config).filter((item) => item.category === "subsidiary").map((item) => item.name));
export const compulsoryNames = (config: Config) => {
  const names = unique(aLevelSubjects(config).filter((item) => item.category === "compulsory").map((item) => item.name));
  return names.length ? names : ["General Paper"];
};

/** The subjects an enrolled A-Level student takes: their three principals, the chosen subsidiary, and the compulsory subject(s). */
export function enrolmentSubjects(config: Config, combination: Combination, subsidiary?: string) {
  return unique([...combination.subjects, ...(subsidiary ? [subsidiary] : []), ...compulsoryNames(config)]);
}

/** Checks a student's stream / combination / subsidiary and works out their subjects. */
export function resolveEnrolment(config: Config, className: string, input: Enrolment):
  { problem: string } | { aLevel: Enrolment; subjects: string[] } {
  if (!aLevelEnabled(config)) return { problem: "A-Level is not switched on for this school." };
  if (!isALevelClass(className)) return { problem: "Stream and combination are only for S.5 and S.6 students." };
  const combination = combinationsOf(config).find((item) => item.id === input.combination);
  if (!combination) return { problem: "Choose a combination that exists for this school." };
  if (combination.stream !== input.stream) return { problem: `${combination.name} belongs to the ${combination.stream === "arts" ? "Arts" : "Sciences"} stream.` };
  const subsidiary = (input.subsidiary ?? "").trim();
  if (subsidiary && !subsidiaryNames(config).includes(subsidiary)) return { problem: `${subsidiary} is not a subsidiary subject for this school.` };
  return {
    aLevel: { stream: combination.stream, combination: combination.id, ...(subsidiary ? { subsidiary } : {}) },
    subjects: enrolmentSubjects(config, combination, subsidiary || undefined),
  };
}

/** Validates the whole combinations list an admin is saving. */
export function combinationsProblem(config: Config, list: Array<{ name: string; stream: string; subjects: string[] }>): string | null {
  if (list.length > 60) return "That is more combinations than expected (60 at most).";
  const principals = new Set(principalNames(config));
  const names = new Set<string>();
  for (const item of list) {
    const name = item.name.trim();
    if (!name || name.length > 30) return "Every combination needs a name (up to 30 characters), for example PCM.";
    if (names.has(name.toLowerCase())) return `Two combinations are called ${name}.`;
    names.add(name.toLowerCase());
    if (item.stream !== "sciences" && item.stream !== "arts") return `${name}: choose Sciences or Arts.`;
    if (item.subjects.length !== 3 || new Set(item.subjects).size !== 3) return `${name}: choose three different principal subjects.`;
    const missing = item.subjects.find((subject) => !principals.has(subject));
    if (missing) return `${name}: ${missing} is not set up as a principal subject in S.5 or S.6 yet (Manage subjects).`;
  }
  return null;
}
