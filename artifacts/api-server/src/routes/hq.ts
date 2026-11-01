import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import {
  asRows,
  isSupabaseAdminConfigured,
  jsonBody,
  supabaseAdminRequest,
  supabaseRequest,
  type SupabaseUser,
} from "../lib/supabase.js";
import {
  clientIp,
  currentSuperAdmin,
  describeDevice,
  codeService,
  forgetBlockState,
  isSuperAdminEmail,
  proofConfigured,
  signProof,
  SUPER_ADMIN_EMAIL,
  superAdminPasswordLogin,
  tooManyAttempts,
} from "../lib/hq.js";

const router: IRouter = Router();

function fail(res: Response, error: unknown) {
  res.status(400).json({ error: error instanceof Error ? error.message : "Unexpected error" });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- Sign-in: password, then a code emailed by the existing verification service ----------------------------
// Every failure looks identical ("incorrect"), so nobody can tell whether an address is the administrator's.
const LoginBody = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200), code: z.string().max(12).optional() });

async function slowFail(res: Response, started: number) {
  const remaining = 900 - (Date.now() - started);
  if (remaining > 0) await wait(remaining);
  res.status(401).json({ error: "Email or password is incorrect." });
}

router.post("/hq/login-start", async (req, res) => {
  const started = Date.now();
  try {
    const body = LoginBody.parse(req.body);
    const email = body.email.trim().toLowerCase();
    if (tooManyAttempts(`ip:${clientIp(req)}`, 10, 15 * 60_000) || tooManyAttempts(`mail:${email}`, 8, 15 * 60_000)) {
      res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
      return;
    }
    const session = await superAdminPasswordLogin(email, body.password);
    if (!session) { await slowFail(res, started); return; }
    if (!proofConfigured()) { res.status(503).json({ error: "Sign-in is not configured on the server." }); return; }
    const sent = await codeService("send", email);
    if (!sent.ok) { res.status(502).json({ error: `Could not send the code${sent.error ? `: ${sent.error}` : ""}.` }); return; }
    res.json({ ok: true });
  } catch {
    await slowFail(res, started);
  }
});

router.post("/hq/login-verify", async (req, res) => {
  const started = Date.now();
  try {
    const body = LoginBody.parse(req.body);
    const email = body.email.trim().toLowerCase();
    if (tooManyAttempts(`verify:${email}`, 6, 10 * 60_000) || tooManyAttempts(`vip:${clientIp(req)}`, 12, 10 * 60_000)) {
      res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
      return;
    }
    const session = await superAdminPasswordLogin(email, body.password);
    const checked = session && body.code ? await codeService("verify", email, body.code.trim()) : null;
    if (!session || !checked?.valid) {
      const remaining = 700 - (Date.now() - started);
      if (remaining > 0) await wait(remaining);
      res.status(401).json({ error: "That code did not work." });
      return;
    }
    const proof = signProof(session.user.id);
    if (!proof) { res.status(503).json({ error: "Sign-in is not configured on the server." }); return; }
    res.json({ session, proof, email: session.user.email ?? email });
  } catch {
    res.status(401).json({ error: "That code did not work." });
  }
});

// ---- Device heartbeat (every signed-in device and every parent device) -----------------------------------
const HeartbeatBody = z.object({
  deviceId: z.string().min(8).max(80),
  event: z.enum(["login", "open", "ping"]).default("ping"),
  role: z.string().max(40).optional(),
  schoolId: z.string().uuid().optional().nullable(),
  schoolName: z.string().max(120).optional().nullable(),
  userLabel: z.string().max(80).optional().nullable(),
  isApp: z.boolean().optional(),
});

router.post("/devices/heartbeat", async (req, res) => {
  try {
    const body = HeartbeatBody.parse(req.body);
    const userAgent = String(req.header("user-agent") ?? "");
    const info = describeDevice(userAgent);
    const result = await supabaseRequest<{ status?: string } | null>(req, "rpc/jhq_device_heartbeat", {
      method: "POST",
      body: jsonBody({
        p_device_id: body.deviceId,
        p_event: body.event,
        p_role: body.role ?? null,
        p_school_id: body.schoolId ?? null,
        p_school_name: body.schoolName ?? null,
        p_user_label: body.userLabel ?? null,
        p_device_type: info.deviceType,
        p_os: info.os,
        p_browser: info.browser,
        p_is_app: body.isApp ?? false,
        p_user_agent: userAgent.slice(0, 300),
        p_ip: clientIp(req),
      }),
    });
    res.json({ status: result?.status ?? "ok" });
  } catch {
    // Tracking must never get in the way of using the app (for example before the database setup is run).
    res.json({ status: "ok" });
  }
});

// ---- Everything below is for the super administrator only; anyone else gets a plain 404 ---------------------
async function hqOnly(req: Request, res: Response, next: NextFunction) {
  const user = await currentSuperAdmin(req);
  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.locals.hqUser = user;
  next();
}
router.use("/hq", hqOnly);

async function audit(req: Request, action: string, target: string, detail = "") {
  const user = req.res?.locals.hqUser as SupabaseUser | undefined;
  try {
    await supabaseRequest(req, "jhq_audit", { method: "POST", body: jsonBody({ actor: user?.email ?? SUPER_ADMIN_EMAIL, action, target, detail: detail.slice(0, 300) }) }, "");
  } catch { /* the audit table is part of the setup script */ }
}

