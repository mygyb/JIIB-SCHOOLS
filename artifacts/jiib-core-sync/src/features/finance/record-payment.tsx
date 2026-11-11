// /finance/payments — record a payment (amount, date, method, optional Transaction ID), print the receipt, and review all receipts.
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Check, Printer, Search } from 'lucide-react';
import { AmountInput } from './amount-input';
import { PaymentList } from './payment-list';
import { ErrorNote, FinanceTabs, Loading, PageHeader, TypeBadge, useFin, useFinance } from './shared';
import { METHOD_LABELS, num, parseUgx, ugx } from './money';
import { printReceipt } from './receipt';
import type { Account, Payment } from './types';

const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

export function RecordPayment() {
  const fin = useFinance();
  const [location] = useLocation();
  const everyone = useFin<{ accounts: Account[] }>(fin, 'accounts-all', `/accounts?termKey=${encodeURIComponent(fin.termKey)}`);
  const [studentId, setStudentId] = useState(() => new URLSearchParams(window.location.search).get('student') ?? '');
  const [query, setQuery] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [tid, setTid] = useState('');
  const [paidOn, setPaidOn] = useState(today());
  const [paidBy, setPaidBy] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [duplicate, setDuplicate] = useState('');
  const [done, setDone] = useState<{ payment: Payment; account: Account } | null>(null);
  const [filter, setFilter] = useState('');
  const [view, setView] = useState('');
  const accounts = everyone.data?.accounts ?? [];
  const student = accounts.find((account) => account.studentId === studentId);
  const matches = query.trim() ? accounts.filter((account) => account.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8) : [];
  const parsed = parseUgx(amount);
  const receipts = useFin<{ payments: Payment[]; totalValid: number }>(fin, 'payments', `/payments?termKey=${encodeURIComponent(fin.termKey)}${filter.trim() ? `&search=${encodeURIComponent(filter.trim())}` : ''}${view ? `&status=${view}` : ''}`);

  useEffect(() => { setDone(null); }, [studentId]);

  const submit = async (allowDuplicateTid = false) => {
    if (!student) { setError('Choose the student first.'); return; }
    if (parsed === null || parsed < 1) { setError('Enter the amount as a whole number of shillings, above zero.'); return; }
    setBusy(true); setError(''); setDuplicate('');
    try {
      const result = await fin.call<{ payment: Payment; account: Account }>('/payments', 'POST', {
        termKey: fin.termKey, studentId: student.studentId, amount: parsed, method, paidOn,
        ...(tid.trim() ? { tid: tid.trim() } : {}), ...(paidBy.trim() ? { paidBy: paidBy.trim() } : {}), ...(note.trim() ? { note: note.trim() } : {}),
        ...(allowDuplicateTid ? { allowDuplicateTid: true } : {}),
      });
      setDone(result); setAmount(''); setTid(''); setNote(''); setPaidBy(''); setPaidOn(today());
      await fin.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not record this payment.';
      if (/Transaction ID .* already used/.test(message)) setDuplicate(message); else setError(message);
    }
    setBusy(false);
  };

  const over = student && parsed !== null && student.expected > 0 && parsed > Math.max(0, student.balance);
  const print = (payment: Payment, balance?: number, expected?: number) => { if (!printReceipt(payment, { schoolName: fin.schoolName, logoUrl: fin.logoUrl, termLabel: fin.termLabel, balance, expected })) window.alert('Allow pop-ups for this site to print receipts.'); };

  return <div data-testid="record-payment" className="fade-up">
    <PageHeader fin={fin} eyebrow="Fees" title="Record payment" intro="Every payment gets a numbered receipt. A Transaction ID is optional." />
    <FinanceTabs location={location} canEdit={fin.canEdit} />
    {!fin.canEdit ? <ErrorNote error={new Error('Only the Bursar can record payments.')} /> : <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        {done && <div role="status" data-testid="receipt-done" className="mb-5 rounded-xl border border-primary/40 bg-primary/5 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary"><Check size={16} />Payment recorded · <span className="ledger-figure" data-testid="new-receipt-no">{done.payment.receiptNo}</span></p>
          <p className="mt-1 text-sm">{done.payment.studentName} paid <strong className="ledger-figure">{ugx(done.payment.amount)}</strong>. Balance now <strong className="ledger-figure" data-testid="new-balance">{ugx(Math.max(0, done.account.balance))}</strong>{done.account.balance < 0 ? ` (${ugx(-done.account.balance)} paid in advance)` : ''}.</p>
          <button type="button" data-testid="button-print-new" onClick={() => print(done.payment, done.account.balance, done.account.expected)} className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Printer size={15} />Print receipt</button></div>}

        <h3 className="font-display text-base font-semibold">1. Student</h3>
        {student ? <div data-testid="selected-student" className="mt-2 rounded-xl border border-border p-3">
          <div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{student.name}</p><p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">{student.className}<TypeBadge type={student.studentType} /></p></div>
            <button type="button" onClick={() => { setStudentId(''); setQuery(''); }} className="text-xs font-semibold text-primary">Change</button></div>
          <p className="ledger-figure mt-3 flex justify-between text-sm"><span>Expected {student.noStructure ? '—' : num(student.expected)}</span><span className="text-primary">Paid {num(student.paid)}</span><span className={student.balance > 0 ? 'font-semibold text-destructive' : ''}>Balance {num(student.balance)}</span></p>
          {student.noStructure && <p className="mt-2 text-xs text-[#a87410]">No fee structure is set for this student yet, but you can still record the payment.</p>}</div>
          : <div className="relative mt-2"><Search size={15} className="absolute left-3 top-3.5 text-muted-foreground" /><input aria-label="Find student" data-testid="input-student-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type the student's name" className="h-11 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm" />
            {everyone.isLoading && <p className="mt-2 text-xs text-muted-foreground">Loading students…</p>}
            {matches.length > 0 && <ul className="mt-2 overflow-hidden rounded-lg border border-border" data-testid="student-matches">{matches.map((account) => <li key={account.studentId}><button type="button" data-testid={`pick-${account.studentId}`} onClick={() => setStudentId(account.studentId)} className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-muted"><span className="min-w-0 truncate font-semibold">{account.name}</span><span className="shrink-0 text-xs text-muted-foreground">{account.className} · owes {num(Math.max(0, account.balance))}</span></button></li>)}</ul>}
            {query.trim() && !matches.length && !everyone.isLoading && <p className="mt-2 text-sm text-muted-foreground">No student found.</p>}</div>}

        <h3 className="mb-2 mt-6 font-display text-base font-semibold">2. Payment</h3>
        <label className="text-xs font-semibold" htmlFor="pay-amount">Amount (UGX)</label>
        <div className="mt-1"><AmountInput label="Amount" testId="input-amount" value={amount} onChange={setAmount} invalid={Boolean(amount) && parsed === null} /></div>
        {student && student.balance > 0 && <button type="button" data-testid="button-full-balance" onClick={() => setAmount(num(student.balance))} className="mt-1.5 text-xs font-semibold text-primary">Pay the full balance ({ugx(student.balance)})</button>}
        {over && <p role="status" data-testid="advance-note" className="mt-2 text-xs text-[#a87410]">This is {ugx(parsed - Math.max(0, student.balance))} more than the balance. It will show as paid in advance.</p>}
        <fieldset className="mt-4"><legend className="text-xs font-semibold">Method</legend><div className="mt-1.5 flex flex-wrap gap-1.5">{Object.entries(METHOD_LABELS).map(([value, label]) => <label key={value} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold ${method === value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}><input type="radio" name="method" value={value} checked={method === value} onChange={() => setMethod(value)} className="sr-only" data-testid={`method-${value}`} />{label}</label>)}</div></fieldset>
        <label className="mt-4 block text-xs font-semibold" htmlFor="pay-tid">Transaction ID (TID) <span className="font-normal text-muted-foreground">— optional</span></label>
        <input id="pay-tid" data-testid="input-tid" value={tid} maxLength={60} onChange={(event) => { setTid(event.target.value); setDuplicate(''); }} placeholder="Mobile money or bank reference" className="mt-1 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" />
        <div className="mt-4 grid grid-cols-2 gap-3"><div><label className="text-xs font-semibold" htmlFor="pay-date">Date paid</label><input id="pay-date" data-testid="input-date" type="date" value={paidOn} max={today()} onChange={(event) => setPaidOn(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" /></div>
          <div><label className="text-xs font-semibold" htmlFor="pay-by">Paid by <span className="font-normal text-muted-foreground">(optional)</span></label><input id="pay-by" data-testid="input-paid-by" value={paidBy} maxLength={80} onChange={(event) => setPaidBy(event.target.value)} placeholder="Parent / guardian" className="mt-1 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" /></div></div>
        <label className="mt-4 block text-xs font-semibold" htmlFor="pay-note">Note <span className="font-normal text-muted-foreground">(optional)</span></label>
        <input id="pay-note" data-testid="input-note" value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" />
        {duplicate && <div role="alert" data-testid="duplicate-tid" className="mt-4 rounded-lg border border-[#e6a23c]/50 bg-[#e6a23c]/10 p-3 text-sm"><p>{duplicate}</p><p className="mt-1 text-xs text-muted-foreground">Only record it again if this really is a separate payment.</p>
          <div className="mt-2 flex gap-2"><button type="button" data-testid="button-record-anyway" disabled={busy} onClick={() => submit(true)} className="h-9 rounded-lg bg-foreground px-3 text-xs font-semibold text-background">Record anyway</button><button type="button" onClick={() => { setDuplicate(''); setTid(''); }} className="h-9 rounded-lg border border-border px-3 text-xs font-semibold">Change the TID</button></div></div>}
        {error && <p role="alert" data-testid="payment-error" className="mt-4 text-sm text-destructive">{error}</p>}
        <button type="button" data-testid="button-submit-payment" disabled={busy || !student || parsed === null || parsed < 1} onClick={() => submit()} className="mt-5 h-12 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? 'Recording…' : parsed ? `Record ${ugx(parsed)}` : 'Record payment'}</button>
      </section>

      <section className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-display text-base font-semibold">Receipts this term</h3>{receipts.data && <p className="ledger-figure text-xs text-muted-foreground">Total received <strong className="text-foreground" data-testid="total-valid">{ugx(receipts.data.totalValid)}</strong></p>}</div>
        <div className="my-3 flex flex-wrap gap-2"><input aria-label="Search receipts" data-testid="input-receipt-search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Name, receipt no. or TID" className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm" />
          <select aria-label="Receipt status" value={view} onChange={(event) => setView(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm"><option value="">All</option><option value="valid">Valid</option><option value="cancelled">Cancelled</option></select></div>
        {receipts.isLoading && <Loading rows={3} />}
        {receipts.isError && <ErrorNote error={receipts.error} />}
        {receipts.data && <PaymentList fin={fin} payments={receipts.data.payments} showStudent empty="No receipts match." />}
      </section>
    </div>}
  </div>;
}
