// Push notifications (Web Push). They reach a phone even when the app is closed:
//  - staff phones register a subscription (POST /schools/:id/push/subscribe),
//  - an administrator writes a message or sends the marks-deadline notice (POST .../push/send, .../push/deadline),
//  - a daily scheduled job sends deadline reminders and announces new app versions (GET /cron/push-daily).
// Messages are held by the phone's push service for up to two days, so a teacher who is offline gets the notification
// the moment their phone gets internet again. Data lives in three tables created by supabase/push-setup.sql and is only
// ever read or written here with the service key; the signing keys are created automatically on first use.
import type { IRouter, Request, RequestHandler, Response } from "express";
import * as webpush from "web-push";
import { z } from "zod";
import { asRows, supabaseAdminRequest } from "../lib/supabase.js";

type Row = Record<string, unknown>;
type Sub = { id: string; endpoint: string; p256dh: string; auth: string; email: string; role: string };
type Payload = { title: string; body: string; url: string; tag: string };
export type PushDeps = {
  readSchoolConfig: (req: Request, schoolId: string) => Promise<Record<string, unknown>>;
  requireSchoolAdmin: RequestHandler;
};

const enc = encodeURIComponent;
const WEB_URL = (process.env.WEB_APP_URL || "https://jiib-schools-web.vercel.app").replace(/\/+$/, "");
// The push standard needs a secure contact address; it is only shown to the phone makers' push services.
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || (WEB_URL.startsWith("https://") ? WEB_URL : "https://jiib-schools-web.vercel.app");
const TTL_SECONDS = 2 * 24 * 60 * 60;
const NON_TEACHER_ROLES = ["admin", "headteacher", "bursar", "super_admin"];
const TIME_ZONE = "Africa/Kampala"; // the app is for Ugandan schools: deadlines typed without a zone mean East Africa Time (UTC+3)

const isDuplicate = (error: unknown) => /duplicate key|23505|unique constraint/i.test(error instanceof Error ? error.message : String(error));

async function db<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await supabaseAdminRequest<T>(path, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isDuplicate(error) && /Could not find the table|schema cache|relation .* does not exist/i.test(message)) {
      throw new Error("Notifications are not set up yet. Run supabase/push-setup.sql in Supabase, then try again.");
    }
    throw error;
  }
}

// ---- signing keys ---------------------------------------------------------------------------------

let vapidCache: { publicKey: string; privateKey: string } | null = null;

async function getVapid() {
  if (vapidCache) return vapidCache;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (publicKey && privateKey) return (vapidCache = { publicKey, privateKey });
  const read = async () => {
    const row = asRows(await db(`/rest/v1/jsa_push_config?key=eq.vapid&select=value`))[0];
    try {
      const parsed = JSON.parse(String(row?.value ?? "null")) as { publicKey?: string; privateKey?: string } | null;
      return parsed?.publicKey && parsed.privateKey ? { publicKey: parsed.publicKey, privateKey: parsed.privateKey } : null;
    } catch { return null; }
  };
  let found = await read();
  if (!found) {
    try {
      await db(`/rest/v1/jsa_push_config`, { method: "POST", body: JSON.stringify({ key: "vapid", value: JSON.stringify(webpush.generateVAPIDKeys()) }) });
    } catch (error) { if (!isDuplicate(error)) throw error; }
    found = await read(); // if two requests raced, both end up using whichever key was stored first
  }
  if (!found) throw new Error("The notification keys could not be created.");
  return (vapidCache = found);
}

// ---- sending --------------------------------------------------------------------------------------

async function subscribers(schoolId: string | null, roles?: "teachers" | "staff"): Promise<Sub[]> {
  const all: Sub[] = [];
  for (let offset = 0; ; offset += 1000) {
    const filter = `${schoolId ? `&school_id=eq.${enc(schoolId)}` : ""}${roles === "teachers" ? `&role=eq.teacher` : ""}`;
    const rows = asRows(await db(`/rest/v1/jsa_push_subscriptions?select=id,endpoint,p256dh,auth,email,role${filter}&order=created_at.asc&limit=1000&offset=${offset}`));
    for (const row of rows) all.push({ id: String(row.id), endpoint: String(row.endpoint), p256dh: String(row.p256dh), auth: String(row.auth), email: String(row.email), role: String(row.role) });
    if (rows.length < 1000) return all;
  }
}

