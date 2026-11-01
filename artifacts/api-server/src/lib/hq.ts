// System administration helpers: the single super-administrator identity, device parsing, throttling and block checks.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { asRows, getSupabaseUser, supabaseRequest, type SupabaseUser } from "./supabase.js";

/** The one address allowed to be the super administrator. Change it with SUPER_ADMIN_EMAIL (and in hq-setup.sql). */
export const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL ?? "mygjyb@gmail.com").trim().toLowerCase();

export function isSuperAdminEmail(email: string | undefined | null) {
  return String(email ?? "").trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

// ---- Second-factor proof ------------------------------------------------------------------------------
// After the emailed code is accepted the server hands back a signed proof. Every administration request must carry it,
// so a stolen password alone is not enough to use the administration API.

const PROOF_HOURS = 8;

function proofSecret(): string | null {
  const base = process.env.HQ_2FA_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return base ? createHmac("sha256", "jiib-hq-proof-v1").update(base).digest("hex") : null;
}

export function proofConfigured() {
  return proofSecret() !== null;
}

export function signProof(userId: string): string | null {
  const secret = proofSecret();
  if (!secret) return null;
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + PROOF_HOURS * 3_600_000 })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

function proofIsValid(req: Request, userId: string): boolean {
  const secret = proofSecret();
  const header = String(req.header("x-hq-proof") ?? "");
  const [payload, signature] = header.split(".");
  if (!secret || !payload || !signature) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { uid?: string; exp?: number };
    return body.uid === userId && typeof body.exp === "number" && body.exp > Date.now();
  } catch {
    return false;
  }
}

/** True only for the one allowed address that holds the super_admin role AND passed the emailed-code step. */
export async function verifySuperAdmin(req: Request, user: SupabaseUser): Promise<boolean> {
  if (!isSuperAdminEmail(user.email)) return false;
  if (!proofIsValid(req, user.id)) return false;
  const roles = asRows(await supabaseRequest(
    req,
    "user_roles",
    {},
    `?user_id=eq.${encodeURIComponent(user.id)}&role=eq.super_admin&select=role&limit=1`,
  ));
  return Boolean(roles[0]);
}

export type PasswordSession = { access_token: string; refresh_token: string; expires_in: number; expires_at?: number; token_type: string; user: { id: string; email?: string } };

/** Checks an email and password with Supabase and confirms the account holds the super_admin role. */
export async function superAdminPasswordLogin(email: string, password: string): Promise<PasswordSession | null> {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon || !isSuperAdminEmail(email) || !password) return null;
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) return null;
  const session = (await response.json()) as PasswordSession;
  const roleResponse = await fetch(
    `${url}/rest/v1/user_roles?user_id=eq.${encodeURIComponent(session.user.id)}&role=eq.super_admin&select=role&limit=1`,
    { headers: { apikey: anon, Authorization: `Bearer ${session.access_token}` } },
  );
  const roles = roleResponse.ok ? ((await roleResponse.json()) as unknown[]) : [];
  return roles.length ? session : null;
}

/** The emailed-code service that already runs on your Supabase project (the old system's `send-verification-email`). */
export async function codeService(action: "send" | "verify", email: string, code?: string): Promise<{ ok: boolean; valid?: boolean; error?: string }> {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return { ok: false, error: "not configured" };
  try {
    const response = await fetch(`${url}/functions/v1/send-verification-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anon },
      body: JSON.stringify(action === "send" ? { action, email } : { action, email, code }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string; valid?: boolean };
    if (action === "verify") return { ok: response.ok, valid: body.valid === true, error: body.error };
    return { ok: response.ok && !body.error, error: body.error };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "request failed" };
  }
}

export async function currentSuperAdmin(req: Request): Promise<SupabaseUser | null> {
  const user = await getSupabaseUser(req);
  if (!user) return null;
  try {
    return (await verifySuperAdmin(req, user)) ? user : null;
  } catch {
    return null;
  }
}

export function clientIp(req: Request): string {
  // Vercel sets these itself from the real connection, so a visitor cannot choose their own address.
  const forwarded = String(req.header("x-vercel-forwarded-for") ?? req.header("x-real-ip") ?? req.header("x-forwarded-for") ?? "").split(",")[0]?.trim();
  return (forwarded || req.socket.remoteAddress || "").replace(/^::ffff:/, "").slice(0, 64);
}

export function describeDevice(userAgent: string) {
  const ua = userAgent || "";
  const os = /Android/i.test(ua) ? "Android"
    : /iPhone|iPad|iPod/i.test(ua) ? "iOS"
    : /Windows/i.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/i.test(ua) ? "macOS"
    : /CrOS/i.test(ua) ? "ChromeOS"
    : /Linux/i.test(ua) ? "Linux" : "Unknown";
  const browser = /Edg\//i.test(ua) ? "Edge"
    : /OPR\/|Opera/i.test(ua) ? "Opera"
    : /SamsungBrowser/i.test(ua) ? "Samsung Internet"
    : /Firefox\//i.test(ua) ? "Firefox"
    : /Chrome\/|CriOS/i.test(ua) ? "Chrome"
    : /Safari\//i.test(ua) ? "Safari" : "Browser";
  const deviceType = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) ? "tablet"
    : /Mobi|Android|iPhone|iPod/i.test(ua) ? "phone" : "computer";
  return { os, browser, deviceType };
}

// ---- Throttling (per server instance; Supabase applies its own limits to the email as well) -----------

const hits = new Map<string, number[]>();
export function tooManyAttempts(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > limit;
}

// ---- Blocked accounts (checked on every school request, cached briefly) ------------------------------

const blockCache = new Map<string, { blocked: boolean; at: number }>();
export async function accountIsBlocked(req: Request, user: SupabaseUser): Promise<boolean> {
  const hit = blockCache.get(user.id);
  if (hit && Date.now() - hit.at < 20_000) return hit.blocked;
  let blocked = false;
  try {
    blocked = (await supabaseRequest<unknown>(req, "rpc/account_blocked", { method: "POST", body: "{}" })) === true;
  } catch {
    blocked = false; // the setup script has not been run yet: never lock anyone out because of it
  }
  blockCache.set(user.id, { blocked, at: Date.now() });
  if (blockCache.size > 5000) blockCache.clear();
  return blocked;
}

export function forgetBlockState(userId?: string) {
  if (userId) blockCache.delete(userId); else blockCache.clear();
}
