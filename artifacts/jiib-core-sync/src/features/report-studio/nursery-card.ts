// Nursery (Baby / Middle / Top) report card: learning-area scores on the left, activity ratings in a picture grid on the right.
import { JSCHOOLS_SEAL } from "@/lib/jschools-seal";
import type { StudentReport } from "./report-model";

export const NURSERY_ACTIVITIES = [
  { id: "writing", label: "WRITING", icon: "✏️" },
  { id: "listening", label: "LISTENING", icon: "👂" },
  { id: "reading", label: "READING", icon: "📖" },
  { id: "speaking", label: "SPEAKING", icon: "🗣️" },
  { id: "drawing", label: "DRAWING", icon: "🎨" },
  { id: "games", label: "GAMES", icon: "⚽" },
  { id: "rhymes", label: "RHYMES / STORIES", icon: "📚" },
  { id: "music", label: "MUSIC", icon: "🎵" },
  { id: "health", label: "HEALTH HABITS", icon: "🪥" },
  { id: "toilet", label: "TOILET HABITS", icon: "🚽" },
] as const;

export const NURSERY_RATINGS = ["Excellent!", "Very good", "Good", "Fairly good", "Commendable", "Impressive", "Fluent", "Reads well", "Can improve", "Needs help"];

export type NurseryExtras = {
  activities?: Record<string, string>;
  daysAttended?: string;
  daysAbsent?: string;
  totalDays?: string;
  behaviour?: string;
  headComment?: string;
};

export type NurseryContext = {
  schoolName: string;
  address: string;
  motto: string;
  year: string;
  termLabel: string;
  closingDate: string;
  nextTermDate: string;
  logoUrl: string;
  stamp: string;
  extras?: NurseryExtras;
  classComment: string;
  headComment: string;
};

const esc = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const hand = "font-family:'Comic Sans MS','Segoe Print','Bradley Hand',cursive;color:#c0392b;";
const BORDER = "1.5px solid #1a3a6b";

