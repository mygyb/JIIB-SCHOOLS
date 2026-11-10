// /finance/fees — fee structure for every class, with separate Boarding and Day structures.
import { useState } from 'react';
import { useLocation } from 'wouter';
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { ErrorNote, FinanceTabs, Loading, PageHeader, Sheet, useFin, useFinance } from './shared';
import { ItemsEditor, readDraft, toDraft, type DraftItem } from './items-editor';
import { ugx } from './money';
import type { Structure, StudentType } from './types';

type StructuresResponse = { termKey: string; classes: string[]; structures: Structure[] };

export function FeeStructures() {
  const fin = useFinance();
  const [location] = useLocation();
  const query = useFin<StructuresResponse>(fin, 'structures', `/structures?termKey=${encodeURIComponent(fin.termKey)}`);
  const [type, setType] = useState<StudentType>('day');
  const [editing, setEditing] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const data = query.data;
  const byClass = new Map((data?.structures ?? []).filter((item) => item.studentType === type).map((item) => [item.className, item]));
  const other = new Map((data?.structures ?? []).filter((item) => item.studentType !== type).map((item) => [item.className, item]));

  return <div data-testid="fee-structures" className="fade-up">
    <PageHeader fin={fin} eyebrow={fin.canEdit ? 'Fees' : 'Fees · view only'} title="Fee structures" intro="What each class pays for the term. Day and Boarding students have their own structure. Individual students can be given their own on the Student fees page.">
      {fin.canEdit && fin.terms.length > 1 && <button type="button" data-testid="button-copy-structures" onClick={() => setCopying(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold"><Copy size={15} />Copy from a term</button>}
    </PageHeader>
    <FinanceTabs location={location} canEdit={fin.canEdit} />
    <div role="tablist" aria-label="Student type" className="mb-4 inline-flex rounded-lg border border-border bg-card p-1">
      {(['day', 'boarding'] as const).map((value) => <button key={value} role="tab" aria-selected={type === value} data-testid={`tab-${value}`} onClick={() => setType(value)} className={`rounded-md px-5 py-2 text-sm font-semibold ${type === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{value === 'day' ? 'Day' : 'Boarding'}</button>)}</div>
    {query.isLoading && <Loading rows={4} />}
    {query.isError && <ErrorNote error={query.error} />}
    {data && <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="class-cards">
      {data.classes.map((className) => {
        const structure = byClass.get(className);
        return <li key={className} data-testid={`class-card-${className}`} className="flex flex-col rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-2"><h3 className="font-display text-lg font-semibold">{className}</h3>
            {structure ? <p className="ledger-figure text-base font-semibold text-primary">{ugx(structure.total)}</p> : <span className="rounded bg-[#e6a23c]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#a87410]">Not set</span>}</div>
          {structure ? <ul className="ledger-figure mt-3 space-y-1 text-sm">{structure.items.map((item) => <li key={item.name} className="flex justify-between gap-3"><span className="font-sans text-muted-foreground">{item.name}</span><span>{item.amount.toLocaleString('en-US')}</span></li>)}</ul>
            : <p className="mt-3 text-sm text-muted-foreground">No {type === 'day' ? 'Day' : 'Boarding'} fees set for this class{other.has(className) ? ` (the ${type === 'day' ? 'Boarding' : 'Day'} structure is set)` : ''}.</p>}
          {fin.canEdit && <button type="button" data-testid={`button-edit-${className}`} onClick={() => setEditing(className)} className="mt-4 inline-flex items-center gap-2 self-start rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:border-primary hover:text-primary">{structure ? <Pencil size={14} /> : <Plus size={14} />}{structure ? 'Edit fees' : 'Set fees'}</button>}
        </li>;
      })}
    </ul>}
    {editing !== null && data && <StructureEditor fin={fin} type={type} className={editing} classes={data.classes} existing={byClass.get(editing)} onClose={() => setEditing(null)} />}
    {copying && <CopyTerm fin={fin} onClose={() => setCopying(false)} />}
  </div>;
}

function StructureEditor({ fin, type, className, classes, existing, onClose }: { fin: ReturnType<typeof useFinance>; type: StudentType; className: string; classes: string[]; existing?: Structure; onClose: () => void }) {
  const [items, setItems] = useState<DraftItem[]>(() => existing ? toDraft(existing.items) : [{ name: 'Tuition', amount: '' }]);
  const [applyTo, setApplyTo] = useState<string[]>([className]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const label = type === 'day' ? 'Day' : 'Boarding';
  const save = async () => {
    const read = readDraft(items);
    if ('error' in read) { setError(read.error); return; }
    if (!read.items.length) { setError('Add at least one fee item.'); return; }
    setBusy(true); setError('');
    try { await fin.call('/structures', 'PUT', { termKey: fin.termKey, classNames: applyTo, studentType: type, items: read.items }); await fin.refresh(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save these fees.'); setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(`Remove the ${label} fees for ${className}? Students in this class will show as having no fee structure.`)) return;
    setBusy(true); setError('');
    try { await fin.call(`/structures?termKey=${encodeURIComponent(fin.termKey)}&className=${encodeURIComponent(className)}&studentType=${type}`, 'DELETE'); await fin.refresh(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not remove these fees.'); setBusy(false); }
  };
  return <Sheet title={`${className} · ${label} fees`} onClose={onClose} testId="structure-editor">
    <p className="mb-4 text-sm text-muted-foreground">{fin.termLabel} · amounts in UGX</p>
    <ItemsEditor items={items} onChange={setItems} />
    <fieldset className="mt-6"><legend className="text-sm font-semibold">Use these fees for</legend>
      <div className="mt-2 flex flex-wrap gap-1.5">{classes.map((name) => <label key={name} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold ${applyTo.includes(name) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'} ${name === className ? 'opacity-100' : ''}`}>
        <input type="checkbox" className="sr-only" checked={applyTo.includes(name)} disabled={name === className} onChange={() => setApplyTo((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name])} />{name}</label>)}</div>
      <p className="mt-2 text-xs text-muted-foreground">Ticking other classes replaces their {label} fees with these.</p></fieldset>
    {error && <p role="alert" data-testid="editor-error" className="mt-4 text-sm text-destructive">{error}</p>}
    <div className="mt-6 flex flex-wrap gap-2">
      <button type="button" data-testid="button-save-structure" disabled={busy} onClick={save} className="h-11 flex-1 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy ? 'Saving…' : applyTo.length > 1 ? `Save for ${applyTo.length} classes` : 'Save fees'}</button>
      {existing && <button type="button" disabled={busy} onClick={remove} aria-label="Remove these fees" className="grid h-11 w-11 place-items-center rounded-lg border border-border text-muted-foreground hover:text-destructive"><Trash2 size={16} /></button>}
    </div>
  </Sheet>;
}

function CopyTerm({ fin, onClose }: { fin: ReturnType<typeof useFinance>; onClose: () => void }) {
  const others = fin.terms.filter((term) => term.key !== fin.termKey);
  const [from, setFrom] = useState(others[0]?.key ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const run = async () => {
    setBusy(true); setMessage('');
    try {
      const result = await fin.call<{ copied: number; skipped: number }>('/structures/copy', 'POST', { fromTerm: from, toTerm: fin.termKey });
      await fin.refresh();
      setMessage(result.copied ? `Copied ${result.copied} structure${result.copied === 1 ? '' : 's'}.${result.skipped ? ` ${result.skipped} already set, left unchanged.` : ''}` : 'Nothing to copy — everything in that term is already set here.');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Could not copy.'); }
    setBusy(false);
  };
  return <Sheet title="Copy fees from another term" onClose={onClose} testId="copy-structures">
    <p className="text-sm text-muted-foreground">Copies every class's Day and Boarding fees into <strong>{fin.termLabel}</strong>. Classes that already have fees here are not changed.</p>
    <select aria-label="Copy from term" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-4 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">{others.map((term) => <option key={term.key} value={term.key}>{term.label}</option>)}</select>
    {message && <p role="status" data-testid="copy-message" className="mt-4 text-sm">{message}</p>}
    <button type="button" data-testid="button-run-copy" disabled={busy || !from} onClick={run} className="mt-5 h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy ? 'Copying…' : 'Copy fees'}</button>
  </Sheet>;
}
