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


const SKIN = "#f6c9a0";
const kid = (x: number, y: number, hair = "#3b2a20", r = 13) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${SKIN}" stroke="#7a4e2d" stroke-width="1.2"/><path d="M${x - r} ${y - 1} Q${x - r + 2} ${y - r - 3} ${x} ${y - r - 1} Q${x + r - 2} ${y - r - 3} ${x + r} ${y - 1} Q${x} ${y - r + 6} ${x - r} ${y - 1}Z" fill="${hair}"/><circle cx="${x - 4.5}" cy="${y + 1}" r="1.7" fill="#222"/><circle cx="${x + 4.5}" cy="${y + 1}" r="1.7" fill="#222"/><path d="M${x - 4} ${y + 6} Q${x} ${y + 10} ${x + 4} ${y + 6}" fill="none" stroke="#c0392b" stroke-width="1.6" stroke-linecap="round"/><circle cx="${x - 8}" cy="${y + 5}" r="2.2" fill="#f4a6a0" opacity=".7"/><circle cx="${x + 8}" cy="${y + 5}" r="2.2" fill="#f4a6a0" opacity=".7"/>`;
const body = (x: number, y: number, color: string) => `<path d="M${x - 15} ${y + 22} Q${x - 15} ${y + 2} ${x} ${y + 2} Q${x + 15} ${y + 2} ${x + 15} ${y + 22}Z" fill="${color}" stroke="#333" stroke-width="1" stroke-opacity=".35"/>`;
const svg = (inner: string) => `<svg viewBox="0 0 80 80" width="66" height="66" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;

const ICONS: Record<string, string> = {
  writing: svg(`${body(34, 40, "#ff9f43")}${kid(34, 30)}<rect x="40" y="52" width="32" height="22" rx="2" fill="#fff" stroke="#555"/><path d="M44 58h22M44 63h22M44 68h14" stroke="#9bb" stroke-width="1.5"/><path d="M60 40 L72 56 L68 59 L56 43Z" fill="#fdd835" stroke="#b8860b"/><path d="M68 59 L72 56 L73 62Z" fill="#555"/>`),
  listening: svg(`${kid(36, 36, "#222", 16)}<path d="M54 24 Q64 36 54 50" fill="none" stroke="#1e88e5" stroke-width="3" stroke-linecap="round"/><path d="M60 18 Q76 36 60 56" fill="none" stroke="#64b5f6" stroke-width="3" stroke-linecap="round"/><ellipse cx="21" cy="38" rx="4" ry="7" fill="#f2b88a" stroke="#7a4e2d"/><path d="M26 66 Q36 58 46 66" fill="#43a047"/>`),
  reading: svg(`${body(40, 28, "#ab47bc")}${kid(40, 24, "#5d4037")}<path d="M12 50 Q26 44 40 52 Q54 44 68 50 L68 72 Q54 66 40 74 Q26 66 12 72Z" fill="#fff" stroke="#c62828" stroke-width="2"/><path d="M40 52 V74" stroke="#c62828" stroke-width="2"/><path d="M18 56 Q27 54 35 58 M18 62 Q27 60 35 64 M45 58 Q53 54 62 56 M45 64 Q53 60 62 62" fill="none" stroke="#90a4ae" stroke-width="1.4"/>`),
  speaking: svg(`${body(30, 40, "#26a69a")}${kid(30, 32, "#212121")}<ellipse cx="30" cy="39" rx="4" ry="3.2" fill="#8e1b1b"/><path d="M44 8 h30 a4 4 0 0 1 4 4 v16 a4 4 0 0 1 -4 4 h-20 l-8 8 v-8 h-2 a4 4 0 0 1 -4 -4 v-16 a4 4 0 0 1 4 -4z" fill="#fff59d" stroke="#f9a825" stroke-width="1.5"/><text x="49" y="26" font-size="13" font-weight="900" fill="#e53935" font-family="Arial">ABC</text>`),
  drawing: svg(`${body(30, 40, "#ef5350")}${kid(30, 30, "#6d4c41")}<rect x="40" y="14" width="34" height="30" rx="2" fill="#fff" stroke="#555" stroke-width="1.5"/><path d="M45 38 Q52 20 58 34 T70 24" fill="none" stroke="#e53935" stroke-width="3" stroke-linecap="round"/><circle cx="52" cy="22" r="4" fill="#fdd835"/><path d="M45 40h24" stroke="#43a047" stroke-width="3"/><path d="M52 58 L70 46 L73 50 L56 62Z" fill="#fb8c00" stroke="#7a4e2d"/><path d="M52 58 L56 62 L49 64Z" fill="#555"/>`),
  games: svg(`${kid(28, 24, "#212121")}${body(28, 30, "#1e88e5")}<path d="M20 66 L16 76 M36 66 L46 74" stroke="#7a4e2d" stroke-width="4" stroke-linecap="round"/><circle cx="58" cy="60" r="14" fill="#fff" stroke="#222" stroke-width="2"/><path d="M58 52 l7 5 -3 8 h-8 l-3 -8z" fill="#222"/><path d="M58 46 V52 M65 57 L72 55 M62 65 L66 72 M54 65 L50 72 M51 57 L44 55" stroke="#222" stroke-width="1.6"/>`),
  rhymes: svg(`<path d="M8 22 Q24 14 40 24 Q56 14 72 22 V66 Q56 58 40 68 Q24 58 8 66Z" fill="#fff8e1" stroke="#e65100" stroke-width="2.4"/><path d="M40 24 V68" stroke="#e65100" stroke-width="2"/><path d="M26 30 l2.5 6 6 .6 -4.6 4 1.5 6 -5.4 -3.2 -5.4 3.2 1.5 -6 -4.6 -4 6 -.6z" fill="#fdd835" stroke="#f9a825"/><path d="M52 52 V36 l12 -3 v16" fill="none" stroke="#8e24aa" stroke-width="2.6"/><circle cx="49" cy="53" r="4" fill="#8e24aa"/><circle cx="61" cy="50" r="4" fill="#8e24aa"/>`),
  music: svg(`${body(28, 42, "#fdd835")}${kid(28, 32, "#4e342e")}<ellipse cx="28" cy="40" rx="3.6" ry="3" fill="#8e1b1b"/><rect x="40" y="36" width="5" height="16" rx="2.5" fill="#444" transform="rotate(-25 42 44)"/><circle cx="38" cy="53" r="5" fill="#666" transform="rotate(-25 42 44)"/><path d="M54 52 V26 l16 -5 v24" fill="none" stroke="#e91e63" stroke-width="3"/><circle cx="50" cy="54" r="5" fill="#e91e63"/><circle cx="66" cy="46" r="5" fill="#e91e63"/><path d="M14 14 l0 14" stroke="#1e88e5" stroke-width="2.5"/><circle cx="11" cy="29" r="3.5" fill="#1e88e5"/>`),
  health: svg(`<path d="M20 10 Q8 10 10 26 Q10 38 14 50 Q16 62 24 62 Q30 62 31 52 Q40 48 49 52 Q50 62 56 62 Q64 62 66 50 Q70 38 70 26 Q72 10 60 10 Q50 14 40 14 Q30 14 20 10Z" fill="#fff" stroke="#1e88e5" stroke-width="2.4"/><circle cx="30" cy="30" r="2.6" fill="#222"/><circle cx="50" cy="30" r="2.6" fill="#222"/><path d="M32 38 Q40 47 48 38" fill="none" stroke="#e53935" stroke-width="2.4" stroke-linecap="round"/><circle cx="24" cy="36" r="3" fill="#f4a6a0" opacity=".7"/><circle cx="56" cy="36" r="3" fill="#f4a6a0" opacity=".7"/><rect x="52" y="60" width="22" height="7" rx="3" fill="#43a047" transform="rotate(-30 63 63)"/><path d="M60 54 l12 -7" stroke="#e53935" stroke-width="5" stroke-linecap="round"/><path d="M12 68 l2 -4 2 4 4 2 -4 2 -2 4 -2 -4 -4 -2z" fill="#fdd835"/>`),
  toilet: svg(`<rect x="22" y="8" width="36" height="22" rx="5" fill="#fff" stroke="#546e7a" stroke-width="2"/><rect x="44" y="12" width="10" height="4" rx="2" fill="#90a4ae"/><path d="M16 34 H64 Q64 54 50 60 V70 H30 V60 Q16 54 16 34Z" fill="#e3f2fd" stroke="#546e7a" stroke-width="2"/><ellipse cx="40" cy="36" rx="22" ry="5" fill="#bbdefb" stroke="#546e7a" stroke-width="1.6"/><circle cx="33" cy="50" r="2.2" fill="#222"/><circle cx="47" cy="50" r="2.2" fill="#222"/><path d="M35 56 Q40 61 45 56" fill="none" stroke="#e53935" stroke-width="2" stroke-linecap="round"/><path d="M68 18 q5 8 0 12 q-5 -4 0 -12z" fill="#42a5f5"/><path d="M8 62 q3 6 0 9 q-3 -3 0 -9z" fill="#42a5f5"/>`),
};

export type NurseryExtras = {
  activities?: Record<string, string>;
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
const initialsOf = (name: string) => String(name ?? "").replace(/@.*$/, "").split(/[\s._-]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase()).slice(0, 3).join(".");
const BORDER = "1.5px solid #1a3a6b";

const TINTS = ["#fff3e0", "#e3f2fd", "#fce4ec", "#e8f5e9", "#f3e5f5", "#fffde7", "#e0f7fa", "#fbe9e7", "#e8eaf6", "#f1f8e9"];
const TINT_EDGE = ["#ffb74d", "#64b5f6", "#f48fb1", "#81c784", "#ba68c8", "#fdd835", "#4dd0e1", "#ff8a65", "#7986cb", "#aed581"];

export function buildNurseryCard(report: StudentReport, ctx: NurseryContext) {
  const { student } = report;
  const extras = ctx.extras ?? {};
  const term = (ctx.termLabel.match(/term\s*(\d)/i) || [])[1] ?? "";
  const NAVY = "#1a3a6b";
  const logo = ctx.logoUrl ? `<img src="${esc(ctx.logoUrl)}" alt="Logo" crossorigin="anonymous" style="width:86px;height:86px;object-fit:contain;">` : `<div style="width:86px;height:86px;border:3px solid ${NAVY};border-radius:50%;display:grid;place-items:center;font-size:34px;background:#f0f4ff;">🏫</div>`;
  const badge = report.badgeRank ? ["🥇", "🥈", "🥉"][report.badgeRank - 1] : "";
  const passport = `<div style="position:relative;width:86px;height:100px;border:3px solid ${NAVY};border-radius:12px;display:grid;place-items:center;font-size:38px;color:#b9c3d9;background:#f8f9ff;">👤${badge ? `<span style="position:absolute;right:-9px;bottom:-9px;font-size:24px;">${badge}</span>` : ""}</div>`;

  const subjectCount = report.subjects.length || 1;
  const rowColors = ["#ffe0b2", "#bbdefb", "#f8bbd0", "#c8e6c9", "#e1bee7", "#fff59d", "#b2ebf2", "#ffccbc"];
  const rows = report.subjects.map((subject, index) => `<tr>
      <td style="border:2px solid ${NAVY};padding:8px 10px;font-size:10pt;font-weight:700;vertical-align:middle;background:${rowColors[index % rowColors.length]}55;"><span style="display:inline-block;background:${NAVY};color:#fff;border-radius:10px;padding:1px 8px;font-size:7.5pt;font-weight:900;margin-bottom:3px;">Learning Area ${index + 1}</span><br>${esc(subject.name)}</td>
      <td style="border:2px solid ${NAVY};padding:8px 10px;font-size:10.5pt;vertical-align:middle;">SCORE: <b style="${hand}font-size:13pt;">${subject.total === null ? "—" : `${esc(subject.total)}/100`}</b><br>Remark: <span style="${hand}font-weight:700;font-size:11.5pt;">${esc(subject.descriptor ? subject.descriptor.label.charAt(0) + subject.descriptor.label.slice(1).toLowerCase() : "—")}</span></td>
      <td style="border:2px solid ${NAVY};width:70px;text-align:center;vertical-align:middle;"><span style="${hand}color:${NAVY};font-size:15pt;font-weight:700;letter-spacing:1px;">${esc(initialsOf(subject.teacher))}</span></td>
    </tr>`).join("") || `<tr><td colspan="3" style="border:2px solid ${NAVY};padding:14px;text-align:center;color:#999;font-size:9pt;">No learning areas set for this class</td></tr>`;

  const cells = NURSERY_ACTIVITIES.map((item, index) => {
    const value = (extras.activities ?? {})[item.id] ?? "";
    return `<div style="border:2px solid ${TINT_EDGE[index]};background:${TINTS[index]};border-radius:12px;padding:5px 8px;display:flex;flex-direction:column;justify-content:space-between;min-height:0;">
      <div style="font-size:7pt;font-weight:900;color:${NAVY};letter-spacing:.4px;">${item.label}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:2px;">${ICONS[item.id]}<span style="${hand}font-size:11pt;min-width:0;overflow-wrap:anywhere;font-weight:700;text-align:right;line-height:1.1;">${esc(value)}</span></div>
    </div>`;
  }).join("");

  const total = report.maxPossible * subjectCount;
  const stamp = ctx.stamp ? `<img src="${esc(ctx.stamp)}" alt="Stamp" style="max-height:74px;max-width:220px;object-fit:contain;">` : `<span style="border:1.5px solid #333;border-radius:50%;padding:10px 36px;font-size:9pt;">SCHOOL STAMP</span>`;
  const cell = `border:2px solid ${NAVY};padding:9px 12px;font-size:10.5pt;`;
  const field = (label: string, value: string, fallback = "") => `<span style="font-size:11pt;"><b>${label}</b> <span style="border-bottom:1.5px solid #333;font-weight:800;color:${NAVY};padding:0 10px;min-width:110px;display:inline-block;text-align:center;">${esc(value) || fallback || "&nbsp;"}</span></span>`;

  return `<div class="rc rc-tpl-classic" data-student="${esc(student.id)}" style="font-family:Arial,Helvetica,sans-serif;padding:0;display:flex;flex-direction:column;min-height:1123px;height:1123px;">
    <div style="height:10px;background:linear-gradient(90deg,#e53935,#fb8c00,#fdd835,#43a047,#1e88e5,#8e24aa);"></div>
    <div style="flex:1;display:flex;flex-direction:column;padding:16px 26px 18px;position:relative;">
      <img src="${JSCHOOLS_SEAL}" alt="" style="position:absolute;left:50%;bottom:6px;width:150px;height:150px;margin-left:-75px;opacity:.13;z-index:0;pointer-events:none;">
      <div style="position:relative;z-index:1;display:flex;flex-direction:column;flex:1;">
        <div style="display:flex;align-items:center;gap:14px;padding-bottom:10px;border-bottom:3px solid ${NAVY};">
          ${logo}
          <div style="flex:1;text-align:center;"><div style="font-size:20pt;font-weight:900;color:${NAVY};letter-spacing:.5px;line-height:1.1;">${esc(ctx.schoolName.toUpperCase())}</div>${ctx.address ? `<div style="font-size:9pt;color:#333;margin-top:4px;">${esc(ctx.address)}</div>` : ""}</div>
          ${passport}
        </div>
        <div style="text-align:center;font-size:15pt;font-weight:900;margin:12px 0 10px;color:#fff;background:linear-gradient(90deg,${NAVY},#2e6da4);border-radius:30px;padding:7px 0;letter-spacing:.5px;">LEARNER'S ASSESSMENT REPORT — TERM ${esc(term)}, ${esc(ctx.year)}</div>
        <div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:8px;">${field("NAME:", student.name)}${field("CLASS:", student.className)}</div>
        <div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:14px;">${field("DATE OF ISSUE:", ctx.closingDate)}${field("NEXT TERM BEGINS:", ctx.nextTermDate)}</div>

        <div style="display:flex;gap:10px;flex:1;min-height:0;">
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;">
            <div style="font-size:12pt;font-weight:900;color:${NAVY};text-decoration:underline;margin-bottom:5px;">Achievement Scores in the ${subjectCount} Learning Area${subjectCount === 1 ? "" : "s"}</div>
            <table style="width:100%;flex:1;border-collapse:collapse;background:#fffffff0;"><thead><tr>
              <th style="border:2px solid ${NAVY};font-size:8.5pt;padding:4px;background:${NAVY};color:#fff;height:22px;">Area</th><th style="border:2px solid ${NAVY};font-size:8.5pt;padding:4px;background:${NAVY};color:#fff;">Score and Comment</th><th style="border:2px solid ${NAVY};font-size:8.5pt;padding:4px;background:${NAVY};color:#fff;">Signature</th>
            </tr></thead><tbody>${rows}</tbody></table>
          </div>
          <div style="width:330px;flex-shrink:0;display:flex;flex-direction:column;min-width:0;">
            <div style="background:${NAVY};color:#fff;text-align:center;font-size:9pt;font-weight:800;padding:5px 0;border-radius:10px 10px 0 0;">PERFORMANCE IN THE LEARNING ACTIVITIES</div>
            <div style="flex:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:repeat(5,1fr);gap:6px;padding-top:6px;">${cells}</div>
          </div>
        </div>

        <div style="display:flex;gap:6px;margin:12px 0;font-size:10.5pt;font-weight:800;color:#fff;">
          <span style="background:${NAVY};padding:8px 18px;border-radius:8px;">TOTAL : ${total}</span>
          <span style="background:#2e7d32;padding:8px 18px;border-radius:8px;">SCORED : ${Math.round(report.grandTotal * 100) / 100}</span>
          <span style="background:#c0392b;padding:8px 18px;border-radius:8px;flex:1;text-align:center;">POSITION ${report.rank ?? "—"} OUT OF ${report.classSize}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;border:2px solid ${NAVY};background:#fffffff0;">
          <tr><td style="${cell}width:170px;font-weight:800;background:#e8f0fb;">Class Teacher's Report</td><td style="${cell}font-style:italic;font-weight:700;height:42px;">${ctx.classComment}</td></tr>
          <tr><td style="${cell}font-weight:800;background:#e8f0fb;">Behaviours / Cleanliness</td><td style="${cell}height:42px;font-weight:700;">${esc(extras.behaviour ?? "")}</td></tr>
          <tr><td style="${cell}font-weight:800;background:#e8f0fb;">Head Teacher's Comment</td><td style="${cell}height:42px;font-style:italic;font-weight:700;">${esc(extras.headComment ?? "") || ctx.headComment}</td></tr>
        </table>
        <div style="display:flex;align-items:center;justify-content:flex-end;margin-top:12px;min-height:60px;">${stamp}</div>
        ${ctx.motto ? `<div style="text-align:center;margin-top:6px;font-size:9.5pt;font-style:italic;font-weight:700;color:${NAVY};">School Motto: ‘${esc(ctx.motto)}’</div>` : ""}
      </div>
    </div>
    <div style="height:8px;background:linear-gradient(90deg,#8e24aa,#1e88e5,#43a047,#fdd835,#fb8c00,#e53935);"></div>
  </div>`;
}
