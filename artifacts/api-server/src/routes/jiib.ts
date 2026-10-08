import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
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
  getSupabaseUser,
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
    aoi: Number(row.aoi ?? row.c1 ?? 0),
    midterm: Number(row.midterm ?? row.c2 ?? 0),
    end: Number(row.end ?? row.c3 ?? 0),
    ...(Array.isArray(row.enteredFields) ? { enteredFields: row.enteredFields.map(String) } : {}),
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

function mapEvent(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    schoolId: String(row.school_id),
    title: String(row.title ?? ""),
    eventDate: String(row.event_date ?? ""),
    createdAt: new Date(String(row.created_at ?? new Date().toISOString())),
  };
}

// Source of truth for who may sign in to this school as admin/teacher,
// and what role they hold. Matches the original system's `allowed_users` table.
function mapAllowedUser(row: Record<string, unknown>) {
  return {
    schoolId: String(row.school_id),
    email: String(row.email ?? ""),
    displayName: (row.display_name as string | null | undefined) ?? null,
    role: row.role === "admin" ? "admin" : "teacher",
    subjects: Array.isArray(row.subjects) ? row.subjects.map(String) : [],
    createdAt: new Date(String(row.created_at ?? new Date().toISOString())),
  };
}

function mapTerm(row: Record<string, unknown>) {
  return {
    key: String(row.term_key ?? ""),
    schoolId: String(row.school_id),
    label: String(row.label ?? ""),
    status: String(row.status ?? "open"),
    createdAt: new Date(String(row.created_at ?? new Date().toISOString())),
  };
}

function mapGrade(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    schoolId: String(row.school_id),
    grade: String(row.grade ?? ""),
    min: Number(row.min ?? 0),
    descriptor: String(row.descriptor ?? ""),
  };
}

const EventBody = z.object({ title: z.string().min(1), eventDate: z.string().min(1) });
const AssessmentFieldBody = z.object({
  name: z.string().trim().min(1),
  field: z.enum(["c1", "c2", "c3"]),
  max: z.number().positive().max(100),
});
const SchoolRegistrationBody = z.object({
  name: z.string().trim().min(1).max(180),
  slug: z.string().trim().toLowerCase().min(3).max(40).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  logoUrl: z.string().url().nullable().optional(),
  initialAdminEmail: z.string().email().nullable().optional(),
  initialAdminName: z.string().trim().max(160).nullable().optional(),
  address: z.string().trim().max(300).optional(),
  assessmentFields: z.array(AssessmentFieldBody).min(1).max(3).optional(),
});
const SchoolStatusBody = z.object({ active: z.boolean() });
const AllowedUserBody = z.object({
  email: z.string().email(),
  displayName: z.string().optional(),
  role: z.enum(["admin", "teacher"]).optional(),
  subjects: z.array(z.string()).optional(),
});
const TermBody = z.object({ termKey: z.string().min(1), label: z.string().min(1) });
const TermStatusBody = z.object({ status: z.enum(["open", "closed"]) });
const GradeBody = z.object({ grade: z.string().min(1), min: z.number(), descriptor: z.string().optional() });
const PromoteBody = z.object({
  fromClass: z.string().min(1),
  toClass: z.string().min(1),
  assignments: z.record(z.string(), z.array(z.string())).optional(),
});
const ParentChatBody = z.object({
  phone: z.string().min(7).max(32),
  text: z.string().trim().min(1).max(5000),
  senderName: z.string().trim().max(120).optional(),
});

type SchoolConfig = Record<string, unknown>;

async function readSchoolConfig(req: Request, schoolId: string): Promise<SchoolConfig> {
  const rows = asRows(
    await supabaseRequest(
      req,
      "school_data",
      {},
      `?school_id=eq.${encodeURIComponent(schoolId)}&select=data&limit=1`,
    ),
  );
  const data = rows[0]?.data;
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as SchoolConfig)
    : {};
}

async function writeSchoolConfig(
  req: Request,
  schoolId: string,
  data: SchoolConfig,
): Promise<SchoolConfig> {
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
          updated_by: req.header("x-verified-user-email") ?? "app",
        }),
      },
      "?on_conflict=school_id",
    ),
  );
  if (!rows[0]) {
    throw new Error("School settings were not saved. Check the signed-in account's database access.");
  }
  const saved = rows[0].data;
  return saved && typeof saved === "object" && !Array.isArray(saved)
    ? (saved as SchoolConfig)
    : data;
}

function normalizedPhone(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").replace(/^0+/, "").slice(-9);
}

async function getParentPortalData(req: Request, schoolId: string, phoneInput: string) {
  const phone = normalizedPhone(phoneInput);
  if (phone.length < 7) throw new Error("Enter the phone number registered with the school.");

  const [config, rows] = await Promise.all([
    readSchoolConfig(req, schoolId),
    supabaseRequest(
      req,
      "students",
      {},
      `?school_id=eq.${encodeURIComponent(schoolId)}&parent_phone=not.is.null&select=id,school_id,term_key,name,class,house,parent_phone`,
    ),
  ]);
  const blockedParents = Array.isArray(config.blockedParents)
    ? config.blockedParents.map(normalizedPhone)
    : [];
  if (blockedParents.includes(phone)) {
    throw new Error("Parent portal access for this number has been restricted. Contact the school.");
  }

  const records = asRows(rows);
  const students = records
    .filter((row) => normalizedPhone(row.parent_phone) === phone)
    .map((row) => ({
      ...mapStudent(row),
      termKey: String(row.term_key ?? config.activeTerm ?? ""),
    }));

  const terms =
    config.terms && typeof config.terms === "object" && !Array.isArray(config.terms)
      ? (config.terms as Record<string, Record<string, unknown>>)
      : {};
  for (const [termKey, term] of Object.entries(terms)) {
    if (!Array.isArray(term.students)) continue;
    for (const rawStudent of term.students) {
      if (!rawStudent || typeof rawStudent !== "object") continue;
      const student = rawStudent as Record<string, unknown>;
      if (normalizedPhone(student.parentPhone ?? student.parent_phone) !== phone) continue;
      const id = String(student.id ?? "");
      if (!id || students.some((existing) => existing.id === id && existing.termKey === termKey)) continue;
      students.push({
        id,
        schoolId,
        name: String(student.name ?? ""),
        className: String(student.class ?? student.className ?? ""),
        house: String(student.house ?? ""),
        parentPhone: String(student.parentPhone ?? student.parent_phone ?? ""),
        badges: Array.isArray(student.badges) ? student.badges.map(String) : [],
        createdAt: new Date(),
        termKey,
      });
    }
  }

  if (!students.length) throw new Error("No student record matches that phone number.");
  const studentIds = new Set(students.map((student) => student.id));
  const markRows = asRows(
    await supabaseRequest(
      req,
      "marks",
      {},
      `?school_id=eq.${encodeURIComponent(schoolId)}&select=*&order=updated_at.desc`,
    ),
  );
  const legacyMarks: Array<Record<string, unknown> & { termKey: string }> = Object.entries(terms).flatMap(([termKey, term]) =>
    Array.isArray(term.marks)
      ? (term.marks as Array<Record<string, unknown>>).map((mark) => ({
          ...mark,
          termKey: String(mark.termKey ?? termKey),
        }))
      : [],
  );
  const marks = [
    ...markRows
      .filter((row) => studentIds.has(String(row.student_id)))
      .map((row) => ({ ...mapMark(row), termKey: String(row.term_key ?? "") })),
    ...legacyMarks
      .filter((mark) => studentIds.has(String(mark.studentId ?? "")))
      .map((mark) => ({
        id: String(mark.id ?? `${mark.studentId}-${mark.termKey}-${mark.subject}`),
        schoolId,
        studentId: String(mark.studentId),
        termKey: String(mark.termKey),
        subject: String(mark.subject ?? ""),
        aoi: Number(mark.aoi ?? mark.c1 ?? 0),
        midterm: Number(mark.midterm ?? mark.c2 ?? 0),
        end: Number(mark.end ?? mark.c3 ?? 0),
      })),
  ];
  const news = config.schoolNews ?? null;
  const events = Array.isArray(config.events) ? config.events : [];

  return {
    activeTerm: String(config.activeTerm ?? ""),
    students,
    marks,
    terms: Object.entries(terms).map(([key, term]) => ({
      key,
      label: String(term.label ?? key),
    })),
    subjects: config.subjects ?? {},
    grading: config.grading ?? [],
    schoolNews: news,
    events,
    schoolName: "",
  };
}

