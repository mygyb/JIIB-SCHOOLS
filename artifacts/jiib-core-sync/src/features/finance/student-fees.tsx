// /finance/accounts — every student's fees, paid and balance; open one to set Day/Boarding, a custom structure and see receipts.
import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Banknote, Search, Trash2 } from 'lucide-react';
import { ErrorNote, FinanceTabs, Loading, PageHeader, Sheet, Stat, TypeBadge, useFin, useFinance } from './shared';
import { ItemsEditor, readDraft, toDraft, type DraftItem } from './items-editor';
import { PaymentList } from './payment-list';
import { num, ugx } from './money';
import type { Account, Payment, StudentType, Totals } from './types';

type AccountsResponse = { termKey: string; totals: Totals; accounts: Account[] };

export function StudentFees() {
  const fin = useFinance();
  const [location] = useLocation();
  const [search, setSearch] = useState('');
  const [className, setClassName] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const params = new URLSearchParams({ termKey: fin.termKey });
  if (className) params.set('className', className);
  if (type) params.set('studentType', type);
  if (status) params.set('status', status);
  if (search.trim()) params.set('search', search.trim());
  const accounts = useFin<AccountsResponse>(fin, 'accounts', `/accounts?${params}`);
  const everyone = useFin<AccountsResponse>(fin, 'accounts-all', `/accounts?termKey=${encodeURIComponent(fin.termKey)}`);
  const classes = Array.from(new Set((everyone.data?.accounts ?? []).map((account) => account.className))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const rows = accounts.data?.accounts ?? [];

  const bulk = async (studentType: StudentType) => {
    setBulkBusy(true); setBulkError('');
    try { await fin.call('/student-types', 'PUT', { studentIds: picked, studentType }); await fin.refresh(); setPicked([]); }
    catch (cause) { setBulkError(cause instanceof Error ? cause.message : 'Could not update these students.'); }
    setBulkBusy(false);
  };

  return <div data-testid="student-fees" className="fade-up">
    <PageHeader fin={fin} eyebrow={fin.canEdit ? 'Fees' : 'Fees · view only'} title="Student fees" intro="What each student owes, has paid and still owes this term." />
    <FinanceTabs location={location} canEdit={fin.canEdit} />
    {accounts.data && <div className="mb-4 grid grid-cols-3 gap-3"><Stat label="Expected" value={ugx(accounts.data.totals.expected)} /><Stat label="Paid" value={ugx(accounts.data.totals.collected)} tone="text-primary" /><Stat label="Owing" value={ugx(accounts.data.totals.outstanding)} tone={accounts.data.totals.outstanding > 0 ? 'text-destructive' : ''} note={`${accounts.data.totals.defaulters} students`} /></div>}
    <div className="mb-3 flex flex-wrap gap-2">
      <label className="relative min-w-[12rem] flex-1"><Search size={15} className="absolute left-3 top-3.5 text-muted-foreground" /><input aria-label="Search students" data-testid="input-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name" className="h-11 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm" /></label>
      <select aria-label="Class" data-testid="filter-class" value={className} onChange={(event) => setClassName(event.target.value)} className="h-11 rounded-lg border border-border bg-card px-3 text-sm"><option value="">All classes</option>{classes.map((name) => <option key={name} value={name}>{name || 'No class'}</option>)}</select>
      <select aria-label="Day or boarding" data-testid="filter-type" value={type} onChange={(event) => setType(event.target.value)} className="h-11 rounded-lg border border-border bg-card px-3 text-sm"><option value="">Day &amp; Boarding</option><option value="day">Day</option><option value="boarding">Boarding</option></select>
      <select aria-label="Fee status" data-testid="filter-status" value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 rounded-lg border border-border bg-card px-3 text-sm"><option value="">All students</option><option value="owing">Owing</option><option value="cleared">Fully paid</option><option value="nostructure">No fee structure</option></select>
    </div>
    {fin.canEdit && picked.length > 0 && <div data-testid="bulk-bar" className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-4 py-2.5 text-sm"><strong>{picked.length} selected</strong><span className="text-muted-foreground">Mark as</span>
      <button type="button" disabled={bulkBusy} onClick={() => bulk('boarding')} data-testid="button-bulk-boarding" className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Boarding</button>
      <button type="button" disabled={bulkBusy} onClick={() => bulk('day')} data-testid="button-bulk-day" className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold">Day</button>
      <button type="button" onClick={() => setPicked([])} className="ml-auto text-xs font-semibold text-muted-foreground">Clear</button>{bulkError && <span role="alert" className="w-full text-xs text-destructive">{bulkError}</span>}</div>}
    {accounts.isLoading && <Loading rows={5} />}
    {accounts.isError && <ErrorNote error={accounts.error} />}
    {accounts.data && (rows.length === 0 ? <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No students match.</p> : <>
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block"><table className="w-full text-sm" data-testid="accounts-table"><thead><tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
        {fin.canEdit && <th className="w-10 px-4"><input type="checkbox" aria-label="Select all shown" checked={picked.length === rows.length} onChange={(event) => setPicked(event.target.checked ? rows.map((row) => row.studentId) : [])} /></th>}
        <th className="px-4 py-3">Student</th><th>Class</th><th>Type</th><th className="text-right">Expected</th><th className="text-right">Paid</th><th className="px-4 text-right">Balance</th></tr></thead>
        <tbody className="ledger-figure">{rows.map((row) => <tr key={row.studentId} data-testid={`account-${row.studentId}`} onClick={() => setOpen(row.studentId)} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/50">
          {fin.canEdit && <td className="px-4" onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Select ${row.name}`} checked={picked.includes(row.studentId)} onChange={() => setPicked((current) => current.includes(row.studentId) ? current.filter((id) => id !== row.studentId) : [...current, row.studentId])} /></td>}
          <td className="px-4 py-3 font-sans font-semibold">{row.name}{row.custom && <span className="ml-2 rounded bg-[#e6a23c]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#a87410]">Custom</span>}</td><td className="font-sans">{row.className}</td><td><TypeBadge type={row.studentType} /></td>
          <td className="text-right">{row.noStructure ? <span className="font-sans text-xs text-[#a87410]">No structure</span> : num(row.expected)}</td><td className="text-right text-primary">{num(row.paid)}</td>
          <td className={`px-4 text-right font-semibold ${row.balance > 0 ? 'text-destructive' : ''}`}>{row.balance < 0 ? `${num(-row.balance)} credit` : num(row.balance)}</td></tr>)}</tbody></table></div>
      <div className="md:hidden">{fin.canEdit && <label className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold"><input type="checkbox" className="h-5 w-5" aria-label="Select all shown" checked={picked.length === rows.length} onChange={(event) => setPicked(event.target.checked ? rows.map((row) => row.studentId) : [])} />Select all shown</label>}
      <ul className="space-y-2" data-testid="accounts-cards">{rows.map((row) => <li key={row.studentId} className="flex items-stretch gap-2">
        {fin.canEdit && <label className="grid w-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-border bg-card"><input type="checkbox" className="h-5 w-5" aria-label={`Select ${row.name}`} checked={picked.includes(row.studentId)} onChange={() => setPicked((current) => current.includes(row.studentId) ? current.filter((id) => id !== row.studentId) : [...current, row.studentId])} /></label>}
        <button type="button" onClick={() => setOpen(row.studentId)} className="min-w-0 flex-1 rounded-xl border border-border bg-card p-4 text-left">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-semibold">{row.name}</p><p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">{row.className}<TypeBadge type={row.studentType} />{row.custom && <span className="font-semibold text-[#a87410]">Custom</span>}</p></div>
          <p className={`ledger-figure text-right text-sm font-semibold ${row.balance > 0 ? 'text-destructive' : ''}`}>{row.balance < 0 ? `${num(-row.balance)} credit` : num(row.balance)}<span className="block text-[10px] font-normal uppercase tracking-wider text-muted-foreground">Balance</span></p></div>
        <p className="ledger-figure mt-2 flex justify-between text-xs text-muted-foreground"><span>Expected {row.noStructure ? '—' : num(row.expected)}</span><span className="text-primary">Paid {num(row.paid)}</span></p></button></li>)}</ul></div></>)}
    {open && <AccountSheet fin={fin} studentId={open} onClose={() => setOpen(null)} />}
  </div>;
}

function AccountSheet({ fin, studentId, onClose }: { fin: ReturnType<typeof useFinance>; studentId: string; onClose: () => void }) {
  const detail = useFin<{ termKey: string; account: Account; payments: Payment[] }>(fin, 'student', `/students/${encodeURIComponent(studentId)}?termKey=${encodeURIComponent(fin.termKey)}`);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const account = detail.data?.account;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); await fin.refresh(); setEditing(false); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save.'); }
    setBusy(false);
  };
  const startEdit = () => { if (!account) return; setItems(account.items.length ? toDraft(account.items) : [{ name: 'Tuition', amount: '' }]); setNote(account.note ?? ''); setError(''); setEditing(true); };
  const saveCustom = () => {
    const read = readDraft(items);
    if ('error' in read) { setError(read.error); return; }
    if (!read.items.length) { setError('Add at least one fee item.'); return; }
    void run(() => fin.call(`/students/${encodeURIComponent(studentId)}/override`, 'PUT', { termKey: fin.termKey, items: read.items, ...(note.trim() ? { note: note.trim() } : {}) }));
  };

  return <Sheet title={account?.name ?? 'Student'} onClose={onClose} testId="account-sheet">
    {detail.isLoading && <Loading rows={3} />}
    {detail.isError && <ErrorNote error={detail.error} />}
    {account && <div className="space-y-6">
      <div><p className="flex items-center gap-2 text-sm text-muted-foreground">{account.className} · {fin.termLabel}<TypeBadge type={account.studentType} /></p>
        <div className="mt-3 grid grid-cols-3 gap-2"><Stat label="Expected" value={account.noStructure ? '—' : num(account.expected)} /><Stat label="Paid" value={num(account.paid)} tone="text-primary" /><Stat label="Balance" value={num(account.balance)} tone={account.balance > 0 ? 'text-destructive' : ''} /></div>
        {fin.canEdit && <Link href={`/finance/payments?student=${encodeURIComponent(studentId)}`} data-testid="button-pay-for-student" className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground"><Banknote size={16} />Record payment</Link>}</div>

      {fin.canEdit && <section><h4 className="text-sm font-semibold">Day or boarding</h4><div className="mt-2 inline-flex rounded-lg border border-border bg-card p-1">
        {(['day', 'boarding'] as const).map((value) => <button key={value} type="button" disabled={busy} data-testid={`set-type-${value}`} aria-pressed={account.studentType === value} onClick={() => account.studentType !== value && run(() => fin.call('/student-types', 'PUT', { studentIds: [studentId], studentType: value }))} className={`rounded-md px-5 py-2 text-sm font-semibold ${account.studentType === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{value === 'day' ? 'Day' : 'Boarding'}</button>)}</div></section>}

      <section><div className="flex items-center justify-between"><h4 className="text-sm font-semibold">{account.custom ? 'Custom fees for this student' : 'Fees (class structure)'}</h4>
        {fin.canEdit && !editing && <button type="button" data-testid="button-custom-fees" onClick={startEdit} className="text-xs font-semibold text-primary">{account.custom ? 'Edit' : 'Give custom fees'}</button>}</div>
        {editing ? <div className="mt-3"><ItemsEditor items={items} onChange={setItems} />
          <label className="mt-4 block text-xs font-semibold" htmlFor="custom-note">Reason (optional)</label><input id="custom-note" data-testid="input-custom-note" value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Bursary, sibling discount" className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
          {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
          <div className="mt-4 flex gap-2"><button type="button" data-testid="button-save-custom" disabled={busy} onClick={saveCustom} className="h-11 flex-1 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy ? 'Saving…' : 'Save custom fees'}</button><button type="button" onClick={() => setEditing(false)} className="h-11 rounded-lg border border-border px-4 text-sm font-semibold">Cancel</button></div></div>
          : account.noStructure ? <p className="mt-2 text-sm text-[#a87410]">No {account.studentType === 'day' ? 'Day' : 'Boarding'} fee structure is set for {account.className} yet.</p>
          : <ul className="ledger-figure mt-2 space-y-1.5 text-sm">{account.items.map((item) => <li key={item.name} className="flex justify-between"><span className="font-sans text-muted-foreground">{item.name}</span><span>{num(item.amount)}</span></li>)}</ul>}
        {account.custom && account.note && !editing && <p className="mt-2 text-xs text-muted-foreground">Reason: {account.note}</p>}
        {fin.canEdit && account.custom && !editing && <button type="button" disabled={busy} data-testid="button-remove-custom" onClick={() => run(() => fin.call(`/students/${encodeURIComponent(studentId)}/override?termKey=${encodeURIComponent(fin.termKey)}`, 'DELETE'))} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-destructive"><Trash2 size={13} />Go back to the class structure</button>}
        {!editing && error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}</section>

      <section><h4 className="mb-2 text-sm font-semibold">Receipts</h4><PaymentList fin={fin} payments={detail.data?.payments ?? []} empty="No payments recorded for this student this term." /></section>
    </div>}
  </Sheet>;
}
