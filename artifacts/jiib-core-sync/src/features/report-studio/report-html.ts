// Builds the printable report card markup (A4, 794px wide). Ported from the Report Studio design file.
import type { GradeBand, StudentReport, SubjectResult } from "./report-model";

export type TemplateId = "classic" | "modern" | "elegant" | "bold";

export const TEMPLATES: { id: TemplateId; name: string; note: string; swatch: string }[] = [
  { id: "classic", name: "Classic Navy", note: "Traditional navy and red school report", swatch: "linear-gradient(135deg,#1a3a6b,#2e6da4)" },
  { id: "modern", name: "Modern Minimal", note: "Clean indigo and teal, lots of white space", swatch: "linear-gradient(135deg,#3730a3,#0d9488)" },
  { id: "elegant", name: "Elegant Ledger", note: "Ivory paper, burgundy and gold, certificate feel", swatch: "linear-gradient(135deg,#7a1f2b,#b8860b)" },
  { id: "bold", name: "Bold Contemporary", note: "Charcoal header, electric blue, pill grades", swatch: "linear-gradient(135deg,#0f172a,#2563eb)" },
];

export type ReportContext = {
  schoolName: string;
  address: string;
  motto: string;
  year: string;
  termLabel: string;
  closingDate: string;
  nextTermDate: string;
  logoUrl: string;
  stamp: string;
  template: TemplateId;
  grading: GradeBand[];
  bills?: { label: string }[];
};

const esc = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const dash = (value: unknown) => (value === null || value === undefined || value === "" ? "-" : esc(value));
const BADGES = ["🥇", "🥈", "🥉"];

const DEFAULT_BILLS = [
  { label: "RESULT 1 - Would fulfill all stipulated conditions for a UCE certificate at UNEB." },
  { label: "RESULT 2 - Did not sit for some compulsory subjects, or did not sit for a minimum of 8 subjects, or does not have Project Work scores." },
  { label: "RESULT 3 - Achieved basic level E in all subjects taken." },
  { label: "RESULT 4 - Registered but missed all assessments." },
];

const TRAITS = ["Punctuality", "Mental Alertness", "Behavior", "Reliability", "Respect", "Neatness", "Politeness", "Honesty", "Relationship with Staff", "Relationship with Others"];

const gradeClass = (grade?: string) => ({ A: "rc-grade-A", B: "rc-grade-B", C: "rc-grade-C", D: "rc-grade-D", E: "rc-grade-E" } as Record<string, string>)[grade ?? ""] ?? "";

function termNumber(label: string) {
  return (label.match(/term\s*(\d)/i) || [])[1] ?? "";
}

function classTeacherComment(report: StudentReport) {
  const first = esc(report.student.name.split(/\s+/)[0] || "The student");
  const red = (value: string) => `<span style="color:#c0392b;font-weight:800;font-style:normal;">${esc(value)}</span>`;
  const weak = report.weakSubjects;
  if (!report.subjects.length || report.lowestPercent === null) return `${first} has shown encouraging effort.`;
  if (report.lowestPercent >= 70) return `${first} has performed very well. Keep it up!`;
  if (weak.length === 1) return `${first} did well overall, but needs more effort in ${red(weak[0])}.`;
  if (weak.length === 2) return `${first} did well. More effort needed in ${red(weak[0])} and ${red(weak[1])}.`;
  if (weak.length > 2) return `${first} needs more effort in ${weak.slice(0, -1).map(red).join(", ")} and ${red(weak[weak.length - 1])}.`;
  return `${first} has shown encouraging effort.`;
}

function headTeacherComment(report: StudentReport) {
  switch (report.overallDescriptor?.label) {
    case "EXCEPTIONAL":
    case "OUTSTANDING": return "Excellent performance! Keep it up.";
    case "SATISFACTORY": return "Very good performance across most subjects.";
    case "BASIC": return "Fair performance. More effort is needed to improve.";
    case "ELEMENTARY": return "More effort needed to improve overall grades.";
    default: return "Well done. Continue working hard.";
  }
}

const logoMarkup = (ctx: ReportContext) => ctx.logoUrl
  ? `<img class="rc-logo" src="${esc(ctx.logoUrl)}" alt="Logo" crossorigin="anonymous">`
  : `<div class="rc-logo-placeholder">🏫</div>`;

