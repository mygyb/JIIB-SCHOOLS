// /finance/defaulters — who still owes fees: this term, from earlier terms, or both. Filter, print, export, remind.
import { useState } from 'react';
import { useLocation } from 'wouter';
import { Download, MessageCircle, MessageSquare, Printer, Search, Copy } from 'lucide-react';
import { AmountInput } from './amount-input';
import { downloadCsv, phoneDigits, printTable, reminderText } from './export';
import { ErrorNote, FinanceTabs, Loading, PageHeader, Stat, TypeBadge, useFin, useFinance, type FinanceContext } from './shared';
import { formatDate, num, parseUgx, ugx } from './money';
import type { Account } from './types';

type Defaulter = Account & { thisTerm: number; previousBalance: number; previousTerms: Array<{ termKey: string; balance: number }>; owed: number };
type Response = { termKey: string; basis: string; totals: { count: number; owed: number; thisTerm: number; previous: number }; defaulters: Defaulter[] };
const BASES = [['term', 'This term'], ['previous', 'Earlier terms'], ['all', 'Both']] as const;

export function Defaulters() {
  const fin = useFinance();
  const [location] = useLocation();
  const [basis, setBasis] = useState<'term' | 'previous' | 'all'>('term');
  const [search, setSearch] = useState('');
  const [className, setClassName] = useState('');
  const [type, setType] = useState('');
  const [min, setMin] = useState('');
  const [copied, setCopied] = useState('');
  const minValue = parseUgx(min) ?? 0;
  const params = new URLSearchParams({ termKey: fin.termKey, basis });
  if (className) params.set('className', className);
  if (type) params.set('studentType', type);
  if (search.trim()) params.set('search', search.trim());
  if (minValue) params.set('minBalance', String(minValue));
  const list = useFin<Response>(fin, 'defaulters', `/defaulters?${params}`);
  const base = useFin<Response>(fin, 'defaulters-base', `/defaulters?termKey=${encodeURIComponent(fin.termKey)}&basis=all`);
  const classes = Array.from(new Set((base.data?.defaulters ?? []).map((row) => row.className))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const rows = list.data?.defaulters ?? [];
  const label = (key: string) => fin.terms.find((term) => term.key === key)?.label ?? key;
  const heading = `${BASES.find(([value]) => value === basis)?.[1]} · ${fin.termLabel}`;
  const tableHeaders = ['Student', 'Class', 'Type', 'This term (UGX)', 'Earlier terms (UGX)', 'Total owed (UGX)', 'Parent phone'];
  const tableRows = rows.map((row) => [row.name, row.className, row.studentType === 'boarding' ? 'Boarding' : 'Day', row.thisTerm, row.previousBalance, row.owed, row.parentPhone ?? '']);

  const text = (row: Defaulter) => reminderText({ student: row.name, className: row.className, term: fin.termLabel, thisTerm: basis === 'previous' ? 0 : row.thisTerm, previous: basis === 'term' ? 0 : row.previousBalance, schoolName: fin.schoolName, format: ugx });
  const copy = async (row: Defaulter) => { try { await navigator.clipboard.writeText(text(row)); setCopied(row.studentId); setTimeout(() => setCopied(''), 2000); } catch { window.prompt('Copy this message:', text(row)); } };

  return <div data-testid="defaulters" className="fade-up">
    <PageHeader fin={fin} eyebrow={fin.canEdit ? 'Fees' : 'Fees · view only'} title="Defaulters" intro="Students who still owe fees. Look at this term, at unpaid fees from earlier terms, or both.">
      <button type="button" data-testid="button-export-csv" disabled={!rows.length} onClick={() => downloadCsv(`defaulters-${fin.termKey}-${basis}.csv`, [tableHeaders, ...tableRows])} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold disabled:opacity-50"><Download size={15} />CSV</button>
      <button type="button" data-testid="button-print-list" disabled={!rows.length} onClick={() => { if (!printTable('Fees defaulters', `${heading} · printed ${formatDate(new Date().toISOString())}`, tableHeaders, tableRows)) window.alert('Allow pop-ups for this site to print.'); }} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold disabled:opacity-50"><Printer size={15} />Print</button>
    </PageHeader>
    <FinanceTabs location={location} canEdit={fin.canEdit} />
    <div role="tablist" aria-label="Which fees" className="mb-4 inline-flex rounded-lg border border-border bg-card p-1">
      {BASES.map(([value, name]) => <button key={value} role="tab" aria-selected={basis === value} data-testid={`basis-${value}`} onClick={() => setBasis(value)} className={`rounded-md px-4 py-2 text-sm font-semibold ${basis === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{name}</button>)}</div>
    {list.data && <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Defaulters" value={num(list.data.totals.count)} tone={list.data.totals.count ? 'text-destructive' : ''} />
      <Stat label="Total owed" value={ugx(list.data.totals.owed)} tone="text-destructive" /><Stat label="This term" value={ugx(list.data.totals.thisTerm)} /><Stat label="Earlier terms" value={ugx(list.data.totals.previous)} note={basis === 'term' ? 'Switch to "Both" to include' : undefined} /></div>}
    <div className="mb-3 flex flex-wrap gap-2">
      <label className="relative min-w-[12rem] flex-1"><Search size={15} className="absolute left-3 top-3.5 text-muted-foreground" /><input aria-label="Search" data-testid="input-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name" className="h-11 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm" /></label>
      <select aria-label="Class" data-testid="filter-class" value={className} onChange={(event) => setClassName(event.target.value)} className="h-11 rounded-lg border border-border bg-card px-3 text-sm"><option value="">All classes</option>{classes.map((name) => <option key={name} value={name}>{name || 'No class'}</option>)}</select>
      <select aria-label="Day or boarding" data-testid="filter-type" value={type} onChange={(event) => setType(event.target.value)} className="h-11 rounded-lg border border-border bg-card px-3 text-sm"><option value="">Day &amp; Boarding</option><option value="day">Day</option><option value="boarding">Boarding</option></select>
      <div className="w-44"><AmountInput label="Owes at least (UGX)" testId="input-min" value={min} onChange={setMin} placeholder="Owes at least…" /></div>
    </div>
    {list.isLoading && <Loading rows={5} />}
    {list.isError && <ErrorNote error={list.error} />}
    {list.data && (rows.length === 0 ? <p data-testid="no-defaulters" className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No defaulters match. {basis === 'previous' ? 'Nobody owes fees from earlier terms.' : ''}</p> : <>
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block"><table className="w-full text-sm" data-testid="defaulters-table"><thead><tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground"><th className="px-4 py-3">Student</th><th>Class</th><th>Type</th><th className="text-right">This term</th><th className="text-right">Earlier terms</th><th className="text-right">Total owed</th><th className="px-4 text-right">Last paid</th>{fin.canEdit && <th className="px-4 text-right">Remind</th>}</tr></thead>
        <tbody className="ledger-figure">{rows.map((row) => <tr key={row.studentId} data-testid={`defaulter-${row.studentId}`} className="border-b border-border/60 last:border-0">
          <td className="px-4 py-3 font-sans font-semibold">{row.name}</td><td className="font-sans">{row.className}</td><td><TypeBadge type={row.studentType} /></td><td className="text-right">{num(row.thisTerm)}</td>
          <td className="text-right" title={row.previousTerms.map((item) => `${label(item.termKey)}: ${num(item.balance)}`).join('\n')}>{row.previousBalance ? <span className="underline decoration-dotted">{num(row.previousBalance)}</span> : '0'}</td>
          <td className="text-right font-semibold text-destructive">{num(row.owed)}</td><td className="px-4 text-right font-sans text-xs text-muted-foreground">{row.lastPaymentOn ? formatDate(row.lastPaymentOn) : 'Never'}</td>
          {fin.canEdit && <td className="px-4"><Remind fin={fin} row={row} text={text(row)} copied={copied === row.studentId} onCopy={() => copy(row)} /></td>}</tr>)}</tbody></table></div>
      <ul className="space-y-2 md:hidden" data-testid="defaulters-cards">{rows.map((row) => <li key={row.studentId} className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-semibold">{row.name}</p><p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">{row.className}<TypeBadge type={row.studentType} /></p></div>
          <p className="ledger-figure text-right text-sm font-semibold text-destructive">{num(row.owed)}<span className="block text-[10px] font-normal uppercase tracking-wider text-muted-foreground">Owed</span></p></div>
        <p className="ledger-figure mt-2 flex justify-between text-xs text-muted-foreground"><span>This term {num(row.thisTerm)}</span><span>Earlier {num(row.previousBalance)}</span></p>
        {row.previousTerms.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{row.previousTerms.map((item) => `${label(item.termKey)} ${num(item.balance)}`).join(' · ')}</p>}
        {fin.canEdit && <div className="mt-3"><Remind fin={fin} row={row} text={text(row)} copied={copied === row.studentId} onCopy={() => copy(row)} /></div>}</li>)}</ul></>)}
  </div>;
}

function Remind({ row, text, copied, onCopy }: { fin: FinanceContext; row: Defaulter; text: string; copied: boolean; onCopy: () => void }) {
  const phone = phoneDigits(row.parentPhone);
  const link = 'inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-semibold hover:border-primary hover:text-primary';
  return <div className="flex flex-wrap justify-end gap-1.5">
    {phone ? <><a href={`sms:+${phone}?&body=${encodeURIComponent(text)}`} className={link} data-testid={`sms-${row.studentId}`}><MessageSquare size={13} />SMS</a>
      <a href={`https://wa.me/${phone}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className={link}><MessageCircle size={13} />WhatsApp</a></>
      : <span className="self-center text-xs text-muted-foreground">No valid phone</span>}
    <button type="button" onClick={onCopy} className={link} data-testid={`copy-${row.studentId}`}><Copy size={13} />{copied ? 'Copied' : 'Copy'}</button></div>;
}
