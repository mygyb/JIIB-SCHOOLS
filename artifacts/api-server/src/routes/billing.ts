// Super administrator: assign each school a plan, see its usage against the limits, and set trial / paid-through dates.
import type { IRouter, Request, Response } from "express";
import { asRows, supabaseAdminRequest } from "../lib/supabase.js";
import { PLANS, TRIAL_DAYS, forgetBilling, schoolCodeFor, usageOf, type BillingRow, type PlanKey } from "../lib/billing.js";

type Row = Record<string, unknown>;
const enc = encodeURIComponent;
const isoOrNull = (value: unknown) => { const t = typeof value === "string" && value ? Date.parse(value) : NaN; return Number.isFinite(t) ? new Date(t).toISOString() : null; };

export function registerBillingRoutes(router: IRouter, deps: { authorizeSuperAdmin: (req: Request, res: Response) => Promise<unknown>; sendError: (res: Response, error: unknown) => void }) {
  router.get("/storage-admin/billing", async (req, res) => {
    try {
      if (!await deps.authorizeSuperAdmin(req, res)) return;
      const [schools, billing, configs] = await Promise.all([
        supabaseAdminRequest(`/rest/v1/schools?select=id,name,active&order=name.asc`),
        supabaseAdminRequest(`/rest/v1/school_billing?select=*`).catch(() => null),
        supabaseAdminRequest(`/rest/v1/school_data?select=school_id,data->>activeTerm`).catch(() => []),
      ]);
      const byId = new Map(asRows(billing ?? []).map((r) => [String(r.school_id), r as unknown as BillingRow]));
      const term = new Map(asRows(configs).map((r) => [String(r.school_id), String(r.activeTerm ?? "")]));
      const out = [];
      for (const school of asRows(schools)) {
        const id = String(school.id);
        const usage = await usageOf(id, term.get(id) ?? "").catch(() => ({ learners: 0, teachers: 0 }));
        out.push({ id, name: String(school.name), active: school.active !== false, billing: byId.get(id) ?? null, usage, termKey: term.get(id) ?? "" });
      }
      res.json({ ready: billing !== null, trialDays: TRIAL_DAYS, plans: PLANS, schools: out });
    } catch (error) { deps.sendError(res, error); }
  });

  router.put("/storage-admin/billing/:schoolId", async (req, res) => {
    try {
      if (!await deps.authorizeSuperAdmin(req, res)) return;
      const schoolId = String(req.params.schoolId);
      if (!/^[0-9a-f-]{36}$/i.test(schoolId)) { res.status(400).json({ error: "Choose a school." }); return; }
      const body = (req.body ?? {}) as Row;
      const plan = String(body.plan ?? "starter") as PlanKey;
      if (!(plan in PLANS)) { res.status(400).json({ error: "Unknown plan." }); return; }
      const cycle = body.cycle === "yearly" ? "yearly" : "termly";
      const status = ["trial", "active", "overdue", "read_only", "suspended"].includes(String(body.status)) ? String(body.status) : "trial";
      const school = asRows(await supabaseAdminRequest(`/rest/v1/schools?id=eq.${enc(schoolId)}&select=name&limit=1`))[0];
      if (!school) { res.status(404).json({ error: "School not found." }); return; }
      const existing = asRows(await supabaseAdminRequest(`/rest/v1/school_billing?school_id=eq.${enc(schoolId)}&select=*&limit=1`))[0] as unknown as BillingRow | undefined;
      let code = existing?.school_code ?? null;
      if (!code) {
        const taken = new Set(asRows(await supabaseAdminRequest(`/rest/v1/school_billing?select=school_code`)).map((r) => String(r.school_code ?? "")));
        code = schoolCodeFor(String(school.name), taken);
      }
      const now = new Date();
      const trialStarted = existing?.trial_started_at ?? (status === "trial" ? now.toISOString() : null);
      const trialEnds = body.trialEndsAt !== undefined ? isoOrNull(body.trialEndsAt)
        : existing?.trial_ends_at ?? (status === "trial" ? new Date(now.getTime() + TRIAL_DAYS * 86_400_000).toISOString() : null);
      const row = {
        school_id: schoolId, school_code: code, plan, cycle, status,
        trial_started_at: trialStarted, trial_ends_at: trialEnds,
        expires_at: body.expiresAt !== undefined ? isoOrNull(body.expiresAt) : existing?.expires_at ?? null,
        note: typeof body.note === "string" ? body.note.slice(0, 500) : existing?.note ?? null,
        updated_at: now.toISOString(),
      };
      const saved = asRows(await supabaseAdminRequest(`/rest/v1/school_billing?on_conflict=school_id`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(row) }))[0];
      forgetBilling(schoolId);
      res.json(saved);
    } catch (error) { deps.sendError(res, error); }
  });
}
