// Billing: plans, school registration, term opening, invoices, payment submissions and approvals.
import { randomUUID } from "node:crypto";
import type { IRouter, Request, Response } from "express";
import { asRows, createSupabaseAuthUser, supabaseAdminRequest } from "../lib/supabase.js";
import { clientIp, tooManyAttempts } from "../lib/hq.js";
import { emailShell, escapeHtml, sendEmail } from "../lib/mailer.js";
import { DEFAULT_PAYEE, GRACE_DAYS, PLANS, coverageEnd, getCalendar, TRIAL_DAYS, accessOf, forgetAccess, forgetBilling, getBilling, getPayee, schoolCodeFor, usageOf, type BillingRow, type PlanKey } from "../lib/billing.js";
import { egoSend, normalizePhone } from "./sms.js";
import { pruneOldTerms } from "./cleanup.js";

type Row = Record<string, unknown>;
const enc = encodeURIComponent;
const text = (value: unknown) => String(value ?? "").trim();
const isoOrNull = (value: unknown) => { const t = typeof value === "string" && value ? Date.parse(value) : NaN; return Number.isFinite(t) ? new Date(t).toISOString() : null; };
const ugx = (n: number) => `UGX ${Math.round(n).toLocaleString("en-US")}`;
const dateText = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Kampala" }) : "");
const termLabelOf = (key: string) => { const m = key.match(/^(\d{4})-T([1-3])$/); return m ? `Term ${m[2]} — ${m[1]}` : key; };
const BILLING_ROLES = new Set(["admin", "headteacher", "bursar", "super_admin"]);

/** Who hears about billing at a school: the admin, head teacher and bursar e-mails, and the registered phone for SMS. */
async function contactsOf(schoolId: string) {
  const users = asRows(await supabaseAdminRequest(`/rest/v1/allowed_users?school_id=eq.${enc(schoolId)}&role=in.(admin,headteacher,bursar)&select=email,role`).catch(() => []));
  const billing = await getBilling(schoolId);
  return { emails: users.map((u) => text(u.email)).filter(Boolean), phone: normalizePhone(billing?.contact_phone) };
}
async function notifySchool(schoolId: string, message: { subject: string; title: string; html: string; sms?: string }) {
  const contacts = await contactsOf(schoolId);
  const email = contacts.emails.length ? await sendEmail(contacts.emails, message.subject, emailShell(message.title, message.html)) : { ok: false, error: "No e-mail addresses." };
  let sms: { ok: boolean; error?: string } = { ok: false, error: "No SMS sent." };
  if (message.sms && contacts.phone) sms = await egoSend([{ number: contacts.phone, message: message.sms }]);
  return { email, sms };
}
const payeeHtml = (p: typeof DEFAULT_PAYEE) => `<table style="border-collapse:collapse;font-size:14px;margin:8px 0">${p.bankName ? `<tr><td style="padding:3px 12px 3px 0;color:#6b7280">Bank</td><td><b>${escapeHtml(p.bankName)}</b> · ${escapeHtml(p.accountName)} · ${escapeHtml(p.accountNumber)}</td></tr>` : ""}${p.mtnNumber ? `<tr><td style="padding:3px 12px 3px 0;color:#6b7280">MTN MoMo</td><td><b>${escapeHtml(p.mtnNumber)}</b> ${escapeHtml(p.mtnName)}</td></tr>` : ""}${p.airtelNumber ? `<tr><td style="padding:3px 12px 3px 0;color:#6b7280">Airtel Money</td><td><b>${escapeHtml(p.airtelNumber)}</b> ${escapeHtml(p.airtelName)}</td></tr>` : ""}</table>`;
const payeeSms = (p: typeof DEFAULT_PAYEE) => [p.bankName && `Bank: ${p.bankName} ${p.accountName} ${p.accountNumber}`, p.mtnNumber && `MTN: ${p.mtnNumber} ${p.mtnName}`, p.airtelNumber && `Airtel: ${p.airtelNumber} ${p.airtelName}`].filter(Boolean).join(". ");

/** The next term after the given one, in the same pattern the term pages already use (Term 3 is followed by Term 1 of the next year). */
function nextTermKey(activeKey: string) {
  const m = activeKey.match(/(20\d{2}).*?(?:T|term\s*)([1-3])\s*$/i);
  const year = Number(m?.[1] ?? new Date().getFullYear());
  const n = Number(m?.[2] ?? 0);
  return n >= 3 ? `${year + 1}-T1` : `${year}-T${n + 1}`;
}