async function deliver(subs: Sub[], payload: Payload) {
  const vapid = await getVapid();
  const body = JSON.stringify(payload);
  const gone: string[] = [];
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < subs.length; i += 20) {
    const results = await Promise.allSettled(subs.slice(i, i + 20).map((sub) => webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      body,
      { TTL: TTL_SECONDS, urgency: "high", vapidDetails: { subject: VAPID_SUBJECT, publicKey: vapid.publicKey, privateKey: vapid.privateKey } },
    )));
    results.forEach((result, index) => {
      if (result.status === "fulfilled") { sent += 1; return; }
      failed += 1;
      const status = (result.reason as { statusCode?: number } | undefined)?.statusCode;
      if (status === 404 || status === 410) gone.push(subs[i + index].id); // the phone removed the app or turned notifications off
    });
  }
  for (let i = 0; i < gone.length; i += 50) {
    await db(`/rest/v1/jsa_push_subscriptions?id=in.(${gone.slice(i, i + 50).map(enc).join(",")})`, { method: "DELETE" }).catch(() => undefined);
  }
  return { sent, failed, removed: gone.length };
}

async function logPush(entry: { schoolId: string | null; kind: string; title: string; body: string; audience?: string; sentBy?: string; dedupKey?: string }) {
  try {
    const rows = asRows(await db(`/rest/v1/jsa_push_log`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ school_id: entry.schoolId, kind: entry.kind, title: entry.title, body: entry.body, audience: entry.audience ?? null, sent_by: entry.sentBy ?? null, dedup_key: entry.dedupKey ?? null }),
    }));
    return String(rows[0]?.id ?? "");
  } catch (error) {
    if (entry.dedupKey && isDuplicate(error)) return null; // this one was already sent
    throw error;
  }
}

const recordResult = (id: string, result: { sent: number; failed: number }) =>
  db(`/rest/v1/jsa_push_log?id=eq.${enc(id)}`, { method: "PATCH", body: JSON.stringify({ recipients: result.sent, failed: result.failed }) }).catch(() => undefined);

// ---- deadline text --------------------------------------------------------------------------------

export function parseDeadline(raw: unknown): Date | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(text) && text.includes("T");
  const full = hasZone ? text : text.length === 10 ? `${text}T23:59:00+03:00` : `${text}${text.length === 16 ? ":00" : ""}+03:00`;
  const date = new Date(full);
  return Number.isFinite(date.getTime()) ? date : null;
}

