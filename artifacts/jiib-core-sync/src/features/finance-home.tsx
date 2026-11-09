// /finance — the Bursar's dashboard and the Head teacher's finance summary. The money screens arrive in the next steps.
import { Link } from 'wouter';
import { AlertTriangle, Banknote, Check, FileBarChart, Receipt, Users } from 'lucide-react';

const STEPS = [
  { icon: FileBarChart, title: 'Fee structures', body: 'Set the fees for each class, with separate Boarding and Day structures.' },
  { icon: Users, title: 'Student fees', body: 'Every student follows their class structure unless you give them their own.' },
  { icon: Banknote, title: 'Record payments', body: 'Amount in UGX, date, method and an optional Transaction ID. Receipts are numbered for you.' },
  { icon: AlertTriangle, title: 'Defaulters', body: 'Filter by class, boarding or day, and minimum balance. Print it or remind parents.' },
  { icon: Receipt, title: 'Reports', body: 'Daily and term collections, collection by class, and outstanding fees.' },
];

export function FinanceHome() {
  const role = localStorage.getItem('jiib.role');
  const bursar = role === 'Bursar';
  return <div data-testid="finance-home" className="fade-up">
    <p className="mb-2 text-[10px] font-bold uppercase tracking-[.22em] text-primary">{bursar ? "Bursar's office" : 'Finance summary'}</p>
    <h2 className="font-display text-3xl font-semibold tracking-[-.03em] sm:text-4xl">{bursar ? 'Your finance workspace' : 'Fees at a glance'}</h2>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
      {bursar
        ? 'This is where fees, payments and defaulters will live. Only the bursar can open it; school administrators cannot.'
        : 'Totals collected, outstanding fees and the number of defaulters will appear here once the bursar starts recording fees. This page is view only.'}
    </p>
    <div className="mt-6 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h3 className="font-display text-lg font-semibold">What is coming next</h3>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2">
        {STEPS.map(({ icon: Icon, title, body }, index) => <li key={title} className="flex gap-3 rounded-xl border border-border p-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon size={17} /></span>
          <div><p className="text-sm font-semibold">{index + 1}. {title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{body}</p></div>
        </li>)}
      </ol>
      <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><Check size={14} className="text-primary" /> Your account and workspace are ready.{bursar && <> You can already <Link href="/students" className="font-semibold text-primary hover:underline">view the student list</Link>.</>}</p>
    </div>
  </div>;
}
