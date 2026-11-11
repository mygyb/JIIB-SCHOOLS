// A4 pages for the Performance page: the academic giants honour roll (one section per class) and the class summary.
// The pages are plain HTML at A4 size (794 x 1122 px) and go through the same PDF/print code as the report cards.
import { downloadPdf, printPages } from '@/features/report-studio/report-output';
import type { ClassSummary, Performance, StudentRow } from './analysis';

export type PdfContext = {
  schoolName: string;
  address: string;
  motto: string;
  logoUrl: string;
  termLabel: string;
  giantMin: number;
  passMark: number;
  /** What the list shows, in words, e.g. "Academic giants: average of 80% or more" or "Top 5 students". */
  criterion: string;
  printedOn: string;
};

export type ClassList = { summary: ClassSummary; entries: StudentRow[] };

const ROWS_PER_PAGE = 15;
const SUMMARY_ROWS_PER_PAGE = 16;

const esc = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pct = (value: number) => `${value.toFixed(1)}%`;
const safeLogo = (url: string) => (/^(data:image\/(png|jpe?g|webp);base64,|https:\/\/)/i.test(url) ? url : '');

const CSS = `
.pf{box-sizing:border-box;width:794px;height:1122px;padding:40px 52px 28px;background:#fff;color:#1c2b24;font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;position:relative}
.pf *{box-sizing:border-box}
.pf-head{display:flex;align-items:center;gap:16px}
.pf-logo{width:68px;height:68px;flex:none;display:flex;align-items:center;justify-content:center}
.pf-logo img{max-width:100%;max-height:100%;object-fit:contain}
.pf-logo .pf-initial{width:68px;height:68px;border-radius:14px;background:#1f4d3f;color:#f4d58d;font:700 30px Georgia,serif;display:flex;align-items:center;justify-content:center}
.pf-school{flex:1;min-width:0}
.pf-school h1{margin:0;font:700 21px Georgia,'Times New Roman',serif;letter-spacing:.4px;text-transform:uppercase;color:#1f4d3f;line-height:1.15}
.pf-school p{margin:4px 0 0;font-size:11px;color:#5b6b63;line-height:1.4}
.pf-term{text-align:right;flex:none}
.pf-term span{display:block;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#7a8a82}
.pf-term b{display:block;margin-top:3px;font-size:15px;color:#1f4d3f}
.pf-rule{margin:16px 0 18px;height:5px;border-top:2px solid #1f4d3f;border-bottom:1px solid #c9972b}
.pf-title small{display:block;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#c9972b;font-weight:700}
.pf-title h2{margin:4px 0 0;font:700 28px Georgia,'Times New Roman',serif;color:#16342b}
.pf-sub{margin:6px 0 0;font-size:11.5px;color:#5b6b63}
.pf-meta{display:flex;gap:10px;margin:16px 0 14px}
.pf-meta div{flex:1;border:1px solid #d9dfdb;border-radius:8px;padding:9px 11px;background:#f7f9f7}
.pf-meta span{display:block;font-size:8.5px;letter-spacing:.14em;text-transform:uppercase;color:#7a8a82}
.pf-meta b{display:block;margin-top:4px;font-size:16px;color:#16342b}
.pf-body{flex:1;min-height:0}
.pf-table{width:100%;border-collapse:collapse;font-size:12px}
.pf-table th{background:#1f4d3f;color:#fff;font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;text-align:left;padding:8px 9px;font-weight:700}
.pf-table td{padding:0 9px;height:35px;border-bottom:1px solid #e3e8e5;vertical-align:middle}
.pf-table tr:nth-child(even) td{background:#fafbfa}
.pf-table .c{text-align:center}.pf-table .r{text-align:right}
.pf-name{font-weight:700;color:#16342b}
.pf-muted{color:#6b7b73}
.pf-rank{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;border-radius:12px;font-weight:700;font-size:11.5px;color:#41524a}
.pf-r1{background:#f4d58d;color:#6b4a05}.pf-r2{background:#dfe3e6;color:#3d474f}.pf-r3{background:#e9c3a0;color:#6a3d16}
.pf-avg{display:flex;align-items:center;gap:8px;justify-content:flex-end}
.pf-bar{width:62px;height:6px;border-radius:3px;background:#e6ebe8;overflow:hidden}
.pf-bar i{display:block;height:100%;background:#2e8c72}
.pf-avg b{width:50px;text-align:right;color:#16342b}
.pf-grade{display:inline-block;min-width:28px;padding:3px 6px;border-radius:5px;background:#e8f1ed;color:#1f4d3f;font-weight:700;font-size:11px;text-align:center}
.pf-empty{padding:40px 10px;text-align:center;color:#6b7b73;font-size:13px}
.pf-note{margin:12px 0 0;font-size:10px;line-height:1.5;color:#6b7b73}
.pf-sign{display:flex;gap:30px;margin-top:22px}
.pf-sign div{flex:1;border-top:1px solid #8a9890;padding-top:5px;font-size:10px;color:#6b7b73}
.pf-foot{display:flex;justify-content:space-between;margin-top:14px;padding-top:8px;border-top:1px solid #d9dfdb;font-size:9.5px;color:#7a8a82}
`;

