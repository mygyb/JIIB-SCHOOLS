// A list of receipts with Print and (for the Bursar) Cancel. Cancelled receipts stay in the list, marked with the reason.
import { useState } from 'react';
import { Printer, Undo2 } from 'lucide-react';
import { formatDate, METHOD_LABELS, ugx } from './money';
import { printReceipt } from './receipt';
import type { FinanceContext } from './shared';
import type { Payment } from './types';

export function PaymentList({ fin, payments, showStudent, empty = 'No payments yet.' }: { fin: FinanceContext; payments: Payment[]; showStudent?: boolean; empty?: string }) {
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!payments.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const cancel = async (payment: Payment) => {
    setBusy(true); setError('');
    try { await fin.call(`/payments/${encodeURIComponent(payment.id)}/cancel`, 'POST', { reason }); await fin.refresh(); setCancelling(null); setReason(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not cancel this receipt.'); }
    setBusy(false);
  };
  return <ul className="divide-y divide-border" data-testid="payment-list">
    {payments.map((payment) => <li key={payment.id} data-testid={`payment-${payment.receiptNo}`} className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{showStudent ? `${payment.studentName} · ` : ''}<span className="ledger-figure">{payment.receiptNo}</span>{payment.status === 'cancelled' && <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-destructive">Cancelled</span>}</p>
          <p className="text-xs text-muted-foreground">{formatDate(payment.paidOn)} · {METHOD_LABELS[payment.method] ?? payment.method}{payment.tid ? ` · TID ${payment.tid}` : ''}{payment.paidBy ? ` · by ${payment.paidBy}` : ''}</p>
          {payment.note && <p className="text-xs text-muted-foreground">{payment.note}</p>}
          {payment.status === 'cancelled' && <p className="mt-1 text-xs text-destructive">Reason: {payment.cancelReason}</p>}
        </div>
        <p className={`ledger-figure shrink-0 text-sm font-semibold ${payment.status === 'cancelled' ? 'text-muted-foreground line-through' : ''}`}>{ugx(payment.amount)}</p>
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => { if (!printReceipt(payment, { schoolName: fin.schoolName, termLabel: fin.terms.find((term) => term.key === payment.termKey)?.label ?? payment.termKey })) window.alert('Allow pop-ups for this site to print receipts.'); }} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:border-primary hover:text-primary"><Printer size={13} />Print</button>
        {fin.canEdit && payment.status === 'valid' && cancelling !== payment.id && <button type="button" data-testid={`button-cancel-${payment.receiptNo}`} onClick={() => { setCancelling(payment.id); setReason(''); setError(''); }} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:border-destructive hover:text-destructive"><Undo2 size={13} />Cancel receipt</button>}
      </div>
      {cancelling === payment.id && <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
        <label className="text-xs font-semibold" htmlFor={`reason-${payment.id}`}>Why is this receipt being cancelled?</label>
        <input id={`reason-${payment.id}`} data-testid="input-cancel-reason" value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Entered twice by mistake" className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
        <p className="mt-1.5 text-xs text-muted-foreground">The receipt stays on record, marked cancelled, and no longer counts toward what the student has paid.</p>
        {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
        <div className="mt-3 flex gap-2"><button type="button" data-testid="button-confirm-cancel" disabled={busy || reason.trim().length < 3} onClick={() => cancel(payment)} className="h-9 rounded-lg bg-destructive px-4 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Cancelling…' : 'Cancel receipt'}</button>
          <button type="button" onClick={() => setCancelling(null)} className="h-9 rounded-lg border border-border px-4 text-xs font-semibold">Keep it</button></div>
      </div>}
    </li>)}
  </ul>;
}
