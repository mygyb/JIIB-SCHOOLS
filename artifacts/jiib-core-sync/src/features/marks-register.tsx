import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getGetDashboardSummaryQueryKey,
  getGetSchoolConfigQueryKey,
  getListMarksQueryKey,
  getListStudentsQueryKey,
  useGetSchoolConfig,
  useListMarks,
  useListStudents,
  useUpsertMark,
} from "@workspace/api-client-react";
import type { Mark, School, Student } from "@workspace/api-client-react";
import { CalendarDays, CircleAlert, ClipboardList, Loader2, LockKeyhole, RefreshCw, Search, Trash2, X } from "lucide-react";
import { configuredHouses, currentTerm, getAssessmentFields, getTerms, isTermLocked, subjectNames, type AssessmentField, type SchoolConfig } from "@/lib/school-data";
import { getPendingMarks, queueMark } from "@/lib/offline-marks";
import { jiibApi } from "@/lib/jiib-api";

type SubjectAssignment = { class: string; subject: string };

function readAssignments(): SubjectAssignment[] {
  try {
    const raw = JSON.parse(localStorage.getItem("jiib.subjects") || "[]") as unknown[];
    return raw.flatMap((entry) => {
      if (typeof entry === "string") {
        const [className, subject] = entry.includes("::") ? entry.split("::", 2) : ["", entry];
        return subject ? [{ class: className, subject }] : [];
      }
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Record<string, unknown>;
      const className = String(item.class ?? "").trim();
      const subject = String(item.subject ?? "").trim();
      return subject ? [{ class: className, subject }] : [];
    });
  } catch {
    return [];
  }
}

function scoreFor(mark: Partial<Mark> | undefined, field: AssessmentField) {
  const alias = { c1: "aoi", c2: "midterm", c3: "end" }[field.field] as "aoi" | "midterm" | "end";
  const values = mark as (Partial<Mark> & Record<string, unknown>) | undefined;
  return Number(values?.[alias] ?? values?.[field.field] ?? 0);
}