function mapDevice(row: Record<string, unknown>) {
  const lastSeen = new Date(String(row.last_seen ?? 0));
  return {
    deviceId: String(row.device_id),
    email: (row.user_email as string | null) ?? null,
    label: (row.user_label as string | null) ?? null,
    role: (row.role as string | null) ?? null,
    schoolId: (row.school_id as string | null) ?? null,
    schoolName: (row.school_name as string | null) ?? null,
    deviceType: String(row.device_type ?? "computer"),
    os: String(row.os ?? ""),
    browser: String(row.browser ?? ""),
    isApp: Boolean(row.is_app),
    ip: (row.ip as string | null) ?? null,
    firstSeen: String(row.first_seen ?? ""),
    lastSeen: String(row.last_seen ?? ""),
    loginCount: Number(row.login_count ?? 1),
    revoked: Boolean(row.revoked),
    blocked: Boolean(row.blocked),
    online: Date.now() - lastSeen.getTime() < 3 * 60_000,
  };
}

router.get("/hq/devices", async (req, res) => {
  try {
    const rows = asRows(await supabaseRequest(req, "jhq_devices", {}, "?select=*&order=last_seen.desc&limit=1500"));
    res.json(rows.map(mapDevice));
  } catch (error) { fail(res, error); }
});

router.get("/hq/devices/:deviceId/logins", async (req, res) => {
  try {
    const rows = asRows(await supabaseRequest(
      req, "jhq_logins", {},
      `?device_id=eq.${encodeURIComponent(String(req.params.deviceId))}&select=*&order=at.desc&limit=40`,
    ));
    res.json(rows.map((row) => ({ at: String(row.at), email: row.user_email ?? null, role: row.role ?? null, ip: row.ip ?? null })));
  } catch (error) { fail(res, error); }
});

async function patchDevice(req: Request, res: Response, patch: Record<string, unknown>, action: string) {
  try {
    const id = String(req.params.deviceId);
    await supabaseRequest(req, "jhq_devices", { method: "PATCH", body: jsonBody(patch) }, `?device_id=eq.${encodeURIComponent(id)}`);
    await audit(req, action, id);
    res.json({ ok: true });
  } catch (error) { fail(res, error); }
}
router.post("/hq/devices/:deviceId/revoke", (req, res) => patchDevice(req, res, { revoked: true, revoked_at: new Date().toISOString() }, "Signed device out"));
router.post("/hq/devices/:deviceId/block", (req, res) => patchDevice(req, res, { blocked: true, revoked: true, revoked_at: new Date().toISOString() }, "Blocked device"));
router.post("/hq/devices/:deviceId/unblock", (req, res) => patchDevice(req, res, { blocked: false }, "Unblocked device"));

// ---- Blocking accounts ------------------------------------------------------------------------------------
router.get("/hq/blocked", async (req, res) => {
  try {
    const rows = asRows(await supabaseRequest(req, "jhq_blocked", {}, "?select=*&order=blocked_at.desc"));
    res.json(rows.map((row) => ({ email: String(row.email), reason: (row.reason as string | null) ?? "", blockedAt: String(row.blocked_at) })));
  } catch (error) { fail(res, error); }
});

async function setLoginBan(req: Request, email: string, banned: boolean): Promise<boolean> {
  if (!isSupabaseAdminConfigured()) return false;
  try {
    const id = await supabaseRequest<string | null>(req, "rpc/jhq_user_id_by_email", { method: "POST", body: jsonBody({ p_email: email }) });
    if (!id) return false;
    await supabaseAdminRequest(`/auth/v1/admin/users/${encodeURIComponent(String(id))}`, {
      method: "PUT",
      body: JSON.stringify({ ban_duration: banned ? "876000h" : "none" }),
    });
    return true;
  } catch { return false; }
}

router.post("/hq/accounts/block", async (req, res) => {
  try {
    const body = z.object({ email: z.string().email().max(200), reason: z.string().max(300).optional() }).parse(req.body);
    const email = body.email.trim().toLowerCase();
    if (isSuperAdminEmail(email)) {
      res.status(400).json({ error: "The system administrator account cannot be blocked." });
      return;
    }
    await supabaseRequest(req, "jhq_blocked", {
      method: "POST",
      body: jsonBody({ email, reason: body.reason ?? "", blocked_by: SUPER_ADMIN_EMAIL, blocked_at: new Date().toISOString() }),
    }, "?on_conflict=email");
    await supabaseRequest(req, "jhq_devices", {
      method: "PATCH",
      body: jsonBody({ revoked: true, revoked_at: new Date().toISOString() }),
    }, `?user_email=eq.${encodeURIComponent(email)}`);
    const loginBanned = await setLoginBan(req, email, true);
    forgetBlockState();
    await audit(req, "Blocked account", email, body.reason ?? "");
    res.status(201).json({ ok: true, loginBanned });
  } catch (error) { fail(res, error); }
});

router.delete("/hq/accounts/:email/block", async (req, res) => {
  try {
    const email = decodeURIComponent(String(req.params.email)).trim().toLowerCase();
    await supabaseRequest(req, "jhq_blocked", { method: "DELETE" }, `?email=eq.${encodeURIComponent(email)}`);
    await setLoginBan(req, email, false);
    forgetBlockState();
    await audit(req, "Unblocked account", email);
    res.json({ ok: true });
  } catch (error) { fail(res, error); }
});

router.get("/hq/audit", async (req, res) => {
  try {
    const rows = asRows(await supabaseRequest(req, "jhq_audit", {}, "?select=*&order=at.desc&limit=200"));
    res.json(rows.map((row) => ({ at: String(row.at), actor: String(row.actor ?? ""), action: String(row.action ?? ""), target: String(row.target ?? ""), detail: String(row.detail ?? "") })));
  } catch (error) { fail(res, error); }
});

export default router;
