import { randomUUID } from "node:crypto";
import { registerFinanceRoutes } from "./finance.js";
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import {
  CreateMessageBody,
  CreateMessageParams,
  CreateSchoolTermBody,
  CreateSchoolTermParams,
  CreateStudentBody,
  CreateStudentParams,
  ActivateSchoolTermParams,
  ClearSchoolTermMarksParams,
  DeleteSchoolTermParams,
  DeleteStudentParams,
  GetDashboardSummaryParams,
  GetSchoolBySlugParams,
  GetSchoolConfigParams,
  GetSchoolConfigResponse,
  ListMarksParams,
  ListMarksQueryParams,
  ListMessagesParams,
  ListStudentsParams,
  ListStudentsQueryParams,
  MarkInput,
  UpdateSchoolAssessmentSettingsBody,
  UpdateSchoolConfigBody,
  UpdateSchoolConfigParams,
  UpdateSchoolTermBody,
  UpdateSchoolTermParams,
  UpdateTeacherSettingsBody,
  UpdateStudentBody,
  UpdateStudentParams,
  UpsertMarkBody,
  UpsertMarkParams,
} from "@workspace/api-zod";
import {
  asRows,
  createSupabaseAuthUser,
  deleteSupabaseAuthUser,
  findSupabaseAuthUserByEmail,
  getSupabaseUser,
  inviteSupabaseUser,
  isSupabaseInviteConfigured,
  isSupabaseAdminConfigured,
  jsonBody,
  supabaseAdminRequest,
  supabaseRequest,
  updateSupabaseAuthUser,
  valueOf,
} from "../lib/supabase.js";
import { listSchoolActivity, logTeacherActivity } from "../lib/activity.js";
import { aLevelEnabled as isALevelEnabledOn, combinationsOf, combinationsProblem, papersOf, enrolmentSubjects, resolveEnrolment, subjectsProblem, type Combination, type Enrolment } from "../lib/alevel.js";
import { cellKey, conversionsFor, convertConfigTerms, convertTable, planRescale, scaleMapper, scaleValue, type Conversion, type Mapper } from "../lib/rescale.js";
import { accountIsBlocked, clientIp, tooManyAttempts, verifySuperAdmin } from "../lib/hq.js";

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
    subjects: Array.isArray(row.subjects) ? row.subjects.map(String) : [],
    aLevel: null as Enrolment | null,
    createdAt: new Date(String(row.created_at ?? new Date().toISOString())),
  };
}

/** The stream / combination / subsidiary kept on a student's saved-settings copy, if any. */
function enrolmentOf(value: unknown): Enrolment | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if ((item.stream !== "sciences" && item.stream !== "arts") || typeof item.combination !== "string" || !item.combination) return null;
  return { stream: item.stream, combination: item.combination, ...(typeof item.subsidiary === "string" && item.subsidiary ? { subsidiary: item.subsidiary } : {}) };
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

export type StaffRole = "admin" | "teacher" | "headteacher" | "bursar";
const STAFF_ROLES: StaffRole[] = ["admin", "teacher", "headteacher", "bursar"];
/** Unknown values fall back to the least-privileged staff role. */
function staffRole(value: unknown): StaffRole {
  return STAFF_ROLES.includes(value as StaffRole) ? (value as StaffRole) : "teacher";
}

