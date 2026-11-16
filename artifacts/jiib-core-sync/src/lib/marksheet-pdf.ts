// Marksheet PDFs drawn directly with jsPDF: school header and badge, a table with a box for every mark, and a J-SCHOOLS footer.
export type MarksheetField = { field: string; name: string; max: number; entryMax?: number };
export type Marksheet = { className: string; subject: string; teacherName: string | null; learners: Array<{ id: string; name: string; marks: Record<string, number | null> }> };
export type MarksheetHeader = { schoolName: string; address: string; motto: string; logoUrl: string | null | undefined; termLabel: string; year: string };

const PAGE_W = 210, PAGE_H = 297, MARGIN = 12, ROW_H = 8.2, FOOT_Y = 288;

/** The badge as a PNG data URL (jsPDF cannot read every image type), or null when there is none or it cannot be read. */
async function badgeImage(logoUrl: string | null | undefined): Promise<string | null> {
  if (!logoUrl) return null;
  try {
    const image = new Image();
    if (!logoUrl.startsWith('data:')) image.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('badge')); image.src = logoUrl; });
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
    const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
    ctx.drawImage(image, (size - w) / 2, (size - h) / 2, w, h);
    return canvas.toDataURL('image/png');
  } catch { return null; }
}

const safe = (value: string) => value.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
export const marksheetFileName = (sheet: Marksheet, termLabel: string) => `${safe(sheet.className)}-${safe(sheet.subject)}-marksheet-${safe(termLabel)}.pdf`;

type Doc = InstanceType<Awaited<typeof import('jspdf')>['jsPDF']>;

function fit(doc: Doc, value: string, width: number) {
  let out = value;
  while (out.length > 1 && doc.getTextWidth(out) > width) out = out.slice(0, -1);
  return out === value ? value : `${out.trimEnd()}…`;
}