const day = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const dayGap = (due: Date, now: Date) => Math.round((Date.parse(day(due)) - Date.parse(day(now))) / 86_400_000);
const clock = (date: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true }).format(date).toLowerCase();
const fullLabel = (date: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(date).replace(",", "");

export function deadlineMessage(due: Date, now: Date, mode: "published" | "reminder"): { title: string; body: string } {
  const gap = dayGap(due, now);
  if (mode === "published") return { title: "Marks deadline set", body: `Please complete your marks by ${fullLabel(due)}.` };
  if (gap <= 0) return { title: "Marks are due today", body: `Please finish entering your marks before ${clock(due)}.` };
  if (gap === 1) return { title: "Marks are due tomorrow", body: `Deadline: ${fullLabel(due)}. Please complete your marks.` };
  return { title: `Marks are due in ${gap} days`, body: `Deadline: ${fullLabel(due)}. Please complete your marks.` };
}

// ---- scheduled work (also safe to run again: everything is guarded so nothing is sent twice) -------

export async function runDeadlineReminders(now = new Date()) {
  const rows = asRows(await db(`/rest/v1/school_data?select=school_id,data&limit=2000`));
  let schools = 0;
  let sent = 0;
  for (const row of rows) {
    const data = row.data && typeof row.data === "object" ? row.data as Row : {};
    const due = parseDeadline(data.deadline);
    if (!due || due.getTime() <= now.getTime()) continue;
    const gap = dayGap(due, now);
    if (gap < 0 || gap > 3) continue;
    const schoolId = String(row.school_id);
    const message = deadlineMessage(due, now, "reminder");
    const logId = await logPush({ schoolId, kind: "reminder", title: message.title, body: message.body, audience: "teachers", sentBy: "schedule", dedupKey: `reminder:${due.toISOString()}:${day(now)}` });
    if (!logId) continue; // today's reminder for this deadline already went out
    const result = await deliver(await subscribers(schoolId, "teachers"), { ...message, url: "/marks", tag: "jiib-deadline-reminder" });
    await recordResult(logId, result);
    schools += 1;
    sent += result.sent;
  }
  return { schools, sent };
}

async function currentWebBuild(): Promise<string | null> {
  try {
    const response = await fetch(`${WEB_URL}/sw.js?ts=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok || (response.headers.get("content-type") ?? "").includes("text/html")) return null;
    const build = /const BUILD = "([^"]+)"/.exec(await response.text())?.[1];
    return build && build !== "__BUILD_ID__" ? build : null;
  } catch { return null; }
}

let lastUpdateCheck = 0;
export async function runUpdateCheck(force = false): Promise<{ status: string; sent?: number }> {
  if (!force && Date.now() - lastUpdateCheck < 60_000) return { status: "recent" };
  lastUpdateCheck = Date.now();
  const build = await currentWebBuild();
  if (!build) return { status: "unknown" };
  const known = String(asRows(await db(`/rest/v1/jsa_push_config?key=eq.web_build&select=value`))[0]?.value ?? "");
  if (!known) {
    try { await db(`/rest/v1/jsa_push_config`, { method: "POST", body: JSON.stringify({ key: "web_build", value: build }) }); }
    catch (error) { if (!isDuplicate(error)) throw error; }
    return { status: "recorded" }; // first run: remember the current version, do not announce it
  }
  if (known === build) return { status: "unchanged" };
  // Only one caller wins the switch from the old version to the new one, so the announcement goes out once.
  const won = asRows(await db(`/rest/v1/jsa_push_config?key=eq.web_build&value=eq.${enc(known)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ value: build, updated_at: new Date().toISOString() }),
  }));
  if (!won.length) return { status: "raced" };
  const message = { title: "J-SCHOOLS update ready", body: "A new version is available. Open the app to update." };
  const logId = await logPush({ schoolId: null, kind: "update", title: message.title, body: message.body, audience: "everyone", sentBy: "schedule", dedupKey: `update:${build}` });
  if (!logId) return { status: "already-announced" };
  const result = await deliver(await subscribers(null), { ...message, url: "/", tag: "jiib-update" });
  await recordResult(logId, result);
  return { status: "announced", sent: result.sent };
}

// ---- routes that need no school sign-in -----------------------------------------------------------

export function registerPublicPushRoutes(router: IRouter, sendError: (res: Response, error: unknown) => void) {
  router.get("/push/public-key", async (_req, res) => {
    try { res.json({ publicKey: (await getVapid()).publicKey }); } catch (error) { sendError(res, error); }
  });

  // The app calls this when it notices a new version. The server decides for itself whether a new version really exists,
  // so a caller cannot make it announce anything.
  router.post("/push/check-update", async (_req, res) => {
    try { res.json(await runUpdateCheck()); } catch (error) { sendError(res, error); }
  });

  // Vercel Cron calls this once a day. If CRON_SECRET is set, only a caller holding it is accepted.
  router.get("/cron/push-daily", async (req, res) => {
    try {
      const secret = process.env.CRON_SECRET;
      if (secret && req.header("authorization") !== `Bearer ${secret}`) { res.status(401).json({ error: "Not allowed." }); return; }
      const reminders = await runDeadlineReminders();
      const update = await runUpdateCheck(true);
      res.json({ reminders, update });
    } catch (error) { sendError(res, error); }
  });
}

// ---- school routes (the sign-in and school checks run before these) -------------------------------