async function provisionSchool(input: { name: string; adminName: string; email: string; phone: string; address: string; termKey: string }) {
  // Short letters-and-digits code like the existing schools use (e.g. "mucoss"): first word plus the initials of the rest.
  const words = input.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  let baseSlug = ((words[0] ?? "") + words.slice(1).map((w) => w[0]).join("")).slice(0, 10);
  if (baseSlug.length < 3) baseSlug = `${baseSlug}sch`.slice(0, 10);
  let slug = baseSlug;
  for (let n = 2; asRows(await supabaseAdminRequest(`/rest/v1/schools?slug=eq.${enc(slug)}&select=id&limit=1`)).length; n += 1) slug = `${baseSlug}${n}`;
  const school = asRows(await supabaseAdminRequest(`/rest/v1/schools?select=*`, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ name: input.name, slug, active: true }) }))[0];
  if (!school) throw new Error("The school record was not created.");
  const schoolId = String(school.id);
  const fields = [{ name: "AOI", field: "c1", max: 10 }, { name: "Midterm", field: "c2", max: 10 }, { name: "End of Term", field: "c3", max: 80 }];
  const config = {
    activeTerm: input.termKey, subjects: {},
    terms: { [input.termKey]: { label: termLabelOf(input.termKey), students: [], marks: [], locked: false, status: "open" } },
    settings: { address: input.address, houses: [], marksSchema: fields, activeMarkColumns: fields.map((f) => f.field) },
  };
  await supabaseAdminRequest(`/rest/v1/school_data?on_conflict=school_id`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ school_id: schoolId, data: config, updated_at: new Date().toISOString(), updated_by: "registration" }) });
  await supabaseAdminRequest(`/rest/v1/allowed_users?on_conflict=school_id,email`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ school_id: schoolId, email: input.email, display_name: input.adminName, role: "admin", subjects: [] }) });
  const taken = new Set(asRows(await supabaseAdminRequest(`/rest/v1/school_billing?select=school_code`).catch(() => [])).map((r) => text(r.school_code)));
  const code = schoolCodeFor(input.name, taken);
  const now = Date.now();
  await supabaseAdminRequest(`/rest/v1/school_billing?on_conflict=school_id`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({
    school_id: schoolId, school_code: code, plan: "starter", cycle: "termly", status: "trial", contact_phone: normalizePhone(input.phone) ?? input.phone,
    trial_started_at: new Date(now).toISOString(), trial_ends_at: new Date(now + TRIAL_DAYS * 86_400_000).toISOString(), updated_at: new Date(now).toISOString(),
  }) });
  return { schoolId, slug, code };
}

/** Closes the active term and opens the given one for one school. Mirrors what closing a term has always done, but only the system administrator triggers it. */
async function openTermFor(schoolId: string, termKey: string | null): Promise<{ opened: string } | { skipped: string }> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const row = asRows(await supabaseAdminRequest(`/rest/v1/school_data?school_id=eq.${enc(schoolId)}&select=data,updated_at&limit=1`))[0];
    if (!row) return { skipped: "no settings" };
    const data = (row.data && typeof row.data === "object" ? row.data : {}) as Row;
    const terms = (data.terms && typeof data.terms === "object" ? { ...(data.terms as Record<string, Row>) } : {}) as Record<string, Row>;
    const active = text(data.activeTerm);
    const key = termKey ?? nextTermKey(active);
    if (key === active) return { skipped: "already open" };
    if (active && terms[active]) terms[active] = { ...terms[active], locked: true, status: "closed", closedDate: new Date().toISOString() };
    terms[key] = terms[key] ? { ...terms[key], locked: false, status: "open", closedDate: null } : { label: termLabelOf(key), students: [], marks: [], locked: false, status: "open", closedDate: null, createdDate: new Date().toISOString() };
    const done = asRows(await supabaseAdminRequest(`/rest/v1/school_data?school_id=eq.${enc(schoolId)}&updated_at=eq.${enc(text(row.updated_at))}&select=updated_at`, {
      method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ data: { ...data, activeTerm: key, terms }, updated_at: new Date().toISOString() }),
    }));
    if (done[0]) { await pruneOldTerms(schoolId, key); return { opened: key }; }
  }
  return { skipped: "settings were changing" };
}

