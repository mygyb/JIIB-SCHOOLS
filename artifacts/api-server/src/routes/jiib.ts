import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateMessageBody,
  CreateMessageParams,
  CreateStudentBody,
  CreateStudentParams,
  DeleteStudentParams,
  GetDashboardSummaryParams,
  GetSchoolBySlugParams,
  GetSchoolConfigParams,
  ListMarksParams,
  ListMarksQueryParams,
  ListMessagesParams,
  ListStudentsParams,
  ListStudentsQueryParams,
  MarkInput,
  UpdateSchoolConfigBody,
  UpdateSchoolConfigParams,
  UpdateStudentBody,
  UpdateStudentParams,
  UpsertMarkBody,
  UpsertMarkParams,
} from "@workspace/api-zod";
import {
  asRows,
  jsonBody,
  supabaseRequest,
  valueOf,
} from "../lib/supabase";

const router: IRouter = Router();

function sendError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  res.status(400).json({ error: message });
}

function mapSchool(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    logoUrl: (row.logo_url as string | null | undefined) ?? null,
    active: Boolean(row.active),
  };
}

function mapStudent(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    schoolId: String(row.school_id),
    name: String(row.name ?? ""),
    className: String(row.class ?? ""),
    house: String(row.house ?? ""),
    parentPhone: (row.parent_phone as string | null | undefined) ?? null,
    badges: Array.isArray(row.badges) ? row.badges.map(String) : [],
    createdAt: new Date(String(row.created_at ?? new Date().toISOString())),
  };
}

function mapMark(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    schoolId: String(row.school_id),
    studentId: String(row.student_id),
    termKey: String(row.term_key ?? ""),
    subject: String(row.subject ?? ""),
    aoi: Number(row.aoi ?? 0),
    midterm: Number(row.midterm ?? 0),
    end: Number(row.end ?? 0),
  };
}

function mapMessage(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    schoolId: String(row.school_id),
    senderName: String(row.sender_name ?? "School team"),
    senderEmail: (row.sender_email as string | null | undefined) ?? null,
    message: String(row.message ?? ""),
    direction: row.direction === "out" ? "out" : "in",
    read: Boolean(row.read),
    createdAt: new Date(String(row.created_at ?? new Date().toISOString())),
  };
}