// Source of truth for who may sign in to this school as admin/teacher,
// and what role they hold. Matches the original system's `allowed_users` table.
function mapAllowedUser(row: Record<string, unknown>) {
  return {
    schoolId: String(row.school_id),
    email: String(row.email ?? ""),
    displayName: (row.display_name as string | null | undefined) ?? null,
    role: staffRole(row.role),
    subjects: Array.isArray(row.subjects)
      ? row.subjects.map((entry) => {
          if (typeof entry === "string") return entry;
          if (!entry || typeof entry !== "object") return String(entry);
          const assignment = entry as Record<string, unknown>;
          return {
            class: String(assignment.class ?? ""),
            subject: String(assignment.subject ?? ""),
          };
        })
      : [],
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

// An event may be saved without a date; it is then shown as "Date to be announced".
const EventBody = z.object({ title: z.string().trim().min(1), eventDate: z.string().default("") });
const AssessmentFieldBody = z.object({
  name: z.string().trim().min(1),
  field: z.enum(["c1", "c2", "c3"]),
  max: z.number().positive().max(100),
  entryMax: z.number().min(0.5).max(1000).optional(),
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
const HelpMessageBody = z.object({ message: z.string().trim().min(1).max(5000) });
const SupportBroadcastBody = z.object({
  message: z.string().trim().min(1).max(5000),
  schoolIds: z.array(z.string().uuid()).optional(),
});
const SubjectAssignmentBody = z.object({
  class: z.string().trim().min(1),
  subject: z.string().trim().min(1),
});
const AllowedUserBody = z.object({
  email: z.string().trim().email(),
  displayName: z.string().trim().min(1).max(160),
  role: z.enum(["admin", "teacher", "headteacher", "bursar"]),
  initialPassword: z.string().min(8).max(128),
  subjects: z.array(z.union([z.string(), SubjectAssignmentBody])).optional(),
}).strict();
const AllowedUserUpdateBody = z.object({
  email: z.string().trim().email().optional(),
  displayName: z.string().trim().min(1).max(160).optional(),
  role: z.enum(["admin", "teacher", "headteacher", "bursar"]).optional(),
  subjects: z.array(z.union([z.string(), SubjectAssignmentBody])).optional(),
}).strict();
const SchoolProfileBody = z.object({
  displayName: z.string().trim().min(1).max(160),
}).strict();
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
        subjects: Array.isArray(student.subjects) ? student.subjects.map(String) : [],
        aLevel: enrolmentOf(student.aLevel),
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
    assessmentFields: activeAssessmentFields(config),
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

/** Administrators and head teachers (who may look but not change) can read these. */
function requireSchoolViewer(req: Request, res: Response, next: () => void) {
  if (res.locals.jiibRole !== "admin" && res.locals.jiibRole !== "super_admin" && res.locals.jiibRole !== "headteacher") {
    res.status(403).json({ error: "A school administrator or head teacher account is required." });
    return;
  }
  next();
}

function requireSchoolAdmin(req: Request, res: Response, next: () => void) {
  if (res.locals.jiibRole !== "admin" && res.locals.jiibRole !== "super_admin") {
    res.status(403).json({ error: "A school administrator account is required for this action." });
    return;
  }
  next();
}

// `max` is what the assessment counts for out of 100. `entryMax` (optional, defaults to max) is what teachers type the
// mark out of; the converted score is mark / entryMax * max.
type AssessmentField = { name: string; max: number; field: "c1" | "c2" | "c3"; entryMax?: number };
const entryScale = (field: { max: number; entryMax?: number }) => field.entryMax ?? field.max;

function configuredAssessmentFields(config: Record<string, unknown>): AssessmentField[] {
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
      const entryMax = Number(item.entryMax);
      return {
        name, max, field: field as AssessmentField["field"],
        ...(Number.isFinite(entryMax) && entryMax > 0 && Math.abs(entryMax - max) > 1e-9 ? { entryMax } : {}),
      };
    })
    .filter((entry): entry is AssessmentField => entry !== null);
  const defaultSchema: AssessmentField[] = [
    { name: "AOI", max: 10, field: "c1" },
    { name: "Midterm", max: 10, field: "c2" },
    { name: "End of Term", max: 80, field: "c3" },
  ];
  return schema.length ? schema : defaultSchema;
}

function activeAssessmentFields(config: Record<string, unknown>): AssessmentField[] {
  const settings = config.settings && typeof config.settings === "object" && !Array.isArray(config.settings)
    ? config.settings as Record<string, unknown>
    : {};
  const chosen = configuredAssessmentFields(config);
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
  if (!await verifySuperAdmin(req, user)) {
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

// Lets the login page find a school by name. Only the name, short code and logo are returned, a few at a time.
router.get("/schools/search", async (req, res) => {
  try {
    if (tooManyAttempts(`school-search:${clientIp(req)}`, 60, 60_000)) {
      res.status(429).json({ error: "Too many searches. Please wait a moment." });
      return;
    }
    const q = String(req.query.q ?? "").replace(/[*%,()\\]/g, " ").trim().slice(0, 40);
    if (q.length < 2) {
      res.json([]);
      return;
    }
    const rows = asRows(
      await supabaseRequest(req, "schools", {}, `?name=ilike.${encodeURIComponent(`*${q}*`)}&active=eq.true&select=name,slug,logo_url&order=name.asc&limit=6`),
    );
    res.json(rows.map((row) => ({ name: String(row.name ?? ""), slug: String(row.slug ?? ""), logoUrl: (row.logo_url as string | null) ?? null })));
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
    if (!await verifySuperAdmin(req, user)) {
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
    if (!await verifySuperAdmin(req, user)) {
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
    if (body.initialAdminEmail && !isSupabaseInviteConfigured()) {
      res.status(503).json({ error: "School administrator invitations are not configured. Add SUPABASE_SERVICE_ROLE_KEY in Replit Secrets." });
      return;
    }
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
    let invitationSent: boolean | undefined;
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
        const invite = await inviteSupabaseUser(
          body.initialAdminEmail.toLowerCase(),
          body.initialAdminName?.trim() || body.initialAdminEmail.split("@")[0],
        );
        invitationSent = invite.invitationSent;
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
    res.status(201).json({
      ...mapSchool(school),
      ...(invitationSent === undefined ? {} : { invitationSent }),
    });
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
      supabaseRequest(req, "marks", {}, "?select=*&limit=50000"),
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
      .filter((row) => row.direction !== "out" && String(row.message ?? "").toLowerCase().startsWith("[system administrator help]"))
      .map((row) => ({
        ...mapMessage(row),
        schoolName: schoolNames.get(String(row.school_id)) ?? "Unknown school",
      })));
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/schools/portfolio/messages", async (req, res) => {
  try {
    const user = await authorizeSuperAdmin(req, res);
    if (!user) return;
    const body = SupportBroadcastBody.parse(req.body);
    const schoolRows = asRows(await supabaseRequest(req, "schools", {}, "?select=id,name,active&order=name.asc"));
    const chosen = body.schoolIds?.length
      ? schoolRows.filter((school) => body.schoolIds?.includes(String(school.id)))
      : schoolRows.filter((school) => Boolean(school.active));
    if (!chosen.length) {
      res.status(400).json({ error: "Choose at least one active school to receive the message." });
      return;
    }
    await Promise.all(chosen.map((school) => supabaseRequest(
      req,
      "contact_messages",
      {
        method: "POST",
        body: jsonBody({
          school_id: String(school.id),
          sender_name: user.email ?? "J-SCHOOLS system administrator",
          sender_email: user.email ?? null,
          message: `[System administrator help] ${body.message}`,
          direction: "out",
          read: false,
        }),
      },
      "?select=id",
    )));
    res.status(201).json({ sentTo: chosen.length });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/schools/:schoolId/help-messages", async (req, res) => {
  try {
    const body = HelpMessageBody.parse(req.body);
    const rows = asRows(await supabaseRequest(
      req,
      "contact_messages",
      {
        method: "POST",
        body: jsonBody({
          school_id: String(req.params.schoolId),
          sender_name: "School administrator",
          sender_email: String(req.header("x-verified-user-email") ?? "") || null,
          message: `[System administrator help] ${body.message}`,
          direction: "in",
          read: false,
        }),
      },
      "?select=id,school_id,sender_name,sender_email,message,direction,read,created_at",
    ));
    res.status(201).json(rows[0] ?? { sent: true });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/schools/:schoolId/help-messages", async (req, res) => {
  try {
    const schoolId = String(req.params.schoolId);
    const rows = asRows(await supabaseRequest(
      req,
      "contact_messages",
      {},
      `?school_id=eq.${encodeURIComponent(schoolId)}&select=*&order=created_at.asc&limit=250`,
    ));
    res.json(rows
      .filter((row) => String(row.message ?? "").toLowerCase().startsWith("[system administrator help]"))
      .map((row) => mapMessage(row)));
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
    if (await accountIsBlocked(req, user)) {
      res.status(403).json({ code: "account_blocked", error: "This account has been blocked. Please contact your school administrator." });
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
      res.locals.jiibRole = staffRole(allowed.role);
      const sub = req.path.replace(/\/+$/, "");
      // Head teachers can look at every department but change nothing. Bursars only reach the Finance workspace
      // (plus the read-only lists it needs). Neither may use the teacher-or-admin write routes below.
      if (res.locals.jiibRole === "headteacher" && req.method !== "GET") {
        res.status(403).json({ error: "Head teacher accounts can view school records but not change them." });
        return;
      }
      if (res.locals.jiibRole === "bursar") {
        const readable = req.method === "GET" && /^\/(config|students|terms|users\/[^/]+)$/.test(sub);
        if (!readable && !/^\/finance(\/|$)/.test(sub)) {
          res.status(403).json({ error: "Bursar accounts can only use the Finance workspace." });
          return;
        }
      }
    } else {
      if (!await verifySuperAdmin(req, user)) {
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

// Finance (Bursar full access, Head teacher read-only; administrators and teachers are refused inside the gate).
registerFinanceRoutes(router, { readSchoolConfig });

// Teacher logins and marks entries for the school's System settings page (administrators only).
router.get("/schools/:schoolId/activity", requireSchoolViewer, async (req, res) => {
  try {
    res.json(await listSchoolActivity(req, String(req.params.schoolId), {
      kind: req.query.kind === "login" || req.query.kind === "marks" ? req.query.kind : undefined,
      days: Math.max(0, Math.min(3650, Number(req.query.days) || 0)),
    }));
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/schools/:schoolId/parent-chat", requireSchoolViewer, async (req, res) => {
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
router.patch("/schools/:schoolId/teacher-settings", requireSchoolAdmin);
router.patch("/schools/:schoolId/assessment-settings", requireSchoolAdmin);
router.post("/schools/:schoolId/students", requireSchoolAdmin);
router.patch("/schools/:schoolId/students/:studentId", requireSchoolAdmin);
router.delete("/schools/:schoolId/students/:studentId", requireSchoolAdmin);
router.get("/schools/:schoolId/users", requireSchoolAdmin);
router.post("/schools/:schoolId/users", requireSchoolAdmin);
router.delete("/schools/:schoolId/users/:email", requireSchoolAdmin);
router.delete("/schools/:schoolId/marks", requireSchoolAdmin);
router.post("/schools/:schoolId/help-messages", requireSchoolAdmin);
router.get("/schools/:schoolId/help-messages", requireSchoolAdmin);
router.delete("/schools/:schoolId/terms/:termKey", requireSchoolAdmin);
router.post("/schools/:schoolId/events", requireSchoolAdmin);
router.delete("/schools/:schoolId/events/:eventId", requireSchoolAdmin);

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
    const aLevelIssue = subjectsProblem((data as SchoolConfig).subjects);
    if (aLevelIssue) { res.status(400).json({ error: aLevelIssue }); return; }
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

router.patch("/schools/:schoolId/teacher-settings", async (req, res) => {
  try {
    const { schoolId } = GetSchoolConfigParams.parse(req.params);
    const changes = UpdateTeacherSettingsBody.strict().parse(req.body);
    if (Object.keys(changes).length === 0) {
      res.status(400).json({ error: "At least one teacher setting must be provided." });
      return;
    }
    const current = await readSchoolConfig(req, schoolId);
    const next: SchoolConfig = { ...current };

    if ("deadline" in changes) next.deadline = changes.deadline;
    if ("deadlinePublishedAt" in changes) next.deadlinePublishedAt = changes.deadlinePublishedAt;
    if (changes.activeMarkColumns !== undefined) {
      if (new Set(changes.activeMarkColumns).size !== changes.activeMarkColumns.length) {
        res.status(400).json({ error: "Assessment fields must be unique." });
        return;
      }
      const availableColumns = new Set(configuredAssessmentFields(current).map((field) => field.field));
      if (changes.activeMarkColumns.some((field) => !availableColumns.has(field))) {
        res.status(400).json({ error: "Teacher assessment fields must be part of the school's assessment structure." });
        return;
      }
      const rawSettings = current.settings;
      const settings = rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings)
        ? rawSettings as Record<string, unknown>
        : {};
      next.settings = { ...settings, activeMarkColumns: changes.activeMarkColumns };
    }

    const savedData = await writeSchoolConfig(req, schoolId, next);
    res.json(GetSchoolConfigResponse.parse({
      schoolId,
      data: savedData,
      updatedAt: new Date(),
    }));
  } catch (error) {
    sendError(res, error);
  }
});

router.patch("/schools/:schoolId/assessment-settings", async (req, res) => {
  try {
    const { schoolId } = GetSchoolConfigParams.parse(req.params);
    const { marksSchema } = UpdateSchoolAssessmentSettingsBody.strict().parse(req.body);
    const fields = marksSchema as AssessmentField[];
    if (fields.some((field) => !field.name.trim() || field.name.trim().length > 60 || !Number.isFinite(field.max) || field.max <= 0 || field.max > 100)) {
      res.status(400).json({ error: "Each assessment needs a name and a maximum score between 0 and 100." });
      return;
    }
    if (new Set(fields.map((field) => field.field)).size !== fields.length) {
      res.status(400).json({ error: "Each assessment must use a different mark field." });
      return;
    }
    const names = fields.map((field) => field.name.trim().toLocaleLowerCase());
    if (new Set(names).size !== names.length) {
      res.status(400).json({ error: "Assessment names must be unique." });
      return;
    }
    const totalMarks = fields.reduce((sum, field) => sum + field.max, 0);
    if (Math.abs(totalMarks - 100) > 0.001) {
      res.status(400).json({ error: "Assessment maximums must add up to 100." });
      return;
    }
    if (fields.some((field) => field.entryMax !== undefined && (!Number.isFinite(field.entryMax) || field.entryMax < 0.5 || field.entryMax > 1000))) {
      res.status(400).json({ error: "\"Marks are entered out of\" must be between 0.5 and 1000." });
      return;
    }
    // An entry scale equal to the maximum is the default, so it is not stored.
    for (const field of fields) if (field.entryMax !== undefined && Math.abs(field.entryMax - field.max) < 1e-9) delete field.entryMax;

    const current = await readSchoolConfig(req, schoolId);
    const rawSettings = current.settings;
    const settings = rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings)
      ? rawSettings as Record<string, unknown>
      : {};
    const next: SchoolConfig = {
      ...current,
      settings: {
        ...settings,
        marksSchema: fields,
        activeMarkColumns: fields.map((field) => field.field),
      },
    };
    const savedData = await writeSchoolConfig(req, schoolId, next);
    res.json(GetSchoolConfigResponse.parse({
      schoolId,
      data: savedData,
      updatedAt: new Date(),
    }));
  } catch (error) {
    sendError(res, error);
  }
});

// ---- Rescale marks: convert marks already entered when an assessment's maximum score changes ----
const RescaleBody = z.object({
  marksSchema: z.array(AssessmentFieldBody).min(1).max(3),
  confirm: z.boolean().optional(),
  expectedFrom: z.array(z.object({ field: z.enum(["c1", "c2", "c3"]), from: z.number() })).optional(),
});
const UndoRescaleBody = z.object({ id: z.string().min(1) });

type RescaleEntry = {
  id: string;
  at: string;
  by: string;
  conversions: Conversion[];
  previousSchema: AssessmentField[];
  previousActive: string[];
  newSchema: AssessmentField[];
  total: number;
  rounded: Array<{ k: string; o: number; n: number }>;
  undone?: boolean;
  undoneAt?: string;
};

function schemaProblem(fields: AssessmentField[]): string | null {
  if (fields.some((field) => !field.name.trim() || field.name.trim().length > 60 || !Number.isFinite(field.max) || field.max <= 0 || field.max > 100)) {
    return "Each assessment needs a name and a maximum score between 0 and 100.";
  }
  if (new Set(fields.map((field) => field.field)).size !== fields.length) return "Each assessment must use a different mark field.";
  const names = fields.map((field) => field.name.trim().toLocaleLowerCase());
  if (new Set(names).size !== names.length) return "Assessment names must be unique.";
  if (Math.abs(fields.reduce((sum, field) => sum + field.max, 0) - 100) > 0.001) return "Assessment maximums must add up to 100.";
  if (fields.some((field) => field.entryMax !== undefined && (!Number.isFinite(field.entryMax) || field.entryMax < 0.5 || field.entryMax > 1000))) return "\"Marks are entered out of\" must be between 0.5 and 1000.";
  for (const field of fields) if (field.entryMax !== undefined && Math.abs(field.entryMax - field.max) < 1e-9) delete field.entryMax;
  return null;
}

function rescaleHistory(config: SchoolConfig): RescaleEntry[] {
  const settings = config.settings && typeof config.settings === "object" && !Array.isArray(config.settings) ? config.settings as Record<string, unknown> : {};
  return Array.isArray(settings.rescaleHistory) ? settings.rescaleHistory as RescaleEntry[] : [];
}

function settingsOf(config: SchoolConfig): Record<string, unknown> {
  return config.settings && typeof config.settings === "object" && !Array.isArray(config.settings) ? config.settings as Record<string, unknown> : {};
}

function termsOf(config: SchoolConfig): Record<string, Record<string, unknown>> {
  return config.terms && typeof config.terms === "object" && !Array.isArray(config.terms) ? config.terms as Record<string, Record<string, unknown>> : {};
}

function trimHistory(entries: RescaleEntry[]) {
  // Keep the last five records; only the three newest keep the exact originals of rounded marks.
  return entries.slice(-5).map((entry, index, all) => index < all.length - 3 ? { ...entry, rounded: [] } : entry);
}

// ---- A-Level combinations (PCM, HEG, ...). Saving also refreshes the subjects of every student enrolled in one. ----
const CombinationsBody = z.object({
  combinations: z.array(z.object({
    id: z.string().min(1).max(64).optional(),
    name: z.string(),
    stream: z.enum(["sciences", "arts"]),
    subjects: z.array(z.string()),
  }).strict()).max(60),
}).strict();

const ALevelGradingBody = z.object({
  principal: z.array(z.object({ grade: z.string().trim().min(1).max(3), min: z.number().min(0).max(100), points: z.number().int().min(0).max(9) }).strict()).min(2).max(10),
  subsidiaryPass: z.number().min(0).max(100),
}).strict();

router.patch("/schools/:schoolId/a-level-grading", requireSchoolAdmin, async (req, res) => {
  try {
    const { schoolId } = ListMarksParams.parse(req.params);
    const body = ALevelGradingBody.parse(req.body);
    const bands = body.principal;
    const grades = new Set(bands.map((band) => band.grade.toUpperCase()));
    let problem = "";
    if (grades.size !== bands.length) problem = "Each grade letter can be used once.";
    else if (new Set(bands.map((band) => band.min)).size !== bands.length) problem = "Each grade needs a different minimum mark.";
    else if (Math.min(...bands.map((band) => band.min)) !== 0) problem = "The lowest grade must start at 0 so every mark gets a grade.";
    else {
      const sorted = [...bands].sort((a, b) => b.min - a.min);
      if (sorted.some((band, index) => index > 0 && band.points > sorted[index - 1].points)) problem = "A higher mark can never earn fewer points than a lower one.";
    }
    if (problem) { res.status(400).json({ error: problem }); return; }
    const config = await readSchoolConfig(req, schoolId);
    const settings = config.settings && typeof config.settings === "object" ? (config.settings as Record<string, unknown>) : {};
    const principal = [...bands].sort((a, b) => b.min - a.min).map((band) => ({ grade: band.grade.toUpperCase(), min: band.min, points: band.points }));
    const saved = await writeSchoolConfig(req, schoolId, { ...config, settings: { ...settings, aLevelGrading: { principal, subsidiaryPass: body.subsidiaryPass } } });
    res.json(GetSchoolConfigResponse.parse({ schoolId, data: saved, updatedAt: new Date() }));
  } catch (error) {
    sendError(res, error);
  }
});

const ALEVEL_MARKS_MISSING = "A-Level marks storage is not set up yet. Ask the system administrator to run supabase/alevel-setup.sql once.";
const alevelMarksTableMissing = (error: unknown) => /jsa_alevel_marks|relation .* does not exist|schema cache/i.test(error instanceof Error ? error.message : "");

router.get("/schools/:schoolId/a-level/marks", async (req, res) => {
  try {
    const { schoolId } = ListMarksParams.parse(req.params);
    const termKey = String(req.query.termKey ?? "").trim();
    const subject = String(req.query.subject ?? "").trim();
    if (!termKey) { res.status(400).json({ error: "termKey is required" }); return; }
    const rows: Array<Record<string, unknown>> = [];
    try {
      for (let offset = 0; ; offset += 1000) {
        const page = asRows(await supabaseRequest(req, "jsa_alevel_marks", {},
          `?school_id=eq.${encodeURIComponent(schoolId)}&term_key=eq.${encodeURIComponent(termKey)}${subject ? `&subject=eq.${encodeURIComponent(subject)}` : ""}&select=student_id,subject,paper,score&order=student_id,subject,paper&limit=1000&offset=${offset}`));
        rows.push(...page);
        if (page.length < 1000) break;
      }
    } catch (error) {
      if (alevelMarksTableMissing(error)) { res.status(503).json({ error: ALEVEL_MARKS_MISSING }); return; }
      throw error;
    }
    res.json(rows.map((row) => ({ studentId: String(row.student_id), subject: String(row.subject ?? subject), paper: String(row.paper), score: Number(row.score) })));
  } catch (error) {
    sendError(res, error);
  }
});

const ALevelMarkBody = z.object({
  termKey: z.string().optional(),
  studentId: z.string().min(1),
  subject: z.string().min(1),
  paper: z.string().min(1),
  score: z.number().finite().nullable(),
}).strict();

router.put("/schools/:schoolId/a-level/marks", async (req, res) => {
  try {
    const { schoolId } = ListMarksParams.parse(req.params);
    const body = ALevelMarkBody.parse(req.body);
    const isTeacher = res.locals.jiibRole === "teacher";
    const [config, teacherRows] = await Promise.all([
      readSchoolConfig(req, schoolId),
      isTeacher
        ? supabaseRequest(req, "allowed_users", {}, `?school_id=eq.${encodeURIComponent(schoolId)}&email=eq.${encodeURIComponent(String(req.headers["x-verified-user-email"] ?? "").toLowerCase())}&select=subjects&limit=1`)
        : Promise.resolve([]),
    ]);
    if (!isALevelEnabledOn(config)) { res.status(409).json({ error: "A-Level is switched off for this school." }); return; }
    const termKey = body.termKey || String(config.activeTerm ?? "");
    if (isTeacher && termKey !== String(config.activeTerm ?? "")) {
      res.status(403).json({ error: "Teachers can enter marks only in the active term." });
      return;
    }
    const termMap = config.terms && typeof config.terms === "object" ? (config.terms as Record<string, Record<string, unknown>>) : {};
    const term = termMap[termKey];
    if (config.marksLocked || term?.locked || term?.status === "closed") { res.status(423).json({ error: "Marks are locked for this term." }); return; }
    const student = asRows(await supabaseRequest(req, "students", {},
      `?id=eq.${encodeURIComponent(body.studentId)}&school_id=eq.${encodeURIComponent(schoolId)}&select=class,subjects&limit=1`).catch(() => []))[0]
      ?? (Array.isArray(term?.students) ? (term.students as Array<Record<string, unknown>>).find((item) => String(item.id) === body.studentId) : undefined);
    if (!student) { res.status(404).json({ error: "Student not found in this term." }); return; }
    const className = String(student.class ?? student.className ?? "");
    const papers = papersOf(config, className, body.subject);
    if (!papers) { res.status(400).json({ error: `${body.subject} is not an A-Level subject for ${className || "this class"}.` }); return; }
    const paper = papers.find((item) => item.name === body.paper);
    if (!paper) { res.status(400).json({ error: `${body.subject} has no paper called ${body.paper}.` }); return; }
    if (body.score !== null && (body.score < 0 || body.score > paper.max)) {
      res.status(400).json({ error: `${body.paper} must be between 0 and ${paper.max}.` });
      return;
    }
    if (isTeacher) {
      const assigned = asRows(teacherRows)[0]?.subjects;
      const list = Array.isArray(assigned) ? assigned : [];
      const allowed = list.some((a) => typeof a === "string"
        ? a === body.subject
        : Boolean(a && typeof a === "object" && String((a as Record<string, unknown>).class ?? "") === className && String((a as Record<string, unknown>).subject ?? "") === body.subject));
      if (!allowed) { res.status(403).json({ error: "You can enter marks only for subjects assigned to your class." }); return; }
    }
    const enc = encodeURIComponent;
    const key = `school_id=eq.${enc(schoolId)}&term_key=eq.${enc(termKey)}&student_id=eq.${enc(body.studentId)}&subject=eq.${enc(body.subject)}&paper=eq.${enc(body.paper)}`;
    try {
      if (body.score === null) {
        await supabaseRequest(req, "jsa_alevel_marks", { method: "DELETE", headers: { Prefer: "return=minimal" } }, `?${key}`);
      } else {
        await supabaseRequest(req, "jsa_alevel_marks", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: jsonBody({ school_id: schoolId, term_key: termKey, student_id: body.studentId, subject: body.subject, paper: body.paper, score: body.score, updated_at: new Date().toISOString(), updated_by: req.header("x-user-email") ?? "app" }),
        }, "?on_conflict=school_id,term_key,student_id,subject,paper");
      }
    } catch (error) {
      if (alevelMarksTableMissing(error)) { res.status(503).json({ error: ALEVEL_MARKS_MISSING }); return; }
      throw error;
    }
    if (isTeacher) await logTeacherActivity(req, String(req.headers["x-verified-user-email"] ?? ""), schoolId, "marks", [body.subject, className].filter(Boolean).join(" · "));
    res.json({ studentId: body.studentId, subject: body.subject, paper: body.paper, score: body.score });
  } catch (error) {
    sendError(res, error);
  }
});

router.put("/schools/:schoolId/a-level/combinations", requireSchoolAdmin, async (req, res) => {
  try {
    const schoolId = String(req.params.schoolId);
    const body = CombinationsBody.parse(req.body);
    const config = await readSchoolConfig(req, schoolId);
    if (!isALevelEnabledOn(config)) { res.status(400).json({ error: "Switch A-Level on in School settings first." }); return; }
    const problem = combinationsProblem(config, body.combinations);
    if (problem) { res.status(400).json({ error: problem }); return; }

    const next: Combination[] = body.combinations.map((item) => ({
      id: item.id ?? randomUUID(),
      name: item.name.trim(),
      stream: item.stream,
      subjects: item.subjects,
    }));
    const previous = combinationsOf(config);
    const kept = new Set(next.map((item) => item.id));
    const terms = config.terms && typeof config.terms === "object" ? config.terms as Record<string, Record<string, unknown>> : {};

    // A combination that students are still enrolled in cannot be removed.
    for (const old of previous) {
      if (kept.has(old.id)) continue;
      const count = Object.values(terms).reduce((sum, term) => sum + (Array.isArray(term.students)
        ? (term.students as Array<Record<string, unknown>>).filter((student) => enrolmentOf(student.aLevel)?.combination === old.id).length : 0), 0);
      if (count > 0) {
        res.status(409).json({ error: `${count} ${count === 1 ? "student is" : "students are"} enrolled in ${old.name}. Move them to another combination before removing it.` });
        return;
      }
    }

    // Refresh enrolled students: their stream follows the combination and their subjects are re-derived.
    const draft: SchoolConfig = { ...config, aLevel: { ...(config.aLevel as Record<string, unknown> | undefined), combinations: next } };
    let refreshed = 0;
    const nextTerms = Object.fromEntries(Object.entries(terms).map(([key, term]) => [key, Array.isArray(term.students) ? {
      ...term,
      students: (term.students as Array<Record<string, unknown>>).map((student) => {
        const enrolment = enrolmentOf(student.aLevel);
        const combination = enrolment ? next.find((item) => item.id === enrolment.combination) : undefined;
        if (!enrolment || !combination) return student;
        refreshed += 1;
        return {
          ...student,
          aLevel: { ...enrolment, stream: combination.stream },
          subjects: enrolmentSubjects(draft, combination, enrolment.subsidiary),
        };
      }),
    } : term]));
    const saved = await writeSchoolConfig(req, schoolId, { ...draft, terms: nextTerms });
    res.json({ ...GetSchoolConfigResponse.parse({ schoolId, data: saved, updatedAt: new Date() }), refreshedStudents: refreshed });
  } catch (error) {
    sendError(res, error);
  }
});

// ---- A-Level: the school-wide switch. Off by default; nothing A-Level is shown until an admin turns it on. ----
router.patch("/schools/:schoolId/a-level-settings", requireSchoolAdmin, async (req, res) => {
  try {
    const schoolId = String(req.params.schoolId);
    const { enabled } = z.object({ enabled: z.boolean() }).strict().parse(req.body);
    const current = await readSchoolConfig(req, schoolId);
    const saved = await writeSchoolConfig(req, schoolId, { ...current, settings: { ...settingsOf(current), aLevelEnabled: enabled } });
    res.json(GetSchoolConfigResponse.parse({ schoolId, data: saved, updatedAt: new Date() }));
  } catch (error) {
    sendError(res, error);
  }
});

// ---- Houses: add and remove from School settings. A house that still has students cannot be removed. ----
const houseKey = (value: unknown) => String(value ?? "").trim().toLowerCase();
const houseNameOf = (house: unknown) => typeof house === "string" ? house.trim() : String((house as Record<string, unknown>)?.name ?? "").trim();

async function houseUsage(req: Request, schoolId: string, config: Record<string, unknown>) {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  const rows = asRows(await supabaseRequest(req, "students", {}, `?school_id=eq.${encodeURIComponent(schoolId)}&select=id,house,term_key`).catch(() => []));
  const bump = (id: unknown, term: unknown, house: unknown) => {
    const key = houseKey(house);
    const unique = `${term ?? ""}|${id}`;
    if (!key || seen.has(unique)) return;
    seen.add(unique);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (const row of rows) bump(row.id, row.term_key, row.house);
  const terms = config.terms && typeof config.terms === "object" ? (config.terms as Record<string, Record<string, unknown>>) : {};
  for (const [termKey, term] of Object.entries(terms)) {
    if (Array.isArray(term?.students)) for (const student of term.students as Array<Record<string, unknown>>) bump(student.id, termKey, student.house);
  }
  return counts;
}

router.get("/schools/:schoolId/houses", requireSchoolAdmin, async (req, res) => {
  try {
    const schoolId = String(req.params.schoolId);
    const config = await readSchoolConfig(req, schoolId);
    const settings = settingsOf(config);
    const raw = Array.isArray(settings.houses) ? settings.houses : Array.isArray(config.houses) ? config.houses : [];
    const usage = await houseUsage(req, schoolId, config);
    res.json(Array.from(new Set(raw.map(houseNameOf).filter(Boolean))).map((name) => ({ name, students: usage.get(houseKey(name)) ?? 0 })));
  } catch (error) {
    sendError(res, error);
  }
});

router.put("/schools/:schoolId/houses", requireSchoolAdmin, async (req, res) => {
  try {
    const schoolId = String(req.params.schoolId);
    const { houses } = z.object({ houses: z.array(z.string()).max(20) }).strict().parse(req.body);
    const names = houses.map((name) => name.trim().replace(/\s+/g, " ")).filter(Boolean);
    if (names.some((name) => name.length > 30)) { res.status(400).json({ error: "Keep each house name to 30 characters or fewer." }); return; }
    if (new Set(names.map(houseKey)).size !== names.length) { res.status(400).json({ error: "Each house name can be used once." }); return; }
    const config = await readSchoolConfig(req, schoolId);
    const settings = settingsOf(config);
    const raw = Array.isArray(settings.houses) ? settings.houses : Array.isArray(config.houses) ? config.houses : [];
    const existing = new Map(raw.map((house) => [houseKey(houseNameOf(house)), house]));
    const keep = new Set(names.map(houseKey));
    const removed = Array.from(existing.keys()).filter((key) => key && !keep.has(key));
    if (removed.length) {
      const usage = await houseUsage(req, schoolId, config);
      const blocked = removed.filter((key) => (usage.get(key) ?? 0) > 0);
      if (blocked.length) {
        const label = (key: string) => `${houseNameOf(existing.get(key))} (${usage.get(key)} ${usage.get(key) === 1 ? "student" : "students"})`;
        res.status(409).json({ error: `Move the students out of ${blocked.map(label).join(", ")} before removing ${blocked.length === 1 ? "it" : "them"}.` });
        return;
      }
    }
    // Keep any extra details (such as a colour) saved for houses that stay.
    const next = names.map((name) => existing.get(houseKey(name)) ?? name);
    const saved = await writeSchoolConfig(req, schoolId, { ...config, settings: { ...settings, houses: next } });
    res.json(GetSchoolConfigResponse.parse({ schoolId, data: saved, updatedAt: new Date() }));
  } catch (error) {
    sendError(res, error);
  }
});

// ---- The class where students start choosing optional subjects (S.1 for schools whose S.1 already has electives). ----
router.patch("/schools/:schoolId/optional-subjects-class", requireSchoolAdmin, async (req, res) => {
  try {
    const schoolId = String(req.params.schoolId);
    const { className } = z.object({ className: z.string().trim().min(1).max(20) }).strict().parse(req.body);
    if (!/\d/.test(className)) { res.status(400).json({ error: "Choose a class such as S.1 or S.3." }); return; }
    const current = await readSchoolConfig(req, schoolId);
    const saved = await writeSchoolConfig(req, schoolId, { ...current, settings: { ...settingsOf(current), optionalSubjectsClass: className } });
    res.json(GetSchoolConfigResponse.parse({ schoolId, data: saved, updatedAt: new Date() }));
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/schools/:schoolId/assessment-settings/rescale", requireSchoolAdmin, async (req, res) => {
  try {
    const schoolId = String(req.params.schoolId);
    const body = RescaleBody.parse(req.body);
    const fields = body.marksSchema as AssessmentField[];
    const problem = schemaProblem(fields);
    if (problem) { res.status(400).json({ error: problem }); return; }

    const config = await readSchoolConfig(req, schoolId);
    const previousSchema = configuredAssessmentFields(config);
    const previousActive = activeAssessmentFields(config).map((field) => field.field);
    const conversions = conversionsFor(previousSchema, fields);
    const { mapper, convertible } = scaleMapper(conversions);
    const labels = termsOf(config);
    const plan = await planRescale(req, schoolId, mapper, convertible);
    const hidden = Object.entries(plan.stats.untouchedFields)
      .filter(([field]) => !fields.some((item) => item.field === field))
      .map(([field, count]) => ({ field, name: previousSchema.find((item) => item.field === field)?.name ?? field, count }));

    if (!body.confirm) {
      res.json({
        conversions,
        totalMarks: plan.stats.total,
        perField: plan.stats.perField,
        terms: Object.entries(plan.stats.perTerm).map(([termKey, count]) => ({ termKey, label: String(labels[termKey]?.label ?? termKey), count })),
        examples: plan.stats.examples,
        hiddenFields: hidden,
        roundedMarks: Object.values(plan.stats.perField).reduce((sum, item) => sum + item.rounded, 0),
        clampedMarks: Object.values(plan.stats.perField).reduce((sum, item) => sum + item.clamped, 0),
      });
      return;
    }

    if (body.expectedFrom) {
      const expected = new Map(body.expectedFrom.map((item) => [item.field, item.from]));
      const stale = conversions.some((item) => expected.get(item.field) !== item.from) || body.expectedFrom.some((item) => !conversions.some((c) => c.field === item.field));
      if (stale) { res.status(409).json({ error: "The assessment settings changed since you previewed. Please preview again." }); return; }
    }

    const table = conversions.length ? await convertTable(req, schoolId, mapper, convertible) : null;
    try {
      const fresh = await readSchoolConfig(req, schoolId);
      const copy = convertConfigTerms(termsOf(fresh), mapper, convertible);
      const stats = table?.stats;
      const entry: RescaleEntry | null = conversions.length ? {
        id: randomUUID(),
        at: new Date().toISOString(),
        by: String(req.header("x-verified-user-email") ?? "app"),
        conversions,
        previousSchema,
        previousActive,
        newSchema: fields,
        total: stats?.total ?? 0,
        rounded: (stats?.roundedCells ?? []).map((cell) => ({ k: cellKey(cell), o: cell.before, n: cell.after })),
      } : null;
      const freshSettings = settingsOf(fresh);
      const saved = await writeSchoolConfig(req, schoolId, {
        ...fresh,
        terms: copy.terms,
        settings: {
          ...freshSettings,
          marksSchema: fields,
          activeMarkColumns: fields.map((field) => field.field),
          ...(entry ? { rescaleHistory: trimHistory([...rescaleHistory(fresh), entry]) } : {}),
        },
      });
      res.json({
        ...GetSchoolConfigResponse.parse({ schoolId, data: saved, updatedAt: new Date() }),
        summary: { converted: stats?.total ?? 0, rounded: Object.values(stats?.perField ?? {}).reduce((sum, item) => sum + item.rounded, 0) },
      });
    } catch (error) {
      // The marks must never stay converted while the school settings still describe the old scale.
      if (table) await table.rollback().catch(() => undefined);
      throw error;
    }
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/schools/:schoolId/assessment-settings/rescale/undo", requireSchoolAdmin, async (req, res) => {
  try {
    const schoolId = String(req.params.schoolId);
    const { id } = UndoRescaleBody.parse(req.body);
    const config = await readSchoolConfig(req, schoolId);
    const history = rescaleHistory(config);
    const latest = [...history].reverse().find((entry) => !entry.undone);
    if (!latest || latest.id !== id) {
      res.status(409).json({ error: "Only the most recent conversion can be undone." });
      return;
    }
    const current = configuredAssessmentFields(config);
    if (latest.conversions.some((item) => (() => { const found = current.find((field) => field.field === item.field); return found ? entryScale(found) : undefined; })() !== item.to)) {
      res.status(409).json({ error: "The assessment maximums were changed after this conversion, so it cannot be undone automatically." });
      return;
    }
    const exact = new Map(latest.rounded.map((item) => [item.k, item]));
    const inverse = new Map(latest.conversions.map((item) => [item.field, item]));
    const convertible = new Set(latest.conversions.map((item) => item.field));
    const mapper: Mapper = (cell) => {
      const conversion = inverse.get(cell.field);
      if (!conversion) return { value: cell.value };
      const original = exact.get(cellKey(cell));
      if (original && original.n === cell.value) return { value: original.o };
      const { value, rounded, clamped } = scaleValue(cell.value, conversion.to, conversion.from);
      return { value, rounded, clamped };
    };
    const table = await convertTable(req, schoolId, mapper, convertible);
    try {
      const fresh = await readSchoolConfig(req, schoolId);
      const copy = convertConfigTerms(termsOf(fresh), mapper, convertible);
      const freshHistory = rescaleHistory(fresh).map((entry) => entry.id === latest.id ? { ...entry, undone: true, undoneAt: new Date().toISOString() } : entry);
      const saved = await writeSchoolConfig(req, schoolId, {
        ...fresh,
        terms: copy.terms,
        settings: {
          ...settingsOf(fresh),
          marksSchema: latest.previousSchema,
          activeMarkColumns: latest.previousActive,
          rescaleHistory: freshHistory,
        },
      });
      res.json(GetSchoolConfigResponse.parse({ schoolId, data: saved, updatedAt: new Date() }));
    } catch (error) {
      await table.rollback().catch(() => undefined);
      throw error;
    }
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/schools/:schoolId/dashboard", async (req, res) => {
  try {
    const { schoolId } = GetDashboardSummaryParams.parse(req.params);
    const userEmail = String(req.headers["x-verified-user-email"] ?? "").toLowerCase();
    const [studentRows, markRows, configRows, assignmentRows] = await Promise.all([
      supabaseRequest(req, "students", {}, `?school_id=eq.${encodeURIComponent(schoolId)}&select=*`),
      supabaseRequest(req, "marks", {}, `?school_id=eq.${encodeURIComponent(schoolId)}&select=*&limit=5000`),
      supabaseRequest(req, "school_data", {}, `?school_id=eq.${schoolId}&select=data&limit=1`),
      res.locals.jiibRole === "teacher" && userEmail
        ? supabaseRequest(req, "allowed_users", {}, `?school_id=eq.${encodeURIComponent(schoolId)}&email=eq.${encodeURIComponent(userEmail)}&select=email,display_name,subjects&limit=1`)
        : Promise.resolve([]),
    ]);
    const config = (asRows(configRows)[0]?.data as Record<string, unknown> | undefined) ?? {};
    const termKey = String(config?.activeTerm ?? "");
    const terms = config?.terms && typeof config.terms === "object"
      ? config.terms as Record<string, Record<string, unknown>>
      : {};
    const activeTerm = terms[termKey] ?? {};
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
        subjects: Array.isArray(previous.subjects) && previous.subjects.length
          ? previous.subjects
          : student.subjects ?? [],
      });
    }
    const students = Array.from(studentMap.values());
    const markMap = new Map<string, Record<string, unknown>>();
    for (const mark of asRows(markRows).filter((item) => !termKey || String(item.term_key ?? "") === termKey)) {
      markMap.set(`${String(mark.student_id)}|${String(mark.subject)}`, {
        ...mark,
        enteredFields: Array.isArray(mark.entered_fields) ? mark.entered_fields : mark.enteredFields,
      });
    }
    const legacyMarks = Array.isArray(activeTerm?.marks)
      ? activeTerm.marks as Array<Record<string, unknown>>
      : [];
    for (const mark of legacyMarks) {
      const key = `${String(mark.studentId ?? "")}|${String(mark.subject ?? "")}`;
      if (key.startsWith("|")) continue;
      const existing = markMap.get(key);
      markMap.set(key, existing
        ? { ...mark, ...existing, enteredFields: mark.enteredFields ?? existing.enteredFields }
        : mark);
    }
    const classes = new Set(students.map((student) => String(student.class ?? "")));
    const settings = config.settings && typeof config.settings === "object" && !Array.isArray(config.settings)
      ? config.settings as Record<string, unknown>
      : {};
    const rawHouses = Array.isArray(settings.houses) ? settings.houses : Array.isArray(config.houses) ? config.houses : [];
    const configuredHouses = Array.from(new Set(rawHouses
      .map((house) => typeof house === "string" ? house.trim() : String((house as Record<string, unknown>)?.name ?? "").trim())
      .filter(Boolean)));
    const houseCounts = new Map<string, number>();
    students.forEach((student) => {
      const house = String(student.house ?? "").trim() || "Unassigned";
      houseCounts.set(house, (houseCounts.get(house) ?? 0) + 1);
    });
    const houseNames = configuredHouses.length
      ? [...configuredHouses, ...Array.from(houseCounts.keys()).filter((house) => house !== "Unassigned" && !configuredHouses.includes(house))]
      : Array.from(houseCounts.keys());
    if (houseCounts.has("Unassigned") && !houseNames.includes("Unassigned")) houseNames.push("Unassigned");
    const houseGroups = houseNames.map((label) => ({ label, count: houseCounts.get(label) ?? 0 }));
    const subjectMap = config?.subjects;
    const subjectsByClass = subjectMap && typeof subjectMap === "object" && !Array.isArray(subjectMap)
      ? subjectMap as Record<string, unknown>
      : undefined;
    const globalSubjects = Array.isArray(subjectMap) ? subjectMap : [];
    const assessmentFields = activeAssessmentFields(config);
    const assignments = asRows(assignmentRows)[0]?.subjects;
    const assignmentList = Array.isArray(assignments) ? assignments : [];
    const teacherName = String(asRows(assignmentRows)[0]?.display_name ?? "");
    const subjectCompletion: Array<{
      className: string; subject: string; teacher: string; entered: number; expected: number; percentage: number;
    }> = [];
    const optionalClass = String(settings.optionalSubjectsClass ?? "S.3");
    const classLevel = (name: string) => Number(name.match(/\d+/)?.[0] ?? 0);
    const configuredClassNames = subjectsByClass
      ? Object.keys(subjectsByClass)
      : Array.from(classes).filter(Boolean);
    const subjectsFromMarks = new Map<string, Set<string>>();
    for (const mark of markMap.values()) {
      const studentId = String(mark.student_id ?? mark.studentId ?? "");
      const className = String(studentMap.get(studentId)?.class ?? "");
      const subject = String(mark.subject ?? "").trim();
      if (!className || !subject) continue;
      if (!subjectsFromMarks.has(className)) subjectsFromMarks.set(className, new Set());
      subjectsFromMarks.get(className)?.add(subject);
    }
    const allClassNames = new Set([...configuredClassNames, ...subjectsFromMarks.keys()]);
    for (const className of allClassNames) {
      const classStudents = students.filter((student) => String(student.class ?? "") === className);
      const rawSubjects = subjectsByClass?.[className];
      const subjectEntries = Array.isArray(rawSubjects) ? rawSubjects : globalSubjects;
      const subjects = subjectEntries
        .map((entry) => typeof entry === "string" ? { name: entry, teacher: "" } : {
          name: String((entry as Record<string, unknown>)?.name ?? ""),
          teacher: String((entry as Record<string, unknown>)?.teacher ?? ""),
        })
        .filter((entry) => entry.name);
      for (const subject of subjectsFromMarks.get(className) ?? []) {
        if (!subjects.some((item) => item.name === subject)) subjects.push({ name: subject, teacher: "" });
      }
      for (const item of subjects) {
        const owned = assignmentList.some((entry) =>
          typeof entry === "string"
            ? entry === item.name
            : Boolean(entry && typeof entry === "object" &&
              String((entry as Record<string, unknown>).class ?? "") === className &&
              String((entry as Record<string, unknown>).subject ?? "") === item.name),
        );
        if (res.locals.jiibRole === "teacher" && !owned) continue;
        const assignedToCurrentTeacher = assignmentList.some((entry) =>
          Boolean(entry && typeof entry === "object" &&
            String((entry as Record<string, unknown>).class ?? "") === className &&
            String((entry as Record<string, unknown>).subject ?? "") === item.name),
        ) ? teacherName : item.teacher;
        const assignedTeacher = assignedToCurrentTeacher || item.teacher;
        const eligibleStudents = classLevel(className) >= classLevel(optionalClass)
          ? classStudents.filter((student) => !Array.isArray(student.subjects) || student.subjects.length === 0 ||
            (student.subjects as unknown[]).some((subject) =>
              typeof subject === "string" ? subject === item.name :
                String((subject as Record<string, unknown>)?.name ?? subject) === item.name))
          : classStudents;
        const expected = eligibleStudents.length * assessmentFields.length;
        const entered = eligibleStudents.reduce((total, student) => {
          const mark = markMap.get(`${String(student.id)}|${item.name}`);
          return total + (mark ? enteredMarkFields(mark, assessmentFields).length : 0);
        }, 0);
        subjectCompletion.push({
          className,
          subject: item.name,
          teacher: assignedTeacher,
          entered,
          expected,
          percentage: expected ? Math.round((entered / expected) * 100) : 0,
        });
      }
    }
    const marksEntered = subjectCompletion.reduce((total, item) => total + item.entered, 0);
    const marksExpected = subjectCompletion.reduce((total, item) => total + item.expected, 0);
    const events = (Array.isArray(config.events) ? config.events : [])
      .map((event, index) => {
        if (typeof event === "string") return { id: `event-${index}`, title: event, date: "" };
        const item = event as Record<string, unknown>;
        return {
          id: String(item.id ?? `event-${index}`),
          title: String(item.title ?? ""),
          date: String(item.date ?? item.eventDate ?? item.event_date ?? ""),
        };
      })
      .filter((event) => event.title);
    res.json({
      studentCount: students.length,
      classCount: Array.from(classes).filter(Boolean).length,
      marksEntered,
      marksExpected,
      houses: houseGroups,
      configuredHouseCount: configuredHouses.length,
      subjectCompletion,
      assessmentFields,
      activeTerm: String(activeTerm.label ?? termKey),
      events,
      recentActivity: [],
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
        // The saved-settings copy is what the edit page writes, so it wins; the table's own list is the fallback.
        subjects: Array.isArray(legacy?.subjects) ? legacy.subjects.map(String) : (student.subjects ?? []),
        aLevel: enrolmentOf(legacy?.aLevel),
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
        subjects: Array.isArray(legacy.subjects) ? legacy.subjects.map(String) : [],
        aLevel: enrolmentOf(legacy.aLevel),
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
    let subjects = Array.from(new Set((body.subjects ?? []).map((subject) => subject.trim()).filter(Boolean)));
    const config = await readSchoolConfig(req, schoolId);
    // An A-Level student's subjects come from their combination, subsidiary and the compulsory subject.
    let enrolment: Enrolment | null = null;
    if (body.aLevel) {
      const resolved = resolveEnrolment(config, body.className, body.aLevel as Enrolment);
      if ("problem" in resolved) { res.status(400).json({ error: resolved.problem }); return; }
      enrolment = resolved.aLevel;
      subjects = resolved.subjects;
    }
    const termKey = String(config.activeTerm ?? "2026-T1");
    const studentId = randomUUID();
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
      subjects,
      ...(enrolment ? { aLevel: enrolment } : {}),
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
    res.status(201).json({ ...mapStudent(rows[0]), subjects, aLevel: enrolment });
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
    let newSubjects = body.subjects === undefined
      ? undefined
      : Array.from(new Set(body.subjects.map((subject) => subject.trim()).filter(Boolean)));
    // undefined = leave the enrolment alone, null = remove it, object = set it (and derive the subjects).
    let enrolment: Enrolment | null | undefined;
    if (body.aLevel === null) enrolment = null;
    else if (body.aLevel) {
      if (body.className === undefined) { res.status(400).json({ error: "Send the class together with the stream and combination." }); return; }
      const resolved = resolveEnrolment(config, body.className, body.aLevel as Enrolment);
      if ("problem" in resolved) { res.status(400).json({ error: resolved.problem }); return; }
      enrolment = resolved.aLevel;
      newSubjects = resolved.subjects;
    }
    if (enrolment === undefined && body.className !== undefined && !/^s(enior)?[\s.]*[56](?!\d)/i.test(body.className.trim())) enrolment = null;
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) update.name = body.name;
    if (body.className !== undefined) update.class = body.className;
    if (body.house !== undefined) update.house = body.house;
    if (body.parentPhone !== undefined) update.parent_phone = body.parentPhone;
    let rows = asRows(
      await supabaseRequest(
        req,
        "students",
        { method: "PATCH", body: jsonBody(update) },
        `?id=eq.${encodeURIComponent(studentId)}&school_id=eq.${encodeURIComponent(schoolId)}${termKey ? `&term_key=eq.${encodeURIComponent(termKey)}` : ""}&select=*`,
      ),
    );
    if (!rows[0]) {
      // The student list also shows students that only exist in the school's saved settings (e.g. brought over from the
      // old system). Create their database row now, from that saved copy plus the edits, so the edit can be saved.
      const legacyTerms = config.terms && typeof config.terms === "object"
        ? (config.terms as Record<string, Record<string, unknown>>)
        : {};
      const legacyList = Array.isArray(legacyTerms[termKey]?.students)
        ? (legacyTerms[termKey].students as Array<Record<string, unknown>>)
        : [];
      const legacy = legacyList.find((student) => String(student.id) === studentId);
      if (!legacy) {
        res.status(404).json({ error: "Student not found" });
        return;
      }
      rows = asRows(
        await supabaseRequest(
          req,
          "students",
          {
            method: "POST",
            body: jsonBody({
              school_id: schoolId,
              term_key: termKey,
              id: studentId,
              name: body.name ?? String(legacy.name ?? ""),
              class: body.className ?? String(legacy.class ?? legacy.className ?? ""),
              house: body.house ?? String(legacy.house ?? ""),
              parent_phone: body.parentPhone !== undefined ? body.parentPhone : (String(legacy.parentPhone ?? legacy.parent_phone ?? "") || null),
              updated_at: new Date().toISOString(),
            }),
          },
          "?on_conflict=id,school_id,term_key&select=*",
        ),
      );
      if (!rows[0]) throw new Error("Student was not saved. Check the signed-in account's database access.");
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
                    ...(newSubjects !== undefined ? { subjects: newSubjects } : {}),
                    ...(enrolment !== undefined ? { aLevel: enrolment } : {}),
                  }
                : student,
            ).concat(
              (newSubjects !== undefined || enrolment) && !students.some((student) => String(student.id) === studentId)
                ? [{ id: studentId, name: String(rows[0].name ?? ""), class: String(rows[0].class ?? ""), house: String(rows[0].house ?? ""), parentPhone: String(rows[0].parent_phone ?? ""), subjects: newSubjects ?? [], ...(enrolment ? { aLevel: enrolment } : {}) }]
                : [],
            ),
          },
        },
      });
    }
    res.json({ ...mapStudent(rows[0]), ...(newSubjects !== undefined ? { subjects: newSubjects } : {}), ...(enrolment !== undefined ? { aLevel: enrolment } : {}) });
  } catch (error) {
    sendError(res, error);
  }
});

router.delete("/schools/:schoolId/students/:studentId", async (req, res) => {
  try {
    const { schoolId, studentId } = DeleteStudentParams.parse(req.params);
    const config = await readSchoolConfig(req, schoolId);
    await supabaseRequest(
      req,
      "students",
      { method: "DELETE" },
      `?id=eq.${encodeURIComponent(studentId)}&school_id=eq.${encodeURIComponent(schoolId)}`,
    );
    await supabaseRequest(
      req,
      "marks",
      { method: "DELETE" },
      `?student_id=eq.${encodeURIComponent(studentId)}&school_id=eq.${encodeURIComponent(schoolId)}`,
    );
    const terms = config.terms && typeof config.terms === "object"
      ? (config.terms as Record<string, Record<string, unknown>>)
      : {};
    const nextTerms = Object.fromEntries(Object.entries(terms).map(([key, term]) => [
      key,
      {
        ...term,
        ...(Array.isArray(term.students) ? {
          students: (term.students as Array<Record<string, unknown>>).filter(
            (student) => String(student.id) !== studentId,
          ),
        } : {}),
        ...(Array.isArray(term.marks) ? {
          marks: (term.marks as Array<Record<string, unknown>>).filter(
            (mark) => String(mark.studentId ?? mark.student_id) !== studentId,
          ),
        } : {}),
      },
    ]));
    await writeSchoolConfig(req, schoolId, { ...config, terms: nextTerms });
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
          ...(Array.isArray(mark.enteredFields) ? { enteredFields: mark.enteredFields.map(String) } : {}),
        }))
      : [];
    const byKey = new Map<string, ReturnType<typeof mapMark>>();
    for (const mark of legacyMarks) byKey.set(`${mark.studentId}|${mark.subject}`, mark);
    for (const mark of databaseMarks) {
      const key = `${mark.studentId}|${mark.subject}`;
      const legacy = byKey.get(key);
      byKey.set(key, {
        ...legacy,
        ...mark,
        ...(legacy?.enteredFields ? { enteredFields: legacy.enteredFields } : {}),
      });
    }
    // A box holding a value always counts as entered, even if the record of which boxes were typed was lost.
    for (const mark of byKey.values()) {
      const entered = new Set(mark.enteredFields ?? []);
      if (mark.aoi > 0) entered.add("c1");
      if (mark.midterm > 0) entered.add("c2");
      if (mark.end > 0) entered.add("c3");
      mark.enteredFields = [...entered];
    }
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

// Which score columns the database uses (aoi/midterm/end or c1/c2/c3); learned on the first save.
let markColumnStyle: "aoi" | "c" | null = null;

router.put("/schools/:schoolId/marks", async (req, res) => {
  try {
    const { schoolId } = UpsertMarkParams.parse(req.params);
    const body = UpsertMarkBody.parse(req.body);
    const now = new Date().toISOString();
    const [config, teacherRows] = await Promise.all([
      readSchoolConfig(req, schoolId),
      res.locals.jiibRole === "teacher"
        ? supabaseRequest(req, "allowed_users", {}, `?school_id=eq.${encodeURIComponent(schoolId)}&email=eq.${encodeURIComponent(String(req.headers["x-verified-user-email"] ?? "").toLowerCase())}&select=subjects&limit=1`)
        : Promise.resolve([]),
    ]);
    const termKey = body.termKey || String(config.activeTerm ?? "");
    if (res.locals.jiibRole === "teacher" && termKey !== String(config.activeTerm ?? "")) {
      res.status(403).json({ error: "Teachers can enter marks only in the active term." });
      return;
    }
    const termMap = config.terms && typeof config.terms === "object"
      ? (config.terms as Record<string, Record<string, unknown>>)
      : {};
    const term = termMap[termKey];
    if (config.marksLocked || term?.locked || term?.status === "closed") {
      res.status(423).json({ error: "Marks are locked for this term." });
      return;
    }
    const isUuidStudentId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.studentId);
    let normalizedStudentRows: Array<Record<string, unknown>> = [];
    try {
      normalizedStudentRows = asRows(await supabaseRequest(
          req,
          "students",
          {},
          `?id=eq.${encodeURIComponent(body.studentId)}&school_id=eq.${encodeURIComponent(schoolId)}&select=class,subjects&limit=1`,
        ));
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (isUuidStudentId || !/invalid input syntax for type uuid/i.test(message)) throw error;
    }
    const normalizedStudent = normalizedStudentRows[0];
    const legacyStudent = Array.isArray(term?.students)
      ? (term.students as Array<Record<string, unknown>>).find(
          (student) => String(student.id) === body.studentId,
        )
      : undefined;
    if (!normalizedStudent && !legacyStudent) {
      res.status(404).json({ error: "Student not found in this term." });
      return;
    }
    const studentClass = String(normalizedStudent?.class ?? legacyStudent?.class ?? legacyStudent?.className ?? "");
    if (res.locals.jiibRole === "teacher") {
      const assignedSubjects = asRows(teacherRows)[0]?.subjects;
      const assignments = Array.isArray(assignedSubjects) ? assignedSubjects : [];
      const allowed = assignments.some((assignment) =>
        typeof assignment === "string"
          ? assignment === body.subject
          : Boolean(assignment && typeof assignment === "object" &&
            String((assignment as Record<string, unknown>).class ?? "") === studentClass &&
            String((assignment as Record<string, unknown>).subject ?? "") === body.subject),
      );
      if (!allowed) {
        res.status(403).json({ error: "You can enter marks only for subjects assigned to your class." });
        return;
      }
    }
    const fields = activeAssessmentFields(config);
    // Only the boxes the teacher actually changed are written. An older app that sends every box still works.
    const SCORE_KEYS = ["aoi", "midterm", "end"] as const;
    const FIELD_OF = { aoi: "c1", midterm: "c2", end: "c3" } as const;
    const sent = SCORE_KEYS.filter((key) => typeof body[key] === "number");
    const touched = sent.length ? sent : [...SCORE_KEYS];
    const incoming = { aoi: body.aoi ?? 0, midterm: body.midterm ?? 0, end: body.end ?? 0 };
    const touchedFields = new Set<string>(touched.map((key) => FIELD_OF[key]));
    const scores: Record<string, number> = { c1: incoming.aoi, c2: incoming.midterm, c3: incoming.end };
    const invalidScore = fields.find((field) => touchedFields.has(field.field) && Number(scores[field.field]) > entryScale(field));
    if (invalidScore) {
      res.status(400).json({ error: `${invalidScore.name} cannot be greater than ${entryScale(invalidScore)}.` });
      return;
    }
    const sentEntered = Array.isArray(body.enteredFields)
      ? body.enteredFields.filter((field) => fields.some((item) => item.field === field))
      : [];
    let rows: Array<Record<string, unknown>> = [];
    let databaseSchemaFallback = false;
    if (normalizedStudent) {
      const databaseMarkFields = {
        school_id: schoolId,
        student_id: body.studentId,
        term_key: termKey,
        subject: body.subject,
        class: studentClass,
        updated_at: now,
        updated_by: req.header("x-user-email") ?? "app",
      };
      const enc = encodeURIComponent;
      const rowFilter = `?school_id=eq.${enc(schoolId)}&term_key=eq.${enc(termKey)}&student_id=eq.${enc(body.studentId)}&subject=eq.${enc(body.subject)}`;
      const changed = (style: "aoi" | "c") =>
        Object.fromEntries(touched.map((key) => [style === "aoi" ? key : FIELD_OF[key], incoming[key]]));
      const patchRow = async (style: "aoi" | "c") => asRows(await supabaseRequest(
        req,
        "marks",
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: jsonBody({ class: studentClass, updated_at: now, updated_by: databaseMarkFields.updated_by, ...changed(style) }),
        },
        `${rowFilter}&select=*`,
      ));
      // Changes only the boxes that were typed in, so two people (or two quick saves) never wipe each other's boxes.
      const writeScores = async (style: "aoi" | "c") => {
        const patched = await patchRow(style);
        if (patched[0]) return patched;
        const blank = style === "aoi" ? { aoi: 0, midterm: 0, end: 0 } : { c1: 0, c2: 0, c3: 0 };
        const created = asRows(await supabaseRequest(
          req,
          "marks",
          { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: jsonBody({ ...databaseMarkFields, ...blank, ...changed(style) }) },
          "?on_conflict=school_id,term_key,student_id,subject&select=*",
        ));
        return created[0] ? created : patchRow(style); // someone created the row a moment earlier
      };
      try {
        rows = await writeScores(markColumnStyle ?? "aoi");
        markColumnStyle ??= "aoi";
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        markColumnStyle = null;
        if (/Could not find the '(aoi|midterm|end)' column of 'marks' in the schema cache/i.test(message)) {
          try {
            rows = await writeScores("c");
            markColumnStyle = "c";
          } catch (legacyError) {
            const legacyMessage = legacyError instanceof Error ? legacyError.message : "";
            const missingLegacyScoreColumn =
              /Could not find the '(c1|c2|c3)' column of 'marks' in the schema cache/i.test(legacyMessage);
            const invalidLegacyUuid =
              !isUuidStudentId && /invalid input syntax for type uuid/i.test(legacyMessage);
            if (!missingLegacyScoreColumn && !invalidLegacyUuid) throw legacyError;
            databaseSchemaFallback = true;
          }
        } else if (!isUuidStudentId && /invalid input syntax for type uuid/i.test(message)) {
          databaseSchemaFallback = true;
        } else {
          throw error;
        }
      }
    }
    if (normalizedStudent && !rows[0] && !databaseSchemaFallback) {
      throw new Error("Mark was not saved. Check the signed-in account's database access.");
    }
    // Re-read the school record right before writing it back, so a save made a moment ago by someone else is kept.
    const freshConfig = await readSchoolConfig(req, schoolId);
    const freshTerms = freshConfig.terms && typeof freshConfig.terms === "object"
      ? (freshConfig.terms as Record<string, Record<string, unknown>>)
      : {};
    const freshTerm = freshTerms[termKey] ?? term;
    const freshMarks = Array.isArray(freshTerm?.marks)
      ? (freshTerm.marks as Array<Record<string, unknown>>)
      : [];
    const previous = freshMarks.find(
      (mark) => String(mark.studentId) === body.studentId && String(mark.subject) === body.subject,
    );
    const enteredFields = new Set<string>(Array.isArray(previous?.enteredFields) ? previous.enteredFields.map(String) : []);
    for (const key of touched) {
      const field = FIELD_OF[key];
      if (sentEntered.includes(field)) enteredFields.add(field);
      else enteredFields.delete(field);
    }
    const saved = rows[0] ? mapMark(rows[0]) : null;
    if (saved) {
      if (saved.aoi > 0) enteredFields.add("c1");
      if (saved.midterm > 0) enteredFields.add("c2");
      if (saved.end > 0) enteredFields.add("c3");
    }
    const valueFor = (key: (typeof SCORE_KEYS)[number]) =>
      saved?.[key] ?? (touched.includes(key) ? incoming[key] : Number(previous?.[key] ?? previous?.[FIELD_OF[key]] ?? 0));
    const nextMark = {
      studentId: body.studentId,
      subject: body.subject,
      class: studentClass,
      aoi: valueFor("aoi"),
      midterm: valueFor("midterm"),
      end: valueFor("end"),
      enteredFields: [...enteredFields],
      updatedAt: now,
    };
    await writeSchoolConfig(req, schoolId, {
      ...freshConfig,
      activeTerm: freshConfig.activeTerm ?? termKey,
      terms: {
        ...freshTerms,
        [termKey]: {
          ...(freshTerm ?? { label: termKey, students: [], locked: false }),
          marks: [
            ...freshMarks.filter(
              (mark) => !(String(mark.studentId) === body.studentId && String(mark.subject) === body.subject),
            ),
            nextMark,
          ],
        },
      },
    });
    if (res.locals.jiibRole === "teacher") {
      await logTeacherActivity(req, String(req.headers["x-verified-user-email"] ?? ""), schoolId, "marks", [body.subject, studentClass].filter(Boolean).join(" · "));
    }
    res.json({
      ...mapMark(rows[0] ?? {
        id: `${body.studentId}-${termKey}-${body.subject}`,
        school_id: schoolId,
        student_id: body.studentId,
        term_key: termKey,
        subject: body.subject,
        aoi: nextMark.aoi,
        midterm: nextMark.midterm,
        end: nextMark.end,
      }),
      enteredFields: nextMark.enteredFields,
    });
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
      // The page identifies an event by its id. Older events without one are identified by
      // their position (event-N for objects, legacy-N for plain strings), as the page lists them.
      events: events.filter((item, index) => {
        if (typeof item === "object" && item !== null) {
          return String((item as Record<string, unknown>).id ?? `event-${index}`) !== eventId;
        }
        return `legacy-${index}` !== eventId && String(item) !== eventId;
      }),
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

function sendStaffManagementError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : "Could not update staff access.";
  if (/service_role_key|not configured/i.test(message)) {
    res.status(503).json({ error: "Staff account management is not configured. Add SUPABASE_SERVICE_ROLE_KEY in Replit Secrets." });
    return;
  }
  if (/already registered|already exists|already been registered|email.*(taken|in use)/i.test(message)) {
    res.status(409).json({ error: "A Supabase sign-in account already uses that email address." });
    return;
  }
  if (/allowed_users_role_check|violates check constraint/i.test(message)) {
    res.status(503).json({ error: "Head teacher and Bursar accounts need a one-time database update. Ask the system administrator to run supabase/roles-setup.sql." });
    return;
  }
  if (/not found/i.test(message)) {
    res.status(404).json({ error: message });
    return;
  }
  res.status(400).json({ error: message });
}

function teacherAssignmentConflict(
  subjects: Array<string | { class: string; subject: string }>,
  roster: Record<string, unknown>[],
  excludedEmails: string[],
) {
  const excluded = new Set(excludedEmails.map((email) => email.toLowerCase()));
  const assignments = subjects.filter(
    (item): item is { class: string; subject: string } => typeof item === "object" && item !== null,
  );
  for (const assignment of assignments) {
    const owner = roster.find((user) => {
      if (excluded.has(String(user.email ?? "").toLowerCase()) || user.role === "admin") return false;
      return Array.isArray(user.subjects) && user.subjects.some((owned) => {
        if (owned && typeof owned === "object") {
          const record = owned as Record<string, unknown>;
          return String(record.class ?? "") === assignment.class &&
            String(record.subject ?? "") === assignment.subject;
        }
        return String(owned ?? "") === assignment.subject;
      });
    });
    if (owner) {
      return `${assignment.class} · ${assignment.subject} is already assigned to ${String(owner.display_name || owner.email)}.`;
    }
  }
  return null;
}

router.post("/schools/:schoolId/users", async (req, res) => {
  let authUserId: string | undefined;
  try {
    if (!isSupabaseAdminConfigured()) {
      res.status(503).json({ error: "Staff account creation is not configured. Add SUPABASE_SERVICE_ROLE_KEY in Replit Secrets." });
      return;
    }
    const schoolId = String(req.params.schoolId);
    const body = AllowedUserBody.parse(req.body);
    const email = body.email.toLowerCase();
    const subjects = body.role === "teacher" ? body.subjects ?? [] : [];
    if (body.role === "teacher" && !subjects.length) {
      res.status(400).json({ error: "Assign at least one class subject to this teacher." });
      return;
    }

    const roster = asRows(await supabaseAdminRequest(
      `/rest/v1/allowed_users?school_id=eq.${encodeURIComponent(schoolId)}&select=email,display_name,role,subjects`,
    ));
    if (roster.some((user) => String(user.email ?? "").toLowerCase() === email)) {
      res.status(409).json({ error: "This email already has access to the school." });
      return;
    }
    const conflict = teacherAssignmentConflict(subjects, roster, []);
    if (conflict) {
      res.status(409).json({ error: conflict });
      return;
    }

    const authUser = await createSupabaseAuthUser(email, body.initialPassword, body.displayName);
    authUserId = authUser.id;
    const rows = asRows(await supabaseAdminRequest(
      "/rest/v1/allowed_users?select=*",
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: jsonBody({
          school_id: schoolId,
          email,
          display_name: body.displayName,
          role: body.role,
          subjects,
        }),
      },
    ));
    if (!rows[0]) throw new Error("The account was created but school access was not saved.");
    res.status(201).json(mapAllowedUser(rows[0]));
  } catch (error) {
    if (authUserId) {
      try {
        await deleteSupabaseAuthUser(authUserId);
      } catch {
        // The original failure is more useful; the account can be cleaned up in Supabase if needed.
      }
    }
    sendStaffManagementError(res, error);
  }
});

router.patch("/schools/:schoolId/users/:email", async (req, res) => {
  let authUser: Awaited<ReturnType<typeof findSupabaseAuthUserByEmail>> = null;
  let oldEmail = "";
  let authEmailChanged = false;
  try {
    if (!isSupabaseAdminConfigured()) {
      res.status(503).json({ error: "Staff account editing is not configured. Add SUPABASE_SERVICE_ROLE_KEY in Replit Secrets." });
      return;
    }
    const schoolId = String(req.params.schoolId);
    oldEmail = decodeURIComponent(String(req.params.email)).trim().toLowerCase();
    const body = AllowedUserUpdateBody.parse(req.body);
    if (!Object.keys(body).length) {
      res.status(400).json({ error: "Provide at least one staff detail to update." });
      return;
    }

    const currentRows = asRows(await supabaseAdminRequest(
      `/rest/v1/allowed_users?school_id=eq.${encodeURIComponent(schoolId)}&email=eq.${encodeURIComponent(oldEmail)}&select=*&limit=1`,
    ));
    const current = currentRows[0];
    if (!current) {
      res.status(404).json({ error: "Staff account not found." });
      return;
    }

    const nextEmail = (body.email ?? oldEmail).toLowerCase();
    const nextRole = body.role ?? staffRole(current.role);
    const currentSubjects = Array.isArray(current.subjects)
      ? current.subjects as Array<string | { class: string; subject: string }>
      : [];
    const nextSubjects = nextRole === "teacher"
      ? body.subjects ?? currentSubjects
      : [];
    if (nextRole === "teacher" && !nextSubjects.length) {
      res.status(400).json({ error: "Assign at least one class subject to this teacher." });
      return;
    }

    const roster = asRows(await supabaseAdminRequest(
      `/rest/v1/allowed_users?school_id=eq.${encodeURIComponent(schoolId)}&select=email,display_name,role,subjects`,
    ));
    if (nextEmail !== oldEmail && roster.some((user) => String(user.email ?? "").toLowerCase() === nextEmail)) {
      res.status(409).json({ error: "This email already has access to the school." });
      return;
    }
    const conflict = teacherAssignmentConflict(nextSubjects, roster, [oldEmail, nextEmail]);
    if (conflict) {
      res.status(409).json({ error: conflict });
      return;
    }

    if (nextEmail !== oldEmail) {
      authUser = await findSupabaseAuthUserByEmail(oldEmail);
      if (!authUser) {
        res.status(409).json({ error: "This staff member has no Supabase sign-in yet, so their email cannot be changed." });
        return;
      }
      const existingAuthUser = await findSupabaseAuthUserByEmail(nextEmail);
      if (existingAuthUser && existingAuthUser.id !== authUser.id) {
        res.status(409).json({ error: "A Supabase sign-in account already uses the new email address." });
        return;
      }
      await updateSupabaseAuthUser(authUser.id, {
        email: nextEmail,
        email_confirm: true,
        user_metadata: {
          ...(authUser.user_metadata ?? {}),
          ...(body.displayName ? { display_name: body.displayName } : {}),
        },
      });
      authEmailChanged = true;
    }

    try {
      const rows = asRows(await supabaseAdminRequest(
        `/rest/v1/allowed_users?school_id=eq.${encodeURIComponent(schoolId)}&email=eq.${encodeURIComponent(oldEmail)}&select=*`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: jsonBody({
            email: nextEmail,
            display_name: body.displayName ?? current.display_name ?? null,
            role: nextRole,
            subjects: nextSubjects,
          }),
        },
      ));
      if (!rows[0]) throw new Error("Staff account not found.");
      res.json(mapAllowedUser(rows[0]));
    } catch (error) {
      if (authEmailChanged && authUser) {
        try {
          await updateSupabaseAuthUser(authUser.id, {
            email: oldEmail,
            email_confirm: true,
            user_metadata: authUser.user_metadata ?? {},
          });
        } catch {
          // Preserve the database error and avoid hiding a failed rollback.
        }
      }
      throw error;
    }
  } catch (error) {
    sendStaffManagementError(res, error);
  }
});

router.patch("/schools/:schoolId/profile", async (req, res) => {
  try {
    if (res.locals.jiibRole === "super_admin") {
      res.status(403).json({ error: "Choose a school staff account to update this profile." });
      return;
    }
    if (!isSupabaseAdminConfigured()) {
      res.status(503).json({ error: "Profile updates are not configured. Add SUPABASE_SERVICE_ROLE_KEY in Replit Secrets." });
      return;
    }
    const schoolId = String(req.params.schoolId);
    const email = String(req.headers["x-verified-user-email"] ?? "").toLowerCase();
    const { displayName } = SchoolProfileBody.parse(req.body);
    const rows = asRows(await supabaseAdminRequest(
      `/rest/v1/allowed_users?school_id=eq.${encodeURIComponent(schoolId)}&email=eq.${encodeURIComponent(email)}&select=*&limit=1`,
    ));
    if (!rows[0]) {
      res.status(404).json({ error: "Staff account not found." });
      return;
    }
    const updated = asRows(await supabaseAdminRequest(
      `/rest/v1/allowed_users?school_id=eq.${encodeURIComponent(schoolId)}&email=eq.${encodeURIComponent(email)}&select=*`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: jsonBody({ display_name: displayName }),
      },
    ));
    if (!updated[0]) {
      res.status(404).json({ error: "Staff account not found." });
      return;
    }
    res.json(mapAllowedUser(updated[0]));
  } catch (error) {
    sendStaffManagementError(res, error);
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
function getNextTermIdentity(activeKey: string, activeLabel: string, terms: Record<string, Record<string, unknown>>) {
  const year = Number(
    activeLabel.match(/\b(20\d{2})\b/)?.[1] ??
    activeKey.match(/\b(20\d{2})\b/)?.[1] ??
    new Date().getFullYear(),
  );
  const currentNumber = Number(
    activeLabel.match(/\b(?:term|t)\s*([1-3])\b/i)?.[1] ??
    activeKey.match(/(?:term|t)[-_ ]?([1-3])$/i)?.[1] ??
    0,
  );
  let nextYear = currentNumber >= 3 ? year + 1 : year;
  let nextNumber = currentNumber >= 3 || currentNumber === 0 ? 1 : currentNumber + 1;
  let key = `${nextYear}-T${nextNumber}`;
  while (terms[key] && (terms[key].locked || terms[key].status === "closed")) {
    if (nextNumber >= 3) {
      nextYear += 1;
      nextNumber = 1;
    } else {
      nextNumber += 1;
    }
    key = `${nextYear}-T${nextNumber}`;
  }
  return { key, label: `Term ${nextNumber}, ${nextYear}` };
}

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

router.post("/schools/:schoolId/terms", requireSchoolAdmin, async (req, res): Promise<void> => {
  try {
    const { schoolId } = CreateSchoolTermParams.parse(req.params);
    const body = CreateSchoolTermBody.parse(req.body);
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
    const saved = await writeSchoolConfig(req, schoolId, {
      ...config,
      activeTerm: config.activeTerm ?? body.termKey,
      terms: { ...terms, [body.termKey]: term },
    });
    res.status(201).json(GetSchoolConfigResponse.parse({
      schoolId,
      data: saved,
      updatedAt: new Date(),
    }));
  } catch (error) {
    sendError(res, error);
  }
});

router.patch("/schools/:schoolId/terms/:termKey", requireSchoolAdmin, async (req, res): Promise<void> => {
  try {
    const { schoolId, termKey } = UpdateSchoolTermParams.parse(req.params);
    const body = UpdateSchoolTermBody.parse(req.body);
    const config = await readSchoolConfig(req, schoolId);
    const terms = config.terms && typeof config.terms === "object" && !Array.isArray(config.terms)
      ? (config.terms as Record<string, Record<string, unknown>>)
      : {};
    if (!terms[termKey]) {
      res.status(404).json({ error: "Term not found" });
      return;
    }
    const nextTerms = { ...terms };
    const term = {
      ...terms[termKey],
      locked: body.status === "closed",
      status: body.status,
      closedDate: body.status === "closed" ? new Date().toISOString() : null,
    };
    nextTerms[termKey] = term;
    let activeTerm = String(config.activeTerm ?? "");
    if (body.status === "closed" && activeTerm === termKey) {
      const identity = getNextTermIdentity(termKey, String(terms[termKey]?.label ?? termKey), nextTerms);
      const existing = nextTerms[identity.key];
      nextTerms[identity.key] = existing
        ? { ...existing, locked: false, status: "open", closedDate: null }
        : {
            label: identity.label,
            students: [],
            marks: [],
            locked: false,
            status: "open",
            closedDate: null,
            createdDate: new Date().toISOString(),
          };
      activeTerm = identity.key;
    }
    const saved = await writeSchoolConfig(req, schoolId, { ...config, activeTerm, terms: nextTerms });
    res.json(GetSchoolConfigResponse.parse({
      schoolId,
      data: saved,
      updatedAt: new Date(),
    }));
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/schools/:schoolId/terms/:termKey/activate", requireSchoolAdmin, async (req, res): Promise<void> => {
  try {
    const { schoolId, termKey } = ActivateSchoolTermParams.parse(req.params);
    const config = await readSchoolConfig(req, schoolId);
    const terms = config.terms && typeof config.terms === "object" && !Array.isArray(config.terms)
      ? (config.terms as Record<string, Record<string, unknown>>)
      : {};
    if (!terms[termKey]) {
      res.status(404).json({ error: "Term not found." });
      return;
    }
    const saved = await writeSchoolConfig(req, schoolId, { ...config, activeTerm: termKey });
    res.json(GetSchoolConfigResponse.parse({
      schoolId,
      data: saved,
      updatedAt: new Date(),
    }));
  } catch (error) {
    sendError(res, error);
  }
});

router.delete("/schools/:schoolId/terms/:termKey/data", requireSchoolAdmin, async (req, res): Promise<void> => {
  try {
    const { schoolId, termKey } = ClearSchoolTermMarksParams.parse(req.params);
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

router.delete("/schools/:schoolId/terms/:termKey", async (req, res) => {
  try {
    const { schoolId, termKey } = DeleteSchoolTermParams.parse(req.params);
    const config = await readSchoolConfig(req, schoolId);
    const terms = config.terms && typeof config.terms === "object" && !Array.isArray(config.terms)
      ? config.terms as Record<string, Record<string, unknown>>
      : {};
    if (!terms[termKey]) {
      res.status(404).json({ error: "Term not found." });
      return;
    }
    await Promise.all([
      supabaseRequest(req, "marks", { method: "DELETE" }, `?school_id=eq.${encodeURIComponent(schoolId)}&term_key=eq.${encodeURIComponent(termKey)}`),
      supabaseRequest(req, "students", { method: "DELETE" }, `?school_id=eq.${encodeURIComponent(schoolId)}&term_key=eq.${encodeURIComponent(termKey)}`),
    ]);
    const nextTerms = { ...terms };
    delete nextTerms[termKey];
    const remaining = Object.entries(nextTerms);
    const activeTerm = config.activeTerm === termKey
      ? remaining.filter(([, term]) => !(term.locked || term.status === "closed")).slice(-1)[0]?.[0]
        ?? remaining.slice(-1)[0]?.[0]
        ?? ""
      : config.activeTerm;
    await writeSchoolConfig(req, schoolId, { ...config, activeTerm, terms: nextTerms });
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

// ---- Year-end promotion wizard. Every batch is remembered for UNDO_DAYS so it can be undone. ----
const UNDO_DAYS = 60;
const PromotionBody = z.object({
  fromClass: z.string().trim().min(1).max(40),
  toClass: z.string().trim().min(1).max(40),
  students: z.array(z.object({
    id: z.string().min(1),
    action: z.enum(["promote", "stay"]),
    subjects: z.array(z.string().min(1)).max(40).optional(),
    aLevel: z.object({ stream: z.enum(["sciences", "arts"]), combination: z.string().min(1), subsidiary: z.string().optional() }).strict().nullable().optional(),
  }).strict()).min(1).max(2000),
}).strict();

type PromotionMove = { id: string; subjects?: string[]; aLevel?: Enrolment; created?: boolean };
type PromotionBatch = {
  id: string; at: string; by: string; termKey: string; fromClass: string; toClass: string; stayed: number;
  moved?: PromotionMove[]; movedCount: number; undoneAt?: string; undoneBy?: string;
};

function promotionHistoryOf(config: SchoolConfig): PromotionBatch[] {
  return Array.isArray(config.promotionHistory) ? (config.promotionHistory as PromotionBatch[]) : [];
}
const withinUndoWindow = (batch: PromotionBatch) => Date.now() - new Date(batch.at).getTime() <= UNDO_DAYS * 86_400_000;
const classOfStudent = (student: Record<string, unknown>) => String(student.class ?? student.className ?? "");

router.post("/schools/:schoolId/promotion", requireSchoolAdmin, async (req, res) => {
  try {
    const schoolId = String(req.params.schoolId);
    const body = PromotionBody.parse(req.body);
    if (body.fromClass === body.toClass) { res.status(400).json({ error: "Choose a different class to promote to." }); return; }
    const config = await readSchoolConfig(req, schoolId);
    const termKey = String(config.activeTerm ?? "");
    if (!termKey) { res.status(409).json({ error: "There is no active term to promote students in." }); return; }
    const terms = termsOf(config);
    const term = terms[termKey] ?? {};
    const legacyList = Array.isArray(term.students) ? (term.students as Array<Record<string, unknown>>) : [];
    const encSchool = encodeURIComponent(schoolId);
    const rows = asRows(await supabaseRequest(req, "students", {}, `?school_id=eq.${encSchool}&class=eq.${encodeURIComponent(body.fromClass)}&term_key=eq.${encodeURIComponent(termKey)}&select=*`));
    const rowById = new Map(rows.map((row) => [String(row.id), row]));
    const legacyById = new Map(legacyList.filter((student) => classOfStudent(student) === body.fromClass).map((student) => [String(student.id), student]));
    const destinationSubjects = (() => {
      const list = (config.subjects as Record<string, unknown> | undefined)?.[body.toClass];
      return Array.isArray(list) ? list.map((item) => String((item as { name?: unknown })?.name ?? item)).filter(Boolean) : [];
    })();
    const aLevelDestination = isALevelEnabledOn(config) && /^s(enior)?[\s.]*[56](?!\d)/i.test(body.toClass);

    type Change = {
      id: string; name: string; house: string; parentPhone: string | null; row?: Record<string, unknown>;
      prevSubjects: string[]; prevALevel: Enrolment | null; nextSubjects?: string[]; nextALevel: Enrolment | null;
    };
    const changes: Change[] = [];
    for (const item of body.students) {
      if (item.action !== "promote") continue;
      const row = rowById.get(item.id);
      const legacy = legacyById.get(item.id);
      if (!row && !legacy) { res.status(409).json({ error: `A student you selected is no longer in ${body.fromClass}. Reload the page and try again.` }); return; }
      const name = String(row?.name ?? legacy?.name ?? "");
      const prevSubjects = Array.isArray(row?.subjects) ? (row!.subjects as unknown[]).map(String) : Array.isArray(legacy?.subjects) ? (legacy!.subjects as unknown[]).map(String) : [];
      let nextSubjects = item.subjects;
      let nextALevel: Enrolment | null = null;
      if (aLevelDestination && item.aLevel) {
        const resolved = resolveEnrolment(config, body.toClass, item.aLevel);
        if ("problem" in resolved) { res.status(400).json({ error: `${name}: ${resolved.problem}` }); return; }
        nextALevel = resolved.aLevel;
        nextSubjects = resolved.subjects;
      } else if (aLevelDestination) {
        nextALevel = enrolmentOf(legacy?.aLevel);
        if (nextALevel) nextSubjects = nextSubjects ?? prevSubjects;
      }
      if (nextSubjects && destinationSubjects.length) {
        const unknown = nextSubjects.find((subject) => !destinationSubjects.includes(subject));
        if (unknown) { res.status(400).json({ error: `${name}: ${unknown} is not a subject of ${body.toClass}.` }); return; }
      }
      changes.push({
        id: item.id, name, house: String(row?.house ?? legacy?.house ?? ""), parentPhone: (row?.parent_phone as string | null | undefined) ?? (String(legacy?.parentPhone ?? legacy?.parent_phone ?? "") || null),
        row, prevSubjects, prevALevel: enrolmentOf(legacy?.aLevel), nextSubjects, nextALevel,
      });
    }
    if (!changes.length) { res.status(400).json({ error: "No students are set to be promoted." }); return; }

    // Write the student rows one by one; if anything fails, put back what was already changed.
    const applied: Change[] = [];
    const rowKey = (id: string) => `?id=eq.${encodeURIComponent(id)}&school_id=eq.${encSchool}&term_key=eq.${encodeURIComponent(termKey)}`;
    try {
      for (const change of changes) {
        if (change.row) {
          await supabaseRequest(req, "students", { method: "PATCH", headers: { Prefer: "return=minimal" }, body: jsonBody({ class: body.toClass, ...(change.nextSubjects ? { subjects: change.nextSubjects } : {}), updated_at: new Date().toISOString() }) }, rowKey(change.id));
        } else {
          await supabaseRequest(req, "students", {
            method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: jsonBody({ school_id: schoolId, term_key: termKey, id: change.id, name: change.name, class: body.toClass, house: change.house, parent_phone: change.parentPhone, ...(change.nextSubjects ? { subjects: change.nextSubjects } : {}), updated_at: new Date().toISOString() }),
          }, "?on_conflict=id,school_id,term_key");
        }
        applied.push(change);
      }
    } catch (error) {
      for (const change of applied) {
        try {
          if (change.row) await supabaseRequest(req, "students", { method: "PATCH", headers: { Prefer: "return=minimal" }, body: jsonBody({ class: body.fromClass, subjects: change.row.subjects ?? null }) }, rowKey(change.id));
          else await supabaseRequest(req, "students", { method: "DELETE", headers: { Prefer: "return=minimal" } }, rowKey(change.id));
        } catch { /* best effort */ }
      }
      throw error;
    }

    const byId = new Map(changes.map((change) => [change.id, change]));
    // A-Level enrolment lives on the saved-settings copy of the student, so students that only have a database row get one.
    const inCopy = new Set(legacyList.map((student) => String(student.id)));
    const copies = changes
      .filter((change) => change.nextALevel && !inCopy.has(change.id))
      .map((change) => ({ id: change.id, name: change.name, class: body.toClass, house: change.house, parentPhone: change.parentPhone, subjects: change.nextSubjects ?? [], aLevel: change.nextALevel }));
    const nextTerm = Array.isArray(term.students) || copies.length
      ? { ...term, students: [...legacyList.map((student) => {
          const change = byId.get(String(student.id));
          if (!change) return student;
          const { aLevel: _drop, ...rest } = student;
          return { ...rest, class: body.toClass, ...(change.nextSubjects ? { subjects: change.nextSubjects } : {}), ...(change.nextALevel ? { aLevel: change.nextALevel } : {}) };
        }), ...copies] }
      : term;
    const batch: PromotionBatch = {
      id: randomUUID(), at: new Date().toISOString(), by: String(req.headers["x-verified-user-email"] ?? ""), termKey,
      fromClass: body.fromClass, toClass: body.toClass, stayed: body.students.length - changes.length, movedCount: changes.length,
      moved: changes.map((change) => ({
        id: change.id,
        ...(change.prevSubjects.length ? { subjects: change.prevSubjects } : {}),
        ...(change.prevALevel ? { aLevel: change.prevALevel } : {}),
        ...(change.row ? {} : { created: true }),
      })),
    };
    const history = [batch, ...promotionHistoryOf(config)]
      .map((item) => (withinUndoWindow(item) ? item : { ...item, moved: undefined }))
      .filter((item) => withinUndoWindow(item) || Date.now() - new Date(item.at).getTime() <= 365 * 86_400_000)
      .slice(0, 12);
    const saved = await writeSchoolConfig(req, schoolId, { ...config, terms: { ...terms, [termKey]: nextTerm }, promotionHistory: history });
    res.json({ promoted: changes.length, stayed: batch.stayed, batchId: batch.id, config: GetSchoolConfigResponse.parse({ schoolId, data: saved, updatedAt: new Date() }) });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/schools/:schoolId/promotion/:batchId/undo", requireSchoolAdmin, async (req, res) => {
  try {
    const schoolId = String(req.params.schoolId);
    const config = await readSchoolConfig(req, schoolId);
    const history = promotionHistoryOf(config);
    const batch = history.find((item) => item.id === req.params.batchId);
    if (!batch) { res.status(404).json({ error: "That promotion was not found." }); return; }
    if (batch.undoneAt) { res.status(409).json({ error: "This promotion has already been undone." }); return; }
    if (!withinUndoWindow(batch) || !batch.moved) { res.status(409).json({ error: `Promotions can be undone for ${UNDO_DAYS} days. This one is too old.` }); return; }
    const encSchool = encodeURIComponent(schoolId);
    const rows = asRows(await supabaseRequest(req, "students", {}, `?school_id=eq.${encSchool}&term_key=eq.${encodeURIComponent(batch.termKey)}&class=eq.${encodeURIComponent(batch.toClass)}&select=id`));
    const present = new Set(rows.map((row) => String(row.id)));
    const restorable = batch.moved.filter((move) => present.has(move.id));
    for (const move of restorable) {
      await supabaseRequest(req, "students", { method: "PATCH", headers: { Prefer: "return=minimal" }, body: jsonBody({ class: batch.fromClass, subjects: move.subjects ?? [], updated_at: new Date().toISOString() }) },
        `?id=eq.${encodeURIComponent(move.id)}&school_id=eq.${encSchool}&term_key=eq.${encodeURIComponent(batch.termKey)}`);
    }
    const terms = termsOf(config);
    const term = terms[batch.termKey];
    const restoredIds = new Map(restorable.map((move) => [move.id, move]));
    const nextTerm = term && Array.isArray(term.students)
      ? { ...term, students: (term.students as Array<Record<string, unknown>>).map((student) => {
          const move = restoredIds.get(String(student.id));
          if (!move || classOfStudent(student) !== batch.toClass) return student;
          const { aLevel: _a, subjects: _s, ...rest } = student;
          return { ...rest, class: batch.fromClass, ...(move.subjects ? { subjects: move.subjects } : {}), ...(move.aLevel ? { aLevel: move.aLevel } : {}) };
        }) }
      : term;
    const nextHistory = history.map((item) => (item.id === batch.id ? { ...item, undoneAt: new Date().toISOString(), undoneBy: String(req.headers["x-verified-user-email"] ?? ""), moved: undefined } : item));
    const saved = await writeSchoolConfig(req, schoolId, { ...config, ...(nextTerm ? { terms: { ...terms, [batch.termKey]: nextTerm } } : {}), promotionHistory: nextHistory });
    res.json({ restored: restorable.length, skipped: batch.moved.length - restorable.length, config: GetSchoolConfigResponse.parse({ schoolId, data: saved, updatedAt: new Date() }) });
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
    // Students saved only in the school's settings (e.g. brought over from the old system) have no database row yet.
    // Create it now, already in the new class, so they are promoted like everyone else.
    if (termKey && term && Array.isArray(term.students)) {
      const inDatabase = new Set(studentRows.map((row) => String(row.id)));
      for (const legacy of term.students as Array<Record<string, unknown>>) {
        const legacyId = String(legacy.id ?? "");
        if (!legacyId || inDatabase.has(legacyId)) continue;
        if (String(legacy.class ?? legacy.className ?? "") !== body.fromClass) continue;
        const created = asRows(
          await supabaseRequest(
            req,
            "students",
            {
              method: "POST",
              body: jsonBody({
                school_id: schoolId,
                term_key: termKey,
                id: legacyId,
                name: String(legacy.name ?? ""),
                class: body.toClass,
                house: String(legacy.house ?? ""),
                parent_phone: String(legacy.parentPhone ?? legacy.parent_phone ?? "") || null,
                updated_at: new Date().toISOString(),
              }),
            },
            "?on_conflict=id,school_id,term_key&select=*",
          ),
        );
        if (created[0]) results.push(mapStudent(created[0]));
      }
    }
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