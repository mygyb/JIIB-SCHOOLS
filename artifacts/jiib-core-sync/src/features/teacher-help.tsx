// Help page for teacher accounts: a short, direct guide to every part of the teacher workspace.
import { ArrowLeft, Bell, ClipboardList, LayoutDashboard, Moon, Settings, WifiOff } from 'lucide-react';
import { Link } from 'wouter';

const SECTIONS = [
  { icon: LayoutDashboard, title: 'Overview (Dashboard)', points: [
    'Shows your progress: how many marks you have entered for your classes and subjects in the current term.',
    'The percentage counts only the assessments the school has switched on (for example "Midterm only"). The label next to it tells you which.',
    'The subject table lists each class and subject you teach, with entered / expected marks. Use it to see what is still left.',
  ] },
  { icon: ClipboardList, title: 'Marks register', points: [
    'Choose the Term, Class and Subject at the top. You only see the classes and subjects the school assigned to you.',
    'Type each learner\'s mark in its box. It saves by itself when you move to the next box; the box shows whether it is saved.',
    'Only the assessments switched on by the school appear (for example AOI, Midterm, End of term). A mark cannot be higher than the maximum shown.',
    'Learners are listed A to Z by default. Use the Sort button to switch to Z to A, or clear the sorting, and "Find student" to search by name.',
    'In S.5 and S.6 (A-Level), marks are entered paper by paper for each subject.',
    'If you see "Marks locked", the school has closed this term for entry. Ask the school administrator if you need to change a mark.',
    'The Refresh button reloads the register with the latest marks from the server.',
  ] },
  { icon: WifiOff, title: 'No internet? Keep working', points: [
    'Marks you type while offline are kept on your phone and the register shows "Offline · queued".',
    'They are sent automatically when the internet is back. Keep the app open until the count says 0 pending.',
  ] },
  { icon: Bell, title: 'Reminders and notifications', points: [
    'Open the profile menu (your initials, top right) and choose to turn on notifications. You will get a reminder when the school sets a marks deadline.',
    'A deadline banner may appear on the Marks register. You can dismiss it once you have read it.',
  ] },
  { icon: Settings, title: 'Account settings', points: [
    'Open the profile menu, then Account settings, to change your display name and your password.',
    'Use a password only you know. If you forget it, ask the school administrator to reset it.',
  ] },
  { icon: Moon, title: 'Dark mode', points: ['The Dark / Light button at the top switches the look of the app on this device. It does not change anything for other people.'] },
];

export function TeacherHelp() {
  return <div className="fade-up mx-auto max-w-3xl" data-testid="teacher-help">
    <Link href="/dashboard" data-testid="button-help-back" className="mb-5 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted"><ArrowLeft size={15} /> Back to dashboard</Link>
    <p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">Teacher guide</p>
    <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">How to use your account</h2>
    <p className="mt-2 text-sm text-muted-foreground">Your job here is simple: open the Marks register, pick your class and subject, and enter marks. Everything else on this page explains the parts you will see.</p>
    <ol className="mt-5 grid gap-2 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm sm:grid-cols-2">
      <li><strong>1.</strong> Open <strong>Marks register</strong> from the menu.</li>
      <li><strong>2.</strong> Pick the <strong>class</strong> and <strong>subject</strong>.</li>
      <li><strong>3.</strong> Type each learner's mark and press Next.</li>
      <li><strong>4.</strong> Check the <strong>Overview</strong> to see what is left.</li>
    </ol>
    <div className="mt-5 space-y-4">
      {SECTIONS.map(({ icon: Icon, title, points }) => <section key={title} className="rounded-2xl border border-border bg-card p-5">
        <h3 className="flex items-center gap-2.5 font-display text-lg font-semibold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Icon size={16} /></span>{title}</h3>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-muted-foreground">{points.map((point) => <li key={point}>{point}</li>)}</ul>
      </section>)}
    </div>
    <p className="mt-5 text-xs text-muted-foreground">Still stuck? Contact your school administrator.</p>
  </div>;
}