async function issueInvoice(billing: BillingRow, termKey: string, startDate: string | null) {
  const plan = PLANS[billing.plan] ?? PLANS.starter;
  const n = termKey.match(/T([1-3])$/)?.[1] ?? "1";
  if (billing.cycle === "yearly" && n !== "1") return null;
  const exists = asRows(await supabaseAdminRequest(`/rest/v1/billing_invoices?school_id=eq.${enc(billing.school_id)}&term_key=eq.${enc(termKey)}&select=id&limit=1`));
  if (exists.length) return null;
  const cfg = asRows(await supabaseAdminRequest(`/rest/v1/school_data?school_id=eq.${enc(billing.school_id)}&select=activeTerm:data->>activeTerm&limit=1`).catch(() => []))[0];
  const term = await usageOf(billing.school_id, text(cfg?.activeTerm)).catch(() => ({ learners: 0, teachers: 0 }));
  let number = `${billing.school_code ?? "SCH"}-T${n}`;
  if (asRows(await supabaseAdminRequest(`/rest/v1/billing_invoices?invoice_no=eq.${enc(number)}&select=id&limit=1`)).length) number = `${billing.school_code ?? "SCH"}-${termKey.slice(2, 4)}-T${n}`;
  const start = startDate ? Date.parse(startDate) : Date.now();
  const invoice = {
    id: randomUUID(), school_id: billing.school_id, invoice_no: number, term_key: termKey, plan: billing.plan, cycle: billing.cycle,
    amount: billing.cycle === "yearly" ? plan.yearFee : plan.termFee, learners_snapshot: term.learners, status: "unpaid",
    issued_at: new Date().toISOString(), due_at: new Date(start + GRACE_DAYS * 86_400_000).toISOString(), paid_amount: 0,
  };
  await supabaseAdminRequest(`/rest/v1/billing_invoices`, { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(invoice) });
  return invoice;
}

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

  // ---------------- public: a school registers itself (waits for approval) ----------------
  router.post("/public/register-school", async (req, res) => {
    try {
      if (tooManyAttempts(`register:${clientIp(req)}`, 5, 3_600_000)) { res.status(429).json({ error: "Too many attempts. Please try again later." }); return; }
      const b = (req.body ?? {}) as Row;
      const schoolName = text(b.schoolName).slice(0, 120), adminName = text(b.adminName).slice(0, 80), email = text(b.email).toLowerCase(), phone = text(b.phone), address = text(b.address).slice(0, 160), password = String(b.password ?? "");
      if (schoolName.length < 3 || adminName.length < 2) { res.status(400).json({ error: "Enter the school name and your name." }); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { res.status(400).json({ error: "Enter a valid e-mail address." }); return; }
      if (!normalizePhone(phone)) { res.status(400).json({ error: "Enter a valid phone number, like 0772 123456." }); return; }
      if (password.length < 8) { res.status(400).json({ error: "The password must have at least 8 characters." }); return; }
      const dup = asRows(await supabaseAdminRequest(`/rest/v1/school_registrations?email=eq.${enc(email)}&status=eq.pending&select=id&limit=1`));
      if (dup.length) { res.status(409).json({ error: "A registration for this e-mail is already waiting for approval." }); return; }
      let userId = "";
      try { userId = (await createSupabaseAuthUser(email, password, adminName)).id; }
      catch (error) { const m = error instanceof Error ? error.message : ""; res.status(409).json({ error: /already|registered|exists/i.test(m) ? "An account with this e-mail already exists. Log in, or use another e-mail." : "The account could not be created. Please try again." }); return; }
      await supabaseAdminRequest(`/rest/v1/school_registrations`, { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ school_name: schoolName, admin_name: adminName, email, phone, address, auth_user_id: userId, status: "pending" }) });
      res.status(201).json({ ok: true });
    } catch (error) { deps.sendError(res, error); }
  });

  // ---------------- super admin: registrations ----------------
  router.get("/storage-admin/registrations", async (req, res) => {
    try {
      if (!await deps.authorizeSuperAdmin(req, res)) return;
      const rows = asRows(await supabaseAdminRequest(`/rest/v1/school_registrations?select=id,school_name,admin_name,email,phone,address,status,created_at,note,school_id&order=created_at.desc&limit=100`).catch(() => []));
      res.json({ registrations: rows });
    } catch (error) { deps.sendError(res, error); }
  });
  router.post("/storage-admin/registrations/:id/approve", async (req, res) => {
    try {
      if (!await deps.authorizeSuperAdmin(req, res)) return;
      const reg = asRows(await supabaseAdminRequest(`/rest/v1/school_registrations?id=eq.${enc(String(req.params.id))}&select=*&limit=1`))[0];
      if (!reg || reg.status !== "pending") { res.status(409).json({ error: "This registration is not waiting for approval." }); return; }
      // New schools join the term the other schools are in.
      const terms = asRows(await supabaseAdminRequest(`/rest/v1/school_data?select=activeTerm:data->>activeTerm`).catch(() => [])).map((r) => text(r.activeTerm)).filter(Boolean);
      const tally = new Map<string, number>(); terms.forEach((t) => tally.set(t, (tally.get(t) ?? 0) + 1));
      const termKey = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? `${new Date().getFullYear()}-T1`;
      const made = await provisionSchool({ name: text(reg.school_name), adminName: text(reg.admin_name), email: text(reg.email), phone: text(reg.phone), address: text(reg.address), termKey });
      await supabaseAdminRequest(`/rest/v1/school_registrations?id=eq.${enc(String(reg.id))}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "approved", school_id: made.schoolId, decided_at: new Date().toISOString() }) });
      forgetBilling(made.schoolId);
      const payee = await getPayee();
      const site = process.env.PUBLIC_SITE_URL ?? "https://j-schools-ug.vercel.app";
      const html = `<p>Welcome, ${escapeHtml(text(reg.admin_name))}! <b>${escapeHtml(text(reg.school_name))}</b> is now approved on J-SCHOOLS.</p><p>Log in at <a href="${site}">${site}</a> with the e-mail and password you registered with, and search for your school by name.</p><p><b>Your free ${TRIAL_DAYS} days have started.</b> After that, a term subscription keeps your portal open.</p><p><b>How to pay:</b> open <i>Billing</i> in your portal, choose your plan, and you get a payment reference starting with your school code <b>${made.code}</b>. Pay with that reference, then press <i>Submit payment</i> with the transaction ID.</p>${payeeHtml(payee)}`;
      const email = await sendEmail([text(reg.email)], "Welcome to J-SCHOOLS: your school is approved", emailShell("Your school is approved", html));
      const phone = normalizePhone(reg.phone);
      const sms = phone ? await egoSend([{ number: phone, message: `Welcome to J-SCHOOLS! ${text(reg.school_name)} is approved. Your free ${TRIAL_DAYS} days have started. To pay later open Billing, pick a plan and use the reference it gives (starts with ${made.code}). ${payeeSms(payee)}`.slice(0, 300) }]) : { ok: false, error: "No phone." };
      res.json({ ...made, email, sms });
    } catch (error) { deps.sendError(res, error); }
  });
  router.post("/storage-admin/registrations/:id/reject", async (req, res) => {
    try {
      if (!await deps.authorizeSuperAdmin(req, res)) return;
      const reg = asRows(await supabaseAdminRequest(`/rest/v1/school_registrations?id=eq.${enc(String(req.params.id))}&select=*&limit=1`))[0];
      if (!reg || reg.status !== "pending") { res.status(409).json({ error: "This registration is not waiting for approval." }); return; }
      if (reg.auth_user_id) await supabaseAdminRequest(`/auth/v1/admin/users/${enc(text(reg.auth_user_id))}`, { method: "DELETE" }).catch(() => undefined);
      await supabaseAdminRequest(`/rest/v1/school_registrations?id=eq.${enc(String(reg.id))}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "rejected", note: text((req.body as Row)?.note).slice(0, 300), decided_at: new Date().toISOString() }) });
      res.json({ ok: true });
    } catch (error) { deps.sendError(res, error); }
  });

  // ---------------- super admin: terms are opened centrally ----------------
  router.get("/storage-admin/terms", async (req, res) => {
    try {
      if (!await deps.authorizeSuperAdmin(req, res)) return;
      const [schools, configs] = await Promise.all([
        supabaseAdminRequest(`/rest/v1/schools?select=id,name&order=name.asc`),
        supabaseAdminRequest(`/rest/v1/school_data?select=school_id,activeTerm:data->>activeTerm`),
      ]);
      const term = new Map(asRows(configs).map((r) => [text(r.school_id), text(r.activeTerm)]));
      const list = asRows(schools).map((s) => ({ id: text(s.id), name: text(s.name), activeTerm: term.get(text(s.id)) ?? "" }));
      const common = list[0] ? nextTermKey([...list].map((s) => s.activeTerm).sort((a, b) => b.localeCompare(a))[0] ?? "") : `${new Date().getFullYear()}-T1`;
      res.json({ schools: list, suggested: common });
    } catch (error) { deps.sendError(res, error); }
  });
  router.post("/storage-admin/open-term", async (req, res) => {
    try {
      if (!await deps.authorizeSuperAdmin(req, res)) return;
      const b = (req.body ?? {}) as Row;
      const termKey = text(b.termKey);
      if (!/^\d{4}-T[1-3]$/.test(termKey)) { res.status(400).json({ error: "Use a term like 2027-T1." }); return; }
      const ids = Array.isArray(b.schoolIds) ? (b.schoolIds as unknown[]).map(text).filter((id) => /^[0-9a-f-]{36}$/i.test(id)) : [];
      if (!ids.length) { res.status(400).json({ error: "Choose at least one school." }); return; }
      const start = isoOrNull(b.startDate) ?? new Date().toISOString();
      const end = isoOrNull(b.endDate) ?? new Date(Date.parse(start) + 91 * 86_400_000).toISOString();
      if (Date.parse(end) <= Date.parse(start)) { res.status(400).json({ error: "The term must end after it starts." }); return; }
      const calendar = await getCalendar();
      calendar[termKey] = { start, end };
      await supabaseAdminRequest(`/rest/v1/billing_settings?on_conflict=key`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ key: "calendar", value: calendar }) });
      const results: Array<{ schoolId: string; result: string }> = [];
      for (const id of ids) {
        try { const r = await openTermFor(id, termKey); results.push({ schoolId: id, result: "opened" in r ? `opened ${r.opened}` : `skipped: ${r.skipped}` }); }
        catch (error) { results.push({ schoolId: id, result: `failed: ${error instanceof Error ? error.message.slice(0, 80) : "error"}` }); }
      }
      res.json({ results });
    } catch (error) { deps.sendError(res, error); }
  });

  // ---------------- super admin: invoices ----------------
  router.post("/storage-admin/invoices/issue", async (req, res) => {
    try {
      if (!await deps.authorizeSuperAdmin(req, res)) return;
      const b = (req.body ?? {}) as Row;
      const termKey = text(b.termKey);
      if (!/^\d{4}-T[1-3]$/.test(termKey)) { res.status(400).json({ error: "Use a term like 2027-T1." }); return; }
      const startDate = isoOrNull(b.startDate);
      if (!startDate) { res.status(400).json({ error: "Enter the date the term starts." }); return; }
      const rows = asRows(await supabaseAdminRequest(`/rest/v1/school_billing?select=*&status=neq.suspended`)) as unknown as BillingRow[];
      const payee = await getPayee();
      const out: Array<{ school: string; invoice: string; sent: boolean }> = [];
      for (const billing of rows) {
        const invoice = await issueInvoice(billing, termKey, startDate);
        if (!invoice) continue;
        forgetAccess(billing.school_id);
        const due = dateText(String(invoice.due_at));
        const html = `<p>Your J-SCHOOLS subscription invoice for <b>${termLabelOf(termKey)}</b> is ready.</p><p>Invoice <b>${invoice.invoice_no}</b> · ${PLANS[billing.plan].label} plan · <b>${ugx(Number(invoice.amount))}</b> · due <b>${due}</b> (21 days after the term starts).</p><p>Pay to the account below and use <b>${invoice.invoice_no}</b> as the reason or reference. Then open <i>Billing</i> in your portal and press <i>Submit payment</i>.</p>${payeeHtml(payee)}`;
        const sent = await notifySchool(billing.school_id, { subject: `Invoice ${invoice.invoice_no}: ${termLabelOf(termKey)}`, title: "Your invoice is ready", html, sms: `J-SCHOOLS invoice ${invoice.invoice_no}: ${ugx(Number(invoice.amount))} for ${termLabelOf(termKey)}, due ${due}. Use ${invoice.invoice_no} as reference. ${payeeSms(payee)}`.slice(0, 300) });
        out.push({ school: billing.school_code ?? billing.school_id, invoice: String(invoice.invoice_no), sent: sent.email.ok || sent.sms.ok });
      }
      res.json({ issued: out });
    } catch (error) { deps.sendError(res, error); }
  });
  router.get("/storage-admin/invoices", async (req, res) => {
    try {
      if (!await deps.authorizeSuperAdmin(req, res)) return;
      const rows = asRows(await supabaseAdminRequest(`/rest/v1/billing_invoices?select=*&order=issued_at.desc&limit=200`).catch(() => []));
      res.json({ invoices: rows });
    } catch (error) { deps.sendError(res, error); }
  });
  router.put("/storage-admin/invoices/:id", async (req, res) => {
    try {
      if (!await deps.authorizeSuperAdmin(req, res)) return;
      const b = (req.body ?? {}) as Row;
      const patch: Row = {};
      if (b.dueAt) { const due = isoOrNull(b.dueAt); if (due) patch.due_at = due; }
      if (b.status === "void") patch.status = "void";
      const row = asRows(await supabaseAdminRequest(`/rest/v1/billing_invoices?id=eq.${enc(String(req.params.id))}&select=school_id`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) }))[0];
      if (row) forgetAccess(text(row.school_id));
      res.json({ ok: true });
    } catch (error) { deps.sendError(res, error); }
  });

  // ---------------- super admin: payment approvals ----------------
  router.get("/storage-admin/payments", async (req, res) => {
    try {
      if (!await deps.authorizeSuperAdmin(req, res)) return;
      const status = ["pending", "approved", "rejected"].includes(String(req.query.status)) ? String(req.query.status) : "pending";
      const rows = asRows(await supabaseAdminRequest(`/rest/v1/billing_payments?status=eq.${status}&select=*&order=submitted_at.desc&limit=100`).catch(() => []));
      const schools = new Map(asRows(await supabaseAdminRequest(`/rest/v1/school_billing?select=school_id,school_code`).catch(() => [])).map((r) => [text(r.school_id), text(r.school_code)]));
      const names = new Map(asRows(await supabaseAdminRequest(`/rest/v1/schools?select=id,name`).catch(() => [])).map((r) => [text(r.id), text(r.name)]));
      const invs = new Map(asRows(await supabaseAdminRequest(`/rest/v1/billing_invoices?select=id,invoice_no`).catch(() => [])).map((r) => [text(r.id), text(r.invoice_no)]));
      res.json({ payments: rows.map((p) => ({ ...p, invoice_no: invs.get(text(p.invoice_id)) ?? null, school_name: names.get(text(p.school_id)) ?? "", school_code: schools.get(text(p.school_id)) ?? "" })) });
    } catch (error) { deps.sendError(res, error); }
  });
  router.post("/storage-admin/payments/:id/approve", async (req, res) => {
    try {
      if (!await deps.authorizeSuperAdmin(req, res)) return;
      const b = (req.body ?? {}) as Row;
      const pay = asRows(await supabaseAdminRequest(`/rest/v1/billing_payments?id=eq.${enc(String(req.params.id))}&select=*&limit=1`))[0];
      if (!pay || pay.status !== "pending") { res.status(409).json({ error: "This payment is not waiting for approval." }); return; }
      const schoolId = text(pay.school_id);
      const amount = Number(b.amount ?? pay.amount) || 0;
      if (!amount) { res.status(400).json({ error: "Enter the confirmed amount." }); return; }
      const receiptNo = `RC-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${randomUUID().slice(0, 4).toUpperCase()}`;
      let invoiceNo = "";
      let expiresAt: string | null = isoOrNull(b.expiresAt);
      let fullyPaid = !pay.invoice_id;
      let plan: string | null = null, cycle: string | null = null;
      if (pay.invoice_id) {
        const inv = asRows(await supabaseAdminRequest(`/rest/v1/billing_invoices?id=eq.${enc(text(pay.invoice_id))}&select=*&limit=1`))[0];
        if (inv) {
          const paid = Number(inv.paid_amount ?? 0) + amount;
          invoiceNo = text(inv.invoice_no);
          fullyPaid = paid >= Number(inv.amount);
          plan = text(inv.plan); cycle = text(inv.cycle) === "yearly" ? "yearly" : "termly";
          // The run-to date comes from the term dates (set when the term was opened), never typed in by hand.
          if (fullyPaid && !expiresAt) expiresAt = coverageEnd(await getCalendar(), text(inv.term_key), cycle);
          await supabaseAdminRequest(`/rest/v1/billing_invoices?id=eq.${enc(text(inv.id))}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ paid_amount: paid, status: fullyPaid ? "paid" : "unpaid", paid_at: fullyPaid ? new Date().toISOString() : null }) });
        } else fullyPaid = true;
      }
      if (fullyPaid && !expiresAt) { res.status(400).json({ error: "This payment has no invoice, so enter the date the subscription runs to." }); return; }
      await supabaseAdminRequest(`/rest/v1/billing_payments?id=eq.${enc(text(pay.id))}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "approved", amount, receipt_no: receiptNo, decided_at: new Date().toISOString(), note: text(b.note).slice(0, 300) || null }) });
      if (fullyPaid && expiresAt) {
        await supabaseAdminRequest(`/rest/v1/school_billing?school_id=eq.${enc(schoolId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "active", expires_at: expiresAt, ...(plan ? { plan, cycle } : {}), updated_at: new Date().toISOString() }) });
      }
      forgetBilling(schoolId); forgetAccess(schoolId);
      const site = process.env.PUBLIC_SITE_URL ?? "https://j-schools-ug.vercel.app";
      const runs = fullyPaid && expiresAt ? `Your subscription runs until <b>${dateText(expiresAt)}</b>.` : "This is a part payment: the invoice still has a balance, so the subscription has not been extended yet.";
      const html = `<p>We have received your payment of <b>${ugx(amount)}</b>. Thank you!</p><p>Receipt <b>${receiptNo}</b>${invoiceNo ? ` for invoice ${invoiceNo}` : ""}. ${runs}</p><p>Download the receipt any time from <i>Billing</i> in your portal: <a href="${site}">${site}</a>.</p>`;
      const sent = await notifySchool(schoolId, { subject: `Payment received: receipt ${receiptNo}`, title: "Payment received", html, sms: `J-SCHOOLS: payment of ${ugx(amount)} received. Receipt ${receiptNo}. ${fullyPaid && expiresAt ? `Subscription runs until ${dateText(expiresAt)}.` : "Part payment: balance remains."} Thank you.` });
      res.json({ receiptNo, expiresAt: fullyPaid ? expiresAt : null, ...sent });
    } catch (error) { deps.sendError(res, error); }
  });
  router.post("/storage-admin/payments/:id/reject", async (req, res) => {
    try {
      if (!await deps.authorizeSuperAdmin(req, res)) return;
      const note = text((req.body as Row)?.note).slice(0, 300);
      const pay = asRows(await supabaseAdminRequest(`/rest/v1/billing_payments?id=eq.${enc(String(req.params.id))}&status=eq.pending&select=school_id`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status: "rejected", note: note || null, decided_at: new Date().toISOString() }) }))[0];
      if (!pay) { res.status(409).json({ error: "This payment is not waiting for approval." }); return; }
      await notifySchool(text(pay.school_id), { subject: "Payment could not be confirmed", title: "Payment not confirmed", html: `<p>We could not confirm the payment you submitted${note ? `: ${escapeHtml(note)}` : ""}.</p><p>Please check the transaction ID and amount and submit it again from <i>Billing</i>, or contact us on WhatsApp.</p>` });
      res.json({ ok: true });
    } catch (error) { deps.sendError(res, error); }
  });
  router.get("/storage-admin/billing-settings", async (req, res) => {
    try { if (!await deps.authorizeSuperAdmin(req, res)) return; res.json(await getPayee()); } catch (error) { deps.sendError(res, error); }
  });
  router.put("/storage-admin/billing-settings", async (req, res) => {
    try {
      if (!await deps.authorizeSuperAdmin(req, res)) return;
      const b = (req.body ?? {}) as Row;
      const value = Object.fromEntries(Object.keys(DEFAULT_PAYEE).map((k) => [k, text(b[k]).slice(0, 200)]));
      await supabaseAdminRequest(`/rest/v1/billing_settings?on_conflict=key`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ key: "payee", value }) });
      res.json(value);
    } catch (error) { deps.sendError(res, error); }
  });

  // ---------------- a school: its own billing ----------------
  const staffOnly = (res: Response) => { if (!BILLING_ROLES.has(String(res.locals.jiibRole))) { res.status(403).json({ error: "Billing is for the school administrator, head teacher and bursar." }); return false; } return true; };
  router.get("/schools/:schoolId/billing/status", async (req, res) => {
    try {
      const access = await accessOf(String(req.params.schoolId));
      const privileged = BILLING_ROLES.has(String(res.locals.jiibRole));
      res.json({ state: access.state, locked: access.locked, ...(privileged ? { expiresAt: access.expiresAt, trialEndsAt: access.trialEndsAt, dueAt: access.dueAt, daysLeft: access.daysLeft, invoiceNo: access.invoiceNo } : {}) });
    } catch (error) { deps.sendError(res, error); }
  });
  router.get("/schools/:schoolId/billing", async (req, res) => {
    try {
      if (!staffOnly(res)) return;
      const schoolId = String(req.params.schoolId);
      const [billing, access, payee, invoices, payments, school] = await Promise.all([
        getBilling(schoolId), accessOf(schoolId), getPayee(),
        supabaseAdminRequest(`/rest/v1/billing_invoices?school_id=eq.${enc(schoolId)}&select=*&order=issued_at.desc&limit=30`).catch(() => []),
        supabaseAdminRequest(`/rest/v1/billing_payments?school_id=eq.${enc(schoolId)}&select=id,invoice_id,channel,transaction_id,amount,paid_on,payer_name,status,submitted_at,decided_at,receipt_no,note&order=submitted_at.desc&limit=50`).catch(() => []),
        supabaseAdminRequest(`/rest/v1/schools?id=eq.${enc(schoolId)}&select=name&limit=1`).catch(() => []),
      ]);
      const cfg = asRows(await supabaseAdminRequest(`/rest/v1/school_data?school_id=eq.${enc(schoolId)}&select=activeTerm:data->>activeTerm&limit=1`).catch(() => []))[0];
      const usage = await usageOf(schoolId, text(cfg?.activeTerm)).catch(() => ({ learners: 0, teachers: 0 }));
      const calendar = await getCalendar();
      const { whatsapp: _hidden, ...publicPayee } = payee;
      res.json({ schoolName: text(asRows(school)[0]?.name), termKey: text(cfg?.activeTerm), billing, access, payee: publicPayee, plans: PLANS, usage, invoices: asRows(invoices).map((i) => ({ ...i, runs_to: coverageEnd(calendar, text(i.term_key), text(i.cycle)) })), payments: asRows(payments) });
    } catch (error) { deps.sendError(res, error); }
  });
  router.post("/schools/:schoolId/billing/checkout", async (req, res) => {
    try {
      if (!staffOnly(res)) return;
      const schoolId = String(req.params.schoolId);
      const b = (req.body ?? {}) as Row;
      const planKey = text(b.plan) as PlanKey;
      const plan = PLANS[planKey];
      if (!plan) { res.status(400).json({ error: "Choose a plan." }); return; }
      const cycle = text(b.period) === "year" ? "yearly" : "termly";
      const billing = await getBilling(schoolId);
      if (!billing) { res.status(409).json({ error: "This school's billing has not been set up yet. Please contact J-SCHOOLS." }); return; }
      const cfg = asRows(await supabaseAdminRequest(`/rest/v1/school_data?school_id=eq.${enc(schoolId)}&select=activeTerm:data->>activeTerm&limit=1`).catch(() => []))[0];
      const termKey = text(cfg?.activeTerm);
      if (!/^\d{4}-T[1-3]$/.test(termKey)) { res.status(409).json({ error: "No term is open yet. Please contact J-SCHOOLS." }); return; }
      const usage = await usageOf(schoolId, termKey).catch(() => ({ learners: 0, teachers: 0 }));
      if (usage.learners > plan.learners) { res.status(400).json({ error: `You have ${usage.learners} learners, and the ${plan.label} plan allows ${plan.learners}. Choose a bigger plan.` }); return; }
      if (plan.teachers !== null && usage.teachers > plan.teachers) { res.status(400).json({ error: `You have ${usage.teachers} teachers, and the ${plan.label} plan allows ${plan.teachers}. Choose a bigger plan.` }); return; }
      const amount = cycle === "yearly" ? plan.yearFee : plan.termFee;
      const existing = asRows(await supabaseAdminRequest(`/rest/v1/billing_invoices?school_id=eq.${enc(schoolId)}&term_key=eq.${enc(termKey)}&select=*&limit=1`))[0];
      if (existing && existing.status === "paid") { res.status(409).json({ error: `${termLabelOf(termKey)} is already paid for.` }); return; }
      const dueMs = Math.max(Date.now() + 14 * 86_400_000, billing.trial_ends_at && billing.status === "trial" ? Date.parse(billing.trial_ends_at) : 0);
      const fields = { plan: planKey, cycle, amount, learners_snapshot: usage.learners, status: "unpaid", due_at: new Date(dueMs).toISOString(), paid_amount: 0 };
      let invoiceNo = text(existing?.invoice_no);
      if (existing) {
        await supabaseAdminRequest(`/rest/v1/billing_invoices?id=eq.${enc(text(existing.id))}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(fields) });
      } else {
        for (let tries = 0; tries < 8 && !invoiceNo; tries += 1) {
          const candidate = `${billing.school_code ?? "SCH"}-${String(1000 + Math.floor(Math.random() * 9000))}`;
          if (!asRows(await supabaseAdminRequest(`/rest/v1/billing_invoices?invoice_no=eq.${enc(candidate)}&select=id&limit=1`)).length) invoiceNo = candidate;
        }
        if (!invoiceNo) throw new Error("Could not create a reference. Please try again.");
        await supabaseAdminRequest(`/rest/v1/billing_invoices`, { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ id: randomUUID(), school_id: schoolId, invoice_no: invoiceNo, term_key: termKey, issued_at: new Date().toISOString(), ...fields }) });
      }
      forgetAccess(schoolId);
      const runsTo = coverageEnd(await getCalendar(), termKey, cycle);
      res.status(existing ? 200 : 201).json({ invoiceNo, amount, termKey, runsTo });
    } catch (error) { deps.sendError(res, error); }
  });
  router.post("/schools/:schoolId/billing/payments", async (req, res) => {
    try {
      if (!staffOnly(res)) return;
      const schoolId = String(req.params.schoolId);
      const b = (req.body ?? {}) as Row;
      const channel = ["bank", "mtn", "airtel"].includes(text(b.channel)) ? text(b.channel) : "";
      const transactionId = text(b.transactionId).toUpperCase().slice(0, 60);
      const amount = Math.round(Number(b.amount));
      const paidOn = isoOrNull(b.paidOn);
      if (!channel) { res.status(400).json({ error: "Choose how the money was sent." }); return; }
      if (transactionId.length < 4) { res.status(400).json({ error: "Enter the transaction ID from the receipt or SMS." }); return; }
      if (!Number.isFinite(amount) || amount < 1000) { res.status(400).json({ error: "Enter the amount that was paid." }); return; }
      if (!paidOn) { res.status(400).json({ error: "Enter the date of payment." }); return; }
      const dup = asRows(await supabaseAdminRequest(`/rest/v1/billing_payments?channel=eq.${channel}&transaction_id=eq.${enc(transactionId)}&select=id&limit=1`));
      if (dup.length) { res.status(409).json({ error: "This transaction ID has already been submitted." }); return; }
      const invoiceId = /^[0-9a-f-]{36}$/i.test(text(b.invoiceId)) ? text(b.invoiceId) : null;
      const row = { id: randomUUID(), school_id: schoolId, invoice_id: invoiceId, channel, transaction_id: transactionId, amount, paid_on: paidOn.slice(0, 10), payer_name: text(b.payerName).slice(0, 80) || null, status: "pending", submitted_by: String(req.headers["x-verified-user-email"] ?? ""), submitted_at: new Date().toISOString() };
      await supabaseAdminRequest(`/rest/v1/billing_payments`, { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(row) });
      const [billing, school, payee] = await Promise.all([getBilling(schoolId), supabaseAdminRequest(`/rest/v1/schools?id=eq.${enc(schoolId)}&select=name&limit=1`), getPayee()]);
      const label = { bank: "Bank", mtn: "MTN MoMo", airtel: "Airtel Money" }[channel];
      const message = `J-SCHOOLS PAYMENT\nSchool: ${text(asRows(school)[0]?.name)} (${billing?.school_code ?? ""})\nAmount: ${ugx(amount)}\nVia: ${label}\nTransaction ID: ${transactionId}\nDate: ${paidOn.slice(0, 10)}${row.payer_name ? `\nPaid by: ${row.payer_name}` : ""}`;
      res.status(201).json({ id: row.id, whatsappUrl: `https://wa.me/${payee.whatsapp.replace(/\D/g, "")}?text=${enc(message)}` });
    } catch (error) { deps.sendError(res, error); }
  });
}