/** The mid-term result slip: compact, two students per A4 page. */
function slipMarkup(report: StudentReport, ctx: ReportContext, qr: string) {
  const rows = report.subjects.map((subject: SubjectResult) => {
    const descriptor = subject.descriptor ? `<span class="${subject.descriptor.cls}" style="font-size:6pt;color:#000;">${esc(subject.descriptor.label)}</span>` : `<span style="color:#999;">-</span>`;
    const grade = subject.grade ? `<span class="${gradeClass(subject.grade.grade)}">${esc(subject.grade.grade)}</span>` : `<span style="color:#999;">-</span>`;
    return `<tr>
      <td style="text-align:left;padding:3px 4px 3px 5px;font-weight:700;color:#000;">${esc(subject.name)}</td>
      <td style="padding:3px 4px;color:#000;font-weight:700;">${dash(subject.total)}</td>
      <td style="padding:3px 4px;">${grade}</td>
      <td style="padding:3px 4px;">${descriptor}</td>
    </tr>`;
  }).join("");
  const th = "background:#2e6da4;color:white;padding:3px 5px;border:1px solid #1a3a6b;";
  return `<div style="border:2px solid #1a3a6b;padding:8px 10px;">
    <div style="display:flex;align-items:center;gap:8px;border-bottom:2px solid #1a3a6b;padding-bottom:6px;margin-bottom:6px;">
      ${ctx.logoUrl ? `<img src="${esc(ctx.logoUrl)}" crossorigin="anonymous" style="width:48px;height:48px;object-fit:contain;">` : `<div style="width:48px;height:48px;border:2px solid #1a3a6b;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.2rem;background:#f0f4ff;">🏫</div>`}
      <div style="flex:1;text-align:center;">
        <div style="font-size:11pt;font-weight:900;color:#1a3a6b;text-transform:uppercase;">${esc(ctx.schoolName)}</div>
        ${ctx.address ? `<div style="font-size:6.5pt;color:#333;">${esc(ctx.address)}</div>` : ""}
        ${ctx.motto ? `<div style="font-size:7pt;font-weight:800;color:#c0392b;">${esc(ctx.motto.toUpperCase())}</div>` : ""}
      </div>
      ${qr ? `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;"><img src="${qr}" style="width:48px;height:48px;"><span style="font-size:5pt;color:#1a3a6b;font-weight:700;">SCAN</span></div>` : ""}
    </div>
    <div style="background:#c0392b;color:white;text-align:center;font-size:7.5pt;font-weight:800;padding:3px;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:5px;">MID-TERM RESULT SLIP — TERM ${esc(termNumber(ctx.termLabel))} — ${esc(ctx.year)}</div>
    <div style="display:flex;gap:4px;margin-bottom:5px;font-size:7pt;">
      <div style="flex:2;border:1px solid #c8d4e8;padding:3px 6px;"><span style="font-weight:700;color:#1a3a6b;">NAME:</span> <span style="font-weight:700;color:#000;margin-left:4px;">${esc(report.student.name.toUpperCase())}</span></div>
      <div style="flex:1;border:1px solid #c8d4e8;padding:3px 6px;"><span style="font-weight:700;color:#1a3a6b;">CLASS:</span> <span style="font-weight:700;color:#000;margin-left:4px;">${esc(report.student.className)}</span></div>
      <div style="flex:1;border:1px solid #c8d4e8;padding:3px 6px;"><span style="font-weight:700;color:#1a3a6b;">TERM:</span> <span style="font-weight:700;color:#000;margin-left:4px;">${esc(ctx.termLabel)}</span></div>
    </div>
    <table style="width:100%;border-collapse:collapse;border:1.5px solid #1a3a6b;font-size:7pt;margin-bottom:5px;">
      <thead><tr>
        <th style="${th}text-align:left;">SUBJECT</th>
        <th style="${th}width:60px;">MIDTERM (${report.maxPossible})</th>
        <th style="${th}width:36px;">GRADE</th>
        <th style="${th}width:80px;">DESCRIPTOR</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="4" style="text-align:center;padding:8px;color:#999;">No subjects configured</td></tr>`}</tbody>
    </table>
    <div style="border:1.5px solid #1a3a6b;">
      <div style="background:#1a3a6b;color:white;font-size:6.5pt;font-weight:800;padding:2px 6px;text-transform:uppercase;">Class Teacher's Comment</div>
      <div style="min-height:28px;padding:4px 6px;font-size:8pt;font-style:italic;font-weight:bold;color:#000;">${classTeacherComment(report)}</div>
    </div>
  </div>`;
}

