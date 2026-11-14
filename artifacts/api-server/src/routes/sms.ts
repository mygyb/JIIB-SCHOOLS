// Bulk SMS through EgoSMS (Pahappa Comms API).
//  - The Bursar sends fee-balance reminders (one SMS per student, with the student's own balance).
//  - The Head teacher sends announcements to parents and/or teachers.
//  - The super administrator buys SMS from EgoSMS and assigns them to schools. A school can only send what it has been given:
//    the balance is taken off before sending (in one locked database step) and refunded for anything that fails.
// Secrets (set in Vercel, never in the code): EGOSMS_USERNAME, EGOSMS_PASSWORD, optional EGOSMS_SENDER_ID, SMS_WEBHOOK_TOKEN.
// Tables and the balance function come from supabase/sms-setup.sql and are only ever touched here with the service key.
import type { IRouter, Request, Response } from "express";
import { z } from "zod";
import { asRows, jsonBody, supabaseAdminRequest } from "../lib/supabase.js";
import { buildAccounts, termStudents, type FinanceDeps } from "./finance.js";

type Row = Record<string, unknown>;
export type SmsDeps = FinanceDeps & {
  authorizeSuperAdmin: (req: Request, res: Response) => Promise<unknown>;
  sendError: (res: Response, error: unknown) => void;
};

const enc = encodeURIComponent;
const EGO_URL = "https://comms.egosms.co/api/v1/json/";
const BATCH = 500; // EgoSMS accepts up to 1000 per request
const MAX_RECIPIENTS = 2500; // per send: stops a slip of the finger from emptying a school's balance
const MAX_MESSAGE = 640;

export const DEFAULT_FEE_TEMPLATE =
  "Dear parent, the school fees balance for {student} ({class}) at {school} for {term} is {balance}. Please pay using the school PAY CODE {paycode}. Thank you.";

const emailOf = (req: Request) => String(req.header("x-verified-user-email") ?? "app").toLowerCase();

// ---- counting ----------------------------------------------------------------------------------------------------

const GSM_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€";

/** How many SMS a text uses: 160 characters for one (153 each when longer); 70/67 if it has characters outside the basic set. */
export function smsSegments(text: string): number {
  let units = 0;
  let unicode = false;
  for (const char of text) {
    if (GSM_BASIC.includes(char)) units += 1;
    else if (GSM_EXTENDED.includes(char)) units += 2;
    else { unicode = true; units += char.length; }
  }
  if (!units) return 0;
  if (unicode) { const length = text.length; return length <= 70 ? 1 : Math.ceil(length / 67); }
  return units <= 160 ? 1 : Math.ceil(units / 153);
}

/** International format without "+": 0772123456 / +256772123456 / 772123456 all become 256772123456. */
export function normalizePhone(value: unknown): string | null {
  let digits = String(value ?? "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^0\d{9}$/.test(digits)) digits = `256${digits.slice(1)}`;
  else if (/^[7]\d{8}$/.test(digits)) digits = `256${digits}`;
  return /^(256|254|255)\d{9}$/.test(digits) ? digits : null;
}

const ugx = (value: number) => `UGX ${Math.round(value).toLocaleString("en-US")}`;

/** Swaps fancy characters (dashes, curly quotes) for plain ones: a single such character would make the whole SMS count as 70-character Unicode text. */
export function plainSms(text: string): string {
  return text.replace(/[\u2013\u2014\u2212]/g, "-").replace(/[\u2018\u2019\u201B]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u2026/g, "...").replace(/\u00A0/g, " ");
}

/** Fills the fee template for one student. Key words are written in capitals because an SMS cannot show bold text. */
export function fillFeeTemplate(template: string, values: { student: string; className: string; school: string; term: string; balance: number; payCode: string }) {
  const map: Record<string, string> = {
    student: values.student.toUpperCase(),
    class: values.className.toUpperCase(),
    school: values.school.toUpperCase(),
    term: values.term.toUpperCase(),
    balance: ugx(values.balance),
    paycode: values.payCode,
  };
  return plainSms(template.replace(/\{(student|class|school|term|balance|paycode)\}/gi, (_all, name: string) => map[name.toLowerCase()] ?? "").replace(/[ \t]{2,}/g, " ").trim());
}

// ---- EgoSMS ----------------------------------------------------------------------------------------------------

const egoConfigured = () => Boolean(process.env.EGOSMS_USERNAME && process.env.EGOSMS_PASSWORD);
const egoUser = () => ({ username: process.env.EGOSMS_USERNAME ?? "", password: process.env.EGOSMS_PASSWORD ?? "" });

async function egoCall(body: Record<string, unknown>): Promise<Row> {
  const response = await fetch(EGO_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(25_000) });
  const text = await response.text();
  try { return JSON.parse(text) as Row; } catch { return { Status: "Failed", Message: `Unexpected reply from the SMS provider (${response.status}).` }; }
}

