// System administration helpers: the single super-administrator identity, device parsing, throttling and block checks.
import type { Request } from "express";
import { asRows, getSupabaseUser, supabaseRequest, type SupabaseUser } from "./supabase.js";

/** The one address allowed to be the super administrator. Change it with SUPER_ADMIN_EMAIL (and in hq-setup.sql). */
export const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL ?? "mygjyb@gmail.com").trim().toLowerCase();

export function isSuperAdminEmail(email: string | undefined | null) {
  return String(email ?? "").trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

/** True only for the one allowed address that also holds the super_admin role in the database. */
export async function verifySuperAdmin(req: Request, user: SupabaseUser): Promise<boolean> {
  if (!isSuperAdminEmail(user.email)) return false;
  const roles = asRows(await supabaseRequest(
    req,
    "user_roles",
    {},
    `?user_id=eq.${encodeURIComponent(user.id)}&role=eq.super_admin&select=role&limit=1`,
  ));
  return Boolean(roles[0]);
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