export function MarksRegister({ school }: { school: School }) {
  const queryClient = useQueryClient();
  const isTeacher = localStorage.getItem("jiib.role") === "Teacher";
  const [assignments] = useState(readAssignments);
  const [term, setTerm] = useState("");
  const [className, setClassName] = useState(() => isTeacher ? readAssignments().find((item) => item.class)?.class ?? "" : "");
  const [subject, setSubject] = useState("");
  const [search, setSearch] = useState("");
  const [pendingMarks, setPendingMarks] = useState(() => getPendingMarks(school.id));
  const [error, setError] = useState("");
  const [fieldSaveStates, setFieldSaveStates] = useState<Record<string, "saved" | "unsaved">>({});
  const saveVersions = useRef<Record<string, number>>({});
  const pendingSyncKeys = useRef(new Map<string, { markKey: string; hasValue: boolean }>());
  const configQuery = useGetSchoolConfig(school.id, {
    query: { queryKey: getGetSchoolConfigQueryKey(school.id) },
  });
  const configData = (configQuery.data?.data ?? {}) as SchoolConfig;
  const activeTerm = currentTerm(configData);
  const deadline = String(configData.deadline ?? "").trim();
  const deadlineNoticeId = deadline ? `${deadline}|${String(configData.deadlinePublishedAt ?? "")}` : "";
  const teacherIdentity = localStorage.getItem("jiib.email") || localStorage.getItem("jiib.userName") || "teacher";
  const deadlineDismissalKey = `jiib.deadline-dismissed:${school.id}:${teacherIdentity.toLowerCase()}`;
  const [dismissedDeadline, setDismissedDeadline] = useState(() => localStorage.getItem(deadlineDismissalKey) ?? "");
  const selectedTerm = isTeacher ? activeTerm : term || activeTerm;
  const terms = getTerms(configData);
  const allStudents = useListStudents(school.id, {});
  const rawClassNames = configData.subjects && !Array.isArray(configData.subjects) && typeof configData.subjects === "object"
    ? Object.keys(configData.subjects)
    : [];
  const hasUnrestrictedSubject = assignments.some((item) => !item.class);
  const classes = Array.from(new Set([
    ...rawClassNames,
    ...(allStudents.data ?? []).map((student) => student.className),
  ])).filter(Boolean).sort();
  const availableClasses = isTeacher && !hasUnrestrictedSubject
    ? classes.filter((item) => assignments.some((assignment) => assignment.class === item))
    : classes;
  const fields = getAssessmentFields(configData);
  const maxTotal = fields.reduce((total, field) => total + field.max, 0);
  const deadlineDate = deadline ? new Date(deadline) : null;
  const deadlineIsPast = deadlineDate !== null && Number.isFinite(deadlineDate.getTime()) && deadlineDate.getTime() < Date.now();
  const formattedDeadline = deadlineDate && Number.isFinite(deadlineDate.getTime())
    ? new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(deadlineDate)
    : deadline;
  const availableSubjects = useMemo(() => {
    const configured = subjectNames(configData, className);
    if (!isTeacher) return configured;
    const assigned = assignments
      .filter((item) => !item.class || !className || item.class === className)
      .map((item) => item.subject);
    return Array.from(new Set([...configured, ...assigned])).filter((item) => assigned.includes(item));
  }, [assignments, className, configData, isTeacher]);
  const selectedSubject = subject || availableSubjects[0] || "";

  useEffect(() => {
    if (configQuery.isSuccess) setTerm(activeTerm);
  }, [activeTerm, configQuery.isSuccess]);
  useEffect(() => {
    if (isTeacher && !className && availableClasses[0]) setClassName(availableClasses[0]);
  }, [availableClasses, className, isTeacher]);
  useEffect(() => {
    if (!availableSubjects.includes(subject)) setSubject(availableSubjects[0] ?? "");
  }, [availableSubjects, subject]);
  useEffect(() => {
    setPendingMarks(getPendingMarks(school.id));
    pendingSyncKeys.current.clear();
    setFieldSaveStates({});
  }, [school.id]);
  useEffect(() => {
    const reconcileSyncedMarks = () => {
      const pending = getPendingMarks(school.id);
      const pendingKeys = new Set(pending.map((item) =>
        `${item.schoolId}|${item.termKey}|${item.studentId}|${item.subject}`,
      ));
      setPendingMarks(pending);
      setFieldSaveStates((current) => {
        const next = { ...current };
        for (const [fieldKey, pendingMark] of pendingSyncKeys.current) {
          if (!pendingKeys.has(pendingMark.markKey)) {
            next[fieldKey] = pendingMark.hasValue ? "saved" : "unsaved";
            pendingSyncKeys.current.delete(fieldKey);
          }
        }
        return next;
      });
    };
    window.addEventListener("jiib:sync", reconcileSyncedMarks);
    return () => window.removeEventListener("jiib:sync", reconcileSyncedMarks);
  }, [school.id]);
  const settings = configData.settings && typeof configData.settings === "object"
    ? configData.settings
    : {};
  const optionalSubjectsClass = String(settings.optionalSubjectsClass ?? "S.3");
  const classLevel = (value: string) => Number(value.match(/\d+/)?.[0] ?? 0);
  const usesOptionalSubjects = Boolean(className) &&
    classLevel(className) >= classLevel(optionalSubjectsClass);

  const studentsQuery = useQuery({
    queryKey: ["marks-register-students", school.id, selectedTerm, className, search],
    queryFn: () => jiibApi<Student[]>(
      `/api/schools/${encodeURIComponent(school.id)}/students?termKey=${encodeURIComponent(selectedTerm)}&className=${encodeURIComponent(className)}&search=${encodeURIComponent(search)}`,
    ),
  });
  const marksQuery = useListMarks(school.id, {
    termKey: selectedTerm,
    className: className || undefined,
    subject: selectedSubject || undefined,
  });
  const upsert = useUpsertMark();
  const students = (studentsQuery.data ?? []).filter((student) =>
    !usesOptionalSubjects || !selectedSubject || !student.subjects?.length ||
    student.subjects.includes(selectedSubject),
  );
  const marks = marksQuery.data ?? [];
  const locked = Boolean(configData.marksLocked || isTermLocked(configData, selectedTerm));
  const pendingForTerm = pendingMarks.filter((item) => item.termKey === selectedTerm);

  const getMark = (studentId: string) => {
    const queued = pendingMarks.find((item) =>
      item.schoolId === school.id && item.studentId === studentId &&
      item.termKey === selectedTerm && item.subject === selectedSubject,
    );
    return queued ?? marks.find((mark) => mark.studentId === studentId && mark.subject === selectedSubject);
  };

  // Enter / "Next" on the phone keypad jumps to the next mark box (down the list, box by box).
  const focusNextMark = (current: HTMLInputElement) => {
    const boxes = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-mark-input]:not(:disabled)"));
    const next = boxes[boxes.indexOf(current) + 1];
    if (next) {
      next.focus();
      next.select();
      next.scrollIntoView({ block: "center", behavior: "smooth" });
    } else {
      current.blur();
    }
  };

  const save = (student: Student, field: AssessmentField, rawValue: string, input: HTMLInputElement) => {
    const fieldKey = `${school.id}|${selectedTerm}|${student.id}|${selectedSubject}|${field.field}`;
    const value = rawValue.trim() === "" ? null : Number(rawValue);
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > field.max)) {
      window.alert(`${field.name} must be between 0 and ${field.max}.`);
      const existing = getMark(student.id);
      input.value = existing?.enteredFields?.includes(field.field) ? String(scoreFor(existing, field)) : "";
      setFieldSaveStates((current) => ({
        ...current,
        [fieldKey]: existing?.enteredFields?.includes(field.field) || scoreFor(existing, field) > 0 ? "saved" : "unsaved",
      }));
      return;
    }
    const saveVersion = (saveVersions.current[fieldKey] ?? 0) + 1;
    saveVersions.current[fieldKey] = saveVersion;
    setFieldSaveStates((current) => ({ ...current, [fieldKey]: "unsaved" }));
    const existing = getMark(student.id);
    const nextEnteredFields = new Set(existing?.enteredFields ?? []);
    if (value === null) nextEnteredFields.delete(field.field);
    else nextEnteredFields.add(field.field);
    const values = {
      aoi: existing?.aoi ?? 0,
      midterm: existing?.midterm ?? 0,
      end: existing?.end ?? 0,
    };
    const storageField = { c1: "aoi", c2: "midterm", c3: "end" }[field.field] as keyof typeof values;
    values[storageField] = value ?? 0;
    const payload = {
      studentId: student.id,
      termKey: selectedTerm,
      subject: selectedSubject,
      ...values,
      enteredFields: Array.from(nextEnteredFields),
    };
    setError("");
    if (!navigator.onLine) {
      const next = queueMark({ schoolId: school.id, ...payload });
      setPendingMarks(next.filter((item) => item.schoolId === school.id));
      pendingSyncKeys.current.set(fieldKey, {
        markKey: `${school.id}|${selectedTerm}|${student.id}|${selectedSubject}`,
        hasValue: value !== null,
      });
      window.dispatchEvent(new Event("jiib:sync"));
      return;
    }
    upsert.mutate(
      { schoolId: school.id, data: payload },
      {
        onSuccess: async () => {
          if (saveVersions.current[fieldKey] === saveVersion) {
            setFieldSaveStates((current) => ({ ...current, [fieldKey]: value === null ? "unsaved" : "saved" }));
          }
          await queryClient.invalidateQueries({
            queryKey: getListMarksQueryKey(school.id, {
              termKey: selectedTerm,
              className: className || undefined,
              subject: selectedSubject || undefined,
            }),
          });
          await queryClient.invalidateQueries({
            queryKey: getGetDashboardSummaryQueryKey(school.id),
          });
          localStorage.setItem("jiib.lastSyncAt", new Date().toISOString());
        },
        onError: (cause) => {
          if (!navigator.onLine) {
            const next = queueMark({ schoolId: school.id, ...payload });
            setPendingMarks(next.filter((item) => item.schoolId === school.id));
            pendingSyncKeys.current.set(fieldKey, {
              markKey: `${school.id}|${selectedTerm}|${student.id}|${selectedSubject}`,
              hasValue: value !== null,
            });
          } else {
            setError(cause instanceof Error ? cause.message : "This mark could not be saved.");
          }
          if (saveVersions.current[fieldKey] === saveVersion) {
            setFieldSaveStates((current) => ({ ...current, [fieldKey]: "unsaved" }));
          }
        },
      },
    );
  };

  const clearTerm = async () => {
    if (!window.confirm(`Clear all marks for ${selectedTerm}? This cannot be undone.`)) return;
    try {
      await jiibApi(`/api/schools/${encodeURIComponent(school.id)}/marks?termKey=${encodeURIComponent(selectedTerm)}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: getListMarksQueryKey(school.id) });
      await queryClient.invalidateQueries({
        queryKey: getGetDashboardSummaryQueryKey(school.id),
      });
      await marksQuery.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not clear marks for this term.");
    }
  };

  const retry = () => {
    void configQuery.refetch();
    void allStudents.refetch();
    void studentsQuery.refetch();
    void marksQuery.refetch();
  };

  return <div className="fade-up">
    <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.22em] text-primary">Assessment desk</p><h2 className="font-display text-3xl font-semibold tracking-[-.035em] sm:text-4xl">Marks register</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Enter, review, and keep assessment records moving by class and subject.</p></div>
      <div className="flex flex-wrap items-center gap-2"><span className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">{navigator.onLine ? `${pendingForTerm.length} pending` : "Offline · queued"}</span>{locked && <span className="inline-flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive"><LockKeyhole size={14} /> Marks locked</span>}{!isTeacher && <button data-testid="button-clear-term-marks" onClick={() => void clearTerm()} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-muted"><Trash2 size={14} /> Clear term</button>}</div>
    </div>

    {isTeacher && deadline && dismissedDeadline !== deadlineNoticeId && <div data-testid="deadline-notification" role="status" className="mb-5 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
      <CircleAlert size={19} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{deadlineIsPast ? "Marks deadline has passed" : "Marks submission deadline"}</p>
        <p className="mt-1 text-sm leading-5">{deadlineIsPast ? `The deadline was ${formattedDeadline}.` : `Please complete your marks by ${formattedDeadline}.`}</p>
      </div>
      <button type="button" data-testid="button-dismiss-deadline" aria-label="Dismiss marks deadline reminder" onClick={() => {
        localStorage.setItem(deadlineDismissalKey, deadlineNoticeId);
        setDismissedDeadline(deadlineNoticeId);
      }} className="shrink-0 rounded-md p-1 text-destructive/80 transition hover:bg-destructive/10 hover:text-destructive">
        <X size={17} aria-hidden="true" />
      </button>
    </div>}

    <div className="mb-4 grid grid-cols-2 gap-3 rounded-2xl border border-border bg-card p-3 sm:p-4 xl:grid-cols-4">
      {!isTeacher ? <label className="col-span-2 xl:col-span-1"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Term</span><select data-testid="select-mark-term" value={selectedTerm} onChange={(event) => setTerm(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm">{(terms.length ? terms : [{ key: selectedTerm, label: selectedTerm, locked: false, active: true }]).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label> : <div className="col-span-2 xl:col-span-1"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Active term</span><p className="flex h-10 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 text-sm font-medium"><CalendarDays size={14} className="text-primary" />{terms.find((item) => item.key === selectedTerm)?.label ?? selectedTerm}</p></div>}
      <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Class</span><select data-testid="select-mark-class" value={className} onChange={(event) => setClassName(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm" disabled={isTeacher && availableClasses.length === 0}><option value="">All classes</option>{availableClasses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Subject</span><select data-testid="select-mark-subject" value={selectedSubject} onChange={(event) => setSubject(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm" disabled={!availableSubjects.length}><option value="">Select a subject</option>{availableSubjects.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="col-span-2 xl:col-span-1"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Find student</span><div className="relative"><Search size={15} className="absolute left-3 top-3 text-muted-foreground" /><input data-testid="input-mark-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or student ID" className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm" /></div></label>
    </div>

    {error && <p role="alert" className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {configQuery.isLoading || studentsQuery.isLoading || marksQuery.isLoading ? <div className="space-y-3 p-5">{[1, 2, 3, 4].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-muted" />)}</div>
        : configQuery.isError || studentsQuery.isError || marksQuery.isError ? <div className="p-5 text-center"><CircleAlert className="mx-auto text-destructive" size={22} /><p className="mt-2 text-sm">Marks could not be loaded.</p><button onClick={retry} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"><RefreshCw size={14} /> Retry</button></div>
        : !availableSubjects.length ? <div className="p-10 text-center"><ClipboardList className="mx-auto text-muted-foreground" size={25} /><p className="mt-3 font-semibold">No subjects assigned</p><p className="mt-1 text-sm text-muted-foreground">{isTeacher ? "Ask your school administrator to assign a class and subject to your account." : "Add subjects under Manage subjects before entering marks."}</p></div>
        : !fields.length ? <div className="p-10 text-center text-sm text-muted-foreground">No assessment components are active for this school.</div>
        : !students.length ? <div className="p-10 text-center"><p className="font-semibold">No students match</p><p className="mt-1 text-sm text-muted-foreground">Choose another class or clear the student search.</p></div>
        : <div className="xl:overflow-x-auto"><table className="block w-full text-left xl:table xl:min-w-[700px]">
          <thead className="hidden border-b border-border bg-muted/45 text-[10px] uppercase tracking-[.16em] text-muted-foreground xl:table-header-group"><tr><th className="px-5 py-4 font-bold">Student</th>{fields.map((field) => <th key={field.field} className="px-3 py-4 font-bold">{field.name} <span className="font-normal normal-case tracking-normal">({field.max})</span></th>)}<th className="px-5 py-4 text-right font-bold">Total</th></tr></thead>
          {/* Phones and tablets: one card per student with the mark boxes right under the name, so nothing scrolls sideways. Wide screens (xl): the usual table. */}
          <tbody className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 xl:table-row-group xl:divide-y xl:divide-border xl:p-0">{students.map((student) => {
            const mark = getMark(student.id);
            const total = fields.reduce((sum, field) => sum + scoreFor(mark, field), 0);
            const totalColor = total >= maxTotal / 2 ? "text-[#2e8c72]" : "text-foreground";
            return <tr key={student.id} data-testid={`row-mark-${student.id}`} style={{ gridTemplateColumns: `repeat(${fields.length}, minmax(0, 1fr))` }} className="grid content-start gap-x-2 gap-y-3 rounded-xl border border-border bg-background p-3 xl:table-row xl:rounded-none xl:border-0 xl:bg-transparent xl:p-0">
              <td className="col-span-full min-w-0 xl:table-cell xl:px-5 xl:py-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">{student.name.split(/\s+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase()}</span>
                  <div className="min-w-0 flex-1"><p className="text-sm font-semibold uppercase">{student.name}</p><p className="text-xs text-muted-foreground">{student.className} · {selectedSubject}</p></div>
                  <p className="shrink-0 text-right xl:hidden"><span className={`font-display text-lg font-semibold ${totalColor}`}>{total}</span><span className="ml-1 text-xs text-muted-foreground">/ {maxTotal}</span></p>
                </div>
              </td>
              {fields.map((field) => {
                const entered = mark?.enteredFields?.includes(field.field) ?? scoreFor(mark, field) > 0;
                const fieldKey = `${school.id}|${selectedTerm}|${student.id}|${selectedSubject}|${field.field}`;
                const isSaved = (fieldSaveStates[fieldKey] ?? (entered ? "saved" : "unsaved")) === "saved";
                return <td key={field.field} className="flex min-w-0 flex-col justify-end gap-1 xl:table-cell xl:px-3 xl:py-3">
                  <span className="text-[10px] font-bold uppercase leading-tight tracking-[.08em] text-muted-foreground xl:hidden">{field.name} <span className="font-normal normal-case tracking-normal">({field.max})</span></span>
                  <input disabled={locked} data-mark-input data-testid={`input-mark-${field.field}-${student.id}`} data-save-state={isSaved ? "saved" : "unsaved"} aria-label={`${field.name} (out of ${field.max}) for ${student.name}`} title={isSaved ? "Saved" : "Not saved"} type="number" inputMode="decimal" enterKeyHint="next" min="0" max={field.max} step="any" defaultValue={entered ? scoreFor(mark, field) : ""} onChange={() => { saveVersions.current[fieldKey] = (saveVersions.current[fieldKey] ?? 0) + 1; setFieldSaveStates((current) => ({ ...current, [fieldKey]: "unsaved" })); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); focusNextMark(event.currentTarget); } }} onBlur={(event) => save(student, field, event.currentTarget.value, event.currentTarget)} className={`h-12 w-full rounded-md border px-2 text-center text-base outline-none transition-colors focus:ring-2 focus:ring-ring disabled:opacity-50 xl:h-9 xl:w-24 xl:text-left xl:text-sm ${isSaved ? "border-[#96cdb8] bg-[#eef8f4]" : "border-[#e6a0a0] bg-[#fff1f1]"}`} />
                </td>;
              })}
              <td className="hidden xl:table-cell xl:px-5 xl:py-3 xl:text-right"><span className={`font-display text-lg font-semibold ${totalColor}`}>{total}</span><span className="ml-1 text-xs text-muted-foreground">/ {maxTotal}</span></td>
            </tr>;
          })}</tbody></table></div>}
    </div>
  </div>;
}