function requireSchoolAdmin(req: Request, res: Response, next: () => void) {
  if (res.locals.jiibRole !== "admin" && res.locals.jiibRole !== "super_admin") {
    res.status(403).json({ error: "A school administrator account is required for this action." });
    return;
  }
  next();
}

type AssessmentField = { name: string; max: number; field: "c1" | "c2" | "c3" };

function activeAssessmentFields(config: Record<string, unknown>): AssessmentField[] {
  const settings = config.settings && typeof config.settings === "object" && !Array.isArray(config.settings)
    ? config.settings as Record<string, unknown>
    : {};
  const rawSchema = Array.isArray(settings.marksSchema) ? settings.marksSchema : [];
  const schema = rawSchema
    .map((entry): AssessmentField | null => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const field = String(item.field ?? "");
      const max = Number(item.max ?? 0);
      const name = String(item.name ?? "").trim();
      if (!name || !["c1", "c2", "c3"].includes(field) || !Number.isFinite(max) || max <= 0) return null;
      return { name, max, field: field as AssessmentField["field"] };
    })
    .filter((entry): entry is AssessmentField => entry !== null);
  const defaultSchema: AssessmentField[] = [
    { name: "AOI", max: 10, field: "c1" },
    { name: "Midterm", max: 10, field: "c2" },
    { name: "End of Term", max: 80, field: "c3" },
  ];
  const chosen = schema.length ? schema : defaultSchema;
  const active = settings.activeMarkColumns;
  if (!Array.isArray(active)) return chosen;
  const selected = new Set(active.map(String));
  return chosen.filter((field) => selected.has(field.field));
}

function enteredMarkFields(mark: Record<string, unknown>, fields: AssessmentField[]) {
  if (Array.isArray(mark.enteredFields)) return mark.enteredFields.map(String);
  return fields
    .filter((field) => Number(mark[field.field] ?? mark[{ c1: "aoi", c2: "midterm", c3: "end" }[field.field] as "aoi" | "midterm" | "end"] ?? 0) > 0)
    .map((field) => field.field);
}

