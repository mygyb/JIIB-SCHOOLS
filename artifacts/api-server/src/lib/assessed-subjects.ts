// "Assessed subjects": a school can switch on a per-term list of the class subjects that are being assessed this term.
// Stored as settings.assessedSubjects[termKey] = { on: boolean, items: ["s.1|ict", ...] } (class and subject, lower-case).
type Row = Record<string, unknown>;

export const assessedKey = (className: unknown, subject: unknown) =>
  `${String(className ?? "").trim().toLowerCase()}|${String(subject ?? "").trim().toLowerCase()}`;

export function assessedFilter(settings: unknown, termKey: string): ((className: string, subject: string) => boolean) {
  const all = settings && typeof settings === "object" ? (settings as Row).assessedSubjects : null;
  const entry = all && typeof all === "object" && !Array.isArray(all) ? (all as Row)[termKey] : null;
  if (!entry || typeof entry !== "object" || !(entry as Row).on || !Array.isArray((entry as Row).items)) return () => true;
  const items = new Set(((entry as Row).items as unknown[]).map(String));
  return (className, subject) => items.has(assessedKey(className, subject));
}
