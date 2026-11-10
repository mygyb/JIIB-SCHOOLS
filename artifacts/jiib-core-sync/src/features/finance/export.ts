// Download a table as a spreadsheet-friendly CSV, print it, and build parent reminder links.
const esc = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

export function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const cell = (value: string | number) => {
    let text = String(value);
    if (/^[=+\-@]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`; // stop spreadsheet formulas in names or notes
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const blob = new Blob([`﻿${rows.map((row) => row.map(cell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Opens a clean printable table in a new window. Returns false if the browser blocked it. */
export function printTable(title: string, subtitle: string, headers: string[], rows: Array<Array<string | number>>, rightFrom = 3): boolean {
  const win = window.open('', '_blank', 'width=900,height=900');
  if (!win) return false;
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#1c2b24;margin:24px}h1{font-size:20px;margin:0}p{margin:4px 0 16px;color:#5b6b63;font-size:12px}
    table{width:100%;border-collapse:collapse;font-size:12px}th,td{border-bottom:1px solid #cfd6d2;padding:6px 8px;text-align:left}th{background:#eef2ef;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
    .r{text-align:right;font-variant-numeric:tabular-nums}@media print{body{margin:8mm}}
  </style></head><body><h1>${esc(title)}</h1><p>${esc(subtitle)}</p><table><thead><tr>${headers.map((h, i) => `<th class="${i >= rightFrom ? 'r' : ''}">${esc(h)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map((row) => `<tr>${row.map((c, i) => `<td class="${i >= rightFrom ? 'r' : ''}">${esc(String(c))}</td>`).join('')}</tr>`).join('')}</tbody></table>
  <script>window.onload=function(){setTimeout(function(){window.print()},250)}</script></body></html>`);
  win.document.close();
  return true;
}

/** 0772 123 456 / +256772123456 / 256772123456 → "256772123456", or null when it doesn't look like a Ugandan number. */
export function phoneDigits(phone: string | null): string | null {
  const digits = String(phone ?? '').replace(/[^\d]/g, '');
  if (/^256\d{9}$/.test(digits)) return digits;
  if (/^0\d{9}$/.test(digits)) return `256${digits.slice(1)}`;
  if (/^\d{9}$/.test(digits)) return `256${digits}`;
  return null;
}

export function reminderText(opts: { student: string; className: string; term: string; thisTerm: number; previous: number; schoolName: string; format: (n: number) => string }) {
  const parts = [] as string[];
  if (opts.thisTerm > 0) parts.push(`${opts.format(opts.thisTerm)} for ${opts.term}`);
  if (opts.previous > 0) parts.push(`${opts.format(opts.previous)} from earlier terms`);
  return `Dear parent/guardian of ${opts.student} (${opts.className}), the school fees balance is ${parts.join(' and ')}. Please clear it at your earliest convenience. Thank you. ${opts.schoolName}`;
}