export function buildNurseryCard(report: StudentReport, ctx: NurseryContext) {
  const { student } = report;
  const extras = ctx.extras ?? {};
  const term = (ctx.termLabel.match(/term\s*(\d)/i) || [])[1] ?? "";
  const logo = ctx.logoUrl ? `<img src="${esc(ctx.logoUrl)}" alt="Logo" crossorigin="anonymous" style="width:78px;height:78px;object-fit:contain;">` : `<div style="width:78px;height:78px;border:2px solid #1a3a6b;border-radius:50%;display:grid;place-items:center;font-size:30px;">🏫</div>`;
  const badge = report.badgeRank ? ["🥇", "🥈", "🥉"][report.badgeRank - 1] : "";
  const passport = `<div style="position:relative;width:78px;height:92px;border:2px solid #1a3a6b;display:grid;place-items:center;font-size:34px;color:#aaa;background:#f8f9ff;">👤${badge ? `<span style="position:absolute;right:-8px;bottom:-8px;font-size:22px;">${badge}</span>` : ""}</div>`;

  const subjectCount = report.subjects.length || 1;
  const rowHeight = Math.max(52, Math.min(110, Math.floor(470 / Math.max(1, report.subjects.length))));
  const rows = report.subjects.map((subject, index) => `<tr>
      <td style="border:${BORDER};padding:6px 8px;font-size:9pt;font-weight:700;height:${rowHeight}px;vertical-align:middle;"><span style="font-size:8pt;font-weight:900;">Learning Area ${index + 1}:</span><br>${esc(subject.name)}</td>
      <td style="border:${BORDER};padding:6px 8px;font-size:9.5pt;vertical-align:middle;">SCORE: <b style="${hand}">${subject.total === null ? "—" : `${esc(subject.total)}/100`}</b><br>Remark: <span style="${hand}font-weight:700;">${esc(subject.descriptor ? subject.descriptor.label.charAt(0) + subject.descriptor.label.slice(1).toLowerCase() : "—")}</span></td>
      <td style="border:${BORDER};width:74px;"></td>
    </tr>`).join("") || `<tr><td colspan="3" style="border:${BORDER};padding:14px;text-align:center;color:#999;font-size:9pt;">No learning areas set for this class</td></tr>`;

  const cells = NURSERY_ACTIVITIES.map((item) => {
    const value = (extras.activities ?? {})[item.id] ?? "";
    return `<div style="border:${BORDER};height:92px;padding:3px 6px;display:flex;flex-direction:column;justify-content:space-between;">
      <div style="font-size:6.5pt;font-weight:800;color:#1a3a6b;">${item.label}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;"><span style="font-size:21pt;line-height:1;">${item.icon}</span><span style="${hand}font-size:10.5pt;font-weight:700;text-align:right;line-height:1.1;">${esc(value)}</span></div>
    </div>`;
  }).join("");

  const total = report.maxPossible * subjectCount;
  const stamp = ctx.stamp ? `<img src="${esc(ctx.stamp)}" alt="Stamp" style="max-height:64px;max-width:200px;object-fit:contain;">` : `<span style="border:1px solid #333;border-radius:50%;padding:7px 28px;font-size:8pt;">SCHOOL STAMP</span>`;
  const cell = `border:${BORDER};padding:6px 8px;font-size:10pt;`;
  const line = (label: string, value: string) => `<span style="font-weight:700;">${label}</span>&nbsp;<span style="border-bottom:1px solid #333;display:inline-block;min-width:44px;text-align:center;font-weight:800;color:#1a3a6b;">${esc(value) || "&nbsp;"}</span>`;

  return `<div class="rc rc-tpl-classic" data-student="${esc(student.id)}" style="font-family:Arial,Helvetica,sans-serif;">
    <div style="display:flex;align-items:center;gap:12px;border-bottom:3px solid #1a3a6b;padding-bottom:8px;">
      ${logo}
      <div style="flex:1;text-align:center;"><div style="font-size:19pt;font-weight:900;color:#1a3a6b;letter-spacing:.5px;">${esc(ctx.schoolName.toUpperCase())}</div>${ctx.address ? `<div style="font-size:8.5pt;color:#333;margin-top:2px;">${esc(ctx.address)}</div>` : ""}</div>
      ${passport}
    </div>
    <div style="text-align:center;font-size:15pt;font-weight:900;margin:8px 0 6px;color:#111;">LEARNER'S ASSESSMENT REPORT TERM ${esc(term)}, ${esc(ctx.year)}</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px 22px;font-size:10.5pt;margin-bottom:4px;">
      <span><b>NAME:</b> <span style="border-bottom:1px solid #333;font-weight:800;color:#1a3a6b;padding:0 8px;">${esc(student.name)}</span></span>
      <span><b>CLASS:</b> <span style="border-bottom:1px solid #333;font-weight:800;color:#1a3a6b;padding:0 8px;">${esc(student.className)}</span></span>
      ${student.house ? `<span><b>HOUSE:</b> <span style="border-bottom:1px solid #333;font-weight:800;padding:0 8px;">${esc(student.house)}</span></span>` : ""}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px 22px;font-size:10.5pt;margin-bottom:8px;">${line("DAYS ATTENDED:", extras.daysAttended ?? "")}${line("ABSENT:", extras.daysAbsent ?? "")}${line("TOTAL:", extras.totalDays ?? "")}</div>

    <div style="position:relative;">
      <img src="${JSCHOOLS_SEAL}" alt="" style="position:absolute;left:50%;top:50%;width:150px;height:150px;margin:-75px 0 0 -75px;opacity:.12;z-index:0;pointer-events:none;">
      <div style="position:relative;z-index:1;display:flex;gap:6px;align-items:flex-start;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:11.5pt;font-weight:900;color:#1a3a6b;text-decoration:underline;margin-bottom:4px;">Achievement Scores in the ${subjectCount} Learning Area${subjectCount === 1 ? "" : "s"}</div>
          <table style="width:100%;border-collapse:collapse;"><thead><tr>
            <th style="border:${BORDER};font-size:8pt;padding:3px;">Area</th><th style="border:${BORDER};font-size:8pt;padding:3px;">Score and Comment</th><th style="border:${BORDER};font-size:8pt;padding:3px;">Signature</th>
          </tr></thead><tbody>${rows}</tbody></table>
        </div>
        <div style="width:330px;flex-shrink:0;">
          <div style="background:#1a3a6b;color:#fff;text-align:center;font-size:8.5pt;font-weight:800;padding:3px 0;">PERFORMANCE IN THE LEARNING ACTIVITIES</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;">${cells}</div>
        </div>
      </div>
      <div style="position:relative;z-index:1;display:flex;gap:4px;margin:8px 0;font-size:9.5pt;font-weight:800;color:#fff;">
        <span style="background:#1a3a6b;padding:6px 14px;">TOTAL : ${total}</span>
        <span style="background:#1a3a6b;padding:6px 14px;">SCORED : ${Math.round(report.grandTotal * 100) / 100}</span>
        <span style="background:#c0392b;padding:6px 14px;">POSITION ${report.rank ?? "—"} OUT OF ${report.classSize}</span>
      </div>
      <table style="position:relative;z-index:1;width:100%;border-collapse:collapse;border:${BORDER};">
        <tr><td style="${cell}width:150px;font-weight:800;">Class Teacher's Report</td><td style="${cell}font-style:italic;font-weight:700;">${ctx.classComment}</td></tr>
        <tr><td style="${cell}font-weight:800;">Behaviours / Cleanliness</td><td style="${cell}height:34px;font-weight:700;">${esc(extras.behaviour ?? "")}</td></tr>
        <tr><td style="${cell}font-weight:800;">Head Teacher's Comment</td><td style="${cell}height:34px;font-style:italic;font-weight:700;">${esc(extras.headComment ?? "") || ctx.headComment}</td></tr>
      </table>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;font-size:10pt;">
      <div><b>Date of Issue:</b> ${esc(ctx.closingDate) || "__________"} &nbsp;&nbsp; <b>Next Term Begins:</b> ${esc(ctx.nextTermDate) || "__________"}</div>
      <div>${stamp}</div>
    </div>
    ${ctx.motto ? `<div style="text-align:center;margin-top:8px;font-size:8.5pt;font-style:italic;color:#1a3a6b;">School Motto: ‘${esc(ctx.motto)}’</div>` : ""}
  </div>`;
}
