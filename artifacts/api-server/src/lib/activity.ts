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

export async function readSchoolActivity(req: Request, schoolId: string) {
  try {
    const rows = asRows(await supabaseRequest(
      req, "jsa_activity", {},
      `?school_id=eq.${encodeURIComponent(schoolId)}&select=*&order=at.desc&limit=30`,
    ));
    return rows.map((row) => ({
      id: `${row.kind === "marks" ? "marks" : "login"}-${String(row.id)}`,
      label: row.kind === "marks" ? `${String(row.user_name)} entered marks` : `${String(row.user_name)} logged in`,
      detail: String(row.detail ?? ""),
      createdAt: new Date(String(row.at)),
    }));
  } catch {
    return [];
  }
}
