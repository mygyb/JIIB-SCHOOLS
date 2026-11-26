// Print marksheets: a PDF per class and subject listing the learners who take it, with a box for every mark
// (marks already entered are filled in). Administrators see every subject; a teacher sees only their own.
import { useState } from 'react';
import { LogoLoader } from '@/components/logo-loader';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, Loader2 } from 'lucide-react';
import { getGetSchoolConfigQueryKey, useGetSchoolConfig } from '@workspace/api-client-react';
import type { School } from '@workspace/api-client-react';
import { jiibApi } from '@/lib/jiib-api';
import { getTerms, type SchoolConfig } from '@/lib/school-data';
import { buildMarksheetPdf, marksheetFileName, saveBlob, type Marksheet, type MarksheetField } from '@/lib/marksheet-pdf';

type Data = { termKey: string; termLabel: string; year: string; address: string; motto: string; fields: MarksheetField[]; teacherView: boolean; sheets: Marksheet[] };

export function Marksheets({ school }: { school: School }) {
  const config = useGetSchoolConfig(school.id, { query: { queryKey: getGetSchoolConfigQueryKey(school.id) } });
  const configData = (config.data?.data ?? {}) as SchoolConfig;
  const terms = getTerms(configData);
  const [picked, setPicked] = useState('');
  const termKey = picked || String(configData.activeTerm ?? '');
  const [className, setClassName] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['marksheets', school.id, termKey],
    queryFn: () => jiibApi<Data>(`/api/schools/${encodeURIComponent(school.id)}/marksheets?termKey=${encodeURIComponent(termKey)}`),
    enabled: Boolean(termKey),
  });
  const data = query.data;
  const sheets = data?.sheets ?? [];
  const classes = Array.from(new Set(sheets.map((sheet) => sheet.className)));
  const shown = sheets.filter((sheet) => !className || sheet.className === className);
  const teacherView = Boolean(data?.teacherView);

  const download = async (list: Marksheet[], label: string, filename: string) => {
    if (!data || !list.length) return;
    setBusy(label); setError('');
    try {
      const blob = await buildMarksheetPdf(list, data.fields, { schoolName: school.name, address: data.address, motto: data.motto, logoUrl: school.logoUrl, termLabel: data.termLabel, year: data.year });
      saveBlob(blob, filename);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the PDF.');
    } finally { setBusy(''); }
  };
  const term = data?.termLabel ?? termKey;
  const entered = (sheet: Marksheet) => sheet.learners.filter((learner) => data?.fields.some((f) => learner.marks[f.field] != null)).length;

  return <div className="fade-up" data-testid="marksheets-page">
    <div className="mb-6">
      <p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">Academics & marks</p>
      <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">Print marksheets</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{teacherView ? 'Download a marksheet PDF for each of your classes and subjects.' : 'Download a marksheet PDF for every class and subject.'} Each sheet lists only the learners who take that subject, with a box for every mark. Marks already entered are filled in.</p>
    </div>
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {terms.length > 1 && <select aria-label="Term" value={termKey} onChange={(e) => setPicked(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">{terms.map((t) => <option key={t.key} value={t.key}>{t.label}{t.active ? ' (current)' : ''}</option>)}</select>}
      {classes.length > 1 && <select aria-label="Class" data-testid="select-marksheet-class" value={className} onChange={(e) => setClassName(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm"><option value="">All classes</option>{classes.map((c) => <option key={c} value={c}>{c}</option>)}</select>}
      {data && <span className="text-xs font-semibold text-muted-foreground">Assessments: {data.fields.map((f) => f.name).join(', ')}</span>}
      <button type="button" data-testid="button-download-all" disabled={!shown.length || Boolean(busy)} onClick={() => void download(shown, 'all', `${className ? `${className}-` : ''}marksheets-${term.replace(/[^\w]+/g, '-')}.pdf`)}
        className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {busy === 'all' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Download all ({shown.length})
      </button>
    </div>
    {error && <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
    {query.isLoading && <LogoLoader label="Loading marksheets…" />}
    {query.isError && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">Could not load the marksheets. <button className="ml-2 font-semibold underline" onClick={() => void query.refetch()}>Try again</button></div>}
    {data && !shown.length && <p className="rounded-xl bg-muted/50 p-5 text-sm text-muted-foreground">{teacherView ? 'No subjects have been assigned to you yet. Ask the school administrator to assign your classes and subjects.' : 'No class subjects with learners were found for this term.'}</p>}
    <div className="space-y-4">
      {(className ? [className] : classes).map((c) => {
        const list = shown.filter((sheet) => sheet.className === c);
        if (!list.length) return null;
        return <section key={c} className="rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="font-display text-lg font-semibold">{c} <span className="text-xs font-normal text-muted-foreground">· {list.length} subject{list.length === 1 ? '' : 's'}</span></p>
            {list.length > 1 && <button type="button" disabled={Boolean(busy)} onClick={() => void download(list, `class:${c}`, `${c.replace(/[^\w]+/g, '-')}-marksheets-${term.replace(/[^\w]+/g, '-')}.pdf`)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50">{busy === `class:${c}` ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} All {c} sheets</button>}
          </div>
          <ul className="divide-y divide-border">
            {list.map((sheet) => {
              const key = `${sheet.className}|${sheet.subject}`;
              return <li key={key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><FileText size={16} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{sheet.subject}</span>
                  <span className="block truncate text-xs text-muted-foreground">{sheet.learners.length} learner{sheet.learners.length === 1 ? '' : 's'} · {entered(sheet)} with marks{!teacherView && ` · ${sheet.teacherName ?? 'No teacher assigned'}`}</span></span>
                <button type="button" data-testid={`button-download-${key}`} disabled={Boolean(busy)} onClick={() => void download([sheet], key, marksheetFileName(sheet, term))} className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary px-3 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-50">
                  {busy === key ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} PDF</button>
              </li>;
            })}
          </ul>
        </section>;
      })}
    </div>
  </div>;
}
