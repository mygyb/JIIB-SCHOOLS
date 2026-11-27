// Plans and the limits that follow from them. A school with no billing row is not limited (existing schools until a plan is assigned).
import { asRows, supabaseAdminRequest } from "./supabase.js";

export type PlanKey = "starter" | "growth" | "premium";
export const PLANS: Record<PlanKey, { label: string; learners: number; teachers: number | null; termFee: number; yearFee: number }> = {
  starter: { label: "Starter", learners: 150, teachers: 15, termFee: 155_000, yearFee: 410_000 },
  growth: { label: "Growth", learners: 500, teachers: null, termFee: 310_000, yearFee: 820_000 },
  premium: { label: "Premium", learners: 1000, teachers: null, termFee: 515_000, yearFee: 1_325_000 },
};
export const TRIAL_DAYS = 21;

export type BillingRow = { school_id: string; school_code: string | null; contact_phone?: string | null; plan: PlanKey; cycle: string; status: string; trial_started_at: string | null; trial_ends_at: string | null; expires_at: string | null; note: string | null };

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


// ---- What a school may do right now ------------------------------------------------------------------------------
export const GRACE_DAYS = 21;
export type Access = {
  state: "none" | "trial" | "trial_ended" | "paid" | "invoice_due" | "overdue" | "read_only";
  locked: boolean; expiresAt: string | null; trialEndsAt: string | null; dueAt: string | null; daysLeft: number | null; invoiceNo: string | null;
};
const accessCache = new Map<string, { at: number; value: Access }>();
export const forgetAccess = (schoolId: string) => { accessCache.delete(schoolId); };
const daysUntil = (iso: string | null) => (iso ? Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000) : null);

export async function accessOf(schoolId: string): Promise<Access> {
  const hit = accessCache.get(schoolId);
  if (hit && Date.now() - hit.at < 8000) return hit.value;
  const none: Access = { state: "none", locked: false, expiresAt: null, trialEndsAt: null, dueAt: null, daysLeft: null, invoiceNo: null };
  const billing = await getBilling(schoolId);
  let value = none;
  if (billing) {
    let unpaid: { due_at: string | null; invoice_no: string | null } | undefined;
    try {
      unpaid = asRows(await supabaseAdminRequest(`/rest/v1/billing_invoices?school_id=eq.${encodeURIComponent(schoolId)}&status=eq.unpaid&select=due_at,invoice_no&order=due_at.asc&limit=1`))[0] as typeof unpaid;
    } catch { unpaid = undefined; }
    const base = { expiresAt: billing.expires_at, trialEndsAt: billing.trial_ends_at, dueAt: unpaid?.due_at ?? null, invoiceNo: unpaid?.invoice_no ?? null };
    const trialOver = billing.status === "trial" && !!billing.trial_ends_at && Date.parse(billing.trial_ends_at) < Date.now();
    if (billing.status === "read_only" || billing.status === "suspended") value = { ...base, state: "read_only", locked: true, daysLeft: null };
    else if (unpaid?.due_at && Date.parse(unpaid.due_at) < Date.now()) value = { ...base, state: "overdue", locked: true, daysLeft: daysUntil(unpaid.due_at) };
    else if (trialOver) value = { ...base, state: "trial_ended", locked: true, daysLeft: 0 };
    else if (unpaid) value = { ...base, state: "invoice_due", locked: false, daysLeft: daysUntil(unpaid.due_at) };
    else if (billing.status === "trial") value = { ...base, state: "trial", locked: false, daysLeft: daysUntil(billing.trial_ends_at) };
    else value = { ...base, state: "paid", locked: false, daysLeft: daysUntil(billing.expires_at) };
  }
  accessCache.set(schoolId, { at: Date.now(), value });
  return value;
}

export type Payee = { bankName: string; accountName: string; accountNumber: string; mtnNumber: string; mtnName: string; airtelNumber: string; airtelName: string; whatsapp: string; note: string };
export const DEFAULT_PAYEE: Payee = { bankName: "", accountName: "", accountNumber: "", mtnNumber: "", mtnName: "", airtelNumber: "", airtelName: "", whatsapp: "256762971094", note: "" };

/** Term dates the system administrator sets when opening a term: { "2027-T1": { start, end } }. */
export type Calendar = Record<string, { start: string; end: string }>;
export async function getCalendar(): Promise<Calendar> {
  try {
    const row = asRows(await supabaseAdminRequest(`/rest/v1/billing_settings?key=eq.calendar&select=value&limit=1`))[0];
    return (row?.value as Calendar | undefined) ?? {};
  } catch { return {}; }
}
const TERM_DAYS = 91, HOLIDAY_DAYS = 28;
/**
 * The day a payment runs to. A term payment runs to the end of that term; a yearly payment to the end of Term 3 of that year.
 * Where the dates were never entered, a term is 13 weeks from the day it opened and the holidays are 4 weeks.
 */
export function coverageEnd(calendar: Calendar, termKey: string, cycle: string, now = Date.now()): string {
  const m = termKey.match(/^(\d{4})-T([1-3])$/);
  const year = m?.[1] ?? String(new Date(now).getFullYear());
  const n = Number(m?.[2] ?? 1);
  const endOf = (key: string, fallbackStart: number) => { const e = calendar[key]?.end; return e && Number.isFinite(Date.parse(e)) ? Date.parse(e) : fallbackStart + TERM_DAYS * 86_400_000; };
  const startOf = (key: string, fallback: number) => { const st = calendar[key]?.start; return st && Number.isFinite(Date.parse(st)) ? Date.parse(st) : fallback; };
  const thisStart = startOf(termKey, now);
  const thisEnd = endOf(termKey, thisStart);
  let end = thisEnd;
  if (cycle === "yearly") {
    let cursorEnd = thisEnd;
    for (let t = n + 1; t <= 3; t += 1) {
      const key = `${year}-T${t}`;
      const start = startOf(key, cursorEnd + HOLIDAY_DAYS * 86_400_000);
      cursorEnd = endOf(key, start);
    }
    end = cursorEnd;
  }
  const d = new Date(end); d.setUTCHours(23, 59, 59, 0);
  return d.toISOString();
}
export async function getPayee(): Promise<Payee> {
  try {
    const row = asRows(await supabaseAdminRequest(`/rest/v1/billing_settings?key=eq.payee&select=value&limit=1`))[0];
    return { ...DEFAULT_PAYEE, ...((row?.value as Partial<Payee> | undefined) ?? {}) };
  } catch { return DEFAULT_PAYEE; }
}
