// Plans and the limits that follow from them. A school with no billing row is not limited (existing schools until a plan is assigned).
import { asRows, supabaseAdminRequest } from "./supabase.js";

export type PlanKey = "starter" | "growth" | "premium";
export const PLANS: Record<PlanKey, { label: string; learners: number; teachers: number | null; termFee: number; yearFee: number }> = {
  starter: { label: "Starter", learners: 150, teachers: 15, termFee: 155_000, yearFee: 410_000 },
  growth: { label: "Growth", learners: 500, teachers: null, termFee: 310_000, yearFee: 820_000 },
  premium: { label: "Premium", learners: 1000, teachers: null, termFee: 515_000, yearFee: 1_325_000 },
};
export const TRIAL_DAYS = 21;

export type BillingRow = { school_id: string; school_code: string | null; plan: PlanKey; cycle: string; status: string; trial_started_at: string | null; trial_ends_at: string | null; expires_at: string | null; note: string | null };

const cache = new Map<string, { at: number; row: BillingRow | null }>();
export const forgetBilling = (schoolId: string) => { cache.delete(schoolId); };

export async function getBilling(schoolId: string): Promise<BillingRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(schoolId)) return null;
  const hit = cache.get(schoolId);
  if (hit && Date.now() - hit.at < 8000) return hit.row;
  let row: BillingRow | null = null;
  try {
    row = (asRows(await supabaseAdminRequest(`/rest/v1/school_billing?school_id=eq.${encodeURIComponent(schoolId)}&select=*&limit=1`))[0] as BillingRow | undefined) ?? null;
  } catch { row = null; } // the table may not exist yet: no limits then
  cache.set(schoolId, { at: Date.now(), row });
  return row;
}

async function countRows(path: string, cap: number): Promise<number> {
  // Only "is it at the cap?" matters, so never read more rows than the cap.
  return asRows(await supabaseAdminRequest(`${path}&limit=${Math.max(1, cap)}`)).length;
}

/** A message when adding `adding` more learners to the term would pass the plan, otherwise null. */
export async function learnerLimitProblem(schoolId: string, termKey: string, adding = 1): Promise<string | null> {
  const billing = await getBilling(schoolId);
  if (!billing) return null;
  const plan = PLANS[billing.plan] ?? PLANS.starter;
  const count = await countRows(`/rest/v1/students?school_id=eq.${encodeURIComponent(schoolId)}&term_key=eq.${encodeURIComponent(termKey)}&select=id`, plan.learners);
  if (count + adding > plan.learners) {
    return `Your ${plan.label} plan allows up to ${plan.learners} learners and this term already has ${count}. Upgrade your plan to add more.`;
  }
  return null;
}

export async function teacherLimitProblem(schoolId: string): Promise<string | null> {
  const billing = await getBilling(schoolId);
  if (!billing) return null;
  const plan = PLANS[billing.plan] ?? PLANS.starter;
  if (plan.teachers === null) return null;
  const count = await countRows(`/rest/v1/allowed_users?school_id=eq.${encodeURIComponent(schoolId)}&role=eq.teacher&select=email`, plan.teachers);
  return count + 1 > plan.teachers ? `Your ${plan.label} plan allows up to ${plan.teachers} teachers. Upgrade your plan to add more.` : null;
}

export async function usageOf(schoolId: string, termKey: string) {
  const [learners, teachers] = await Promise.all([
    countRows(`/rest/v1/students?school_id=eq.${encodeURIComponent(schoolId)}&term_key=eq.${encodeURIComponent(termKey)}&select=id`, 1000),
    countRows(`/rest/v1/allowed_users?school_id=eq.${encodeURIComponent(schoolId)}&role=eq.teacher&select=email`, 1000),
  ]);
  return { learners, teachers };
}

/** A short permanent code from the school's name, such as MCS-001. */
export function schoolCodeFor(name: string, taken: Set<string>): string {
  const letters = name.split(/[^A-Za-z]+/).filter((w) => w && !/^(s\.?s|ss|the|of|and|school|secondary)$/i.test(w)).map((w) => w[0].toUpperCase()).join("").slice(0, 3).padEnd(3, "X");
  for (let n = 1; n < 1000; n += 1) {
    const code = `${letters}-${String(n).padStart(3, "0")}`;
    if (!taken.has(code)) return code;
  }
  return `${letters}-${Date.now() % 100000}`;
}
