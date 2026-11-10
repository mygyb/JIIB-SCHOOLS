// Finance: fee structures, student fees and payments (all amounts are whole UGX).
// Only the Bursar can change anything here; the Head teacher can read. School administrators and teachers are refused.
import type { IRouter, Request, Response } from "express";
import { z } from "zod";
import { asRows, jsonBody, supabaseRequest } from "../lib/supabase.js";

type Row = Record<string, unknown>;
export type FinanceDeps = {
  /** Reads the school's saved settings blob (for the active term and legacy student copies). */
  readSchoolConfig: (req: Request, schoolId: string) => Promise<Record<string, unknown>>;
};

const enc = encodeURIComponent;
const MAX_AMOUNT = 10_000_000_000;
const STUDENT_TYPES = ["day", "boarding"] as const;
const METHODS = ["cash", "mobile_money", "bank", "cheque", "other"] as const;

const Items = z
  .array(z.object({ name: z.string().trim().min(1).max(60), amount: z.number().int().min(0).max(MAX_AMOUNT) }).strict())
  .max(40);
const StudentType = z.enum(STUDENT_TYPES);

function itemsOf(value: unknown): Array<{ name: string; amount: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({ name: String((item as Row)?.name ?? "").trim(), amount: Math.round(Number((item as Row)?.amount ?? 0)) }))
    .filter((item) => item.name && Number.isFinite(item.amount) && item.amount >= 0);
}
const sum = (items: Array<{ amount: number }>) => items.reduce((total, item) => total + item.amount, 0);
const key = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function distinctItems(items: Array<{ name: string; amount: number }>): string | null {
  return new Set(items.map((item) => key(item.name))).size === items.length ? null : "Each fee item name can be used once.";
}

export function financeGate(req: Request, res: Response, next: () => void) {
  const role = res.locals.jiibRole;
  if (role !== "bursar" && role !== "headteacher") {
    res.status(403).json({ error: "Finance records are only open to the Bursar and the Head teacher." });
    return;
  }
  next();
}
function bursarOnly(res: Response): boolean {
  if (res.locals.jiibRole !== "bursar") {
    res.status(403).json({ error: "Only the Bursar can change finance records." });
    return false;
  }
  return true;
}

type TermStudent = { id: string; name: string; className: string; parentPhone: string | null };

