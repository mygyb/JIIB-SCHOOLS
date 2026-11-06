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
