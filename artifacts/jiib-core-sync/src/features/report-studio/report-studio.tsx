import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Download, ImagePlus, Loader2, Minus, Plus, Printer, Trash2 } from "lucide-react";
import {
  getGetSchoolConfigQueryKey,
  useGetSchoolConfig,
  useListMarks,
  useListStudents,
  useUpdateSchoolConfig,
} from "@workspace/api-client-react";
import type { School } from "@workspace/api-client-react";
import { currentTerm, getTerms, type SchoolConfig } from "@/lib/school-data";
import { REPORT_CARD_CSS } from "./report-css";
import { buildEndTermCard, buildSlipPage, TEMPLATES, type ReportContext, type TemplateId } from "./report-html";
import { buildDataset, classOverview, type ReportType, type StudentReport } from "./report-model";
import { buildPages, downloadPdf, printPages, qrFor, PAGE_WIDTH } from "./report-output";

type Scope = "student" | "class" | "school";

const field = "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm";
const label = "mb-1.5 block text-xs font-semibold text-muted-foreground";

function yearFromTerm(termKey: string, termLabel: string) {
  return termLabel.match(/(\d{4}(?:\s*\/\s*\d{4})?)/)?.[1]?.replace(/\s+/g, "") ?? termKey.match(/^(\d{4})/)?.[1] ?? String(new Date().getFullYear());
}