/** Builds one PDF holding every given sheet (each starts on a new page). */
export async function buildMarksheetPdf(sheets: Marksheet[], fields: MarksheetField[], header: MarksheetHeader): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const badge = await badgeImage(header.logoUrl);
  const printed = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const tableW = PAGE_W - MARGIN * 2;
  const markW = fields.length > 3 ? 20 : 26;
  const noW = 11;
  const nameW = tableW - noW - markW * fields.length;
  const termText = [header.termLabel, header.year].filter(Boolean).join(' · ');

  const drawFooter = (page: number, pages: number) => {
    doc.setDrawColor(190); doc.setLineWidth(0.2); doc.line(MARGIN, FOOT_Y - 4, PAGE_W - MARGIN, FOOT_Y - 4);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110);
    doc.text('Generated from J-SCHOOLS', MARGIN, FOOT_Y);
    doc.text(`Page ${page} of ${pages}`, PAGE_W / 2, FOOT_Y, { align: 'center' });
    doc.text(`Printed ${printed}`, PAGE_W - MARGIN, FOOT_Y, { align: 'right' });
    doc.setTextColor(0);
  };
  const drawTableHead = (y: number) => {
    const headH = 11;
    doc.setFillColor(238, 242, 239); doc.setDrawColor(120); doc.setLineWidth(0.25);
    doc.rect(MARGIN, y, tableW, headH, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(30);
    doc.text('No.', MARGIN + noW / 2, y + 6.6, { align: 'center' });
    doc.text('LEARNER NAME', MARGIN + noW + 2, y + 6.6);
    let x = MARGIN + noW + nameW;
    doc.line(MARGIN + noW, y, MARGIN + noW, y + headH);
    doc.line(x, y, x, y + headH);
    for (const field of fields) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      doc.text(fit(doc, field.name.toUpperCase(), markW - 2), x + markW / 2, y + 4.6, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
      doc.text(`out of ${field.entryMax && field.entryMax > 0 ? field.entryMax : field.max}`, x + markW / 2, y + 8.6, { align: 'center' });
      x += markW;
      doc.line(x, y, x, y + headH);
    }
    return y + headH;
  };

  let firstSheet = true;
  for (const sheet of sheets) {
    // Plan the pages first so every footer can say "Page n of N".
    const firstStart = 62, laterStart = 30, bottom = FOOT_Y - 8;
    const firstRows = Math.max(1, Math.floor((bottom - firstStart - 11) / ROW_H));
    const laterRows = Math.max(1, Math.floor((bottom - laterStart - 11) / ROW_H));
    const total = sheet.learners.length;
    const pages = total <= firstRows ? 1 : 1 + Math.ceil((total - firstRows) / laterRows);

    let index = 0;
    for (let page = 1; page <= pages; page += 1) {
      if (!firstSheet || page > 1) doc.addPage();
      firstSheet = false;
      let y: number;
      if (page === 1) {
        if (badge) doc.addImage(badge, 'PNG', MARGIN, MARGIN, 22, 22);
        doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
        doc.text(fit(doc, header.schoolName.toUpperCase(), PAGE_W - MARGIN * 2 - 48), PAGE_W / 2, MARGIN + 8, { align: 'center' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(70);
        if (header.address) doc.text(fit(doc, header.address, PAGE_W - MARGIN * 2 - 48), PAGE_W / 2, MARGIN + 14, { align: 'center' });
        if (header.motto) { doc.setFont('helvetica', 'italic'); doc.text(fit(doc, `"${header.motto}"`, PAGE_W - MARGIN * 2 - 48), PAGE_W / 2, MARGIN + 19.5, { align: 'center' }); }
        doc.setDrawColor(40); doc.setLineWidth(0.6); doc.line(MARGIN, MARGIN + 26, PAGE_W - MARGIN, MARGIN + 26);
        doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
        doc.text('MARKSHEET', PAGE_W / 2, MARGIN + 34, { align: 'center' });
        doc.setFontSize(10);
        doc.text(`Class: ${sheet.className}`, MARGIN, MARGIN + 42);
        doc.text(`Subject: ${sheet.subject}`, PAGE_W / 2, MARGIN + 42, { align: 'center' });
        doc.text(`Term: ${termText}`, PAGE_W - MARGIN, MARGIN + 42, { align: 'right' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(60);
        doc.text(`Subject teacher: ${sheet.teacherName ?? '______________________'}`, MARGIN, MARGIN + 48.5);
        doc.text(`Learners: ${total}`, PAGE_W - MARGIN, MARGIN + 48.5, { align: 'right' });
        doc.setTextColor(0);
        y = drawTableHead(firstStart);
      } else {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30);
        doc.text(fit(doc, header.schoolName.toUpperCase(), 110), MARGIN, MARGIN + 6);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(80);
        doc.text(`${sheet.className} · ${sheet.subject} · ${termText}`, PAGE_W - MARGIN, MARGIN + 6, { align: 'right' });
        doc.setDrawColor(40); doc.setLineWidth(0.4); doc.line(MARGIN, MARGIN + 9, PAGE_W - MARGIN, MARGIN + 9);
        doc.setTextColor(0);
        y = drawTableHead(laterStart - 8);
      }
      const take = page === 1 ? firstRows : laterRows;
      for (const learner of sheet.learners.slice(index, index + take)) {
        index += 1;
        doc.setDrawColor(120); doc.setLineWidth(0.2);
        doc.rect(MARGIN, y, tableW, ROW_H);
        doc.line(MARGIN + noW, y, MARGIN + noW, y + ROW_H);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(30);
        doc.text(String(index), MARGIN + noW / 2, y + 5.6, { align: 'center' });
        doc.text(fit(doc, learner.name, nameW - 4), MARGIN + noW + 2, y + 5.6);
        let x = MARGIN + noW + nameW;
        doc.line(x, y, x, y + ROW_H);
        for (const field of fields) {
          const value = learner.marks[field.field];
          if (value !== null && value !== undefined) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(String(Math.round(value * 100) / 100), x + markW / 2, y + 5.6, { align: 'center' }); }
          x += markW;
          doc.line(x, y, x, y + ROW_H);
        }
        y += ROW_H;
      }
      drawFooter(page, pages);
    }
  }
  return doc.output('blob');
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