/** One printed page of mid-term slips (one or two students). */
export function buildSlipPage(reports: StudentReport[], ctx: ReportContext, qrs: string[]) {
  const [first, second] = reports;
  const divider = second ? `<div style="border-top:2px dashed #1a3a6b;margin:4px 0 6px;text-align:center;"><span style="font-size:6pt;color:#999;background:#fff;padding:0 6px;position:relative;top:-1px;">✂ CUT HERE</span></div>` : "";
  return `<div class="rc-slip-page" data-student="${esc(first.student.id)}" style="width:794px;background:#fff;font-family:Arial,Helvetica,sans-serif;font-size:8pt;color:#000;padding:10px 6px;box-sizing:border-box;">
    ${slipMarkup(first, ctx, qrs[0] ?? "")}
    ${divider}
    ${second ? slipMarkup(second, ctx, qrs[1] ?? "") : ""}
  </div>`;
}

/** A full end-of-term report card in the chosen template. */
export function buildEndTermCard(report: StudentReport, ctx: ReportContext, qr: string) {
  const { student, fields } = report;
  const logo = logoMarkup(ctx);
  const watermark = ctx.logoUrl ? `<img class="rc-watermark" src="${esc(ctx.logoUrl)}" alt="" crossorigin="anonymous">` : `<div class="rc-watermark-placeholder">🏫</div>`;
  const badge = report.badgeRank ? BADGES[report.badgeRank - 1] : "";
  const passport = `<div class="rc-passport-wrap"><div class="rc-passport">👤</div>${badge ? `<div class="rc-rank-badge">${badge}</div>` : ""}</div>`;
  const stamp = ctx.stamp ? `<img class="rc-stamp-img" src="${esc(ctx.stamp)}" alt="Stamp">` : `<span style="font-size:6pt;color:#bbb;">Stamp</span>`;

  const thCols = fields.map((field) => `<th style="width:60px;">${esc(field.name.toUpperCase().replace(" OF ", "/"))}<br>(${field.max})</th>`).join("") + `<th style="width:45px;">TOTAL<br>(100)</th>`;

  const rows = report.subjects.map((subject) => {
    const cols = fields.map((field) => `<td>${dash(subject.cols[field.field])}</td>`).join("");
    const grade = subject.grade ? `<span class="${gradeClass(subject.grade.grade)}">${esc(subject.grade.grade)}</span>` : `<span style="color:#999;">-</span>`;
    const descriptor = subject.descriptor ? `<span class="${subject.descriptor.cls}">${esc(subject.descriptor.label)}</span>` : `<span style="color:#999;">-</span>`;
    return `<tr>
      <td class="subject-cell">${esc(subject.name)}</td>
      ${cols}
      <td><strong>${dash(subject.total)}</strong></td>
      <td style="font-weight:800;color:#1a3a6b;">${dash(subject.outOf3)}</td>
      <td>${grade}</td>
      <td>${descriptor}</td>
      <td style="font-weight:700;color:#1a3a6b;">${esc(subject.teacher || "-")}</td>
    </tr>`;
  }).join("");
  const colCount = fields.length + 6;

  const gradingRows = ctx.grading.map((band) => `<tr><td style="font-weight:700;text-align:center;">${esc(band.grade)}</td><td>${band.min}–${band.max}</td><td>${esc(band.descriptor)}</td></tr>`).join("");
  const billRows = (ctx.bills ?? DEFAULT_BILLS).map((bill) => {
    const [head, ...rest] = bill.label.split(" - ");
    return `<tr><td colspan="3" style="font-size:6pt;color:#1a1a1a;padding:3px 5px;line-height:1.4;"><strong style="color:#1a3a6b;">${esc(head)} -</strong> ${esc(rest.join(" - "))}</td></tr>`;
  }).join("");
  const traitRows = TRAITS.map((trait) => `<tr><td class="rc-trait-lbl">${esc(trait)}</td><td class="rc-trait-rating">&nbsp;</td></tr>`).join("");

  const overallCls = report.overallDescriptor?.cls ?? "";
  const title = `END OF TERM ${esc(termNumber(ctx.termLabel))} REPORT — ${esc(ctx.year)}`;
  const info = (label: string, value: string) => `<span class="rc-info-lbl">${label}</span><span class="rc-info-val">&nbsp;&nbsp;${esc(value)}</span>`;

  return `<div class="rc rc-tpl-${ctx.template}" data-student="${esc(student.id)}">
    ${watermark}
    <div class="rc-header">
      ${logo}
      <div class="rc-school-info">
        <div class="rc-school-name">${esc(ctx.schoolName.toUpperCase())}</div>
        ${ctx.address ? `<div class="rc-school-address">${esc(ctx.address)}</div>` : ""}
        ${ctx.motto ? `<div class="rc-school-motto">${esc(ctx.motto.toUpperCase())}</div>` : ""}
      </div>
      ${passport}
    </div>

    <div class="rc-title-banner">${title}</div>

    <div class="rc-info-grid" style="display:flex;">
      <div style="flex:1;min-width:0;">
        <div class="rc-info-row"><div class="rc-info-cell" style="flex:2.2;">${info("NAME OF STUDENT:", student.name.toUpperCase())}</div><div class="rc-info-cell">${info("CLASS:", student.className)}</div></div>
        <div class="rc-info-row"><div class="rc-info-cell" style="flex:2.2;">${info("HOUSE:", (student.house || "").toUpperCase())}</div><div class="rc-info-cell">${info("YEAR:", ctx.year)}</div></div>
        <div class="rc-info-row"><div class="rc-info-cell" style="flex:2.2;">${info("CLOSING DATE:", ctx.closingDate)}</div><div class="rc-info-cell">${info("TERM:", ctx.termLabel)}</div></div>
        <div class="rc-info-row"><div class="rc-info-cell" style="flex:2.2;">${info("NEXT TERM BEGINS ON:", ctx.nextTermDate)}</div><div class="rc-info-cell">${info("NO. IN CLASS:", String(report.classSize))}</div></div>
      </div>
      <div style="width:90px;flex-shrink:0;border-left:1.5px solid #1a3a6b;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:4px;">
        ${qr ? `<img src="${qr}" style="width:72px;height:72px;" alt="QR"><span style="font-size:5pt;font-weight:800;color:#1a3a6b;letter-spacing:.5px;">SCAN FOR INFO</span>` : `<span style="font-size:6pt;color:#bbb;">QR</span>`}
      </div>
    </div>

    <div class="rc-overall-row" style="margin-top:8px;">
      <div class="rc-overall-cell"><span class="rc-overall-lbl">OVERALL TOTAL</span><span class="rc-overall-val">${report.grandTotal}</span></div>
      <div class="rc-overall-cell"><span class="rc-overall-lbl">AVERAGE</span><span class="rc-overall-val">${esc(report.average)}</span></div>
      <div class="rc-overall-cell"><span class="rc-overall-lbl">PERCENTAGE</span><span class="rc-overall-val">${esc(report.percentage)}</span></div>
      <div class="rc-overall-cell"><span class="rc-overall-lbl">RANK</span><span class="rc-overall-val" style="background:#1a3a6b;">${report.rank ?? "—"}</span></div>
    </div>

    <div class="rc-perf-header" style="margin-top:8px;">STUDENT'S ACADEMIC PERFORMANCE — ${esc(student.className)}</div>
    <table class="rc-table" style="margin-top:6px;">
      <thead><tr>
        <th class="subject-col" style="width:auto;">SUBJECT</th>
        ${thCols}
        <th style="width:36px;">OUT/3</th>
        <th style="width:30px;">GRADE</th>
        <th style="width:70px;">DESCRIPTOR</th>
        <th style="width:30px;">INITIALS</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="${colCount}" style="text-align:center;padding:8px;color:#999;">No subjects configured</td></tr>`}</tbody>
    </table>

    <table class="rc-summary-row-table" style="margin-top:8px;">
      <thead><tr>
        <th style="text-align:left;width:auto;">OVERALL AVERAGE (out of 3)</th>
        <th>OVERALL PERFORMANCE</th>
        <th>RESULT CATEGORY</th>
      </tr></thead>
      <tbody><tr>
        <td style="font-size:9pt;font-weight:900;color:#1a3a6b;">${esc(report.overallOutOf3)}</td>
        <td><span class="${overallCls}" style="font-size:7.5pt;">${esc(report.overallDescriptor?.label ?? "—")}</span></td>
        <td style="font-weight:800;color:#c0392b;">${esc(report.resultCategory)}</td>
      </tr></tbody>
    </table>

    <div style="color:#111124;text-align:center;font-size:13px;font-weight:700;margin:4px 0;"><u>GRADING SCALE</u></div>
    <table class="rc-descriptor-system-table">
      <thead><tr><th style="width:70px;">GRADE</th><th style="width:130px;">ACHIEVEMENT LEVEL</th><th>DESCRIPTOR</th></tr></thead>
      <tbody>
        <tr><td style="font-weight:900;">A</td><td><b>EXCEPTIONAL</b></td><td><i>Applies innovatory and creativity of the acquired knowledge and skills.</i></td></tr>
        <tr><td style="font-weight:900;">B</td><td><b>OUTSTANDING</b></td><td><i>Applies high level of acquired knowledge &amp; skills in life situations.</i></td></tr>
        <tr><td style="font-weight:900;">C</td><td><b>SATISFACTORY</b></td><td><i>Applies adequate level of acquired knowledge and skills in real life.</i></td></tr>
        <tr><td style="font-weight:900;">D</td><td><b>BASIC</b></td><td><i>Demonstrates minimum level of acquired knowledge &amp; skills in life</i></td></tr>
        <tr><td style="font-weight:900;">E</td><td><b>ELEMENTARY</b></td><td><i>Demonstrates basic level of acquired knowledge and skills in real life.</i></td></tr>
      </tbody>
    </table>

    <div class="rc-bottom" style="margin-top:8px;">
      <div class="rc-bottom-col">
        <div class="rc-bottom-title">Affective Traits</div>
        <table class="rc-bottom-table">
          <thead><tr><td class="rc-trait-lbl" style="background:#e8f0fb;font-weight:800;color:#1a3a6b;">TRAIT</td><td class="rc-trait-rating" style="background:#e8f0fb;font-weight:800;color:#1a3a6b;">RATING</td></tr></thead>
          <tbody>${traitRows}</tbody>
        </table>
      </div>
      <div class="rc-bottom-col">
        <div class="rc-bottom-title">Keys to Grading</div>
        <table class="rc-bottom-table">
          <thead class="rc-grading-key"><tr><td style="font-weight:700;">GRD</td><td style="font-weight:700;">RANGE</td><td style="font-weight:700;">DESCRIPTOR</td></tr></thead>
          <tbody>${gradingRows}</tbody>
        </table>
        <div class="rc-bottom-title" style="margin-top:3px;">Keys to Rating</div>
        <table class="rc-bottom-table"><tbody>
          <tr><td style="font-weight:800;text-align:center;">5</td><td>= EXCELLENT</td></tr>
          <tr><td style="font-weight:800;text-align:center;">4</td><td>= VERY GOOD</td></tr>
          <tr><td style="font-weight:800;text-align:center;">3</td><td>= GOOD</td></tr>
          <tr><td style="font-weight:800;text-align:center;">2</td><td>= POOR</td></tr>
          <tr><td style="font-weight:800;text-align:center;">1</td><td>= VERY POOR</td></tr>
        </tbody></table>
      </div>
      <div class="rc-bottom-col">
        <div class="rc-bottom-title">RESULT CATEGORIES</div>
        <table class="rc-bottom-table"><tbody>${billRows}</tbody></table>
      </div>
    </div>

    <div class="rc-comments">
      <div style="flex:1;display:flex;flex-direction:column;gap:3px;">
        <div class="rc-comment-box"><div class="rc-comment-title">Class Teacher's Comment</div><div class="rc-comment-body">${classTeacherComment(report)}</div></div>
        <div class="rc-comment-box"><div class="rc-comment-title">Head Teacher's Comment</div><div class="rc-comment-body">${headTeacherComment(report)}</div></div>
      </div>
      <div class="rc-sig-box"><div class="rc-sig-title">Signature &amp; Stamp</div><div class="rc-sig-body">${stamp}</div></div>
    </div>
    ${ctx.motto ? `<div class="rc-school-motto" style="text-align:center;margin-top:4px;">${esc(ctx.motto.toUpperCase())}</div>` : ""}
  </div>`;
}
