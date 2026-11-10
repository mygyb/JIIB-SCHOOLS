// /finance/reports — money received (by day, method and class) and a review of every term, including earlier ones.
import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Download, Printer } from 'lucide-react';
import { downloadCsv, printTable } from './export';
import { Bar, ErrorNote, FinanceTabs, Loading, PageHeader, Stat, useFin, useFinance } from './shared';
import { formatDate, METHOD_LABELS, num, ugx } from './money';
import type { Totals } from './types';

type Collections = { termKey: string; total: number; count: number; cancelled: number; cancelledTotal: number; byDay: Array<{ date: string; count: number; total: number }>; byMethod: Array<{ method: string; count: number; total: number }>; byClass: Array<{ className: string; count: number; total: number }> };

export function Reports() {
  const fin = useFinance();
  const [location] = useLocation();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const range = `${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`;
  const collections = useFin<Collections>(fin, 'collections', `/reports/collections?termKey=${encodeURIComponent(fin.termKey)}${range}`);
  const terms = useFin<{ terms: Array<Totals & { termKey: string }> }>(fin, 'terms-review', '/terms');
  const data = collections.data;
  const label = (key: string) => fin.terms.find((term) => term.key === key)?.label ?? key;
  const maxMethod = Math.max(1, ...(data?.byMethod ?? []).map((item) => item.total));
  const maxClass = Math.max(1, ...(data?.byClass ?? []).map((item) => item.total));
  const period = `${fin.termLabel}${from || to ? ` · ${from ? formatDate(from) : 'start'} to ${to ? formatDate(to) : 'today'}` : ''}`;
  const exportCollections = () => data && downloadCsv(`collections-${fin.termKey}.csv`, [['Date', 'Receipts', 'Amount (UGX)'], ...data.byDay.map((d) => [d.date, d.count, d.total]), [], ['Method', 'Receipts', 'Amount (UGX)'], ...data.byMethod.map((m) => [METHOD_LABELS[m.method] ?? m.method, m.count, m.total]), [], ['Class', 'Receipts', 'Amount (UGX)'], ...data.byClass.map((c) => [c.className, c.count, c.total]), [], ['Total', data.count, data.total]]);
  const printCollections = () => { if (data && !printTable('Fees collected', `${period} · printed ${formatDate(new Date().toISOString())}`, ['Date', 'Receipts', 'Amount (UGX)'], [...data.byDay.map((d) => [formatDate(d.date), d.count, d.total]), ['Total', data.count, data.total]], 1)) window.alert('Allow pop-ups for this site to print.'); };
  const exportTerms = () => terms.data && downloadCsv('terms-review.csv', [['Term', 'Students', 'Expected (UGX)', 'Collected (UGX)', 'Outstanding (UGX)', 'Defaulters', 'Collected %'], ...terms.data.terms.map((t) => [label(t.termKey), t.students, t.expected, t.collected, t.outstanding, t.defaulters, t.collectionRate])]);

  return <div data-testid="reports" className="fade-up">
    <PageHeader fin={fin} eyebrow={fin.canEdit ? 'Fees' : 'Fees · view only'} title="Reports" intro="What has been received, and how every term compares — including earlier terms." />
    <FinanceTabs location={location} canEdit={fin.canEdit} />

    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5" data-testid="collections-report">
      <div className="flex flex-wrap items-end justify-between gap-3"><h3 className="font-display text-lg font-semibold">Fees collected · {fin.termLabel}</h3>
        <div className="flex flex-wrap items-end gap-2"><label className="text-xs font-semibold">From<input type="date" data-testid="input-from" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} className="mt-1 block h-10 rounded-lg border border-border bg-background px-2 text-sm" /></label>
          <label className="text-xs font-semibold">To<input type="date" data-testid="input-to" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className="mt-1 block h-10 rounded-lg border border-border bg-background px-2 text-sm" /></label>
          {(from || to) && <button type="button" onClick={() => { setFrom(''); setTo(''); }} className="h-10 text-xs font-semibold text-primary">Clear</button>}
          <button type="button" aria-label="Download CSV" data-testid="button-export-collections" disabled={!data?.count} onClick={exportCollections} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-50"><Download size={15} />CSV</button>
          <button type="button" aria-label="Print" disabled={!data?.count} onClick={printCollections} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-50"><Printer size={15} />Print</button></div></div>
      {collections.isLoading && <div className="mt-4"><Loading rows={3} /></div>}
      {collections.isError && <div className="mt-4"><ErrorNote error={collections.error} /></div>}
      {data && <>
        <div className="mt-4 grid grid-cols-3 gap-3"><Stat label="Received" value={ugx(data.total)} tone="text-primary" /><Stat label="Receipts" value={num(data.count)} /><Stat label="Cancelled" value={num(data.cancelled)} note={data.cancelled ? ugx(data.cancelledTotal) : undefined} /></div>
        {data.count === 0 ? <p data-testid="no-collections" className="mt-4 text-sm text-muted-foreground">No payments in this period.</p> : <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <div><h4 className="mb-2 text-sm font-semibold">By method</h4><ul className="space-y-2.5">{data.byMethod.map((item) => <li key={item.method}><div className="flex justify-between text-sm"><span>{METHOD_LABELS[item.method] ?? item.method} <span className="text-xs text-muted-foreground">({item.count})</span></span><span className="ledger-figure font-semibold">{num(item.total)}</span></div><Bar percent={(item.total / maxMethod) * 100} /></li>)}</ul>
            <h4 className="mb-2 mt-6 text-sm font-semibold">By class</h4><ul className="space-y-2.5">{data.byClass.map((item) => <li key={item.className}><div className="flex justify-between text-sm"><span>{item.className || 'No class'} <span className="text-xs text-muted-foreground">({item.count})</span></span><span className="ledger-figure font-semibold">{num(item.total)}</span></div><Bar percent={(item.total / maxClass) * 100} /></li>)}</ul></div>
          <div><h4 className="mb-2 text-sm font-semibold">By day</h4><div className="max-h-96 overflow-y-auto rounded-xl border border-border"><table className="w-full text-sm" data-testid="by-day"><tbody className="ledger-figure">{[...data.byDay].reverse().map((item) => <tr key={item.date} className="border-b border-border/60 last:border-0"><td className="px-3 py-2.5 font-sans">{formatDate(item.date)}</td><td className="text-right text-xs text-muted-foreground">{item.count} {item.count === 1 ? 'receipt' : 'receipts'}</td><td className="px-3 text-right font-semibold">{num(item.total)}</td></tr>)}</tbody></table></div></div></div>}
      </>}
    </section>

    <section className="mt-6 rounded-2xl border border-border bg-card" data-testid="terms-review">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5"><div><h3 className="font-display text-lg font-semibold">All terms</h3><p className="text-xs text-muted-foreground">Open an earlier term to see its payments and who still owes from it.</p></div>
        <button type="button" data-testid="button-export-terms" disabled={!terms.data?.terms.length} onClick={exportTerms} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-50"><Download size={15} />CSV</button></div>
      {terms.isLoading && <div className="p-4"><Loading rows={3} /></div>}
      {terms.isError && <div className="p-4"><ErrorNote error={terms.error} /></div>}
      {terms.data && (terms.data.terms.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No terms yet.</p> : <ul className="divide-y divide-border">{terms.data.terms.map((term) => <li key={term.termKey} data-testid={`term-${term.termKey}`} className="grid gap-3 px-4 py-4 sm:px-5 md:grid-cols-[1fr_2fr_auto] md:items-center">
        <div><p className="font-semibold">{label(term.termKey)}{term.termKey === fin.termKey && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">Viewing</span>}</p><p className="text-xs text-muted-foreground">{term.students} students</p></div>
        <div><dl className="ledger-figure grid grid-cols-3 gap-2 text-sm"><div><dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Expected</dt><dd className="font-semibold">{num(term.expected)}</dd></div><div><dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Collected</dt><dd className="font-semibold text-primary">{num(term.collected)}</dd></div><div><dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Owing</dt><dd className="font-semibold text-destructive">{num(term.outstanding)}</dd></div></dl><div className="mt-2"><Bar percent={term.collectionRate} /></div><p className="mt-1 text-xs text-muted-foreground">{term.collectionRate}% collected · {term.defaulters} defaulters</p></div>
        <div className="flex gap-2"><Link href="/finance/defaulters" onClick={() => fin.setTermKey(term.termKey)} data-testid={`open-defaulters-${term.termKey}`} className="rounded-md border border-border px-3 py-2 text-xs font-semibold hover:border-primary hover:text-primary">Defaulters</Link>
          {fin.canEdit && <Link href="/finance/payments" onClick={() => fin.setTermKey(term.termKey)} className="rounded-md border border-border px-3 py-2 text-xs font-semibold hover:border-primary hover:text-primary">Payments</Link>}</div></li>)}</ul>)}
    </section>
  </div>;
}