function header(ctx: PdfContext): string {
  const logo = safeLogo(ctx.logoUrl);
  const details = [ctx.address, ctx.motto ? `“${ctx.motto}”` : ''].filter(Boolean).map(esc).join(' &nbsp;·&nbsp; ');
  const initial = esc((ctx.schoolName.trim()[0] ?? 'J').toUpperCase());
  return `<div class="pf-head">
    <div class="pf-logo">${logo ? `<img src="${esc(logo)}" alt="">` : `<div class="pf-initial">${initial}</div>`}</div>
    <div class="pf-school"><h1>${esc(ctx.schoolName)}</h1>${details ? `<p>${details}</p>` : ''}</div>
    <div class="pf-term"><span>Term</span><b>${esc(ctx.termLabel)}</b></div>
  </div><div class="pf-rule"></div>`;
}

function page(ctx: PdfContext, body: string, pageNo: number, pageCount: number): string {
  return `<div class="pf"><style>${CSS}</style>${header(ctx)}<div class="pf-body">${body}</div>
    <div class="pf-foot"><span>Generated by J-SCHOOLS · ${esc(ctx.printedOn)}</span><span>Page ${pageNo} of ${pageCount}</span></div></div>`;
}

const chunk = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out.length ? out : [[]];
};

function rankCell(rank: number) {
  return `<span class="pf-rank ${rank <= 3 ? `pf-r${rank}` : ''}">${rank}</span>`;
}

function giantsBody(ctx: PdfContext, list: ClassList, rows: StudentRow[], first: boolean, last: boolean, part: number, parts: number): string {
  const { summary } = list;
  const meta = first ? `<div class="pf-meta">
      <div><span>Class</span><b>${esc(summary.className)}</b></div>
      <div><span>Students ranked</span><b>${summary.ranked}</b></div>
      <div><span>Class average</span><b>${pct(summary.average)}</b></div>
      <div><span>On this list</span><b>${list.entries.length}</b></div></div>` : '<div style="height:14px"></div>';
  const table = rows.length ? `<table class="pf-table"><thead><tr>
      <th class="c" style="width:52px">Rank</th><th>Student</th><th>Best subject</th><th class="c" style="width:58px">Subjects</th><th class="c" style="width:52px">Grade</th><th class="r" style="width:150px">Average</th></tr></thead><tbody>
      ${rows.map((row) => `<tr><td class="c">${rankCell(row.rank)}</td><td class="pf-name">${esc(row.name)}</td>
        <td class="pf-muted">${row.best ? `${esc(row.best.subject)} · ${Math.round(row.best.percent)}%` : '—'}</td>
        <td class="c">${row.subjects}</td><td class="c"><span class="pf-grade">${esc(row.grade)}</span></td>
        <td><div class="pf-avg"><div class="pf-bar"><i style="width:${Math.max(0, Math.min(100, row.average))}%"></i></div><b>${pct(row.average)}</b></div></td></tr>`).join('')}
      </tbody></table>` : `<div class="pf-empty">No student in ${esc(summary.className)} meets this list's requirement yet.</div>`;
  const closing = last ? `<p class="pf-note">${esc(ctx.criterion)}. Average is the mean of a student's subject totals as a percentage of the maximum. Students with the same average share a position.</p>
      <div class="pf-sign"><div>Class teacher</div><div>Director of studies</div><div>Head teacher</div></div>` : '';
  return `<div class="pf-title"><small>Honour roll</small><h2>Academic Giants</h2>
      <p class="pf-sub">${esc(summary.className)} · ${esc(ctx.termLabel)}${parts > 1 ? ` · part ${part} of ${parts}` : ''}</p></div>${meta}${table}${closing}`;
}