router.get("/schools/by-slug/:slug", async (req, res) => {
  try {
    const { slug } = GetSchoolBySlugParams.parse(req.params);
    const rows = asRows(
      await supabaseRequest(req, "schools", {}, `?slug=eq.${encodeURIComponent(slug)}&select=*`),
    );
    if (!rows[0]) {
      res.status(404).json({ error: "School not found" });
      return;
    }
    res.json(mapSchool(rows[0]));
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/schools/:schoolId/config", async (req, res) => {
  try {
    const { schoolId } = GetSchoolConfigParams.parse(req.params);
    const rows = asRows(
      await supabaseRequest(
        req,
        "school_data",
        {},
        `?school_id=eq.${schoolId}&select=school_id,data,updated_at&limit=1`,
      ),
    );
    const row = rows[0] ?? {
      school_id: schoolId,
      data: {},
      updated_at: new Date().toISOString(),
    };
    res.json({
      schoolId: String(row.school_id),
      data: valueOf(row, "data", {}),
      updatedAt: new Date(String(row.updated_at)),
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.put("/schools/:schoolId/config", async (req, res) => {
  try {
    const { schoolId } = UpdateSchoolConfigParams.parse(req.params);
    const { data } = UpdateSchoolConfigBody.parse(req.body);
    const now = new Date().toISOString();
    const rows = asRows(
      await supabaseRequest(
        req,
        "school_data",
        {
          method: "POST",
          body: jsonBody({
            school_id: schoolId,
            data,
            updated_at: now,
            updated_by: req.header("x-user-email") ?? "app",
          }),
        },
        "?on_conflict=school_id",
      ),
    );
    const row = rows[0] ?? { school_id: schoolId, data, updated_at: now };
    res.json({
      schoolId: String(row.school_id),
      data: valueOf(row, "data", data),
      updatedAt: new Date(String(row.updated_at ?? now)),
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/schools/:schoolId/dashboard", async (req, res) => {
  try {
    const { schoolId } = GetDashboardSummaryParams.parse(req.params);
    const [studentRows, markRows, configRows] = await Promise.all([
      supabaseRequest(req, "students", {}, `?school_id=eq.${schoolId}&select=id,class,house,created_at&order=created_at.desc`),
      supabaseRequest(req, "marks", {}, `?school_id=eq.${schoolId}&select=id,term_key,updated_at&order=updated_at.desc&limit=5000`),
      supabaseRequest(req, "school_data", {}, `?school_id=eq.${schoolId}&select=data&limit=1`),
    ]);
    const students = asRows(studentRows);
    const marks = asRows(markRows);
    const config = asRows(configRows)[0]?.data as Record<string, unknown> | undefined;
    const classes = new Set(students.map((student) => String(student.class ?? "")));
    const houses = new Map<string, number>();
    students.forEach((student) => {
      const house = String(student.house ?? "Unassigned") || "Unassigned";
      houses.set(house, (houses.get(house) ?? 0) + 1);
    });
    const subjectMap = config?.subjects;
    const subjectCount: number =
      subjectMap && typeof subjectMap === "object"
        ? Object.values(subjectMap as Record<string, unknown>).reduce<number>(
            (total, subjects) =>
              total + (Array.isArray(subjects) ? subjects.length : 0),
            0,
          )
        : 0;
    const expected = Math.max(students.length * Math.max(subjectCount, 1), marks.length);
    res.json({
      studentCount: students.length,
      classCount: Array.from(classes).filter(Boolean).length,
      marksEntered: marks.length,
      marksExpected: expected,
      houses: Array.from(houses.entries()).map(([label, count]) => ({ label, count })),
      recentActivity: students.slice(0, 6).map((student) => ({
        id: String(student.id),
        label: "Student record updated",
        detail: String(student.name ?? student.class ?? "Student record"),
        createdAt: new Date(String(student.created_at ?? new Date().toISOString())),
      })),
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/schools/:schoolId/students", async (req, res) => {
  try {
    const { schoolId } = ListStudentsParams.parse(req.params);
    const { className, house, search } = ListStudentsQueryParams.parse(req.query);
    const filters = [`school_id=eq.${schoolId}`];
    if (className) filters.push(`class=eq.${encodeURIComponent(className)}`);
    if (house) filters.push(`house=eq.${encodeURIComponent(house)}`);
    if (search) filters.push(`name=ilike.*${encodeURIComponent(search)}*`);
    const rows = asRows(
      await supabaseRequest(
        req,
        "students",
        {},
        `?${filters.join("&")}&select=*&order=created_at.desc`,
      ),
    );
    res.json(rows.map(mapStudent));
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/schools/:schoolId/students", async (req, res) => {
  try {
    const { schoolId } = CreateStudentParams.parse(req.params);
    const body = CreateStudentBody.parse(req.body);
    const rows = asRows(
      await supabaseRequest(
        req,
        "students",
        {
          method: "POST",
          body: jsonBody({
            school_id: schoolId,
            term_key: "current",
            name: body.name,
            class: body.className,
            house: body.house,
            parent_phone: body.parentPhone ?? null,
            badges: body.badges ?? [],
          }),
        },
        "?select=*",
      ),
    );
    res.status(201).json(mapStudent(rows[0]));
  } catch (error) {
    sendError(res, error);
  }
});

router.patch("/schools/:schoolId/students/:studentId", async (req, res) => {
  try {
    const { schoolId, studentId } = UpdateStudentParams.parse(req.params);
    const body = UpdateStudentBody.parse(req.body);
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) update.name = body.name;
    if (body.className !== undefined) update.class = body.className;
    if (body.house !== undefined) update.house = body.house;
    if (body.parentPhone !== undefined) update.parent_phone = body.parentPhone;
    if (body.badges !== undefined) update.badges = body.badges;
    const rows = asRows(
      await supabaseRequest(
        req,
        "students",
        { method: "PATCH", body: jsonBody(update) },
        `?id=eq.${studentId}&school_id=eq.${schoolId}&select=*`,
      ),
    );
    if (!rows[0]) {
      res.status(404).json({ error: "Student not found" });
      return;
    }
    res.json(mapStudent(rows[0]));
  } catch (error) {
    sendError(res, error);
  }
});

router.delete("/schools/:schoolId/students/:studentId", async (req, res) => {
  try {
    const { schoolId, studentId } = DeleteStudentParams.parse(req.params);
    await supabaseRequest(
      req,
      "students",
      { method: "DELETE" },
      `?id=eq.${studentId}&school_id=eq.${schoolId}`,
    );
    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/schools/:schoolId/marks", async (req, res) => {
  try {
    const { schoolId } = ListMarksParams.parse(req.params);
    const { termKey, className, subject } = ListMarksQueryParams.parse(req.query);
    const filters = [`school_id=eq.${schoolId}`, `term_key=eq.${encodeURIComponent(termKey)}`];
    if (className) filters.push(`class=eq.${encodeURIComponent(className)}`);
    if (subject) filters.push(`subject=eq.${encodeURIComponent(subject)}`);
    const rows = asRows(
      await supabaseRequest(
        req,
        "marks",
        {},
        `?${filters.join("&")}&select=*&order=updated_at.desc`,
      ),
    );
    res.json(rows.map(mapMark));
  } catch (error) {
    sendError(res, error);
  }
});

router.put("/schools/:schoolId/marks", async (req, res) => {
  try {
    const { schoolId } = UpsertMarkParams.parse(req.params);
    const body = UpsertMarkBody.parse(req.body);
    const now = new Date().toISOString();
    const rows = asRows(
      await supabaseRequest(
        req,
        "marks",
        {
          method: "POST",
          body: jsonBody({
            school_id: schoolId,
            student_id: body.studentId,
            term_key: body.termKey,
            subject: body.subject,
            aoi: body.aoi ?? 0,
            midterm: body.midterm ?? 0,
            end: body.end ?? 0,
            updated_at: now,
            updated_by: req.header("x-user-email") ?? "app",
          }),
        },
        "?on_conflict=school_id,term_key,student_id,subject&select=*",
      ),
    );
    res.json(mapMark(rows[0]));
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/schools/:schoolId/messages", async (req, res) => {
  try {
    const { schoolId } = ListMessagesParams.parse(req.params);
    const rows = asRows(
      await supabaseRequest(
        req,
        "contact_messages",
        {},
        `?school_id=eq.${schoolId}&select=*&order=created_at.asc`,
      ),
    );
    res.json(rows.map(mapMessage));
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/schools/:schoolId/messages", async (req, res) => {
  try {
    const { schoolId } = CreateMessageParams.parse(req.params);
    const { message } = CreateMessageBody.parse(req.body);
    const rows = asRows(
      await supabaseRequest(
        req,
        "contact_messages",
        {
          method: "POST",
          body: jsonBody({
            school_id: schoolId,
            sender_name: req.header("x-user-name") ?? "School team",
            sender_email: req.header("x-user-email") ?? null,
            message,
            direction: "out",
            read: true,
          }),
        },
        "?select=*",
      ),
    );
    res.status(201).json(mapMessage(rows[0]));
  } catch (error) {
    sendError(res, error);
  }
});

export default router;