type EgoItem = { number: string; message: string };
async function egoSend(items: EgoItem[]): Promise<{ ok: boolean; code?: string; cost?: number; error?: string }> {
  const senderid = process.env.EGOSMS_SENDER_ID?.trim();
  try {
    const reply = await egoCall({
      method: "SendSms",
      userdata: egoUser(),
      msgdata: items.map((item) => ({ number: item.number, message: item.message, ...(senderid ? { senderid } : {}), priority: 1 })),
    });
    // The provider answers HTTP 200 even for failures: only the Status field tells.
    if (reply.Status === "OK") return { ok: true, code: String(reply.MsgFollowUpUniqueCode ?? ""), cost: Number(reply.Cost ?? 0) };
    return { ok: false, error: String(reply.Message ?? "The SMS provider refused the message.") };
  } catch {
    return { ok: false, error: "The SMS provider could not be reached." };
  }
}

export async function egoBalance(): Promise<{ ok: boolean; balance?: number; error?: string }> {
  if (!egoConfigured()) return { ok: false, error: "EGOSMS_USERNAME and EGOSMS_PASSWORD are not set." };
  try {
    const reply = await egoCall({ method: "Balance", userdata: egoUser() });
    return reply.Status === "OK" ? { ok: true, balance: Number(reply.Balance ?? 0) } : { ok: false, error: String(reply.Message ?? "Could not read the balance.") };
  } catch {
    return { ok: false, error: "The SMS provider could not be reached." };
  }
}

// ---- database --------------------------------------------------------------------------------------------------

async function db<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await supabaseAdminRequest<T>(path, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Could not find (the table|the function)|schema cache|does not exist/i.test(message)) {
      throw new Error("SMS needs a one-time database update. Ask the system administrator to run supabase/sms-setup.sql.");
    }
    throw error;
  }
}

/** Supabase returns at most 1,000 rows per request, so read the rest page by page. */
async function pagedRows(path: string): Promise<Row[]> {
  const all: Row[] = [];
  for (let offset = 0; ; offset += 1000) {
    const rows = asRows(await db(`${path}&limit=1000&offset=${offset}`));
    all.push(...rows);
    if (rows.length < 1000) return all;
  }
}

async function adjust(schoolId: string, delta: number, kind: string, note: string | null, actor: string, ref?: string): Promise<number> {
  const result = await db<number>("/rest/v1/rpc/jsa_sms_adjust", {
    method: "POST",
    body: jsonBody({ p_school: schoolId, p_delta: delta, p_kind: kind, p_note: note, p_actor: actor, p_ref: ref ?? null }),
  });
  return Number(result);
}

async function account(schoolId: string): Promise<{ balance: number; payCode: string }> {
  const row = asRows(await db(`/rest/v1/jsa_sms_accounts?school_id=eq.${enc(schoolId)}&select=balance,pay_code&limit=1`))[0];
  return { balance: Number(row?.balance ?? 0), payCode: String(row?.pay_code ?? "") };
}