/** Shrinks an uploaded stamp so it stays small enough to save with the school's settings. */
function readStamp(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("That file is not a usable image."));
      image.onload = () => {
        const scale = Math.min(1, 480 / image.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function ReportStudio({ school }: { school: School }) {
  const queryClient = useQueryClient();
  const configQuery = useGetSchoolConfig(school.id, { query: { queryKey: getGetSchoolConfigQueryKey(school.id) } });
  const updateConfig = useUpdateSchoolConfig();
  const config = useMemo(() => (configQuery.data?.data ?? {}) as SchoolConfig, [configQuery.data]);
  const settings = useMemo(() => (config.settings && typeof config.settings === "object" ? config.settings : {}) as Record<string, unknown>, [config]);

  const terms = getTerms(config);
  const [termKey, setTermKey] = useState("");
  const activeKey = termKey || currentTerm(config);
  const termLabel = terms.find((term) => term.key === activeKey)?.label ?? activeKey;

  const studentsQuery = useListStudents(school.id, {});
  const marksQuery = useListMarks(school.id, { termKey: activeKey });

  const [type, setType] = useState<ReportType>("endterm");
  const [template, setTemplate] = useState<TemplateId>(() => {
    try { const saved = localStorage.getItem(`jiib.reportTemplate.${school.id}`); if (TEMPLATES.some((item) => item.id === saved)) return saved as TemplateId; } catch { /* storage unavailable */ }
    return "classic";
  });
  const [className, setClassName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [scope, setScope] = useState<Scope>("student");

  // Report details (saved with the school's settings)
  const [details, setDetails] = useState({ motto: "", address: "", year: "", closingDate: "", nextTermDate: "" });
  const [stamp, setStamp] = useState("");
  const [detailsSeeded, setDetailsSeeded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (detailsSeeded || !configQuery.isSuccess) return;
    setDetails({
      motto: String(settings.motto ?? ""),
      address: String(settings.address ?? ""),
      year: String(settings.reportYear ?? ""),
      closingDate: String(settings.closingDate ?? ""),
      nextTermDate: String(settings.nextTermDate ?? ""),
    });
    setStamp(String(settings.stampBase64 ?? ""));
    setDetailsSeeded(true);
  }, [configQuery.isSuccess, detailsSeeded, settings]);

  const year = details.year.trim() || yearFromTerm(activeKey, termLabel);

  const dataset = useMemo(() => {
    const students = (studentsQuery.data ?? []).map((student) => ({
      id: student.id, name: student.name, className: student.className, house: student.house, subjects: student.subjects ?? [],
    }));
    return buildDataset(students, marksQuery.data ?? [], config);
  }, [studentsQuery.data, marksQuery.data, config]);

  const classes = useMemo(() => Array.from(new Set(dataset.students.map((student) => student.className))).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [dataset]);
  const classStudents = dataset.students
    .filter((student) => !className || student.className === className)
    .sort((a, b) => (a.className + a.name).localeCompare(b.className + b.name, undefined, { numeric: true }));
  const reports = dataset.reports(type);
  const selected = reports.get(studentId) ?? null;
  const overview = className ? classOverview(dataset, className) : null;

  const ctx: ReportContext = useMemo(() => ({
    schoolName: school.name,
    address: details.address.trim(),
    motto: details.motto.trim(),
    year,
    termLabel,
    closingDate: details.closingDate.trim(),
    nextTermDate: details.nextTermDate.trim(),
    logoUrl: school.logoUrl ?? "",
    stamp,
    template: type === "midterm" ? "classic" : template,
    grading: dataset.grading,
  }), [school.name, school.logoUrl, details, year, termLabel, stamp, template, type, dataset.grading]);

  // ── Preview ──
  const [previewHtml, setPreviewHtml] = useState("");
  useEffect(() => {
    let cancelled = false;
    if (!selected) { setPreviewHtml(""); return; }
    (async () => {
      const qr = await qrFor(selected, ctx);
      if (cancelled) return;
      setPreviewHtml(type === "midterm" ? buildSlipPage([selected], ctx, [qr]) : buildEndTermCard(selected, ctx, qr));
    })();
    return () => { cancelled = true; };
  }, [selected, ctx, type]);

  const frameRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState(PAGE_WIDTH);
  const [cardHeight, setCardHeight] = useState(1123);
  const [zoomStep, setZoomStep] = useState(0);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(() => setFrameWidth(frame.clientWidth));
    observer.observe(frame);
    setFrameWidth(frame.clientWidth);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const observer = new ResizeObserver(() => setCardHeight(card.scrollHeight));
    observer.observe(card);
    setCardHeight(card.scrollHeight);
    return () => observer.disconnect();
  }, [previewHtml]);
  const fitScale = Math.min(1, Math.max(0.3, (frameWidth - 8) / PAGE_WIDTH));
  const scale = Math.min(1.4, Math.max(0.3, fitScale + zoomStep * 0.1));

  // ── Actions ──
  const [busy, setBusy] = useState<"" | "print" | "pdf">("");
  const [progress, setProgress] = useState("");

  const scopeReports = (): StudentReport[] => {
    if (scope === "student") return selected ? [selected] : [];
    const pool = scope === "class" ? classStudents : dataset.students.slice().sort((a, b) => (a.className + a.name).localeCompare(b.className + b.name, undefined, { numeric: true }));
    return pool.flatMap((student) => reports.get(student.id) ?? []);
  };
  const scopeCount = scope === "student" ? (selected ? 1 : 0) : scope === "class" ? (className ? classStudents.length : 0) : dataset.students.length;
  const canRun = scopeCount > 0 && !busy && !marksQuery.isLoading;

  const run = async (kind: "print" | "pdf") => {
    const list = scopeReports();
    if (!list.length) return;
    setBusy(kind);
    setNotice("");
    try {
      if (kind === "pdf" && scope === "school") {
        // A whole school in one file would be enormous, so each class gets its own PDF.
        const groups = new Map<string, StudentReport[]>();
        list.forEach((report) => groups.set(report.student.className, [...(groups.get(report.student.className) ?? []), report]));
        let index = 0;
        for (const [group, members] of groups) {
          index += 1;
          setProgress(`Class ${group} (${index} of ${groups.size})…`);
          const pages = await buildPages(members, type, ctx);
          await downloadPdf(pages, `${school.slug || "school"}_${type === "midterm" ? "midterm" : "report"}_${group.replace(/\W+/g, "")}.pdf`, (done, total) => setProgress(`Class ${group} (${index} of ${groups.size}): page ${done} of ${total}`));
        }
        setNotice(`${groups.size} PDF files were downloaded, one per class.`);
      } else {
        setProgress("Preparing pages…");
        const pages = await buildPages(list, type, ctx);
        if (kind === "print") await printPages(pages);
        else {
          const name = scope === "student" ? list[0].student.name.replace(/\s+/g, "_") : className.replace(/\W+/g, "");
          await downloadPdf(pages, `${school.slug || "school"}_${type === "midterm" ? "midterm" : "report"}_${name}.pdf`, (done, total) => setProgress(`Creating PDF… ${done} of ${total}`));
        }
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "That did not work. Please try again.");
    } finally {
      setBusy("");
      setProgress("");
    }
  };

  const saveDetails = () => {
    setSaveState("saving");
    updateConfig.mutate(
      {
        schoolId: school.id,
        data: {
          data: {
            ...config,
            settings: { ...settings, motto: details.motto.trim(), address: details.address.trim(), reportYear: details.year.trim(), closingDate: details.closingDate.trim(), nextTermDate: details.nextTermDate.trim(), stampBase64: stamp },
          },
        },
      },
      {
        onSuccess: (result) => { queryClient.setQueryData(getGetSchoolConfigQueryKey(school.id), result); setSaveState("saved"); setTimeout(() => setSaveState("idle"), 2500); },
        onError: () => setSaveState("error"),
      },
    );
  };

  const pickTemplate = (id: TemplateId) => {
    setTemplate(id);
    try { localStorage.setItem(`jiib.reportTemplate.${school.id}`, id); } catch { /* storage unavailable */ }
  };

  const onStamp = async (file: File | undefined) => {
    if (!file) return;
    try { setStamp(await readStamp(file)); setNotice(""); } catch (error) { setNotice(error instanceof Error ? error.message : "The stamp could not be added."); }
  };

  const loading = configQuery.isLoading || studentsQuery.isLoading;

  return <div className="fade-up">
    <style>{REPORT_CARD_CSS}</style>
    <div className="mb-6">
      <p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">Academics & marks</p>
      <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">Report studio</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Pick a template, preview a student's report, then print or download it as a PDF for one student, a class or the whole school.</p>
    </div>

    <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="space-y-4">
        <section className="rounded-2xl border border-border bg-card p-4">
          <p className={label}>Report type</p>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Report type">
            {([["endterm", "End of term"], ["midterm", "Midterm slip"]] as const).map(([id, name]) =>
              <button key={id} type="button" data-testid={`button-report-type-${id}`} aria-pressed={type === id} onClick={() => setType(id)} className={`h-11 rounded-lg border text-sm font-semibold transition ${type === id ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-muted"}`}>{name}</button>)}
          </div>
          {type === "midterm" && <p className="mt-2 text-xs leading-5 text-muted-foreground">Shows midterm marks only (AOI and Midterm combined when AOI is on). Two slips are printed per page.</p>}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <p className={label}>Template</p>
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATES.map((item) =>
              <button key={item.id} type="button" data-testid={`button-template-${item.id}`} aria-pressed={template === item.id} disabled={type === "midterm"} onClick={() => pickTemplate(item.id)} title={item.note} className={`rounded-xl border p-2 text-left text-xs font-semibold transition disabled:opacity-50 ${template === item.id ? "border-primary bg-primary/5" : "border-input hover:bg-muted"}`}>
                <span className="mb-1.5 block h-8 rounded-md" style={{ background: item.swatch }} />
                {item.name}
              </button>)}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{type === "midterm" ? "Midterm slips always use the compact classic layout." : TEMPLATES.find((item) => item.id === template)?.note}</p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <p className={label}>Choose a report</p>
          <div className="space-y-3">
            <label><span className={label}>Term</span><select data-testid="select-report-term" value={activeKey} onChange={(event) => { setTermKey(event.target.value); setStudentId(""); }} className={field}>{terms.length ? terms.map((term) => <option key={term.key} value={term.key}>{term.label}{term.active ? " (active)" : ""}</option>) : <option value={activeKey}>{activeKey}</option>}</select></label>
            <label><span className={label}>Class</span><select data-testid="select-report-class" value={className} onChange={(event) => { setClassName(event.target.value); setStudentId(""); }} className={field}><option value="">All classes</option>{classes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label><span className={label}>Student</span><select data-testid="select-report-student" value={studentId} onChange={(event) => setStudentId(event.target.value)} className={field}><option value="">Select a student</option>{classStudents.map((student) => <option key={student.id} value={student.id}>{student.name.toUpperCase()} · {student.className}</option>)}</select></label>
          </div>
          {overview && <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {([["Students", overview.students], ["Class avg", overview.average], ["Marks in", `${overview.complete}%`]] as const).map(([name, value]) => <div key={name} className="rounded-lg bg-muted/60 px-2 py-2"><dd className="font-display text-lg font-semibold">{value}</dd><dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{name}</dt></div>)}
          </dl>}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <p className={label}>Report details</p>
          <div className="space-y-3">
            <label><span className={label}>School motto</span><input data-testid="input-report-motto" value={details.motto} onChange={(event) => setDetails({ ...details, motto: event.target.value })} placeholder="e.g. Excellence in all" className={field} /></label>
            <label><span className={label}>School address</span><input data-testid="input-report-address" value={details.address} onChange={(event) => setDetails({ ...details, address: event.target.value })} placeholder="P.O. Box 1, Kampala" className={field} /></label>
            <label><span className={label}>Academic year</span><input data-testid="input-report-year" value={details.year} onChange={(event) => setDetails({ ...details, year: event.target.value })} placeholder={yearFromTerm(activeKey, termLabel)} className={field} /></label>
            <label><span className={label}>Closing date</span><input data-testid="input-report-closing" value={details.closingDate} onChange={(event) => setDetails({ ...details, closingDate: event.target.value })} placeholder="e.g. 30th August 2026" className={field} /></label>
            <label><span className={label}>Next term begins on</span><input data-testid="input-report-next-term" value={details.nextTermDate} onChange={(event) => setDetails({ ...details, nextTermDate: event.target.value })} placeholder="e.g. 6th October 2026" className={field} /></label>
            <div>
              <span className={label}>School stamp</span>
              <div className="flex items-center gap-2">
                <label className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-input text-sm font-medium hover:bg-muted"><ImagePlus size={16} aria-hidden="true" />{stamp ? "Replace stamp" : "Upload stamp (PNG)"}<input data-testid="input-report-stamp" type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(event) => { void onStamp(event.target.files?.[0]); event.target.value = ""; }} /></label>
                {stamp && <><img src={stamp} alt="Stamp preview" className="h-11 w-11 rounded-md border border-border bg-white object-contain" /><button type="button" aria-label="Remove stamp" onClick={() => setStamp("")} className="grid h-11 w-11 place-items-center rounded-lg border border-input text-destructive hover:bg-destructive/5"><Trash2 size={16} aria-hidden="true" /></button></>}
              </div>
            </div>
            <button type="button" data-testid="button-save-report-details" onClick={saveDetails} disabled={saveState === "saving"} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {saveState === "saving" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : saveState === "saved" ? <Check size={16} aria-hidden="true" /> : null}
              {saveState === "saved" ? "Saved for every report" : "Save these details"}
            </button>
            {saveState === "error" && <p role="alert" className="text-xs text-destructive">The details could not be saved. Please try again.</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <p className={label}>Print or download</p>
          <label><span className={label}>Which reports</span><select data-testid="select-report-scope" value={scope} onChange={(event) => setScope(event.target.value as Scope)} className={field}>
            <option value="student">This student only</option>
            <option value="class" disabled={!className}>Every student in the selected class</option>
            <option value="school">Every student in the school</option>
          </select></label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" data-testid="button-report-print" disabled={!canRun} onClick={() => void run("print")} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-input bg-background text-sm font-semibold hover:bg-muted disabled:opacity-50">{busy === "print" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Printer size={16} aria-hidden="true" />}Print</button>
            <button type="button" data-testid="button-report-pdf" disabled={!canRun} onClick={() => void run("pdf")} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy === "pdf" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}Download PDF</button>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground" aria-live="polite">{progress || (scopeCount ? `${scopeCount} ${type === "midterm" ? "slip" : "report"}${scopeCount === 1 ? "" : "s"} ready. ${type === "midterm" ? "Two slips per A4 page." : "One A4 page each."}` : "Select a student or a class to enable printing.")}</p>
          {notice && <p role="alert" className="mt-2 text-xs text-destructive">{notice}</p>}
        </section>
      </div>

      <section className="min-w-0 rounded-2xl border border-border bg-muted/40 p-3 sm:p-4" aria-label="Report preview">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-semibold">{selected ? `${selected.student.name.toUpperCase()} · ${selected.student.className}` : "Preview"}</p>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" aria-label="Zoom out" onClick={() => setZoomStep((step) => step - 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-input bg-background hover:bg-muted"><Minus size={15} aria-hidden="true" /></button>
            <button type="button" onClick={() => setZoomStep(0)} className="h-9 rounded-lg border border-input bg-background px-2 text-xs font-semibold hover:bg-muted">{Math.round(scale * 100)}%</button>
            <button type="button" aria-label="Zoom in" onClick={() => setZoomStep((step) => step + 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-input bg-background hover:bg-muted"><Plus size={15} aria-hidden="true" /></button>
          </div>
        </div>
        <div ref={frameRef} className="overflow-auto">
          {loading ? <div className="grid h-72 place-items-center text-sm text-muted-foreground"><Loader2 className="animate-spin" aria-label="Loading" /></div>
            : !previewHtml ? <div data-testid="report-preview-empty" className="grid min-h-72 place-items-center px-6 text-center"><div><p className="font-semibold">Select a student to preview their report</p><p className="mt-1 text-sm text-muted-foreground">Choose the term, class and student on the left. {dataset.students.length === 0 ? "No students have been added yet." : ""}</p></div></div>
              : <div style={{ width: PAGE_WIDTH * scale, height: cardHeight * scale, margin: "0 auto" }}>
                <div ref={cardRef} data-testid="report-preview" style={{ width: PAGE_WIDTH, transform: `scale(${scale})`, transformOrigin: "top left" }} dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>}
        </div>
      </section>
    </div>
  </div>;
}