/** The honour roll: an optional school summary first, then one section per class (long lists continue on more pages). */
export function giantsPages(ctx: PdfContext, lists: ClassList[], options: { summary: boolean; overall?: Performance['overall'] }): string[] {
  const bodies: string[] = [];
  if (options.summary && lists.length > 1) {
    for (const [index, part] of chunk(lists.map((l) => l.summary), SUMMARY_ROWS_PER_PAGE).entries()) {
      bodies.push(summaryBody(ctx, part, options.overall, index === 0, true, 'Academic Giants', 'School summary', lists));
    }
  }
  for (const list of lists) {
    const parts = chunk(list.entries, ROWS_PER_PAGE);
    parts.forEach((rows, index) => bodies.push(giantsBody(ctx, list, rows, index === 0, index === parts.length - 1, index + 1, parts.length)));
  }
  return bodies.map((body, index) => page(ctx, body, index + 1, bodies.length));
}

function summaryBody(ctx: PdfContext, classes: ClassSummary[], overall: Performance['overall'] | undefined, first: boolean, giantsView: boolean, title: string, eyebrow: string, lists?: ClassList[]): string {
  const entriesFor = (name: string) => lists?.find((l) => l.summary.className === name)?.entries.length ?? 0;
  const meta = first && overall ? `<div class="pf-meta">
      <div><span>Students ranked</span><b>${overall.ranked} of ${overall.enrolled}</b></div>
      <div><span>School average</span><b>${pct(overall.average)}</b></div>
      <div><span>Pass rate (${ctx.passMark}%+)</span><b>${overall.passRate}%</b></div>
      <div><span>Academic giants</span><b>${overall.giants}</b></div></div>` : '<div style="height:14px"></div>';
  const table = `<table class="pf-table"><thead><tr>
      <th>Class</th><th class="c">Ranked</th><th class="r">Average</th><th class="c">Pass rate</th><th class="c">${giantsView ? 'On list' : 'Giants'}</th><th class="c">Support</th><th>Top student</th></tr></thead><tbody>
      ${classes.map((c) => `<tr><td class="pf-name">${esc(c.className)}</td><td class="c">${c.ranked}/${c.enrolled}</td><td class="r"><b>${pct(c.average)}</b></td>
        <td class="c">${c.passRate}%</td><td class="c">${giantsView ? entriesFor(c.className) : c.giants}</td><td class="c">${c.support}</td>
        <td class="pf-muted">${c.top ? `${esc(c.top.name)} · ${Math.round(c.top.average)}%` : '—'}</td></tr>`).join('')}</tbody></table>
      <p class="pf-note">Pass rate is the share of ranked students with an average of ${ctx.passMark}% or more. Support is the number of students below ${ctx.passMark}%. ${esc(ctx.criterion)}.</p>`;
  return `<div class="pf-title"><small>${esc(eyebrow)}</small><h2>${esc(title)}</h2><p class="pf-sub">${esc(ctx.termLabel)}</p></div>${meta}${table}`;
}

/** One-page-per-16-classes comparison of every class. */
export function summaryPages(ctx: PdfContext, classes: ClassSummary[], overall: Performance['overall']): string[] {
  const parts = chunk(classes, SUMMARY_ROWS_PER_PAGE);
  const closing = '<div class="pf-sign"><div>Director of studies</div><div>Head teacher</div></div>';
  return parts.map((part, index) => page(ctx, summaryBody(ctx, part, overall, index === 0, false, 'Class Performance Summary', 'Academic review') + (index === parts.length - 1 ? closing : ''), index + 1, parts.length));
}

export const safeFileName = (...parts: string[]) => parts.join('-').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const pdfDownload = downloadPdf;
export const pdfPrint = printPages;