export function registerPushRoutes(router: IRouter, deps: PushDeps, sendError: (res: Response, error: unknown) => void) {
  const emailOf = (req: Request) => String(req.headers["x-verified-user-email"] ?? "").toLowerCase();

  router.post("/schools/:schoolId/push/subscribe", async (req, res) => {
    try {
      const schoolId = String(req.params.schoolId);
      const body = z.object({
        endpoint: z.string().url().max(1000).refine((value) => value.startsWith("https://"), "Push addresses must be secure."),
        keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(6).max(100) }),
        userAgent: z.string().max(300).optional(),
      }).parse(req.body);
      const email = emailOf(req);
      if (!email) { res.status(400).json({ error: "Sign in with a staff account to turn on notifications." }); return; }
      await db(`/rest/v1/jsa_push_subscriptions?on_conflict=endpoint`, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          school_id: schoolId, email, role: String(res.locals.jiibRole ?? "teacher"), endpoint: body.endpoint,
          p256dh: body.keys.p256dh, auth: body.keys.auth, user_agent: body.userAgent ?? null, last_seen: new Date().toISOString(),
        }),
      });
      res.json({ ok: true });
    } catch (error) { sendError(res, error); }
  });

  router.post("/schools/:schoolId/push/unsubscribe", async (req, res) => {
    try {
      const { endpoint } = z.object({ endpoint: z.string().max(1000) }).parse(req.body);
      await db(`/rest/v1/jsa_push_subscriptions?endpoint=eq.${enc(endpoint)}&school_id=eq.${enc(String(req.params.schoolId))}&email=eq.${enc(emailOf(req))}`, { method: "DELETE" });
      res.json({ ok: true });
    } catch (error) { sendError(res, error); }
  });

  router.get("/schools/:schoolId/push/status", deps.requireSchoolAdmin, async (req, res) => {
    try {
      const schoolId = String(req.params.schoolId);
      const [users, subs, history] = await Promise.all([
        db(`/rest/v1/allowed_users?school_id=eq.${enc(schoolId)}&select=email,role&limit=2000`).then(asRows),
        db(`/rest/v1/jsa_push_subscriptions?school_id=eq.${enc(schoolId)}&select=email,role&limit=5000`).then(asRows),
        db(`/rest/v1/jsa_push_log?school_id=eq.${enc(schoolId)}&select=id,kind,title,body,audience,sent_by,recipients,failed,created_at&order=created_at.desc&limit=8`).then(asRows),
      ]);
      const teacherEmails = new Set(users.filter((u) => !NON_TEACHER_ROLES.includes(String(u.role))).map((u) => String(u.email).toLowerCase()));
      const enabledTeachers = new Set(subs.filter((s) => teacherEmails.has(String(s.email).toLowerCase())).map((s) => String(s.email).toLowerCase()));
      res.json({
        teachers: { total: teacherEmails.size, enabled: enabledTeachers.size },
        staffDevices: subs.length,
        history: history.map((h) => ({ id: String(h.id), kind: String(h.kind), title: String(h.title), body: String(h.body), audience: h.audience ?? null, sentBy: h.sent_by ?? null, recipients: Number(h.recipients ?? 0), failed: Number(h.failed ?? 0), createdAt: String(h.created_at) })),
      });
    } catch (error) { sendError(res, error); }
  });

  router.post("/schools/:schoolId/push/send", deps.requireSchoolAdmin, async (req, res) => {
    try {
      const schoolId = String(req.params.schoolId);
      const input = z.object({
        title: z.string().trim().min(1, "Write a title.").max(60, "Keep the title to 60 characters or fewer."),
        body: z.string().trim().min(1, "Write a message.").max(240, "Keep the message to 240 characters or fewer."),
        audience: z.enum(["teachers", "staff"]),
      }).strict().parse(req.body);
      const logId = await logPush({ schoolId, kind: "message", title: input.title, body: input.body, audience: input.audience, sentBy: emailOf(req) || "admin" });
      const targets = await subscribers(schoolId, input.audience);
      const result = await deliver(targets, { title: input.title, body: input.body, url: "/", tag: `jiib-msg-${Date.now()}` });
      if (logId) await recordResult(logId, result);
      res.json({ ...result, devices: targets.length });
    } catch (error) { sendError(res, error); }
  });

  router.post("/schools/:schoolId/push/deadline", deps.requireSchoolAdmin, async (req, res) => {
    try {
      const schoolId = String(req.params.schoolId);
      const { mode } = z.object({ mode: z.enum(["published", "reminder"]) }).strict().parse(req.body);
      const config = await deps.readSchoolConfig(req, schoolId);
      const due = parseDeadline(config.deadline);
      const now = new Date();
      if (!due || due.getTime() <= now.getTime()) { res.status(409).json({ error: "There is no upcoming marks deadline to notify teachers about." }); return; }
      const message = deadlineMessage(due, now, mode);
      const logId = await logPush({ schoolId, kind: "deadline", title: message.title, body: message.body, audience: "teachers", sentBy: emailOf(req) || "admin" });
      const targets = await subscribers(schoolId, "teachers");
      const result = await deliver(targets, { ...message, url: "/marks", tag: "jiib-deadline" });
      if (logId) await recordResult(logId, result);
      res.json({ ...result, devices: targets.length });
    } catch (error) { sendError(res, error); }
  });
}