async function authorizeSuperAdmin(req: Request, res: Response) {
  const user = await getSupabaseUser(req);
  if (!user) {
    res.status(401).json({ error: "Sign in to use system administration." });
    return null;
  }
  const roles = asRows(await supabaseRequest(
    req,
    "user_roles",
    {},
    `?user_id=eq.${encodeURIComponent(user.id)}&role=eq.super_admin&select=role&limit=1`,
  ));
  if (!roles[0]) {
    res.status(403).json({ error: "This account is not a system administrator." });
    return null;
  }
  return user;
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

router.get("/auth/super-admin", async (req, res) => {
  try {
    const user = await getSupabaseUser(req);
    if (!user) {
      res.status(401).json({ error: "Sign in to verify super administrator access." });
      return;
    }
    const rows = asRows(
      await supabaseRequest(
        req,
        "user_roles",
        {},
        `?user_id=eq.${encodeURIComponent(user.id)}&role=eq.super_admin&select=role&limit=1`,
      ),
    );
    if (!rows[0]) {
      res.status(403).json({ error: "This account is not a super administrator." });
      return;
    }
    res.json({ role: "super_admin", email: user.email ?? "" });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/schools/portfolio", async (req, res) => {
  try {
    const user = await getSupabaseUser(req);
    if (!user) {
      res.status(401).json({ error: "Sign in to view the school portfolio." });
      return;
    }
    const roles = asRows(
      await supabaseRequest(
        req,
        "user_roles",
        {},
        `?user_id=eq.${encodeURIComponent(user.id)}&role=eq.super_admin&select=role&limit=1`,
      ),
    );
    if (!roles[0]) {
      res.status(403).json({ error: "This account is not a super administrator." });
      return;
    }
    const schools = asRows(
      await supabaseRequest(req, "schools", {}, "?select=*&order=name.asc"),
    );
    res.json(schools.map(mapSchool));
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/schools", async (req, res) => {
  try {
    if (!await authorizeSuperAdmin(req, res)) return;
    const body = SchoolRegistrationBody.parse(req.body);
    const assessmentFields = body.assessmentFields ?? [
      { name: "AOI", field: "c1" as const, max: 10 },
      { name: "Midterm", field: "c2" as const, max: 10 },
      { name: "End of Term", field: "c3" as const, max: 80 },
    ];
    if (new Set(assessmentFields.map((field) => field.field)).size !== assessmentFields.length) {
      res.status(400).json({ error: "Each assessment component must use a different mark field." });
      return;
    }
    const totalMarks = assessmentFields.reduce((sum, field) => sum + field.max, 0);
    if (Math.abs(totalMarks - 100) > 0.001) {
      res.status(400).json({ error: "Assessment component limits must add up to 100." });
      return;
    }
    const existingSlug = asRows(await supabaseRequest(
      req,
      "schools",
      {},
      `?slug=eq.${encodeURIComponent(body.slug)}&select=id&limit=1`,
    ));
    if (existingSlug.length) {
      res.status(409).json({ error: "That school URL is already in use." });
      return;
    }
    const schoolRows = asRows(await supabaseRequest(
      req,
      "schools",
      {
        method: "POST",
        body: jsonBody({
          name: body.name,
          slug: body.slug,
          logo_url: body.logoUrl ?? null,
          active: true,
        }),
      },
      "?select=*",
    ));
    const school = schoolRows[0];
    if (!school) throw new Error("The school record was not created.");
    const schoolId = String(school.id);
    const year = new Date().getFullYear();
    const termKey = `${year}-T1`;
    const config = {
      activeTerm: termKey,
      subjects: {},
      terms: {
        [termKey]: {
          label: `Term 1 — ${year}`,
          students: [],
          marks: [],
          locked: false,
          status: "open",
        },
      },
      settings: {
        address: body.address ?? "",
        houses: [],
        marksSchema: assessmentFields,
        activeMarkColumns: assessmentFields.map((field) => field.field),
      },
    };
    try {
      await supabaseRequest(
        req,
        "school_data",
        {
          method: "POST",
          body: jsonBody({
            school_id: schoolId,
            data: config,
            updated_at: new Date().toISOString(),
            updated_by: req.header("x-verified-user-email") ?? "system-admin",
          }),
        },
        "?on_conflict=school_id",
      );
      if (body.initialAdminEmail) {
        await supabaseRequest(
          req,
          "allowed_users",
          {
            method: "POST",
            body: jsonBody({
              school_id: schoolId,
              email: body.initialAdminEmail.toLowerCase(),
              display_name: body.initialAdminName ?? null,
              role: "admin",
              subjects: [],
            }),
          },
          "?on_conflict=school_id,email",
        );
      }
    } catch (error) {
      await supabaseRequest(
        req,
        "schools",
        { method: "DELETE" },
        `?id=eq.${encodeURIComponent(schoolId)}`,
      ).catch(() => undefined);
      throw error;
    }
    res.status(201).json(mapSchool(school));
  } catch (error) {
    sendError(res, error);
  }
});

router.patch("/schools/:schoolId/status", async (req, res) => {
  try {
    if (!await authorizeSuperAdmin(req, res)) return;
    const { schoolId } = GetSchoolConfigParams.parse(req.params);
    const body = SchoolStatusBody.parse(req.body);
    const rows = asRows(await supabaseRequest(
      req,
      "schools",
      { method: "PATCH", body: jsonBody({ active: body.active }) },
      `?id=eq.${encodeURIComponent(schoolId)}&select=*`,
    ));
    if (!rows[0]) {
      res.status(404).json({ error: "School not found." });
      return;
    }
    res.json(mapSchool(rows[0]));
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/schools/portfolio/analytics", async (req, res) => {
  try {
    if (!await authorizeSuperAdmin(req, res)) return;
    const [schoolRows, studentRows, markRows, configRows, userRows] = await Promise.all([
      supabaseRequest(req, "schools", {}, "?select=*&order=name.asc"),
      supabaseRequest(req, "students", {}, "?select=school_id,id,name,class,house,term_key"),
      supabaseRequest(req, "marks", {}, "?select=school_id,student_id,term_key,subject,c1,c2,c3,aoi,midterm,end"),
      supabaseRequest(req, "school_data", {}, "?select=school_id,data"),
      supabaseRequest(req, "allowed_users", {}, "?select=school_id,email"),
    ]);
    const schools = asRows(schoolRows);
    const students = asRows(studentRows);
    const marks = asRows(markRows);
    const configs = new Map(asRows(configRows).map((row) => [
      String(row.school_id),
      row.data && typeof row.data === "object" && !Array.isArray(row.data)
        ? row.data as Record<string, unknown>
        : {},
    ]));
    const users = asRows(userRows);
    const metrics = schools.map((schoolRow) => {
      const schoolId = String(schoolRow.id);
      const config = configs.get(schoolId) ?? {};
      const termKey = String(config.activeTerm ?? "");
      const termStudents = students.filter((student) =>
        String(student.school_id) === schoolId && (!termKey || String(student.term_key ?? "") === termKey),
      );
      const classes = new Set(termStudents.map((student) => String(student.class ?? "")).filter(Boolean));
      const fields = activeAssessmentFields(config);
      const subjectMap = config.subjects && typeof config.subjects === "object" && !Array.isArray(config.subjects)
        ? config.subjects as Record<string, unknown>
        : {};
      let expected = 0;
      for (const student of termStudents) {
        const rawSubjects = subjectMap[String(student.class ?? "")];
        const count = Array.isArray(rawSubjects)
          ? rawSubjects.filter((subject) => typeof subject === "string" ? subject.trim() : Boolean((subject as Record<string, unknown>)?.name)).length
          : 0;
        expected += count * fields.length;
      }
      const activeMarks = marks.filter((mark) =>
        String(mark.school_id) === schoolId && (!termKey || String(mark.term_key ?? "") === termKey),
      );
      const legacyTerm = config.terms && typeof config.terms === "object"
        ? (config.terms as Record<string, Record<string, unknown>>)[termKey]
        : undefined;
      const legacyMarks = Array.isArray(legacyTerm?.marks)
        ? legacyTerm.marks as Array<Record<string, unknown>>
        : [];
      const legacyByKey = new Map(legacyMarks.map((mark) => [
        `${String(mark.studentId ?? "")}|${String(mark.subject ?? "")}`,
        mark,
      ]));
      const studentClassById = new Map(termStudents.map((student) => [String(student.id), String(student.class ?? "")]));
      const marksEntered = new Set<string>();
      for (const mark of activeMarks) {
        const id = String(mark.student_id ?? "");
        const className = studentClassById.get(id);
        if (!className) continue;
        const legacy = legacyByKey.get(`${id}|${String(mark.subject ?? "")}`);
        const merged = { ...(legacy ?? {}), ...mark };
        const entered = enteredMarkFields({
          ...merged,
          c1: mark.c1 ?? mark.aoi ?? legacy?.c1 ?? legacy?.aoi,
          c2: mark.c2 ?? mark.midterm ?? legacy?.c2 ?? legacy?.midterm,
          c3: mark.c3 ?? mark.end ?? legacy?.c3 ?? legacy?.end,
        }, fields);
        entered.forEach((field) => marksEntered.add(`${id}|${String(mark.subject)}|${field}`));
      }
      for (const mark of legacyMarks) {
        const id = String(mark.studentId ?? "");
        if (!studentClassById.has(id)) continue;
        enteredMarkFields(mark, fields).forEach((field) =>
          marksEntered.add(`${id}|${String(mark.subject ?? "")}|${field}`),
        );
      }
      const percentage = expected ? Math.round((marksEntered.size / expected) * 100) : 0;
      return {
        schoolId,
        name: String(schoolRow.name ?? ""),
        slug: String(schoolRow.slug ?? ""),
        active: Boolean(schoolRow.active),
        studentCount: termStudents.length,
        classCount: classes.size,
        marksCompletionPercent: percentage,
      };
    });
    const totalExpected = metrics.reduce((sum, metric) => {
      const config = configs.get(metric.schoolId) ?? {};
      const termKey = String(config.activeTerm ?? "");
      const termStudents = students.filter((student) =>
        String(student.school_id) === metric.schoolId && (!termKey || String(student.term_key ?? "") === termKey),
      );
      const subjectMap = config.subjects && typeof config.subjects === "object" && !Array.isArray(config.subjects)
        ? config.subjects as Record<string, unknown>
        : {};
      return sum + termStudents.reduce((count, student) => {
        const rawSubjects = subjectMap[String(student.class ?? "")];
        const subjectCount = Array.isArray(rawSubjects) ? rawSubjects.length : 0;
        return count + subjectCount * activeAssessmentFields(config).length;
      }, 0);
    }, 0);
    const totalEntered = metrics.reduce((sum, metric) =>
      sum + Math.round(totalExpected * metric.marksCompletionPercent / 100), 0);
    res.json({
      schoolCount: metrics.length,
      activeSchoolCount: metrics.filter((school) => school.active).length,
      suspendedSchoolCount: metrics.filter((school) => !school.active).length,
      staffCount: new Set(users.map((user) => String(user.email ?? "").toLowerCase()).filter(Boolean)).size,
      studentCount: metrics.reduce((sum, school) => sum + school.studentCount, 0),
      marksCompletionPercent: totalExpected ? Math.round(totalEntered / totalExpected * 100) : 0,
      schools: metrics,
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/schools/portfolio/users", async (req, res) => {
  try {
    if (!await authorizeSuperAdmin(req, res)) return;
    const [userRows, schoolRows] = await Promise.all([
      supabaseRequest(req, "allowed_users", {}, "?select=*&order=created_at.asc"),
      supabaseRequest(req, "schools", {}, "?select=id,name"),
    ]);
    const schoolNames = new Map(asRows(schoolRows).map((row) => [String(row.id), String(row.name ?? "")]));
    res.json(asRows(userRows).map((row) => ({
      ...mapAllowedUser(row),
      schoolName: schoolNames.get(String(row.school_id)) ?? "Unknown school",
    })));
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/schools/portfolio/messages", async (req, res) => {
  try {
    if (!await authorizeSuperAdmin(req, res)) return;
    const [messageRows, schoolRows] = await Promise.all([
      supabaseRequest(req, "contact_messages", {}, "?select=*&order=created_at.desc&limit=500"),
      supabaseRequest(req, "schools", {}, "?select=id,name"),
    ]);
    const schoolNames = new Map(asRows(schoolRows).map((row) => [String(row.id), String(row.name ?? "")]));
    res.json(asRows(messageRows)
      .filter((row) => String(row.message ?? "").toLowerCase().startsWith("[system administrator help]"))
      .map((row) => ({
        ...mapMessage(row),
        schoolName: schoolNames.get(String(row.school_id)) ?? "Unknown school",
      })));
  } catch (error) {
    sendError(res, error);
  }
});

// Parent access follows the legacy system's phone-number verification. These
// routes return only the matching family's data; Supabase RLS still applies.
router.get("/schools/:schoolId/parents/portal", async (req, res) => {
  try {
    const { schoolId } = req.params;
    const phone = String(req.query.phone ?? "");
    const portal = await getParentPortalData(req, schoolId, phone);
    const schoolRows = asRows(
      await supabaseRequest(
        req,
        "schools",
        {},
        `?id=eq.${encodeURIComponent(schoolId)}&select=name&limit=1`,
      ),
    );
    res.json({ ...portal, schoolName: String(schoolRows[0]?.name ?? "") });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load the parent portal.";
    res.status(message.includes("restricted") ? 403 : 400).json({ error: message });
  }
});

router.get("/schools/:schoolId/parents/chat", async (req, res) => {
  try {
    const { schoolId } = req.params;
    const phone = normalizedPhone(req.query.phone);
    await getParentPortalData(req, schoolId, phone);
    const rows = asRows(
      await supabaseRequest(
        req,
        "parent_chat",
        {},
        `?school_id=eq.${encodeURIComponent(schoolId)}&phone=eq.${encodeURIComponent(phone)}&select=id,school_id,phone,sender,sender_name,text,ts&order=ts.asc&limit=100`,
      ),
    );
    res.json(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load this conversation.";
    res.status(message.includes("restricted") ? 403 : 400).json({ error: message });
  }
});

router.post("/schools/:schoolId/parents/chat", async (req, res) => {
  try {
    const { schoolId } = req.params;
    const body = ParentChatBody.parse(req.body);
    const portal = await getParentPortalData(req, schoolId, body.phone);
    const senderName = body.senderName?.trim() || `Parent of ${portal.students[0]?.name ?? "student"}`;
    const rows = asRows(
      await supabaseRequest(
        req,
        "parent_chat",
        {
          method: "POST",
          body: jsonBody({
            school_id: schoolId,
            phone: normalizedPhone(body.phone),
            sender: "parent",
            sender_name: senderName,
            text: body.text,
            ts: new Date().toISOString(),
          }),
        },
        "?select=id,school_id,phone,sender,sender_name,text,ts",
      ),
    );
    if (!rows[0]) throw new Error("Message was not saved. Check parent chat database access.");
    res.status(201).json(rows[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send this message.";
    res.status(message.includes("restricted") ? 403 : 400).json({ error: message });
  }
});

// All remaining school workspace endpoints require a real Supabase session
// that is registered for this school. The database still enforces RLS.
router.use("/schools/:schoolId", async (req, res, next) => {
  try {
    const user = await getSupabaseUser(req);
    if (!user) {
      res.status(401).json({ error: "Sign in with an authorized school account." });
      return;
    }
    const schoolId = String(req.params.schoolId);
    const email = String(user.email ?? "").toLowerCase();
    const allowed = email
      ? asRows(
          await supabaseRequest(
            req,
            "allowed_users",
            {},
            `?school_id=eq.${encodeURIComponent(schoolId)}&email=eq.${encodeURIComponent(email)}&select=role&limit=1`,
          ),
        )[0]
      : undefined;
    if (allowed) {
      res.locals.jiibRole = allowed.role === "admin" ? "admin" : "teacher";
    } else {
      const globalRoles = asRows(
        await supabaseRequest(
          req,
          "user_roles",
          {},
          `?user_id=eq.${encodeURIComponent(user.id)}&role=eq.super_admin&select=role&limit=1`,
        ),
      );
      if (!globalRoles[0]) {
        res.status(403).json({ error: "This account is not registered for this school." });
        return;
      }
      res.locals.jiibRole = "super_admin";
    }
    if (email) req.headers["x-verified-user-email"] = email;
    next();
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/schools/:schoolId/parent-chat", requireSchoolAdmin, async (req, res) => {
  try {
    const rows = asRows(
      await supabaseRequest(
        req,
        "parent_chat",
        {},
        `?school_id=eq.${encodeURIComponent(String(req.params.schoolId))}&select=id,school_id,phone,sender,sender_name,text,ts&order=ts.desc&limit=500`,
      ),
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/schools/:schoolId/parent-chat", requireSchoolAdmin, async (req, res) => {
  try {
    const schoolId = String(req.params.schoolId);
    const body = ParentChatBody.parse(req.body);
    await getParentPortalData(req, schoolId, body.phone);
    const rows = asRows(
      await supabaseRequest(
        req,
        "parent_chat",
        {
          method: "POST",
          body: jsonBody({
            school_id: schoolId,
            phone: normalizedPhone(body.phone),
            sender: "admin",
            sender_name: body.senderName?.trim() || String(req.headers["x-verified-user-email"] ?? "School team"),
            text: body.text,
            ts: new Date().toISOString(),
          }),
        },
        "?select=id,school_id,phone,sender,sender_name,text,ts",
      ),
    );
    if (!rows[0]) throw new Error("Message was not saved. Check parent chat database access.");
    res.status(201).json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});

router.delete("/schools/:schoolId/parent-chat", requireSchoolAdmin, async (req, res) => {
  try {
    const phone = normalizedPhone(req.query.phone);
    if (!phone) {
      res.status(400).json({ error: "A parent phone number is required." });
      return;
    }
    await supabaseRequest(
      req,
      "parent_chat",
      { method: "DELETE" },
      `?school_id=eq.${encodeURIComponent(String(req.params.schoolId))}&phone=eq.${encodeURIComponent(phone)}`,
    );
    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});

router.put("/schools/:schoolId/config", requireSchoolAdmin);
router.post("/schools/:schoolId/students", requireSchoolAdmin);
router.patch("/schools/:schoolId/students/:studentId", requireSchoolAdmin);
router.delete("/schools/:schoolId/students/:studentId", requireSchoolAdmin);
router.get("/schools/:schoolId/users", requireSchoolAdmin);
router.post("/schools/:schoolId/users", requireSchoolAdmin);
router.delete("/schools/:schoolId/users/:email", requireSchoolAdmin);
router.delete("/schools/:schoolId/marks", requireSchoolAdmin);

router.get("/schools/:schoolId/config", async (req, res) => {
  try {
    const { schoolId } = GetSchoolConfigParams.parse(req.params);
    const rows = asRows(await supabaseRequest(
      req,
      "school_data",
      {},
      `?school_id=eq.${encodeURIComponent(schoolId)}&select=school_id,data,updated_at&limit=1`,
    ));
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
    const savedData = await writeSchoolConfig(req, schoolId, data as SchoolConfig);
    const now = new Date().toISOString();
    res.json({
      schoolId: String(schoolId),
      data: savedData,
      updatedAt: new Date(now),
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/schools/:schoolId/dashboard", async (req, res) => {
  try {
    const { schoolId } = GetDashboardSummaryParams.parse(req.params);
    const [studentRows, markRows, configRows] = await Promise.all([
      supabaseRequest(req, "students", {}, `?school_id=eq.${encodeURIComponent(schoolId)}&select=id,name,class,house,created_at,term_key&order=created_at.desc`),
      supabaseRequest(req, "marks", {}, `?school_id=eq.${encodeURIComponent(schoolId)}&select=id,student_id,subject,term_key,updated_at&order=updated_at.desc&limit=5000`),
      supabaseRequest(req, "school_data", {}, `?school_id=eq.${schoolId}&select=data&limit=1`),
    ]);
    const config = asRows(configRows)[0]?.data as Record<string, unknown> | undefined;
    const termKey = String(config?.activeTerm ?? "");
    const terms = config?.terms && typeof config.terms === "object"
      ? config.terms as Record<string, Record<string, unknown>>
      : {};
    const activeTerm = terms[termKey];
    const studentMap = new Map<string, Record<string, unknown>>();
    for (const row of asRows(studentRows).filter((item) => !termKey || String(item.term_key ?? "") === termKey)) {
      studentMap.set(String(row.id), row);
    }
    const legacyStudents = Array.isArray(activeTerm?.students)
      ? activeTerm.students as Array<Record<string, unknown>>
      : [];
    for (const student of legacyStudents) {
      const id = String(student.id ?? "");
      if (!id) continue;
      const previous = studentMap.get(id) ?? {};
      studentMap.set(id, {
        ...student,
        ...previous,
        id,
        name: previous.name || student.name,
        class: previous.class || student.class || student.className,
        house: previous.house || student.house,
      });
    }
    const students = Array.from(studentMap.values());
    const markMap = new Map<string, Record<string, unknown>>();
    for (const mark of asRows(markRows).filter((item) => !termKey || String(item.term_key ?? "") === termKey)) {
      markMap.set(`${mark.student_id}|${mark.subject}`, mark);
    }
    const legacyMarks = Array.isArray(activeTerm?.marks)
      ? activeTerm.marks as Array<Record<string, unknown>>
      : [];
    for (const mark of legacyMarks) {
      const key = `${String(mark.studentId ?? "")}|${String(mark.subject ?? "")}`;
      if (key.startsWith("|")) continue;
      markMap.set(key, markMap.get(key) ?? mark);
    }
    const marks = Array.from(markMap.values());
    const classes = new Set(students.map((student) => String(student.class ?? "")));
    const houses = new Map<string, number>();
    students.forEach((student) => {
      const house = String(student.house ?? "Unassigned") || "Unassigned";
      houses.set(house, (houses.get(house) ?? 0) + 1);
    });
    const subjectMap = config?.subjects;
    const subjectsByClass = subjectMap && typeof subjectMap === "object" && !Array.isArray(subjectMap)
      ? subjectMap as Record<string, unknown>
      : undefined;
    const globalSubjectCount = Array.isArray(subjectMap) ? subjectMap.length : 0;
    const expected = Math.max(
      students.reduce((total, student) => {
        const classSubjects = subjectsByClass?.[String(student.class ?? "")];
        const count = Array.isArray(classSubjects) ? classSubjects.length : globalSubjectCount;
        return total + Math.max(count, 1);
      }, 0),
      marks.length,
    );
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
    const config = await readSchoolConfig(req, schoolId);
    const termKey = String(req.query.termKey ?? config.activeTerm ?? "");
    const filters = [`school_id=eq.${encodeURIComponent(schoolId)}`];
    if (termKey) filters.push(`term_key=eq.${encodeURIComponent(termKey)}`);
    if (className) filters.push(`class=eq.${encodeURIComponent(className)}`);
    if (house) filters.push(`house=eq.${encodeURIComponent(house)}`);
    if (search) filters.push(`name=ilike.*${encodeURIComponent(search)}*`);
    const databaseRows = asRows(
      await supabaseRequest(
        req,
        "students",
        {},
        `?${filters.join("&")}&select=*&order=updated_at.desc.nullslast,created_at.desc`,
      ),
    );
    const term = config.terms && typeof config.terms === "object"
      ? (config.terms as Record<string, Record<string, unknown>>)[termKey]
      : undefined;
    const legacyStudents = Array.isArray(term?.students)
      ? (term.students as Array<Record<string, unknown>>)
      : [];
    const legacyById = new Map(legacyStudents.map((student) => [String(student.id), student]));
    const byId = new Map<string, ReturnType<typeof mapStudent>>();
    for (const row of databaseRows) {
      const student = mapStudent(row);
      const legacy = legacyById.get(student.id);
      byId.set(student.id, {
        ...student,
        name: student.name || String(legacy?.name ?? ""),
        className: student.className || String(legacy?.class ?? legacy?.className ?? ""),
        house: student.house || String(legacy?.house ?? ""),
        parentPhone: student.parentPhone || String(legacy?.parentPhone ?? legacy?.parent_phone ?? "") || null,
        badges: student.badges.length ? student.badges : Array.isArray(legacy?.badges) ? legacy.badges.map(String) : [],
      });
    }
    for (const legacy of legacyStudents) {
      const student = {
        id: String(legacy.id ?? ""),
        schoolId,
        name: String(legacy.name ?? ""),
        className: String(legacy.class ?? legacy.className ?? ""),
        house: String(legacy.house ?? ""),
        parentPhone: String(legacy.parentPhone ?? legacy.parent_phone ?? "") || null,
        badges: Array.isArray(legacy.badges) ? legacy.badges.map(String) : [],
        createdAt: new Date(String(legacy.createdAt ?? legacy.created_at ?? new Date().toISOString())),
      };
      if (student.id && !byId.has(student.id)) byId.set(student.id, student);
    }
    const matches = Array.from(byId.values()).filter((student) =>
      (!className || student.className === className) &&
      (!house || student.house === house) &&
      (!search || student.name.toLowerCase().includes(search.toLowerCase())),
    );
    res.json(matches);
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/schools/:schoolId/students", async (req, res) => {
  try {
    const { schoolId } = CreateStudentParams.parse(req.params);
    const body = CreateStudentBody.parse(req.body);
    const config = await readSchoolConfig(req, schoolId);
    const termKey = String(config.activeTerm ?? "2026-T1");
    const studentId = `${body.className.replace(/[^a-z0-9]/gi, "")}_${Date.now()}`;
    const rows = asRows(
      await supabaseRequest(
        req,
        "students",
        {
          method: "POST",
          body: jsonBody({
            school_id: schoolId,
            term_key: termKey,
            id: studentId,
            name: body.name,
            class: body.className,
            house: body.house,
            parent_phone: body.parentPhone ?? null,
            updated_at: new Date().toISOString(),
          }),
        },
        "?on_conflict=id,school_id,term_key&select=*",
      ),
    );
    if (!rows[0]) throw new Error("Student was not saved. Check the signed-in account's database access.");
    const terms = config.terms && typeof config.terms === "object"
      ? (config.terms as Record<string, Record<string, unknown>>)
      : {};
    const activeTerm = terms[termKey] ?? { label: termKey, students: [], marks: [], locked: false };
    const legacyStudent = {
      id: studentId,
      name: body.name,
      class: body.className,
      house: body.house,
      parentPhone: body.parentPhone ?? "",
      subjects: [],
    };
    await writeSchoolConfig(req, schoolId, {
      ...config,
      activeTerm: config.activeTerm ?? termKey,
      terms: {
        ...terms,
        [termKey]: {
          ...activeTerm,
          students: [
            ...(Array.isArray(activeTerm.students)
              ? (activeTerm.students as Array<Record<string, unknown>>).filter((student) => String(student.id) !== studentId)
              : []),
            legacyStudent,
          ],
        },
      },
    });
    res.status(201).json(mapStudent(rows[0]));
  } catch (error) {
    sendError(res, error);
  }
});

router.patch("/schools/:schoolId/students/:studentId", async (req, res) => {
  try {
    const { schoolId, studentId } = UpdateStudentParams.parse(req.params);
    const body = UpdateStudentBody.parse(req.body);
    const config = await readSchoolConfig(req, schoolId);
    const termKey = String(config.activeTerm ?? "");
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) update.name = body.name;
    if (body.className !== undefined) update.class = body.className;
    if (body.house !== undefined) update.house = body.house;
    if (body.parentPhone !== undefined) update.parent_phone = body.parentPhone;
    const rows = asRows(
      await supabaseRequest(
        req,
        "students",
        { method: "PATCH", body: jsonBody(update) },
        `?id=eq.${encodeURIComponent(studentId)}&school_id=eq.${encodeURIComponent(schoolId)}${termKey ? `&term_key=eq.${encodeURIComponent(termKey)}` : ""}&select=*`,
      ),
    );
    if (!rows[0]) {
      res.status(404).json({ error: "Student not found" });
      return;
    }
    const terms = config.terms && typeof config.terms === "object"
      ? (config.terms as Record<string, Record<string, unknown>>)
      : {};
    const activeTerm = terms[termKey];
    if (activeTerm && Array.isArray(activeTerm.students)) {
      const students = activeTerm.students as Array<Record<string, unknown>>;
      await writeSchoolConfig(req, schoolId, {
        ...config,
        terms: {
          ...terms,
          [termKey]: {
            ...activeTerm,
            students: students.map((student) =>
              String(student.id) === studentId
                ? {
                    ...student,
                    ...(body.name !== undefined ? { name: body.name } : {}),
                    ...(body.className !== undefined ? { class: body.className } : {}),
                    ...(body.house !== undefined ? { house: body.house } : {}),
                    ...(body.parentPhone !== undefined ? { parentPhone: body.parentPhone ?? "" } : {}),
                  }
                : student,
            ),
          },
        },
      });
    }
    res.json(mapStudent(rows[0]));
  } catch (error) {
    sendError(res, error);
  }
});

router.delete("/schools/:schoolId/students/:studentId", async (req, res) => {
  try {
    const { schoolId, studentId } = DeleteStudentParams.parse(req.params);
    const config = await readSchoolConfig(req, schoolId);
    const termKey = String(config.activeTerm ?? "");
    await supabaseRequest(
      req,
      "students",
      { method: "DELETE" },
      `?id=eq.${encodeURIComponent(studentId)}&school_id=eq.${encodeURIComponent(schoolId)}${termKey ? `&term_key=eq.${encodeURIComponent(termKey)}` : ""}`,
    );
    const terms = config.terms && typeof config.terms === "object"
      ? (config.terms as Record<string, Record<string, unknown>>)
      : {};
    const activeTerm = terms[termKey];
    if (activeTerm && Array.isArray(activeTerm.students)) {
      await writeSchoolConfig(req, schoolId, {
        ...config,
        terms: {
          ...terms,
          [termKey]: {
            ...activeTerm,
            students: (activeTerm.students as Array<Record<string, unknown>>).filter(
              (student) => String(student.id) !== studentId,
            ),
          },
        },
      });
    }
    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/schools/:schoolId/marks", async (req, res) => {
  try {
    const { schoolId } = ListMarksParams.parse(req.params);
    const { termKey, className, subject } = ListMarksQueryParams.parse(req.query);
    const filters = [
      `school_id=eq.${encodeURIComponent(schoolId)}`,
      `term_key=eq.${encodeURIComponent(termKey)}`,
    ];
    if (className) filters.push(`class=eq.${encodeURIComponent(className)}`);
    if (subject) filters.push(`subject=eq.${encodeURIComponent(subject)}`);
    const [rows, config] = await Promise.all([
      await supabaseRequest(
        req,
        "marks",
        {},
        `?${filters.join("&")}&select=*&order=updated_at.desc`,
      ),
      readSchoolConfig(req, schoolId),
    ]);
    const databaseMarks = asRows(rows).map(mapMark);
    const terms = config.terms && typeof config.terms === "object"
      ? (config.terms as Record<string, Record<string, unknown>>)
      : {};
    const term = terms[termKey];
    const legacyMarks = Array.isArray(term?.marks)
      ? (term.marks as Array<Record<string, unknown>>).map((mark) => ({
          id: String(mark.id ?? `${mark.studentId}-${termKey}-${mark.subject}`),
          schoolId,
          studentId: String(mark.studentId ?? ""),
          termKey,
          subject: String(mark.subject ?? ""),
          aoi: Number(mark.aoi ?? mark.c1 ?? 0),
          midterm: Number(mark.midterm ?? mark.c2 ?? 0),
          end: Number(mark.end ?? mark.c3 ?? 0),
        }))
      : [];
    const byKey = new Map<string, ReturnType<typeof mapMark>>();
    for (const mark of legacyMarks) byKey.set(`${mark.studentId}|${mark.subject}`, mark);
    for (const mark of databaseMarks) byKey.set(`${mark.studentId}|${mark.subject}`, mark);
    const matching = Array.from(byKey.values()).filter((mark) =>
      (!subject || mark.subject === subject) &&
      (!className || String(
        (Array.isArray(term?.students)
          ? (term.students as Array<Record<string, unknown>>).find((student) => String(student.id) === mark.studentId)?.class
          : "") ?? "",
      ) === className),
    );
    res.json(matching);
  } catch (error) {
    sendError(res, error);
  }
});

router.put("/schools/:schoolId/marks", async (req, res) => {
  try {
    const { schoolId } = UpsertMarkParams.parse(req.params);
    const body = UpsertMarkBody.parse(req.body);
    const now = new Date().toISOString();
    const [studentRows, config] = await Promise.all([
      await supabaseRequest(
        req,
        "students",
        {},
        `?id=eq.${encodeURIComponent(body.studentId)}&school_id=eq.${encodeURIComponent(schoolId)}&select=class&limit=1`,
      ),
      readSchoolConfig(req, schoolId),
    ]);
    const termKey = body.termKey || String(config.activeTerm ?? "");
    const termMap = config.terms && typeof config.terms === "object"
      ? (config.terms as Record<string, Record<string, unknown>>)
      : {};
    const term = termMap[termKey];
    if (config.marksLocked || term?.locked || term?.status === "closed") {
      res.status(423).json({ error: "Marks are locked for this term." });
      return;
    }
    const legacyStudent = Array.isArray(term?.students)
      ? (term.students as Array<Record<string, unknown>>).find(
          (student) => String(student.id) === body.studentId,
        )
      : undefined;
    const normalizedStudentRows = asRows(studentRows);
    const studentClass = String(normalizedStudentRows[0]?.class ?? legacyStudent?.class ?? legacyStudent?.className ?? "");
    const rows = asRows(
      await supabaseRequest(
        req,
        "marks",
        {
          method: "POST",
          body: jsonBody({
            school_id: schoolId,
            student_id: body.studentId,
            term_key: termKey,
            subject: body.subject,
            class: studentClass,
            c1: body.aoi ?? 0,
            c2: body.midterm ?? 0,
            c3: body.end ?? 0,
            updated_at: now,
            updated_by: req.header("x-user-email") ?? "app",
          }),
        },
        "?on_conflict=school_id,term_key,student_id,subject&select=*",
      ),
    );
    if (!rows[0]) throw new Error("Mark was not saved. Check the signed-in account's database access.");
    const existingMarks = Array.isArray(term?.marks)
      ? (term.marks as Array<Record<string, unknown>>)
      : [];
    const nextMark = {
      studentId: body.studentId,
      subject: body.subject,
      class: studentClass,
      aoi: body.aoi ?? 0,
      midterm: body.midterm ?? 0,
      end: body.end ?? 0,
      updatedAt: now,
    };
    await writeSchoolConfig(req, schoolId, {
      ...config,
      activeTerm: config.activeTerm ?? termKey,
      terms: {
        ...termMap,
        [termKey]: {
          ...(term ?? { label: termKey, students: [], locked: false }),
          marks: [
            ...existingMarks.filter(
              (mark) => !(String(mark.studentId) === body.studentId && String(mark.subject) === body.subject),
            ),
            nextMark,
          ],
        },
      },
    });
    res.json(mapMark(rows[0]));
  } catch (error) {
    sendError(res, error);
  }
});

router.delete("/schools/:schoolId/marks", async (req, res) => {
  try {
    const { schoolId } = ListMarksParams.parse(req.params);
    const termKey = String(req.query.termKey ?? "").trim();
    if (!termKey) {
      res.status(400).json({ error: "termKey is required" });
      return;
    }
    const config = await readSchoolConfig(req, schoolId);
    await supabaseRequest(
      req,
      "marks",
      { method: "DELETE" },
      `?school_id=eq.${schoolId}&term_key=eq.${encodeURIComponent(termKey)}`,
    );
    const terms = config.terms && typeof config.terms === "object"
      ? (config.terms as Record<string, Record<string, unknown>>)
      : {};
    if (terms[termKey]) {
      await writeSchoolConfig(req, schoolId, {
        ...config,
        terms: { ...terms, [termKey]: { ...terms[termKey], marks: [] } },
      });
    }
    res.status(204).send();
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

// ---- School events are stored in the existing school_data JSON record ----
router.get("/schools/:schoolId/events", async (req, res) => {
  try {
    const config = await readSchoolConfig(req, String(req.params.schoolId));
    res.json(Array.isArray(config.events) ? config.events : []);
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/schools/:schoolId/events", async (req, res) => {
  try {
    const schoolId = String(req.params.schoolId);
    const body = EventBody.parse(req.body);
    const config = await readSchoolConfig(req, schoolId);
    const event = {
      id: crypto.randomUUID(),
      title: body.title,
      date: body.eventDate,
      createdAt: new Date().toISOString(),
    };
    await writeSchoolConfig(req, schoolId, {
      ...config,
      events: [...(Array.isArray(config.events) ? config.events : []), event],
    });
    res.status(201).json(event);
  } catch (error) {
    sendError(res, error);
  }
});

router.delete("/schools/:schoolId/events/:eventId", async (req, res) => {
  try {
    const { schoolId, eventId } = req.params;
    const config = await readSchoolConfig(req, schoolId);
    const events = Array.isArray(config.events) ? config.events : [];
    await writeSchoolConfig(req, schoolId, {
      ...config,
      events: events.filter((item) =>
        typeof item === "object" && item !== null
          ? String((item as Record<string, unknown>).id ?? "") !== eventId
          : String(item) !== eventId,
      ),
    });
    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});

// ---- Allowed users: THE source of truth for admin/teacher login access ----
// Mirrors the original system's `allowed_users` table (school_id, email, display_name, role, subjects).
router.get("/schools/:schoolId/users", async (req, res) => {
  try {
    const schoolId = String(req.params.schoolId);
    const rows = asRows(
      await supabaseRequest(req, "allowed_users", {}, `?school_id=eq.${schoolId}&select=*&order=created_at.asc`),
    );
    res.json(rows.map(mapAllowedUser));
  } catch (error) {
    sendError(res, error);
  }
});

// Used by the login flow to verify what role this email is REALLY registered as
// for this school, regardless of what the sign-in form's dropdown says.
router.get("/schools/:schoolId/users/:email", async (req, res) => {
  try {
    const schoolId = String(req.params.schoolId);
    const email = decodeURIComponent(String(req.params.email)).toLowerCase();
    const ownEmail = String(req.headers["x-verified-user-email"] ?? "").toLowerCase();
    if (res.locals.jiibRole !== "admin" && res.locals.jiibRole !== "super_admin" && ownEmail !== email) {
      res.status(403).json({ error: "You may only verify your own school account." });
      return;
    }
    const rows = asRows(
      await supabaseRequest(
        req,
        "allowed_users",
        {},
        `?school_id=eq.${schoolId}&email=eq.${encodeURIComponent(email)}&select=*&limit=1`,
      ),
    );
    if (!rows[0]) {
      res.status(404).json({ error: "This email is not registered for this school" });
      return;
    }
    res.json(mapAllowedUser(rows[0]));
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/schools/:schoolId/users", async (req, res) => {
  try {
    const schoolId = String(req.params.schoolId);
    const body = AllowedUserBody.parse(req.body);
    const rows = asRows(
      await supabaseRequest(
        req,
        "allowed_users",
        {
          method: "POST",
          body: jsonBody({
            school_id: schoolId,
            email: body.email.toLowerCase(),
            display_name: body.displayName ?? null,
            role: body.role ?? "teacher",
            subjects: body.subjects ?? [],
          }),
        },
        "?on_conflict=school_id,email&select=*",
      ),
    );
    if (!rows[0]) throw new Error("The staff account was not added. Check database access and the email address.");
    res.status(201).json(mapAllowedUser(rows[0]));
  } catch (error) {
    sendError(res, error);
  }
});

router.delete("/schools/:schoolId/users/:email", async (req, res) => {
  try {
    const schoolId = String(req.params.schoolId);
    const email = decodeURIComponent(String(req.params.email)).toLowerCase();
    await supabaseRequest(
      req,
      "allowed_users",
      { method: "DELETE" },
      `?school_id=eq.${schoolId}&email=eq.${encodeURIComponent(email)}`,
    );
    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});

// ---- Term management uses the original JSON term model in school_data ----
router.get("/schools/:schoolId/terms", async (req, res) => {
  try {
    const config = await readSchoolConfig(req, String(req.params.schoolId));
    const terms = config.terms && typeof config.terms === "object" && !Array.isArray(config.terms)
      ? (config.terms as Record<string, Record<string, unknown>>)
      : {};
    res.json(Object.entries(terms).map(([key, term]) => ({
      key,
      label: String(term.label ?? key),
      status: term.locked || term.status === "closed" ? "closed" : "open",
      active: config.activeTerm === key,
    })));
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/schools/:schoolId/terms", async (req, res) => {
  try {
    const schoolId = String(req.params.schoolId);
    const body = TermBody.parse(req.body);
    const config = await readSchoolConfig(req, schoolId);
    const terms = config.terms && typeof config.terms === "object" && !Array.isArray(config.terms)
      ? (config.terms as Record<string, Record<string, unknown>>)
      : {};
    if (terms[body.termKey]) {
      res.status(409).json({ error: "That term already exists." });
      return;
    }
    const term = {
      label: body.label,
      students: [],
      marks: [],
      locked: false,
      closedDate: null,
      createdDate: new Date().toISOString(),
    };
    await writeSchoolConfig(req, schoolId, {
      ...config,
      activeTerm: config.activeTerm ?? body.termKey,
      terms: { ...terms, [body.termKey]: term },
    });
    res.status(201).json({ key: body.termKey, ...term, status: "open" });
  } catch (error) {
    sendError(res, error);
  }
});

router.patch("/schools/:schoolId/terms/:termKey", async (req, res) => {
  try {
    const { schoolId, termKey } = req.params;
    const body = TermStatusBody.parse(req.body);
    const config = await readSchoolConfig(req, schoolId);
    const terms = config.terms && typeof config.terms === "object" && !Array.isArray(config.terms)
      ? (config.terms as Record<string, Record<string, unknown>>)
      : {};
    if (!terms[termKey]) {
      res.status(404).json({ error: "Term not found" });
      return;
    }
    const term = {
      ...terms[termKey],
      locked: body.status === "closed",
      status: body.status,
      closedDate: body.status === "closed" ? new Date().toISOString() : null,
    };
    await writeSchoolConfig(req, schoolId, { ...config, terms: { ...terms, [termKey]: term } });
    res.json({ key: termKey, ...term });
  } catch (error) {
    sendError(res, error);
  }
});

router.delete("/schools/:schoolId/terms/:termKey/data", async (req, res) => {
  try {
    const { schoolId, termKey } = req.params;
    const config = await readSchoolConfig(req, schoolId);
    const terms = config.terms && typeof config.terms === "object" && !Array.isArray(config.terms)
      ? (config.terms as Record<string, Record<string, unknown>>)
      : {};
    const term = terms[termKey];
    if (!(term?.locked || term?.status === "closed")) {
      res.status(400).json({ error: "Only closed terms can have their data deleted" });
      return;
    }
    await supabaseRequest(
      req,
      "marks",
      { method: "DELETE" },
      `?school_id=eq.${schoolId}&term_key=eq.${encodeURIComponent(termKey)}`,
    );
    await writeSchoolConfig(req, schoolId, {
      ...config,
      terms: {
        ...terms,
        [termKey]: { ...term, marks: [] },
      },
    });
    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});

// ---- Grading thresholds are the legacy `grading` array in school_data ----
router.get("/schools/:schoolId/grades", async (req, res) => {
  try {
    const config = await readSchoolConfig(req, String(req.params.schoolId));
    const grades = Array.isArray(config.grading) ? config.grading : [];
    res.json([...grades].sort((a, b) =>
      Number((b as Record<string, unknown>).min ?? 0) - Number((a as Record<string, unknown>).min ?? 0),
    ));
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/schools/:schoolId/grades", async (req, res) => {
  try {
    const schoolId = String(req.params.schoolId);
    const body = GradeBody.parse(req.body);
    const config = await readSchoolConfig(req, schoolId);
    const grades = Array.isArray(config.grading)
      ? (config.grading as Array<Record<string, unknown>>)
      : [];
    const grade = { grade: body.grade, min: body.min, descriptor: body.descriptor ?? "" };
    await writeSchoolConfig(req, schoolId, { ...config, grading: [...grades, grade] });
    res.status(201).json(grade);
  } catch (error) {
    sendError(res, error);
  }
});

router.delete("/schools/:schoolId/grades/:gradeId", async (req, res) => {
  try {
    const { schoolId, gradeId } = req.params;
    const config = await readSchoolConfig(req, schoolId);
    const grades = Array.isArray(config.grading)
      ? (config.grading as Array<Record<string, unknown>>)
      : [];
    await writeSchoolConfig(req, schoolId, {
      ...config,
      grading: grades.filter((grade) =>
        String(grade.id ?? grade.grade ?? "") !== gradeId && String(grade.grade ?? "") !== gradeId,
      ),
    });
    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});

// ---- Promotion (e.g. S.2 -> S.3) with optional subject assignment ----
router.post("/schools/:schoolId/promote", async (req, res) => {
  try {
    const schoolId = String(req.params.schoolId);
    const body = PromoteBody.parse(req.body);
    const config = await readSchoolConfig(req, schoolId);
    const termKey = String(config.activeTerm ?? "");
    const studentRows = asRows(
      await supabaseRequest(
        req,
        "students",
        {},
        `?school_id=eq.${encodeURIComponent(schoolId)}&class=eq.${encodeURIComponent(body.fromClass)}${termKey ? `&term_key=eq.${encodeURIComponent(termKey)}` : ""}&select=id`,
      ),
    );
    const results = [];
    for (const student of studentRows) {
      const studentId = String(student.id);
      const optionalSubjects = body.assignments?.[studentId] ?? [];
      const rows = asRows(
        await supabaseRequest(
          req,
          "students",
          {
            method: "PATCH",
            body: jsonBody({
              class: body.toClass,
              ...(optionalSubjects.length ? { subjects: optionalSubjects } : {}),
              updated_at: new Date().toISOString(),
            }),
          },
          `?id=eq.${encodeURIComponent(studentId)}&school_id=eq.${encodeURIComponent(schoolId)}${termKey ? `&term_key=eq.${encodeURIComponent(termKey)}` : ""}&select=*`,
        ),
      );
      if (rows[0]) results.push(mapStudent(rows[0]));
    }
    const terms = config.terms && typeof config.terms === "object"
      ? (config.terms as Record<string, Record<string, unknown>>)
      : {};
    const term = terms[termKey];
    if (term && Array.isArray(term.students)) {
      const assignments = body.assignments ?? {};
      await writeSchoolConfig(req, schoolId, {
        ...config,
        terms: {
          ...terms,
          [termKey]: {
            ...term,
            students: (term.students as Array<Record<string, unknown>>).map((student) =>
              String(student.class ?? student.className ?? "") === body.fromClass
                ? {
                    ...student,
                    class: body.toClass,
                    ...(assignments[String(student.id)] ? { subjects: assignments[String(student.id)] } : {}),
                  }
                : student,
            ),
          },
        },
      });
    }
    res.json({ promoted: results.length, students: results });
  } catch (error) {
    sendError(res, error);
  }
});

export default router;