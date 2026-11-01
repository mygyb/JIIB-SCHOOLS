// Printing and PDF download for finished report pages. jsPDF, html2canvas and the QR library load on demand.
import { buildEndTermCard, buildSlipPage, type ReportContext } from "./report-html";
import type { ReportType, StudentReport } from "./report-model";

export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1122; // A4 at 96 dpi

export async function qrFor(report: StudentReport, ctx: ReportContext): Promise<string> {
  const { default: QRCode } = await import("qrcode");
  // One short plain-text line: fewer, larger squares so phone cameras read it quickly, even from a small printed slip.
  const text = [report.student.name.toUpperCase(), report.student.className, ctx.termLabel, ctx.schoolName].filter(Boolean).join(" | ");
  try {
    return await QRCode.toDataURL(text, { margin: 4, width: 480, color: { dark: "#000000", light: "#ffffff" }, errorCorrectionLevel: "L" });
  } catch {
    return "";
  }
}

/** One HTML string per printed page: a card per student, or two slips per page for mid-term. */
export async function buildPages(reports: StudentReport[], type: ReportType, ctx: ReportContext): Promise<string[]> {
  if (type === "endterm") {
    return Promise.all(reports.map(async (report) => buildEndTermCard(report, ctx, await qrFor(report, ctx))));
  }
  const pages: string[] = [];
  for (let index = 0; index < reports.length; index += 2) {
    const pair = reports.slice(index, index + 2);
    pages.push(buildSlipPage(pair, ctx, await Promise.all(pair.map((report) => qrFor(report, ctx)))));
  }
  return pages;
}

async function settle(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(images.map((img) => img.complete ? Promise.resolve() : new Promise<void>((resolve) => { img.onload = () => resolve(); img.onerror = () => resolve(); })));
  try { await root.ownerDocument.fonts?.ready; } catch { /* fonts are optional */ }
}

/** Shrinks a page that is taller than A4 so that it still lands on one sheet. */
function fitToSheet(inner: HTMLElement) {
  const height = inner.scrollHeight;
  if (height > PAGE_HEIGHT) inner.style.zoom = String(PAGE_HEIGHT / height);
}

export async function downloadPdf(pages: string[], filename: string, onProgress?: (done: number, total: number) => void) {
  const [{ jsPDF }, { toCanvas, getFontEmbedCSS }] = await Promise.all([import("jspdf"), import("html-to-image")]);
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  // Pages are drawn by the browser itself (so the PDF matches the preview exactly), off screen and on a white sheet.
  const zone = document.createElement("div");
  zone.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_WIDTH}px;background:#fff;z-index:-1;`;
  document.body.appendChild(zone);
  try {
    let fontCss: string | undefined;
    for (let index = 0; index < pages.length; index += 1) {
      zone.innerHTML = pages[index];
      const card = zone.firstElementChild as HTMLElement;
      card.style.margin = "0";
      card.style.boxShadow = "none";
      await settle(zone);
      if (fontCss === undefined) {
        // Fetch the template fonts once and reuse them for every page; without them the PDF still prints in a standard font.
        fontCss = await Promise.race([getFontEmbedCSS(card).catch(() => ""), new Promise<string>((resolve) => setTimeout(() => resolve(""), 8000))]);
      }
      const canvas = await toCanvas(card, { pixelRatio: 2, backgroundColor: "#ffffff", width: PAGE_WIDTH, height: card.scrollHeight, fontEmbedCSS: fontCss });
      if (index > 0) pdf.addPage();
      const pageW = 210;
      const pageH = 297;
      const imgH = (canvas.height / canvas.width) * pageW;
      const image = canvas.toDataURL("image/jpeg", 0.93);
      if (imgH <= pageH) pdf.addImage(image, "JPEG", 0, 0, pageW, imgH);
      else {
        const scaledW = (pageW / imgH) * pageH;
        pdf.addImage(image, "JPEG", (pageW - scaledW) / 2, 0, scaledW, pageH);
      }
      onProgress?.(index + 1, pages.length);
    }
    pdf.save(filename);
  } finally {
    zone.remove();
  }
}

export async function printPages(pages: string[]) {
  const root = document.createElement("div");
  root.id = "rs-print-root";
  root.innerHTML = pages.map((page) => `<div class="rs-sheet"><div class="rs-sheet-inner">${page}</div></div>`).join("");
  const style = document.createElement("style");
  style.id = "rs-print-style";
  style.textContent = `
    #rs-print-root { display:none; }
    @page { size:A4; margin:0; }
    @media print {
      body.rs-printing > *:not(#rs-print-root) { display:none !important; }
      body.rs-printing #rs-print-root { display:block !important; }
      #rs-print-root .rs-sheet { width:${PAGE_WIDTH}px; height:${PAGE_HEIGHT}px; overflow:hidden; break-after:page; page-break-after:always; }
      #rs-print-root .rs-sheet:last-child { break-after:auto; page-break-after:auto; }
      #rs-print-root .rc { box-shadow:none !important; page-break-after:auto !important; }
      #rs-print-root * { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    }`;
  document.head.appendChild(style);
  document.body.appendChild(root);
  // Measure with the sheets visible, off screen, so overlong pages can be shrunk to fit.
  root.style.cssText = `display:block;position:fixed;left:-10000px;top:0;`;
  await settle(root);
  root.querySelectorAll<HTMLElement>(".rs-sheet-inner").forEach(fitToSheet);
  root.style.cssText = "";
  const cleanup = () => {
    document.body.classList.remove("rs-printing");
    root.remove();
    style.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  document.body.classList.add("rs-printing");
  window.print();
}