/** Every student in a term: database rows plus the older copies kept in the school settings. */
async function termStudents(deps: FinanceDeps, req: Request, schoolId: string, termKey: string): Promise<TermStudent[]> {
  const [config, rows] = await Promise.all([
    deps.readSchoolConfig(req, schoolId),
    supabaseRequest(req, "students", {}, `?school_id=eq.${enc(schoolId)}&term_key=eq.${enc(termKey)}&select=id,name,class,parent_phone`),
  ]);
  const byId = new Map<string, TermStudent>();
  for (const row of asRows(rows)) {
    byId.set(String(row.id), { id: String(row.id), name: String(row.name ?? ""), className: String(row.class ?? ""), parentPhone: (row.parent_phone as string | null) ?? null });
  }
  const terms = config.terms && typeof config.terms === "object" ? (config.terms as Record<string, Row>) : {};
  const legacy = terms[termKey]?.students;
  if (Array.isArray(legacy)) {
    for (const item of legacy as Row[]) {
      const id = String(item?.id ?? "");
      if (!id || byId.has(id)) continue;
      byId.set(id, { id, name: String(item.name ?? ""), className: String(item.class ?? item.className ?? ""), parentPhone: (item.parentPhone ?? item.parent_phone ?? null) as string | null });
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

async function activeTermKey(deps: FinanceDeps, req: Request, schoolId: string, asked: unknown): Promise<string> {
  const given = String(asked ?? "").trim();
  if (given) return given;
  return String((await deps.readSchoolConfig(req, schoolId)).activeTerm ?? "");
}

export type Account = {
  studentId: string;
  name: string;
  className: string;
  parentPhone: string | null;
  studentType: "day" | "boarding";
  expected: number;
  paid: number;
  balance: number;
  custom: boolean;
  noStructure: boolean;
  items: Array<{ name: string; amount: number }>;
  note: string | null;
  lastPaymentOn: string | null;
};

/** Works out what every student owes and has paid for one term. Cancelled receipts never count. */
async function buildAccounts(deps: FinanceDeps, req: Request, schoolId: string, termKey: string): Promise<Account[]> {
  const [students, structures, types, overrides, payments] = await Promise.all([
    termStudents(deps, req, schoolId, termKey),
    supabaseRequest(req, "jsa_fee_structures", {}, `?school_id=eq.${enc(schoolId)}&term_key=eq.${enc(termKey)}&select=class_name,student_type,items,total`),
    supabaseRequest(req, "jsa_fee_students", {}, `?school_id=eq.${enc(schoolId)}&select=student_id,student_type`),
    supabaseRequest(req, "jsa_fee_overrides", {}, `?school_id=eq.${enc(schoolId)}&term_key=eq.${enc(termKey)}&select=student_id,items,total,note`),
    supabaseRequest(req, "jsa_fee_payments", {}, `?school_id=eq.${enc(schoolId)}&term_key=eq.${enc(termKey)}&status=eq.valid&select=student_id,amount,paid_on&limit=100000`),
  ]);
  const structureOf = new Map(asRows(structures).map((row) => [`${key(row.class_name)}|${row.student_type}`, itemsOf(row.items)]));
  const typeOf = new Map(asRows(types).map((row) => [String(row.student_id), row.student_type === "boarding" ? "boarding" : "day"] as const));
  const overrideOf = new Map(asRows(overrides).map((row) => [String(row.student_id), row]));
  const paidOf = new Map<string, { total: number; last: string | null }>();
  for (const row of asRows(payments)) {
    const id = String(row.student_id);
    const entry = paidOf.get(id) ?? { total: 0, last: null };
    entry.total += Number(row.amount ?? 0);
    const on = row.paid_on ? String(row.paid_on) : null;
    if (on && (!entry.last || on > entry.last)) entry.last = on;
    paidOf.set(id, entry);
  }
  return students.map((student) => {
    const studentType = typeOf.get(student.id) ?? "day";
    const override = overrideOf.get(student.id);
    const classItems = structureOf.get(`${key(student.className)}|${studentType}`);
    const items = override ? itemsOf(override.items) : classItems ?? [];
    const expected = sum(items);
    const paid = paidOf.get(student.id)?.total ?? 0;
    return {
      studentId: student.id,
      name: student.name,
      className: student.className,
      parentPhone: student.parentPhone,
      studentType,
      expected,
      paid,
      balance: expected - paid,
      custom: Boolean(override),
      noStructure: !override && !classItems,
      items,
      note: override ? ((override.note as string | null) ?? null) : null,
      lastPaymentOn: paidOf.get(student.id)?.last ?? null,
    };
  });
}

function totalsOf(accounts: Account[]) {
  const billed = accounts.filter((account) => !account.noStructure || account.paid > 0);
  const expected = sum(billed.map((account) => ({ amount: account.expected })));
  const collected = sum(accounts.map((account) => ({ amount: account.paid })));
  const owing = accounts.filter((account) => account.balance > 0);
  return {
    students: accounts.length,
    expected,
    collected,
    outstanding: sum(owing.map((account) => ({ amount: account.balance }))),
    defaulters: owing.length,
    cleared: accounts.filter((account) => account.expected > 0 && account.balance <= 0).length,
    withoutStructure: accounts.filter((account) => account.noStructure).length,
    collectionRate: expected > 0 ? Math.round((Math.min(collected, expected) / expected) * 1000) / 10 : 0,
  };
}

function mapPayment(row: Row) {
  return {
    id: String(row.id),
    receiptNo: String(row.receipt_no),
    termKey: String(row.term_key ?? ""),
    studentId: String(row.student_id),
    studentName: String(row.student_name ?? ""),
    className: String(row.class_name ?? ""),
    amount: Number(row.amount ?? 0),
    method: String(row.method ?? "cash"),
    tid: (row.tid as string | null) ?? null,
    paidOn: String(row.paid_on ?? ""),
    paidBy: (row.paid_by as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    status: row.status === "cancelled" ? "cancelled" : "valid",
    cancelReason: (row.cancel_reason as string | null) ?? null,
    cancelledAt: (row.cancelled_at as string | null) ?? null,
    cancelledBy: (row.cancelled_by as string | null) ?? null,
    recordedBy: (row.recorded_by as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
  };
}

const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10); // Uganda date (UTC+3)
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const emailOf = (req: Request) => String(req.header("x-verified-user-email") ?? req.header("x-user-email") ?? "app");
const fail = (res: Response, error: unknown) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: error.issues[0]?.message ? `${error.issues[0].path.join(".") || "Request"}: ${error.issues[0].message}` : "Check the details and try again." });
    return;
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (/jsa_fee_|does not exist|schema cache/i.test(message)) {
    res.status(503).json({ error: "Finance needs a one-time database update. Ask the system administrator to run supabase/finance-setup.sql." });
    return;
  }
  res.status(400).json({ error: message });
};

export function registerFinanceRoutes(router: IRouter, deps: FinanceDeps) {
  const base = "/schools/:schoolId/finance";
  router.use(base, financeGate);

  // Overview: school totals, a class-by-class table and the latest receipts. Used by the Bursar and Head teacher dashboards.
  router.get(`${base}/overview`, async (req, res) => {
    try {
      const schoolId = String(req.params.schoolId);
      const termKey = await activeTermKey(deps, req, schoolId, req.query.termKey);
      const accounts = await buildAccounts(deps, req, schoolId, termKey);
      const byClass = new Map<string, Account[]>();
      for (const account of accounts) byClass.set(account.className, [...(byClass.get(account.className) ?? []), account]);
      const classes = Array.from(byClass.entries())
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
        .map(([className, list]) => ({ className, ...totalsOf(list) }));
      const [recent, todayRows] = await Promise.all([
        supabaseRequest(req, "jsa_fee_payments", {}, `?school_id=eq.${enc(schoolId)}&term_key=eq.${enc(termKey)}&select=*&order=seq.desc&limit=8`),
        supabaseRequest(req, "jsa_fee_payments", {}, `?school_id=eq.${enc(schoolId)}&paid_on=eq.${today()}&status=eq.valid&select=amount`),
      ]);
      res.json({
        termKey,
        totals: totalsOf(accounts),
        types: STUDENT_TYPES.map((type) => ({ studentType: type, ...totalsOf(accounts.filter((account) => account.studentType === type)) })),
        classes,
        collectedToday: asRows(todayRows).reduce((total, row) => total + Number(row.amount ?? 0), 0),
        recentPayments: asRows(recent).map(mapPayment),
      });
    } catch (error) {
      fail(res, error);
    }
  });

  // ---- Fee structures ----
  router.get(`${base}/structures`, async (req, res) => {
    try {
      const schoolId = String(req.params.schoolId);
      const termKey = await activeTermKey(deps, req, schoolId, req.query.termKey);
      const [rows, students] = await Promise.all([
        supabaseRequest(req, "jsa_fee_structures", {}, `?school_id=eq.${enc(schoolId)}&term_key=eq.${enc(termKey)}&select=*`),
        termStudents(deps, req, schoolId, termKey),
      ]);
      const classes = Array.from(new Set([...students.map((student) => student.className).filter(Boolean), "S.1", "S.2", "S.3", "S.4", "S.5", "S.6"]))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      res.json({
        termKey,
        classes,
        structures: asRows(rows).map((row) => ({
          className: String(row.class_name),
          studentType: row.student_type === "boarding" ? "boarding" : "day",
          items: itemsOf(row.items),
          total: Number(row.total ?? 0),
          updatedAt: String(row.updated_at ?? ""),
        })),
      });
    } catch (error) {
      fail(res, error);
    }
  });

  // Save one structure for one or more classes at once (the same items for each).
  router.put(`${base}/structures`, async (req, res) => {
    try {
      if (!bursarOnly(res)) return;
      const schoolId = String(req.params.schoolId);
      const body = z
        .object({ termKey: z.string().trim().min(1), classNames: z.array(z.string().trim().min(1).max(30)).min(1).max(30), studentType: StudentType, items: Items })
        .strict()
        .parse(req.body);
      const problem = distinctItems(body.items);
      if (problem) { res.status(400).json({ error: problem }); return; }
      const total = sum(body.items);
      const stamp = new Date().toISOString();
      const rows = Array.from(new Set(body.classNames)).map((className) => ({
        school_id: schoolId, term_key: body.termKey, class_name: className, student_type: body.studentType,
        items: body.items, total, updated_at: stamp, updated_by: emailOf(req),
      }));
      await supabaseRequest(req, "jsa_fee_structures", { method: "POST", body: jsonBody(rows) }, "?on_conflict=school_id,term_key,class_name,student_type");
      res.json({ saved: rows.length, total });
    } catch (error) {
      fail(res, error);
    }
  });

  router.delete(`${base}/structures`, async (req, res) => {
    try {
      if (!bursarOnly(res)) return;
      const schoolId = String(req.params.schoolId);
      const { termKey, className, studentType } = z
        .object({ termKey: z.string().trim().min(1), className: z.string().trim().min(1), studentType: StudentType })
        .parse(req.query);
      await supabaseRequest(req, "jsa_fee_structures", { method: "DELETE" },
        `?school_id=eq.${enc(schoolId)}&term_key=eq.${enc(termKey)}&class_name=eq.${enc(className)}&student_type=eq.${studentType}`);
      res.json({ removed: true });
    } catch (error) {
      fail(res, error);
    }
  });

  // Copy every structure from one term into another (only fills classes that have none yet).
  router.post(`${base}/structures/copy`, async (req, res) => {
    try {
      if (!bursarOnly(res)) return;
      const schoolId = String(req.params.schoolId);
      const { fromTerm, toTerm } = z.object({ fromTerm: z.string().trim().min(1), toTerm: z.string().trim().min(1) }).strict().parse(req.body);
      if (fromTerm === toTerm) { res.status(400).json({ error: "Choose two different terms." }); return; }
      const [from, to] = await Promise.all([
        supabaseRequest(req, "jsa_fee_structures", {}, `?school_id=eq.${enc(schoolId)}&term_key=eq.${enc(fromTerm)}&select=*`),
        supabaseRequest(req, "jsa_fee_structures", {}, `?school_id=eq.${enc(schoolId)}&term_key=eq.${enc(toTerm)}&select=class_name,student_type`),
      ]);
      const have = new Set(asRows(to).map((row) => `${key(row.class_name)}|${row.student_type}`));
      const stamp = new Date().toISOString();
      const rows = asRows(from)
        .filter((row) => !have.has(`${key(row.class_name)}|${row.student_type}`))
        .map((row) => ({ school_id: schoolId, term_key: toTerm, class_name: row.class_name, student_type: row.student_type, items: row.items, total: row.total, updated_at: stamp, updated_by: emailOf(req) }));
      if (rows.length) await supabaseRequest(req, "jsa_fee_structures", { method: "POST", body: jsonBody(rows) }, "?on_conflict=school_id,term_key,class_name,student_type");
      res.json({ copied: rows.length, skipped: asRows(from).length - rows.length });
    } catch (error) {
      fail(res, error);
    }
  });

  // ---- Student accounts ----
  router.get(`${base}/accounts`, async (req, res) => {
    try {
      const schoolId = String(req.params.schoolId);
      const termKey = await activeTermKey(deps, req, schoolId, req.query.termKey);
      let accounts = await buildAccounts(deps, req, schoolId, termKey);
      const className = String(req.query.className ?? "").trim();
      const type = String(req.query.studentType ?? "").trim();
      const search = key(req.query.search);
      const status = String(req.query.status ?? "").trim();
      const minBalance = Math.max(0, Math.round(Number(req.query.minBalance ?? 0)) || 0);
      if (className) accounts = accounts.filter((account) => key(account.className) === key(className));
      if (type === "day" || type === "boarding") accounts = accounts.filter((account) => account.studentType === type);
      if (search) accounts = accounts.filter((account) => key(account.name).includes(search));
      if (status === "owing") accounts = accounts.filter((account) => account.balance > 0);
      if (status === "cleared") accounts = accounts.filter((account) => account.expected > 0 && account.balance <= 0);
      if (status === "nostructure") accounts = accounts.filter((account) => account.noStructure);
      if (minBalance) accounts = accounts.filter((account) => account.balance >= minBalance);
      res.json({ termKey, totals: totalsOf(accounts), accounts });
    } catch (error) {
      fail(res, error);
    }
  });

  router.get(`${base}/students/:studentId`, async (req, res) => {
    try {
      const schoolId = String(req.params.schoolId);
      const studentId = String(req.params.studentId);
      const termKey = await activeTermKey(deps, req, schoolId, req.query.termKey);
      const account = (await buildAccounts(deps, req, schoolId, termKey)).find((item) => item.studentId === studentId);
      if (!account) { res.status(404).json({ error: "Student not found in this term." }); return; }
      const payments = asRows(await supabaseRequest(req, "jsa_fee_payments", {}, `?school_id=eq.${enc(schoolId)}&term_key=eq.${enc(termKey)}&student_id=eq.${enc(studentId)}&select=*&order=seq.desc`));
      res.json({ termKey, account, payments: payments.map(mapPayment) });
    } catch (error) {
      fail(res, error);
    }
  });

  // Mark students as day or boarding (one or many).
  router.put(`${base}/student-types`, async (req, res) => {
    try {
      if (!bursarOnly(res)) return;
      const schoolId = String(req.params.schoolId);
      const body = z.object({ studentIds: z.array(z.string().min(1)).min(1).max(2000), studentType: StudentType }).strict().parse(req.body);
      const stamp = new Date().toISOString();
      const rows = Array.from(new Set(body.studentIds)).map((id) => ({ school_id: schoolId, student_id: id, student_type: body.studentType, updated_at: stamp, updated_by: emailOf(req) }));
      for (let i = 0; i < rows.length; i += 500) {
        await supabaseRequest(req, "jsa_fee_students", { method: "POST", body: jsonBody(rows.slice(i, i + 500)) }, "?on_conflict=school_id,student_id");
      }
      res.json({ updated: rows.length });
    } catch (error) {
      fail(res, error);
    }
  });

  // A student's own structure for one term.
  router.put(`${base}/students/:studentId/override`, async (req, res) => {
    try {
      if (!bursarOnly(res)) return;
      const schoolId = String(req.params.schoolId);
      const studentId = String(req.params.studentId);
      const body = z.object({ termKey: z.string().trim().min(1), items: Items, note: z.string().trim().max(200).optional() }).strict().parse(req.body);
      const problem = distinctItems(body.items);
      if (problem) { res.status(400).json({ error: problem }); return; }
      if (!body.items.length) { res.status(400).json({ error: "Add at least one fee item, or remove the custom structure instead." }); return; }
      const students = await termStudents(deps, req, schoolId, body.termKey);
      if (!students.some((student) => student.id === studentId)) { res.status(404).json({ error: "Student not found in this term." }); return; }
      await supabaseRequest(req, "jsa_fee_overrides", {
        method: "POST",
        body: jsonBody({ school_id: schoolId, term_key: body.termKey, student_id: studentId, items: body.items, total: sum(body.items), note: body.note || null, updated_at: new Date().toISOString(), updated_by: emailOf(req) }),
      }, "?on_conflict=school_id,term_key,student_id");
      res.json({ saved: true, total: sum(body.items) });
    } catch (error) {
      fail(res, error);
    }
  });

  router.delete(`${base}/students/:studentId/override`, async (req, res) => {
    try {
      if (!bursarOnly(res)) return;
      const termKey = z.string().trim().min(1).parse(req.query.termKey);
      await supabaseRequest(req, "jsa_fee_overrides", { method: "DELETE" },
        `?school_id=eq.${enc(String(req.params.schoolId))}&term_key=eq.${enc(termKey)}&student_id=eq.${enc(String(req.params.studentId))}`);
      res.json({ removed: true });
    } catch (error) {
      fail(res, error);
    }
  });

  // ---- Payments ----
  router.get(`${base}/payments`, async (req, res) => {
    try {
      const schoolId = String(req.params.schoolId);
      const termKey = await activeTermKey(deps, req, schoolId, req.query.termKey);
      const filters = [`school_id=eq.${enc(schoolId)}`, `term_key=eq.${enc(termKey)}`];
      const studentId = String(req.query.studentId ?? "").trim();
      const status = String(req.query.status ?? "").trim();
      const from = String(req.query.from ?? "").trim();
      const to = String(req.query.to ?? "").trim();
      const search = String(req.query.search ?? "").trim();
      if (studentId) filters.push(`student_id=eq.${enc(studentId)}`);
      if (status === "valid" || status === "cancelled") filters.push(`status=eq.${status}`);
      if (isDate(from)) filters.push(`paid_on=gte.${from}`);
      if (isDate(to)) filters.push(`paid_on=lte.${to}`);
      if (search) {
        const term = search.replace(/[*,()]/g, " ").trim();
        if (term) filters.push(`or=(student_name.ilike.*${enc(term)}*,receipt_no.ilike.*${enc(term)}*,tid.ilike.*${enc(term)}*)`);
      }
      const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 200) || 200));
      const rows = asRows(await supabaseRequest(req, "jsa_fee_payments", {}, `?${filters.join("&")}&select=*&order=seq.desc&limit=${limit}`));
      const payments = rows.map(mapPayment);
      res.json({ termKey, payments, totalValid: payments.filter((p) => p.status === "valid").reduce((total, p) => total + p.amount, 0) });
    } catch (error) {
      fail(res, error);
    }
  });

  router.post(`${base}/payments`, async (req, res) => {
    try {
      if (!bursarOnly(res)) return;
      const schoolId = String(req.params.schoolId);
      const body = z
        .object({
          termKey: z.string().trim().min(1),
          studentId: z.string().trim().min(1),
          amount: z.number().int("Enter the amount in whole shillings.").min(1, "Enter an amount above zero.").max(MAX_AMOUNT, "That amount is too large."),
          method: z.enum(METHODS).default("cash"),
          tid: z.string().trim().max(60).optional(),
          paidOn: z.string().trim().optional(),
          paidBy: z.string().trim().max(80).optional(),
          note: z.string().trim().max(200).optional(),
          allowDuplicateTid: z.boolean().optional(),
        })
        .strict()
        .parse(req.body);
      const paidOn = body.paidOn || today();
      if (!isDate(paidOn)) { res.status(400).json({ error: "Enter the payment date as YYYY-MM-DD." }); return; }
      if (paidOn > today()) { res.status(400).json({ error: "The payment date cannot be in the future." }); return; }
      const student = (await termStudents(deps, req, schoolId, body.termKey)).find((item) => item.id === body.studentId);
      if (!student) { res.status(404).json({ error: "Student not found in this term." }); return; }
      const tid = body.tid?.replace(/\s+/g, " ") || null;
      if (tid && !body.allowDuplicateTid) {
        const same = asRows(await supabaseRequest(req, "jsa_fee_payments", {}, `?school_id=eq.${enc(schoolId)}&tid=ilike.${enc(tid.replace(/[*%_]/g, ""))}&status=eq.valid&select=receipt_no,student_name&limit=1`));
        if (same[0]) {
          res.status(409).json({ code: "duplicate_tid", error: `Transaction ID ${tid} was already used on receipt ${same[0].receipt_no} (${same[0].student_name}).` });
          return;
        }
      }
      // Receipt numbers count up per school. If two receipts race for the same number, the database refuses one and we retry.
      for (let attempt = 0; attempt < 5; attempt++) {
        const last = asRows(await supabaseRequest(req, "jsa_fee_payments", {}, `?school_id=eq.${enc(schoolId)}&select=seq&order=seq.desc&limit=1`))[0];
        const seq = Number(last?.seq ?? 0) + 1;
        try {
          const created = asRows(await supabaseRequest(req, "jsa_fee_payments", {
            method: "POST",
            body: jsonBody({
              school_id: schoolId, seq, receipt_no: `RC${String(seq).padStart(6, "0")}`, term_key: body.termKey,
              student_id: student.id, student_name: student.name, class_name: student.className,
              amount: body.amount, method: body.method, tid, paid_on: paidOn, paid_by: body.paidBy || null, note: body.note || null,
              recorded_by: emailOf(req),
            }),
          }, "?on_conflict=school_id,seq"));
          const account = (await buildAccounts(deps, req, schoolId, body.termKey)).find((item) => item.studentId === student.id);
          res.status(201).json({ payment: mapPayment(created[0] ?? {}), account });
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (!/duplicate key|unique/i.test(message) || attempt === 4) throw error;
        }
      }
    } catch (error) {
      fail(res, error);
    }
  });

  // A receipt is never deleted. Cancelling keeps it on record, marked cancelled with the reason, and removes it from the totals.
  router.post(`${base}/payments/:paymentId/cancel`, async (req, res) => {
    try {
      if (!bursarOnly(res)) return;
      const schoolId = String(req.params.schoolId);
      const { reason } = z.object({ reason: z.string().trim().min(3, "Give a reason for cancelling this receipt.").max(200) }).strict().parse(req.body);
      const filter = `?id=eq.${enc(String(req.params.paymentId))}&school_id=eq.${enc(schoolId)}`;
      const current = asRows(await supabaseRequest(req, "jsa_fee_payments", {}, `${filter}&select=*`))[0];
      if (!current) { res.status(404).json({ error: "Receipt not found." }); return; }
      if (current.status === "cancelled") { res.status(409).json({ error: "This receipt is already cancelled." }); return; }
      const updated = asRows(await supabaseRequest(req, "jsa_fee_payments", {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: jsonBody({ status: "cancelled", cancel_reason: reason, cancelled_at: new Date().toISOString(), cancelled_by: emailOf(req) }),
      }, `${filter}&status=eq.valid`));
      if (!updated[0]) { res.status(409).json({ error: "This receipt is already cancelled." }); return; }
      res.json({ payment: mapPayment(updated[0]) });
    } catch (error) {
      fail(res, error);
    }
  });
}