// ---- sending ---------------------------------------------------------------------------------------------------

type Outgoing = { number: string; name: string; message: string; segments: number };

class Short extends Error { constructor(public balance: number, public needed: number) { super("Not enough SMS"); } }

async function dispatch(schoolId: string, actor: string, kind: "fees" | "announcement", audience: string, items: Outgoing[]) {
  const needed = items.reduce((total, item) => total + item.segments, 0);
  const message = asRows(await db("/rest/v1/jsa_sms_messages?select=id", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: jsonBody({ school_id: schoolId, kind, audience, sample: items[0]?.message.slice(0, 300) ?? "", sent_by: actor, recipients: items.length, segments: needed, status: "sending" }),
  }))[0];
  const messageId = String(message?.id);
  try {
    await adjust(schoolId, -needed, "use", `${kind === "fees" ? "Fee reminders" : "Announcement"} to ${items.length}`, actor, messageId);
  } catch (error) {
    await db(`/rest/v1/jsa_sms_messages?id=eq.${enc(messageId)}`, { method: "DELETE" }).catch(() => undefined);
    if (/insufficient_sms/.test(error instanceof Error ? error.message : "")) throw new Short((await account(schoolId)).balance, needed);
    throw error;
  }
  let failedSegments = 0;
  let failedCount = 0;
  let lastError = "";
  try {
    for (let start = 0; start < items.length; start += BATCH) {
      const batch = items.slice(start, start + BATCH);
      const result = await egoSend(batch.map(({ number, message: text }) => ({ number, message: text })));
      if (!result.ok) { failedSegments += batch.reduce((t, i) => t + i.segments, 0); failedCount += batch.length; lastError = result.error ?? lastError; }
      await db("/rest/v1/jsa_sms_recipients", {
        method: "POST",
        body: jsonBody(batch.map((item) => ({ message_id: messageId, school_id: schoolId, name: item.name, number: item.number, segments: item.segments, status: result.ok ? "sent" : "failed", follow_up: result.ok ? result.code ?? null : null }))),
      }).catch(() => undefined);
    }
  } catch (error) {
    // Anything we did not get to is treated as unsent and given back below.
    lastError = error instanceof Error ? error.message : "Sending stopped unexpectedly.";
    const done = (await db<Row[]>(`/rest/v1/jsa_sms_recipients?message_id=eq.${enc(messageId)}&select=segments,status`).catch(() => [] as Row[]));
    const rows = asRows(done);
    const handled = rows.length;
    const unsent = items.slice(handled);
    failedSegments = rows.filter((row) => row.status === "failed").reduce((t, r) => t + Number(r.segments ?? 0), 0) + unsent.reduce((t, i) => t + i.segments, 0);
    failedCount = rows.filter((row) => row.status === "failed").length + unsent.length;
  }
  let balance = (await account(schoolId)).balance;
  if (failedSegments > 0) balance = await adjust(schoolId, failedSegments, "refund", "Not delivered to the SMS provider", actor, messageId).catch(() => balance);
  await db(`/rest/v1/jsa_sms_messages?id=eq.${enc(messageId)}`, {
    method: "PATCH",
    body: jsonBody({ failed: failedCount, status: failedCount === items.length ? "failed" : "done" }),
  }).catch(() => undefined);
  return { messageId, recipients: items.length, sent: items.length - failedCount, failed: failedCount, segmentsUsed: needed - failedSegments, refunded: failedSegments, balance, error: failedCount ? lastError : "" };
}

// ---- who may do what -------------------------------------------------------------------------------------------

function roleIs(res: Response, ...roles: string[]): boolean {
  return roles.includes(String(res.locals.jiibRole));
}
function refuse(res: Response, text: string) { res.status(403).json({ error: text }); }

