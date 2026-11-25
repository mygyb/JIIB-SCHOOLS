// Nursery report card extras (activity ratings and comments), entered by the class teacher in the marks register.
// Stored in the school's saved settings as settings.nurseryExtras[termKey][studentId]; the report studio reads the same place.
import type { IRouter, Request, Response } from "express";
import { asRows, supabaseAdminRequest, supabaseRequest } from "../lib/supabase.js";

type Row = Record<string, unknown>;
const enc = encodeURIComponent;
const text = (value: unknown) => String(value ?? "").trim();
const ACTIVITY_IDS = ["writing", "listening", "reading", "speaking", "drawing", "games", "rhymes", "music", "health", "toilet"];

export function registerNurseryExtrasRoutes(router: IRouter, deps: { readSchoolConfig: (req: Request, schoolId: string) => Promise<Row> }) {
  router.get("/schools/:schoolId/nursery-extras", async (req: Request, res: Response) => {
    try {
      const role = res.locals.jiibRole;
      if (role !== "admin" && role !== "headteacher" && role !== "teacher") {
        res.status(403).json({ error: "Nursery ratings are available to school staff." });
        return;
      }
      const config = await deps.readSchoolConfig(req, String(req.params.schoolId));
      const termKey = text(req.query.termKey) || text(config.activeTerm);
      const settings = (config.settings && typeof config.settings === "object" ? config.settings : {}) as Row;
      const all = (settings.nurseryExtras && typeof settings.nurseryExtras === "object" ? settings.nurseryExtras : {}) as Record<string, unknown>;
      res.json({ termKey, entries: all[termKey] && typeof all[termKey] === "object" ? all[termKey] : {} });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Could not load the nursery ratings." });
    }
  });

  router.put("/schools/:schoolId/nursery-extras", async (req: Request, res: Response) => {
    try {
      const role = res.locals.jiibRole;
      if (role !== "admin" && role !== "teacher") {
        res.status(403).json({ error: "Only the school administrator or the class teacher can save nursery ratings." });
        return;
      }
      const schoolId = String(req.params.schoolId);
      const body = (req.body && typeof req.body === "object" ? req.body : {}) as Row;
      const studentId = text(body.studentId);
      const incoming = (body.extras && typeof body.extras === "object" ? body.extras : {}) as Row;
      if (!studentId) { res.status(400).json({ error: "Choose a pupil." }); return; }

      const config = await deps.readSchoolConfig(req, schoolId);
      const activeTerm = text(config.activeTerm);
      const termKey = text(body.termKey) || activeTerm;
      if (role === "teacher" && termKey !== activeTerm) {
        res.status(403).json({ error: "Ratings can only be changed for the current term." });
        return;
      }

      // Which class is this pupil in? A teacher may only rate pupils of a class they are assigned to.
      const rows = asRows(await supabaseRequest(req, "students", {}, `?school_id=eq.${enc(schoolId)}&term_key=eq.${enc(termKey)}&id=eq.${enc(studentId)}&select=class&limit=1`));
      const terms = config.terms && typeof config.terms === "object" ? (config.terms as Record<string, Row>) : {};
      const legacy = Array.isArray(terms[termKey]?.students) ? (terms[termKey].students as Row[]).find((item) => text(item?.id) === studentId) : undefined;
      const className = text(rows[0]?.class) || text(legacy?.class ?? legacy?.className);
      if (!className) { res.status(404).json({ error: "That pupil was not found in this term." }); return; }
      if (role === "teacher") {
        const email = text(req.headers["x-verified-user-email"]).toLowerCase();
        const me = asRows(await supabaseRequest(req, "allowed_users", {}, `?school_id=eq.${enc(schoolId)}&email=eq.${enc(email)}&select=subjects&limit=1`))[0];
        const mine = Array.isArray(me?.subjects) ? (me.subjects as unknown[]).some((item) => item && typeof item === "object" && text((item as Row).class).toLowerCase() === className.toLowerCase()) : false;
        if (!mine) { res.status(403).json({ error: "You can only rate pupils in the classes assigned to you." }); return; }
      }

      const activities: Record<string, string> = {};
      const rawActivities = (incoming.activities && typeof incoming.activities === "object" ? incoming.activities : {}) as Row;
      for (const id of ACTIVITY_IDS) { const value = text(rawActivities[id]).slice(0, 24); if (value) activities[id] = value; }
      const cleaned: Row = { activities, behaviour: text(incoming.behaviour).slice(0, 160) };
      if (role === "admin" && "headComment" in incoming) cleaned.headComment = text(incoming.headComment).slice(0, 200);

      // Change only this pupil's entry inside the newest saved settings; retry if somebody saved in between.
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const current = asRows(await supabaseAdminRequest(`/rest/v1/school_data?school_id=eq.${enc(schoolId)}&select=data,updated_at&limit=1`))[0];
        if (!current) { res.status(404).json({ error: "School settings were not found." }); return; }
        const data = (current.data && typeof current.data === "object" ? current.data : {}) as Row;
        const settings = (data.settings && typeof data.settings === "object" ? data.settings : {}) as Row;
        const all = (settings.nurseryExtras && typeof settings.nurseryExtras === "object" ? settings.nurseryExtras : {}) as Record<string, Record<string, Row>>;
        const termEntries = { ...(all[termKey] ?? {}) };
        termEntries[studentId] = { ...(termEntries[studentId] ?? {}), ...cleaned };
        const next = { ...data, settings: { ...settings, nurseryExtras: { ...all, [termKey]: termEntries } } };
        const saved = asRows(await supabaseAdminRequest(
          `/rest/v1/school_data?school_id=eq.${enc(schoolId)}&updated_at=eq.${enc(text(current.updated_at))}&select=updated_at`,
          { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ data: next, updated_at: new Date().toISOString(), updated_by: text(req.headers["x-verified-user-email"]) || "app" }) },
        ));
        if (saved[0]) { res.json({ studentId, entry: termEntries[studentId] }); return; }
      }
      res.status(409).json({ error: "Several people are saving at once. Please try again." });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Could not save the nursery ratings." });
    }
  });
}
