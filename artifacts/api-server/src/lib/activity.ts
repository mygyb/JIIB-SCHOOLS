// School activity feed: records teacher logins and marks entries so school administrators can see them on the dashboard.
import type { Request } from "express";
import { asRows, jsonBody, supabaseRequest } from "./supabase.js";

type Kind = "login" | "marks";

/** Records a teacher event. Never throws: the feed is optional and must not get in the way of real work. */
export async function logTeacherActivity(req: Request, email: string, schoolId: string, kind: Kind, detail = "") {
  try {
    const mail = email.trim().toLowerCase();
    if (!mail || !schoolId) return;
    const member = asRows(await supabaseRequest(
      req, "allowed_users", {},
      `?school_id=eq.${encodeURIComponent(schoolId)}&email=eq.${encodeURIComponent(mail)}&select=role,display_name&limit=1`,
    ))[0];
    if (!member || member.role === "admin") return; // only teachers are listed
    const name = String(member.display_name ?? "").trim() || mail;
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    // The same teacher doing the same thing within ten minutes is one entry, not fifty.
    const existing = asRows(await supabaseRequest(
      req, "jsa_activity", {},
      `?school_id=eq.${encodeURIComponent(schoolId)}&user_email=eq.${encodeURIComponent(mail)}&kind=eq.${kind}&detail=eq.${encodeURIComponent(detail)}&at=gte.${encodeURIComponent(since)}&select=id&limit=1`,
    ))[0];
    if (existing) {
      await supabaseRequest(req, "jsa_activity", { method: "PATCH", body: jsonBody({ at: new Date().toISOString() }) }, `?id=eq.${encodeURIComponent(String(existing.id))}`);
    } else {
      await supabaseRequest(req, "jsa_activity", {
        method: "POST",
        body: jsonBody({ school_id: schoolId, user_email: mail, user_name: name.slice(0, 80), kind, detail: detail.slice(0, 160) }),
      }, "");
    }
  } catch { /* the activity table comes from supabase/activity-setup.sql */ }
}

export async function listSchoolActivity(req: Request, schoolId: string, filter: { kind?: Kind; days?: number }) {
  const parts = [`school_id=eq.${encodeURIComponent(schoolId)}`];
  if (filter.kind) parts.push(`kind=eq.${filter.kind}`);
  if (filter.days) parts.push(`at=gte.${encodeURIComponent(new Date(Date.now() - filter.days * 86_400_000).toISOString())}`);
  const rows = asRows(await supabaseRequest(req, "jsa_activity", {}, `?${parts.join("&")}&select=*&order=at.desc&limit=500`));
  return rows.map((row) => ({
    id: String(row.id),
    kind: row.kind === "marks" ? "marks" : "login",
    userName: String(row.user_name ?? row.user_email ?? ""),
    userEmail: String(row.user_email ?? ""),
    detail: String(row.detail ?? ""),
    at: String(row.at),
  }));
}