const FeesBody = z.object({
  template: z.string().trim().min(10).max(MAX_MESSAGE),
  termKey: z.string().optional(),
  className: z.string().trim().max(60).optional(),
  minBalance: z.number().int().min(0).max(1_000_000_000).default(1),
  studentIds: z.array(z.string()).max(MAX_RECIPIENTS).optional(),
  dryRun: z.boolean().default(false),
}).strict();

const AnnounceBody = z.object({
  message: z.string().trim().min(3).max(MAX_MESSAGE),
  audience: z.enum(["parents", "teachers", "both"]),
  classes: z.array(z.string().trim().max(60)).max(60).optional(),
  dryRun: z.boolean().default(false),
}).strict();

const same = (a: unknown, b: unknown) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

export function registerSmsRoutes(router: IRouter, deps: SmsDeps) {
  const base = "/schools/:schoolId/sms";
  const fail = (res: Response, error: unknown) => {
    if (error instanceof z.ZodError) { res.status(400).json({ error: error.issues[0] ? `${error.issues[0].path.join(".") || "Request"}: ${error.issues[0].message}` : "Check the details and try again." }); return; }
    if (error instanceof Short) { res.status(402).json({ code: "sms_short", error: error.balance <= 0 ? "Your school has no SMS left. Please request a recharge." : `Not enough SMS: this needs ${error.needed} but your school has ${error.balance}. Please request a recharge or send to fewer people.`, balance: error.balance, needed: error.needed }); return; }
    res.status(400).json({ error: error instanceof Error ? error.message : "Unexpected error" });
  };
  const needProvider = (res: Response) => {
    if (egoConfigured()) return true;
    res.status(503).json({ error: "SMS sending is not switched on yet. The system administrator needs to add the EgoSMS login on the server." });
    return false;
  };

  // Balance, pay code, recent sends and any open recharge request.
  router.get(`${base}/status`, async (req, res) => {
    try {
      if (!roleIs(res, "headteacher", "bursar")) return refuse(res, "SMS is only open to the Head teacher and the Bursar.");
      const schoolId = String(req.params.schoolId);
      const [acct, history, pending] = await Promise.all([
        account(schoolId),
        db(`/rest/v1/jsa_sms_messages?school_id=eq.${enc(schoolId)}&select=id,kind,audience,sample,sent_by,recipients,segments,failed,status,created_at&order=created_at.desc&limit=25`),
        db(`/rest/v1/jsa_sms_requests?school_id=eq.${enc(schoolId)}&status=eq.open&select=amount,created_at&order=created_at.desc&limit=1`),
      ]);
      res.json({
        balance: acct.balance, payCode: acct.payCode, providerReady: egoConfigured(), defaultTemplate: DEFAULT_FEE_TEMPLATE,
        pendingRequest: asRows(pending)[0] ? { amount: Number(asRows(pending)[0].amount), createdAt: String(asRows(pending)[0].created_at) } : null,
        history: asRows(history).map((row) => ({ id: String(row.id), kind: String(row.kind), audience: String(row.audience ?? ""), text: String(row.sample ?? ""), sentBy: String(row.sent_by ?? ""), recipients: Number(row.recipients ?? 0), segments: Number(row.segments ?? 0), failed: Number(row.failed ?? 0), status: String(row.status), createdAt: String(row.created_at) })),
      });
    } catch (error) { fail(res, error); }
  });

  router.put(`${base}/pay-code`, async (req, res) => {
    try {
      if (!roleIs(res, "bursar")) return refuse(res, "Only the Bursar can set the school pay code.");
      const { payCode } = z.object({ payCode: z.string().trim().min(1).max(40) }).strict().parse(req.body);
      const schoolId = String(req.params.schoolId);
      await db("/rest/v1/jsa_sms_accounts?on_conflict=school_id", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: jsonBody({ school_id: schoolId, pay_code: payCode, updated_at: new Date().toISOString() }),
      });
      res.json({ payCode });
    } catch (error) { fail(res, error); }
  });

  router.post(`${base}/request`, async (req, res) => {
    try {
      if (!roleIs(res, "headteacher", "bursar")) return refuse(res, "SMS is only open to the Head teacher and the Bursar.");
      const body = z.object({ amount: z.number().int().min(1).max(1_000_000), note: z.string().trim().max(300).optional() }).strict().parse(req.body);
      const schoolId = String(req.params.schoolId);
      await db("/rest/v1/jsa_sms_requests", { method: "POST", body: jsonBody({ school_id: schoolId, amount: body.amount, note: body.note ?? null, requested_by: emailOf(req) }) });
      res.status(201).json({ ok: true });
    } catch (error) { fail(res, error); }
  });

  // ---- Bursar: fee reminders (one SMS per student, with that student's own balance) ----
  router.post(`${base}/fees`, async (req, res) => {
    try {
      if (!roleIs(res, "bursar")) return refuse(res, "Only the Bursar can send fee reminders.");
      const body = FeesBody.parse(req.body);
      const schoolId = String(req.params.schoolId);
      const config = await deps.readSchoolConfig(req, schoolId);
      const termKey = body.termKey?.trim() || String(config.activeTerm ?? "");
      const terms = config.terms && typeof config.terms === "object" ? (config.terms as Record<string, Row>) : {};
      const termLabel = String(terms[termKey]?.label ?? termKey);
      const [acct, accounts, schoolRow] = await Promise.all([
        account(schoolId),
        buildAccounts(deps, req, schoolId, termKey),
        db(`/rest/v1/schools?id=eq.${enc(schoolId)}&select=name&limit=1`),
      ]);
      const schoolName = String(asRows(schoolRow)[0]?.name ?? "the school");
      if (/\{paycode\}/i.test(body.template) && !acct.payCode) {
        res.status(400).json({ code: "pay_code_missing", error: "Add the school pay code first, so parents know where to pay." });
        return;
      }
      const chosen = body.studentIds ? new Set(body.studentIds) : null;
      const rows = accounts
        .filter((a) => a.balance >= Math.max(1, body.minBalance))
        .filter((a) => !body.className || same(a.className, body.className))
        .filter((a) => !chosen || chosen.has(a.studentId))
        .map((a) => {
          const number = normalizePhone(a.parentPhone);
          const text = fillFeeTemplate(body.template, { student: a.name, className: a.className, school: schoolName, term: termLabel, balance: a.balance, payCode: acct.payCode });
          return { studentId: a.studentId, name: a.name, className: a.className, balance: a.balance, phone: number, rawPhone: a.parentPhone, message: text, segments: smsSegments(text) };
        })
        .sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
      const valid = rows.filter((row) => row.phone);
      if (valid.length > MAX_RECIPIENTS) { res.status(400).json({ error: `Send to at most ${MAX_RECIPIENTS} parents at a time. Pick a class instead.` }); return; }
      const segments = valid.reduce((t, r) => t + r.segments, 0);
      if (body.dryRun) {
        res.json({ dryRun: true, balance: acct.balance, termLabel, recipients: valid.length, segments, noPhone: rows.length - valid.length, students: rows.map((row) => ({ studentId: row.studentId, name: row.name, className: row.className, balance: row.balance, phone: row.phone, message: row.message, segments: row.segments })) });
        return;
      }
      if (!needProvider(res)) return;
      if (!valid.length) { res.status(400).json({ error: "No student with a balance has a valid parent phone number." }); return; }
      const result = await dispatch(schoolId, emailOf(req), "fees", body.className ? `Fee reminders · ${body.className}` : "Fee reminders · all classes", valid.map((row) => ({ number: row.phone as string, name: row.name, message: row.message, segments: row.segments })));
      res.json({ ...result, noPhone: rows.length - valid.length });
    } catch (error) { fail(res, error); }
  });

  // ---- Head teacher: announcements to parents and/or teachers ----
  router.post(`${base}/announce`, async (req, res) => {
    try {
      if (!roleIs(res, "headteacher")) return refuse(res, "Only the Head teacher can send announcements.");
      const body = AnnounceBody.parse(req.body);
      const schoolId = String(req.params.schoolId);
      const config = await deps.readSchoolConfig(req, schoolId);
      const people = new Map<string, { name: string; group: string }>();
      let missing = 0;
      if (body.audience !== "teachers") {
        const students = await termStudents(deps, req, schoolId, String(config.activeTerm ?? ""));
        const wanted = body.classes?.length ? body.classes : null;
        for (const student of students) {
          if (wanted && !wanted.some((name) => same(name, student.className))) continue;
          const number = normalizePhone(student.parentPhone);
          if (!number) { missing += 1; continue; }
          if (!people.has(number)) people.set(number, { name: `Parent of ${student.name}`, group: "parent" }); // one SMS per phone, even for several children
        }
      }
      if (body.audience !== "parents") {
        const staff = asRows(await db(`/rest/v1/allowed_users?school_id=eq.${enc(schoolId)}&role=eq.teacher&select=display_name,email,phone`));
        for (const person of staff) {
          const number = normalizePhone(person.phone);
          if (!number) { missing += 1; continue; }
          if (!people.has(number)) people.set(number, { name: String(person.display_name || person.email), group: "teacher" });
        }
      }
      const text = plainSms(body.message);
      const segmentsEach = smsSegments(text);
      const recipients = Array.from(people.entries()).map(([number, who]) => ({ number, name: who.name, message: text, segments: segmentsEach }));
      if (recipients.length > MAX_RECIPIENTS) { res.status(400).json({ error: `Send to at most ${MAX_RECIPIENTS} people at a time. Pick a class instead.` }); return; }
      const acct = await account(schoolId);
      const segments = segmentsEach * recipients.length;
      if (body.dryRun) { res.json({ dryRun: true, balance: acct.balance, recipients: recipients.length, segments, segmentsEach, noPhone: missing }); return; }
      if (!needProvider(res)) return;
      if (!recipients.length) { res.status(400).json({ error: "Nobody in that audience has a valid phone number yet." }); return; }
      const label = body.audience === "both" ? "Parents and teachers" : body.audience === "teachers" ? "Teachers" : body.classes?.length ? `Parents · ${body.classes.join(", ")}` : "All parents";
      const result = await dispatch(schoolId, emailOf(req), "announcement", label, recipients);
      res.json({ ...result, noPhone: missing });
    } catch (error) { fail(res, error); }
  });

  // ---- Super administrator: the whole picture, and assigning SMS to schools ----
  router.get("/sms-admin/overview", async (req, res) => {
    try {
      if (!await deps.authorizeSuperAdmin(req, res)) return;
      const [schools, accounts, ledger, requests, provider] = await Promise.all([
        db("/rest/v1/schools?select=id,name&order=name.asc&limit=1000"),
        db("/rest/v1/jsa_sms_accounts?select=school_id,balance,pay_code&limit=1000"),
        pagedRows("/rest/v1/jsa_sms_ledger?select=school_id,kind,amount&order=created_at.asc,id.asc"),
        db("/rest/v1/jsa_sms_requests?status=eq.open&select=id,school_id,amount,note,requested_by,created_at&order=created_at.desc&limit=200"),
        egoBalance(),
      ]);
      const balances = new Map(asRows(accounts).map((row) => [String(row.school_id), Number(row.balance ?? 0)]));
      const totals = new Map<string, { assigned: number; used: number }>();
      for (const row of ledger) {
        const entry = totals.get(String(row.school_id)) ?? { assigned: 0, used: 0 };
        const amount = Number(row.amount ?? 0);
        if (row.kind === "assign" || row.kind === "adjust") entry.assigned += amount;
        else if (row.kind === "use") entry.used += -amount;
        else if (row.kind === "refund") entry.used -= amount;
        totals.set(String(row.school_id), entry);
      }
      const open = asRows(requests);
      res.json({
        provider,
        schools: asRows(schools).map((school) => {
          const id = String(school.id);
          return { id, name: String(school.name ?? ""), balance: balances.get(id) ?? 0, assigned: totals.get(id)?.assigned ?? 0, used: totals.get(id)?.used ?? 0, openRequest: open.filter((r) => String(r.school_id) === id).map((r) => ({ id: String(r.id), amount: Number(r.amount), note: String(r.note ?? ""), by: String(r.requested_by ?? ""), createdAt: String(r.created_at) }))[0] ?? null };
        }),
      });
    } catch (error) { deps.sendError(res, error); }
  });

  router.post("/sms-admin/:schoolId/assign", async (req, res) => {
    try {
      if (!await deps.authorizeSuperAdmin(req, res)) return;
      const body = z.object({ amount: z.number().int().min(-1_000_000).max(1_000_000).refine((n) => n !== 0, "Enter a number of SMS."), note: z.string().trim().max(300).optional() }).strict().parse(req.body);
      const schoolId = String(req.params.schoolId);
      const school = asRows(await db(`/rest/v1/schools?id=eq.${enc(schoolId)}&select=id&limit=1`))[0];
      if (!school) { res.status(404).json({ error: "School not found." }); return; }
      const balance = await adjust(schoolId, body.amount, body.amount > 0 ? "assign" : "adjust", body.note ?? null, emailOf(req));
      if (body.amount > 0) await db(`/rest/v1/jsa_sms_requests?school_id=eq.${enc(schoolId)}&status=eq.open`, { method: "PATCH", body: jsonBody({ status: "done" }) }).catch(() => undefined);
      res.json({ balance });
    } catch (error) {
      if (error instanceof Error && /insufficient_sms/.test(error.message)) { res.status(400).json({ error: "That would take the school below zero SMS." }); return; }
      fail(res, error);
    }
  });

  router.get("/sms-admin/:schoolId/ledger", async (req, res) => {
    try {
      if (!await deps.authorizeSuperAdmin(req, res)) return;
      const rows = asRows(await db(`/rest/v1/jsa_sms_ledger?school_id=eq.${enc(String(req.params.schoolId))}&select=kind,amount,balance_after,note,actor,created_at&order=created_at.desc&limit=100`));
      res.json(rows.map((row) => ({ kind: String(row.kind), amount: Number(row.amount), balanceAfter: Number(row.balance_after), note: String(row.note ?? ""), by: String(row.actor ?? ""), createdAt: String(row.created_at) })));
    } catch (error) { fail(res, error); }
  });
}

/** EgoSMS delivery reports. The address contains a secret token (SMS_WEBHOOK_TOKEN) because the provider does not sign its calls. */
export function registerPublicSmsRoutes(router: IRouter) {
  router.post("/sms/webhook/:token", async (req, res) => {
    const expected = process.env.SMS_WEBHOOK_TOKEN;
    if (!expected || req.params.token !== expected) { res.status(404).end(); return; }
    res.status(200).json({ ok: true }); // answer first: the provider only needs the acknowledgement
    try {
      const body = (req.body ?? {}) as Row;
      const code = String(body.MsgFollowUpUniqueCode ?? "");
      const number = String(body.number ?? "");
      if (!code || !number) return;
      const ok = /^(success|delivered)$/i.test(String(body.Status ?? ""));
      await supabaseAdminRequest(`/rest/v1/jsa_sms_recipients?follow_up=eq.${enc(code)}&number=eq.${enc(number)}`, {
        method: "PATCH",
        body: jsonBody({ status: ok ? "delivered" : "failed", delivered_at: ok ? String(body.deliveryDate ?? new Date().toISOString()) : null }),
      });
    } catch { /* a missed delivery report only means the status stays "sent" */ }
  });
}
