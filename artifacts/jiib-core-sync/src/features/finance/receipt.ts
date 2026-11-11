import type { Payment } from './types';
import { formatDate, METHOD_LABELS, ugx } from './money';

const esc = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

/** Opens a clean, printable receipt in a new window. Returns false if the browser blocked the window. */
export function printReceipt(payment: Payment, opts: { schoolName: string; logoUrl?: string | null; termLabel: string; balance?: number; expected?: number }): boolean {
  const win = window.open('', '_blank', 'width=720,height=900');
  if (!win) return false;
  const cancelled = payment.status === 'cancelled';
  const row = (label: string, value: string) => `<tr><th>${label}</th><td>${value}</td></tr>`;
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(payment.receiptNo)}</title><style>
    body{font-family:Georgia,'Times New Roman',serif;color:#1c2b24;margin:0;padding:32px;position:relative}
    .card{max-width:560px;margin:0 auto;border:2px solid #1c2b24;padding:28px}
    .badge{display:block;margin:0 auto 10px;height:64px;width:64px;object-fit:contain}
    h1{margin:0;font-size:22px;text-align:center;letter-spacing:.04em;text-transform:uppercase}
    .sub{text-align:center;font-size:12px;letter-spacing:.2em;text-transform:uppercase;margin:6px 0 20px;color:#5b6b63}
    table{width:100%;border-collapse:collapse;font-size:14px}th{text-align:left;font-weight:normal;color:#5b6b63;padding:7px 0;width:38%;vertical-align:top}td{padding:7px 0;font-weight:bold}
    .amount{font-size:26px;text-align:center;margin:18px 0;padding:12px;border-top:1px solid #1c2b24;border-bottom:1px solid #1c2b24;font-family:'Courier New',monospace}
    .foot{display:flex;justify-content:space-between;margin-top:36px;font-size:12px;color:#5b6b63}.foot span{border-top:1px solid #1c2b24;padding-top:6px;width:44%;text-align:center}
    .void{position:absolute;top:40%;left:0;right:0;text-align:center;font-size:84px;font-weight:bold;color:rgba(190,30,30,.28);transform:rotate(-18deg);letter-spacing:.1em}
    @media print{body{padding:0}}
  </style></head><body>${cancelled ? '<div class="void">CANCELLED</div>' : ''}<div class="card">
    ${opts.logoUrl && opts.logoUrl.startsWith('data:image/') ? `<img class="badge" src="${esc(opts.logoUrl)}" alt="">` : ''}<h1>${esc(opts.schoolName)}</h1><p class="sub">Fees receipt</p>
    <table>${row('Receipt no.', esc(payment.receiptNo))}${row('Date', esc(formatDate(payment.paidOn)))}${row('Student', esc(payment.studentName))}${row('Class', esc(payment.className))}${row('Term', esc(opts.termLabel))}
    ${row('Method', esc(METHOD_LABELS[payment.method] ?? payment.method))}${payment.tid ? row('Transaction ID', esc(payment.tid)) : ''}${payment.paidBy ? row('Paid by', esc(payment.paidBy)) : ''}${payment.note ? row('Note', esc(payment.note)) : ''}</table>
    <div class="amount">${esc(ugx(payment.amount))}</div>
    ${opts.balance !== undefined && !cancelled ? `<table>${opts.expected !== undefined ? row('Fees this term', esc(ugx(opts.expected))) : ''}${row('Balance after this payment', esc(ugx(Math.max(0, opts.balance))))}</table>` : ''}
    ${cancelled ? `<p style="color:#a11;font-size:13px">Cancelled${payment.cancelReason ? `: ${esc(payment.cancelReason)}` : ''}</p>` : ''}
    <div class="foot"><span>Received by${payment.recordedBy ? `<br>${esc(payment.recordedBy)}` : ''}</span><span>Stamp</span></div>
  </div><script>window.onload=function(){setTimeout(function(){window.print()},250)}</script></body></html>`);
  win.document.close();
  return true;
}
