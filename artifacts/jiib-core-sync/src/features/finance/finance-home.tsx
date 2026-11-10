// /finance — the Bursar's dashboard and the Head teacher's finance summary.
import { Link, useLocation } from 'wouter';
import { AlertTriangle, Banknote, Receipt } from 'lucide-react';
import { Bar, ErrorNote, FinanceTabs, Loading, PageHeader, Stat, TypeBadge, useFin, useFinance } from './shared';
import { formatDate, METHOD_LABELS, num, ugx } from './money';
import type { Overview } from './types';

export function FinanceHome() {
  const fin = useFinance();
  const [location] = useLocation();
  const overview = useFin<Overview>(fin, 'overview', `/overview?termKey=${encodeURIComponent(fin.termKey)}`);
  const data = overview.data;
  return <div data-testid="finance-home" className="fade-up">
    <PageHeader fin={fin} eyebrow={fin.canEdit ? "Bursar's office" : 'Finance summary'} title={fin.canEdit ? 'Fees dashboard' : 'Fees at a glance'}
      intro={fin.canEdit ? undefined : 'A view-only summary of fees for the term. Only the Bursar can change these records.'}>
      {fin.canEdit && <Link href="/finance/payments" data-testid="button-record-payment" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Banknote size={16} />Record payment</Link>}
    </PageHeader>
    <FinanceTabs location={location} canEdit={fin.canEdit} />
    {overview.isLoading && <Loading rows={4} />}
    {overview.isError && <ErrorNote error={overview.error} />}
    {data && <>
      {data.totals.withoutStructure > 0 && <div role="status" data-testid="no-structure-warning" className="mb-4 flex items-start gap-3 rounded-xl border border-[#e6a23c]/50 bg-[#e6a23c]/10 p-4 text-sm">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#c88e17]" />
        <p><strong>{data.totals.withoutStructure}</strong> {data.totals.withoutStructure === 1 ? 'student has' : 'students have'} no fee structure yet, so nothing is counted as owed for them. {fin.canEdit ? <Link href="/finance/fees" className="font-semibold text-primary underline">Set up fee structures</Link> : 'The Bursar needs to set up their fee structure.'}</p></div>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Expected" value={ugx(data.totals.expected)} note={`${data.totals.students} students`} />
        <Stat label="Collected" value={ugx(data.totals.collected)} note={`${data.totals.collectionRate}% of expected`} tone="text-primary" />
        <Stat label="Outstanding" value={ugx(data.totals.outstanding)} note="Still to be paid" tone={data.totals.outstanding > 0 ? 'text-destructive' : ''} />
        <Stat label="Defaulters" value={num(data.totals.defaulters)} note={`${data.totals.cleared} fully paid`} tone={data.totals.defaulters > 0 ? 'text-destructive' : ''} />
      </div>
      <div className="mt-3 rounded-2xl border border-border bg-card p-4 sm:p-5"><div className="mb-2 flex justify-between text-xs font-semibold"><span>Collection progress</span><span className="ledger-figure">{data.totals.collectionRate}%</span></div><Bar percent={data.totals.collectionRate} />
        <p className="mt-3 text-xs text-muted-foreground">Collected today: <strong className="ledger-figure text-foreground" data-testid="collected-today">{ugx(data.collectedToday)}</strong></p></div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {data.types.map((type) => <div key={type.studentType} data-testid={`type-${type.studentType}`} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between"><TypeBadge type={type.studentType} /><span className="text-xs text-muted-foreground">{type.students} {type.students === 1 ? "student" : "students"}</span></div>
          <dl className="ledger-figure mt-4 grid grid-cols-3 gap-2 text-sm"><div><dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Expected</dt><dd className="font-semibold">{num(type.expected)}</dd></div>
            <div><dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Collected</dt><dd className="font-semibold text-primary">{num(type.collected)}</dd></div>
            <div><dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Owing</dt><dd className="font-semibold text-destructive">{num(type.outstanding)}</dd></div></dl>
          <div className="mt-3"><Bar percent={type.collectionRate} /></div></div>)}
      </div>

      <section className="mt-6 rounded-2xl border border-border bg-card" data-testid="class-table">
        <h3 className="border-b border-border px-4 py-3 font-display text-base font-semibold sm:px-5">By class</h3>
        {data.classes.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No students in this term yet.</p> : <>
          <div className="hidden overflow-x-auto md:block"><table className="w-full text-sm"><thead><tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground"><th className="px-5 py-2.5">Class</th><th className="px-3 text-right">Students</th><th className="px-3 text-right">Expected</th><th className="px-3 text-right">Collected</th><th className="px-3 text-right">Outstanding</th><th className="px-3 text-right">Defaulters</th><th className="w-32 px-5">Paid</th></tr></thead>
            <tbody className="ledger-figure">{data.classes.map((row) => <tr key={row.className} className="border-b border-border/60 last:border-0"><td className="px-5 py-3 font-sans font-semibold">{row.className || '—'}</td><td className="px-3 text-right">{row.students}</td><td className="px-3 text-right">{num(row.expected)}</td><td className="px-3 text-right text-primary">{num(row.collected)}</td><td className="px-3 text-right text-destructive">{num(row.outstanding)}</td><td className="px-3 text-right">{row.defaulters}</td><td className="px-5"><Bar percent={row.collectionRate} /></td></tr>)}</tbody></table></div>
          <ul className="divide-y divide-border md:hidden">{data.classes.map((row) => <li key={row.className} className="space-y-2 p-4"><div className="flex justify-between"><span className="font-semibold">{row.className || '—'}</span><span className="text-xs text-muted-foreground">{row.defaulters} defaulters · {row.students} students</span></div><Bar percent={row.collectionRate} />
            <p className="ledger-figure flex justify-between text-xs"><span className="text-primary">Paid {num(row.collected)}</span><span className="text-destructive">Owing {num(row.outstanding)}</span></p></li>)}</ul></>}
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-card" data-testid="recent-payments">
        <h3 className="flex items-center gap-2 border-b border-border px-4 py-3 font-display text-base font-semibold sm:px-5"><Receipt size={16} className="text-primary" />Latest receipts</h3>
        {data.recentPayments.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No payments recorded for this term yet.</p>
          : <ul className="divide-y divide-border">{data.recentPayments.map((payment) => <li key={payment.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{payment.studentName}</p><p className="text-xs text-muted-foreground">{payment.receiptNo} · {formatDate(payment.paidOn)} · {METHOD_LABELS[payment.method] ?? payment.method}</p></div>
            <p className={`ledger-figure shrink-0 text-sm font-semibold ${payment.status === 'cancelled' ? 'text-muted-foreground line-through' : ''}`}>{ugx(payment.amount)}</p></li>)}</ul>}
      </section>
    </>}
  </div>;
}
