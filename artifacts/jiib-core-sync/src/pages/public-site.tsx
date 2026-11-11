import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  Award,
  BarChart3,
  BookOpenCheck,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileText,
  GraduationCap,
  Menu,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  UsersRound,
  Wallet,
  X,
} from 'lucide-react';
import { InstallButton } from '@/components/pwa-ui';
import { useSecretTaps } from '@/lib/secret-taps';
import './public-site.css';

export type PortalRequestValues = {
  fullName: string;
  email: string;
  password: string;
  schoolSlug: string;
  requestedRole: 'admin' | 'teacher';
};

function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={`jiib-brand${light ? ' jiib-brand--light' : ''}`}>
      <span className="jiib-brand-mark" aria-hidden="true"><GraduationCap size={22} strokeWidth={2.2} /></span>
      <span className="jiib-brand-type"><strong>J-SCHOOLS</strong><small>SCHOOL SYSTEM</small></span>
    </span>
  );
}

function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [location] = useLocation();
  const sectionHref = (id: string) => `${location === '/' ? '' : '/'}#${id}`;
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand-link" aria-label="J-SCHOOLS home" data-testid="link-brand-home"><Brand /></Link>
        <InstallButton className="install-chip--header" testId="button-install-top" />
        <button
          className="mobile-menu-toggle"
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
          data-testid="button-menu-toggle"
        >{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
        <nav className={`site-nav${menuOpen ? ' site-nav--open' : ''}`} aria-label="Main navigation">
          <a href={sectionHref('features')} onClick={() => setMenuOpen(false)}>Features</a>
          <a href={sectionHref('screens')} onClick={() => setMenuOpen(false)}>Screens</a>
          <a href={sectionHref('report-cards')} onClick={() => setMenuOpen(false)}>Report cards</a>
          <a href={sectionHref('roles')} onClick={() => setMenuOpen(false)}>Roles</a>
          <a href={sectionHref('questions')} onClick={() => setMenuOpen(false)}>Questions</a>
          <span className="nav-actions">
            <Link href="/login" className="nav-login" data-testid="link-login">Log in</Link>
            <Link href="/signup" className="button button--small" data-testid="link-signup">Sign up <ArrowRight size={15} /></Link>
          </span>
        </nav>
      </div>
    </header>
  );
}

const WHATSAPP_MESSAGE = 'Hello J-SCHOOLS, I would like to know more about the school management system for my school.';
const WHATSAPP_NUMBERS = [
  { label: '0762 971 094', international: '256762971094' },
  { label: '0742 054 096', international: '256742054096' },
];
const whatsappLink = (international: string) => `https://wa.me/${international}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

function XGlyph() { return <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>; }
function LinkedInGlyph() { return <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>; }
function WhatsAppGlyph() { return <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" /></svg>; }

/** X, LinkedIn and two WhatsApp numbers. WhatsApp opens a chat with a ready-written message, so the visitor only has to press send. */
function SocialLinks({ where }: { where: 'top' | 'footer' }) {
  const external = { target: '_blank', rel: 'noopener noreferrer' } as const;
  return (
    <div className={`social-row social-row--${where}`} data-testid={`social-links-${where}`} aria-label="J-SCHOOLS on social media">
      <a className="social-link" href="https://x.com/j_schools_ug?s=11" {...external} aria-label="J-SCHOOLS on X" data-testid={`link-x-${where}`}><XGlyph /><span>X</span></a>
      <a className="social-link" href="https://www.linkedin.com/j_schools_ug" {...external} aria-label="J-SCHOOLS on LinkedIn" data-testid={`link-linkedin-${where}`}><LinkedInGlyph /><span>LinkedIn</span></a>
      {WHATSAPP_NUMBERS.map((number) => (
        <a key={number.international} className="social-link social-link--whatsapp" href={whatsappLink(number.international)} {...external} aria-label={`Chat with J-SCHOOLS on WhatsApp, ${number.label}`} data-testid={`link-whatsapp-${number.international}-${where}`}><WhatsAppGlyph /><span>{number.label}</span></a>
      ))}
    </div>
  );
}

function Footer() {
  const secretTap = useSecretTaps();
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <Link href="/" className="brand-link" aria-label="J-SCHOOLS home" data-testid="link-footer-brand"><Brand light /></Link>
        <p>School management system for Uganda: students, marks, report cards, A-Level, fees and parents.</p>
        <InstallButton className="install-chip--footer" testId="button-install-bottom" />
        <div className="footer-links">
          <a href="#features">Features</a>
          <a href="#report-cards">Report cards</a>
          <a href="#questions">Questions</a>
          <Link href="/login" data-testid="link-footer-login">Log in</Link>
          <Link href="/signup" data-testid="link-footer-signup">Sign up</Link>
        </div>
      </div>
      <SocialLinks where="footer" />
      <div className="footer-bottom"><span onClick={secretTap}>J-SCHOOLS</span><span>Built for the everyday work of schools in Uganda.</span></div>
    </footer>
  );
}

function SectionEyebrow({ children }: { children: string }) {
  return <p className="section-eyebrow"><span />{children}</p>;
}

const SHOWCASE = [
  { id: 'marks', tab: 'Marks register', title: 'Enter marks once, totals work themselves out', text: 'Teachers type AOI, midterm and end-of-term marks by class and subject. Totals, grades and progress update as they go, and the assessment columns are set by your school.', src: '/showcase/marks-register.webp', alt: 'J-SCHOOLS marks register showing a class list with AOI, midterm and end of term marks and totals' },
  { id: 'reports', tab: 'Report studio', title: 'Pick a design, preview, print the whole class', text: 'Choose one of four report card designs, preview any learner, then print or save PDFs for one student, a class or the whole school.', src: '/showcase/report-studio.webp', alt: 'J-SCHOOLS report studio with template choices and a live end of term report card preview' },
  { id: 'fees', tab: 'Fees dashboard', title: 'See the money at a glance, in UGX', text: 'The bursar sees what is expected, collected and still owed, split by Day and Boarding and by class, with the latest receipts alongside.', src: '/showcase/bursar-dashboard.webp', alt: 'J-SCHOOLS bursar fees dashboard with expected, collected, outstanding and defaulters in Uganda shillings' },
  { id: 'structures', tab: 'Fee structures', title: 'Fees set per class, for Day and Boarding', text: 'Each class has its own fee items for day scholars and boarders. Copy a term forward, and give any student their own fees when they need them.', src: '/showcase/fee-structures.webp', alt: 'J-SCHOOLS fee structures per class for day and boarding students' },
  { id: 'defaulters', tab: 'Defaulters', title: 'Know who owes, and follow up', text: 'Filter by class, Day or Boarding and amount owed. Include unpaid fees from earlier terms, print or download the list, and send a ready-made reminder to the parent.', src: '/showcase/defaulters.webp', alt: 'J-SCHOOLS defaulters list with filters, earlier term balances and reminder buttons' },
  { id: 'head', tab: 'Head teacher view', title: 'The head teacher sees everything, changes nothing', text: 'A calm, view-only workspace across every department, with the finance summary, totals and defaulter counts a head teacher needs.', src: '/showcase/head-teacher.webp', alt: 'J-SCHOOLS head teacher view-only finance summary' },
];

const FEATURES = [
  { icon: UsersRound, title: 'Students & classes', text: 'Enrol learners, organise them by class and house, and keep every record in one place from Nursery to A-Level.' },
  { icon: ClipboardList, title: 'Marks register', text: 'Enter AOI, midterm and end-of-term marks by class and subject. Totals add up for you, and teachers see only their own classes.' },
  { icon: FileText, title: 'Report cards', text: 'Print end-of-term report cards in four designs, plus midterm slips, with grades, descriptors, rank, comments and a QR code.' },
  { icon: Award, title: 'A-Level', text: 'Subject combinations, per-paper marks, points and results, with A-Level report cards for your Senior 5 and Senior 6 learners.' },
  { icon: BarChart3, title: 'Grading & performance', text: 'Set your own grading scale, follow class and subject performance, and print marksheets for any class.' },
  { icon: Wallet, title: 'Fees & receipts in UGX', text: 'Fee structures per class for Day and Boarding, custom fees for individual students, numbered receipts and optional Transaction IDs.' },
  { icon: AlertTriangle, title: 'Defaulters & reports', text: 'See who owes this term or from earlier terms, filter, print or download, and review collections term by term.' },
  { icon: GraduationCap, title: 'End-of-year promotion', text: 'Promote whole classes in one guided step, choose optional subjects, and undo within a month if something was wrong.' },
  { icon: Building2, title: 'Houses & terms', text: 'Manage houses, academic terms and publish deadlines without spreadsheets.' },
  { icon: MessageCircle, title: 'Parents portal', text: 'Parents sign in with phone verification to see their children’s results and talk with the school.' },
  { icon: ShieldCheck, title: 'Roles & access', text: 'Administrator, teacher, head teacher, bursar and parent each get the screens and permissions they need, and nothing more.' },
  { icon: Smartphone, title: 'Works on every phone', text: 'Use it in the browser or install it as an app on Android. Built to stay quick on ordinary mobile connections.' },
];

const ROLES = [
  { name: 'School administrator', text: 'Runs the school: students, subjects, terms, staff accounts, settings and promotion.' },
  { name: 'Teacher', text: 'Enters marks for their own classes and subjects, and sees only what they need.' },
  { name: 'Head teacher', text: 'A view-only window across every department, including the finance summary.' },
  { name: 'Bursar', text: 'A focused accounts workspace: fee structures, payments, receipts, defaulters and reports.' },
  { name: 'Parent', text: 'Signs in with a verified phone number to follow their child’s results.' },
];

const DESIGNS = [
  { id: 'classic', name: 'Classic Navy', note: 'Traditional navy and red', src: '/showcase/report-classic.webp' },
  { id: 'elegant', name: 'Elegant Ledger', note: 'Ivory, burgundy and gold', src: '/showcase/report-elegant.webp' },
  { id: 'modern', name: 'Modern Minimal', note: 'Clean indigo and teal', src: '/showcase/report-modern.webp' },
  { id: 'bold', name: 'Bold Contemporary', note: 'Charcoal and electric blue', src: '/showcase/report-bold.webp' },
];

export function LandingPage() {
  const [shot, setShot] = useState(SHOWCASE[0].id);
  const [zoom, setZoom] = useState<string | null>(null);
  const active = SHOWCASE.find((item) => item.id === shot) ?? SHOWCASE[0];
  const zoomed = DESIGNS.find((item) => item.id === zoom) ?? null;

  useEffect(() => {
    document.title = 'J-SCHOOLS | School Management System for Uganda';

    const sections = document.querySelectorAll<HTMLElement>('[data-reveal]');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      sections.forEach((section) => section.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -24px 0px' });

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setZoom(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom]);

  return (
    <main className="jiib-public">
      <SiteHeader />
      <section className="hero">
        <div className="hero-copy">
          <SocialLinks where="top" />
          <SectionEyebrow>School management system for Uganda</SectionEyebrow>
          <h1>One system for your <em>whole school.</em></h1>
          <p className="hero-intro">J-SCHOOLS brings students, marks, report cards, A-Level, fees in UGX and parents into one clear place, from Nursery to Senior 6.</p>
          <div className="hero-actions">
            <Link href="/signup" className="button" data-testid="link-hero-signup">Sign up for portal access <ArrowRight size={17} /></Link>
            <Link href="/login" className="text-link" data-testid="link-hero-login">Already have an account? Log in</Link>
          </div>
          <div className="hero-note"><span className="hero-note-icon"><ShieldCheck size={17} /></span><span>School access is approved by your system administrator.</span></div>
        </div>
        <div className="hero-product" aria-label="J-SCHOOLS on a laptop and a phone">
          <div className="device-laptop">
            <div className="device-bar" aria-hidden="true"><i /><i /><i /></div>
            <img src="/showcase/marks-register.webp" width={1400} height={827} alt="J-SCHOOLS marks register on a laptop, with sample learners and their marks" />
          </div>
          <div className="device-phone">
            <img src="/showcase/phone-defaulters.webp" width={520} height={1125} alt="J-SCHOOLS defaulters list on a phone" />
          </div>
          <div className="photo-note photo-note--product"><span className="photo-note-icon"><FileText size={18} /></span><span><strong>Report cards in a click</strong><small>Four designs, print a whole class</small></span></div>
        </div>
        <div className="hero-bottomline"><span>STUDENTS · MARKS · REPORT CARDS · A-LEVEL · FEES · PARENTS</span><a href="#features">Explore the system <ArrowDownRight size={16} /></a></div>
      </section>

      <section className="intro-strip" aria-label="Platform overview">
        <p>One school. Many moving parts.</p>
        <div><span><UsersRound size={17} /> People</span><b>+</b><span><BookOpenCheck size={17} /> Learning</span><b>+</b><span><Wallet size={17} /> Fees</span><b>+</b><span><MessageCircle size={17} /> Families</span><b>=</b><strong>One shared picture</strong></div>
      </section>

      <section className="section features-section" id="features" data-reveal>
        <div className="section-heading">
          <SectionEyebrow>Everything your school runs on</SectionEyebrow>
          <h2>All the work,<br /><em>in one place.</em></h2>
          <p>From the first enrolment to the last report card, and from fee structures to defaulters, J-SCHOOLS covers the daily work of a Ugandan secondary school.</p>
        </div>
        <div className="feature-grid">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <article className="feature-card" key={title}>
              <span className="item-icon"><Icon size={21} /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="showcase-section" id="screens" data-reveal>
        <div className="showcase-head">
          <SectionEyebrow>See it in action</SectionEyebrow>
          <h2>This is what your team <em>will use.</em></h2>
          <p>Real screens from J-SCHOOLS, shown with sample school data.</p>
        </div>
        <div className="showcase-tabs" role="tablist" aria-label="Screens">
          {SHOWCASE.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={shot === item.id} className={shot === item.id ? 'is-active' : ''} onClick={() => setShot(item.id)} data-testid={`tab-shot-${item.id}`}>{item.tab}</button>
          ))}
        </div>
        <div className="showcase-stage">
          <figure className="showcase-frame">
            <div className="device-bar" aria-hidden="true"><i /><i /><i /></div>
            <img key={active.id} src={active.src} alt={active.alt} loading="lazy" />
          </figure>
          <div className="showcase-caption">
            <h3 data-testid="text-shot-title">{active.title}</h3>
            <p>{active.text}</p>
            <div className="showcase-phones">
              <img src="/showcase/phone-fees.webp" width={520} height={1125} alt="J-SCHOOLS student fees on a phone, with tick boxes to mark students as Day or Boarding" loading="lazy" />
              <img src="/showcase/phone-defaulters.webp" width={520} height={1125} alt="J-SCHOOLS defaulters on a phone" loading="lazy" />
              <span>Made to work on phones too</span>
            </div>
          </div>
        </div>
      </section>

      <section className="designs-section" id="report-cards" data-reveal>
        <div className="section-heading">
          <SectionEyebrow>Report cards</SectionEyebrow>
          <h2>Report cards your school<br /><em>will be proud of.</em></h2>
          <p>Choose from four professional designs. Your school name, logo, motto and stamp go on every card, and the grading follows your own scale. Tap a card to look closer.</p>
        </div>
        <ul className="design-row">
          {DESIGNS.map((design) => (
            <li key={design.id}>
              <button type="button" className="design-card" onClick={() => setZoom(design.id)} data-testid={`button-design-${design.id}`} aria-label={`View the ${design.name} report card larger`}>
                <img src={design.src} width={900} height={1272} alt={`${design.name} end of term report card with a sample learner`} loading="lazy" />
                <span><strong>{design.name}</strong><small>{design.note}</small></span>
              </button>
            </li>
          ))}
        </ul>
        <ul className="check-list check-list--row">
          <li><Check size={17} /> End-of-term report cards and midterm slips</li>
          <li><Check size={17} /> Class position, grades, descriptors and teacher comments</li>
          <li><Check size={17} /> QR code, printable A4, PDF for one learner or a whole class</li>
        </ul>
        <p className="designs-note">Sample cards use made-up school and learner details.</p>
      </section>

      <section className="story-section" id="school-day" data-reveal>
        <div className="story-photo">
          <img src="https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?auto=format&fit=crop&w=1100&q=85" alt="Teacher guiding a class through a lesson" loading="lazy" />
          <span className="photo-side-label">A clearer view, from class to office</span>
        </div>
        <div className="story-copy">
          <SectionEyebrow>One day, one shared record</SectionEyebrow>
          <h2>From the first bell to the last update.</h2>
          <p className="story-lead">A teacher records marks. The bursar records a payment. The head teacher checks how the term is shaping up. A parent follows their child’s results. The work connects, without every detail living in a different place.</p>
          <ul className="check-list">
            <li><Check size={17} /> Staff have a clearer view of what needs attention.</li>
            <li><Check size={17} /> Student information stays organised across school levels.</li>
            <li><Check size={17} /> Money, marks and records are kept safely together.</li>
          </ul>
          <Link href="/signup" className="text-link text-link--arrow" data-testid="link-story-signup">See how your school can get started <ArrowRight size={16} /></Link>
        </div>
      </section>

      <section className="roles-section" id="roles" data-reveal>
        <div className="section-heading">
          <SectionEyebrow>The right view for everyone</SectionEyebrow>
          <h2>Everyone gets<br /><em>their own workspace.</em></h2>
          <p>Each person sees the screens that match their job. An administrator cannot open the bursar’s accounts, and a head teacher can look at everything without changing a thing.</p>
        </div>
        <ul className="roles-grid">
          {ROLES.map((role, index) => (
            <li key={role.name} className="role-card"><span className="item-number">0{index + 1}</span><h3>{role.name}</h3><p>{role.text}</p></li>
          ))}
        </ul>
      </section>

      <section className="stages-section" data-reveal>
        <div className="stages-heading">
          <SectionEyebrow>One school, every stage</SectionEyebrow>
          <h2>Built around how<br />schools <em>actually grow.</em></h2>
        </div>
        <div className="stages-track">
          {[
            ['01', 'Nursery', 'Early years'],
            ['02', 'Primary', 'Growing foundations'],
            ['03', 'O-Level', 'New direction'],
            ['04', 'A-Level', 'Next steps'],
          ].map(([number, name, detail]) => (
            <article className="stage" key={name}>
              <span className="stage-number">{number}</span><span className="stage-line" />
              <h3>{name}</h3><p>{detail}</p>
            </article>
          ))}
        </div>
        <p className="stages-note">One coordinated workspace for the learners, staff and school routines that make each stage count.</p>
      </section>

      <section className="access-section" data-reveal>
        <div className="access-text">
          <SectionEyebrow>Carefully managed access</SectionEyebrow>
          <h2>Your school workspace,<br /><em>with the right people.</em></h2>
          <p>Staff request an account for their school. A system administrator reviews each request before access is approved, so a request is never an automatic login.</p>
          <Link href="/signup" className="button button--light" data-testid="link-access-signup">Request staff access <ArrowRight size={17} /></Link>
        </div>
        <div className="access-steps">
          <div className="access-step"><span>1</span><div><h3>Find your school</h3><p>Use the school portal name shared by your administrator.</p></div></div>
          <div className="access-step"><span>2</span><div><h3>Tell us who you are</h3><p>Request access as a teacher or school administrator.</p></div></div>
          <div className="access-step"><span>3</span><div><h3>Wait for approval</h3><p>Your system administrator confirms access before you can sign in.</p></div></div>
        </div>
      </section>

      <section className="faq-section" id="questions" data-reveal>
        <div className="faq-heading"><SectionEyebrow>A few useful answers</SectionEyebrow><h2>Before you<br /><em>step inside.</em></h2><p>Not sure where to begin? Here are the essentials.</p></div>
        <div className="faq-list">
          <details><summary>What is J-SCHOOLS?<ChevronDown size={18} /></summary><p>J-SCHOOLS is a school management system built for secondary schools in Uganda. It covers student records, marks, report cards, A-Level, fees and receipts in Uganda shillings, defaulters, end-of-year promotion and a parents portal.</p></details>
          <details><summary>Can it print report cards?<ChevronDown size={18} /></summary><p>Yes. Choose from four report card designs, preview any learner, then print or save a PDF for one student, a class or the whole school. Midterm slips are included.</p></details>
          <details><summary>Does it handle school fees?<ChevronDown size={18} /></summary><p>Yes. The bursar sets fee structures per class for Day and Boarding students, gives individual students custom fees when needed, records payments with numbered receipts and an optional Transaction ID, and follows up defaulters from this term or earlier terms. Everything is in UGX.</p></details>
          <details><summary>Does it support A-Level?<ChevronDown size={18} /></summary><p>Yes. A-Level has subject combinations, per-paper marks, points and results, and report cards.</p></details>
          <details><summary>Who can request a staff account?<ChevronDown size={18} /></summary><p>Teachers and school administrators can request access using their school portal name. A system administrator must approve the request before the account can be used. Head teacher and bursar accounts are created by the school administrator.</p></details>
          <details><summary>How do I find my school portal name?<ChevronDown size={18} /></summary><p>Ask your school administrator for the portal name, also called the school slug. It identifies the correct school workspace.</p></details>
          <details><summary>Can parents sign up here?<ChevronDown size={18} /></summary><p>This request form is for school staff only. The parent portal uses phone verification provided by the school.</p></details>
          <details><summary>Does it work on a phone?<ChevronDown size={18} /></summary><p>Yes. J-SCHOOLS works in any modern phone browser and can be installed as an app on Android.</p></details>
        </div>
      </section>

      <section className="final-cta" data-reveal>
        <div className="final-cta-mark"><GraduationCap size={29} /></div>
        <p className="final-kicker">A school runs on people working together.</p>
        <h2>Let the school day<br />move <em>in sync.</em></h2>
        <Link href="/signup" className="button" data-testid="link-final-signup">Request portal access <ArrowRight size={17} /></Link>
        <p className="final-login">Already on J-SCHOOLS? <Link href="/login" data-testid="link-final-login">Log in here</Link></p>
      </section>
      <Footer />

      {zoomed && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={`${zoomed.name} report card`} onMouseDown={(event) => { if (event.target === event.currentTarget) setZoom(null); }} data-testid="lightbox">
          <button type="button" className="lightbox-close" aria-label="Close" onClick={() => setZoom(null)}><X size={22} /></button>
          <img src={zoomed.src} alt={`${zoomed.name} end of term report card with a sample learner`} />
          <p>{zoomed.name} · sample learner</p>
        </div>
      )}
    </main>
  );
}

export function PortalRequestPage({ onSubmit }: { onSubmit: (values: PortalRequestValues) => Promise<void> }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [schoolSlug, setSchoolSlug] = useState('');
  const [requestedRole, setRequestedRole] = useState<PortalRequestValues['requestedRole']>('teacher');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState('');
  const [success, setSuccess] = useState(false);
  const [validation, setValidation] = useState('');

  useEffect(() => {
    document.title = 'Request portal access | J-SCHOOLS';
  }, []);

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure('');
    setValidation('');
    if (!fullName.trim()) {
      setValidation('Enter your full name.');
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(schoolSlug.trim().toLowerCase())) {
      setValidation('Enter your school portal name using letters, numbers, and hyphens.');
      return;
    }
    if (password !== confirmation) {
      setValidation('Your passwords do not match. Please check both fields.');
      return;
    }
    if (password.length < 8) {
      setValidation('Choose a password with at least 8 characters.');
      return;
    }
    setPending(true);
    try {
      await onSubmit({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        schoolSlug: schoolSlug.trim().toLowerCase(),
        requestedRole,
      });
      setSuccess(true);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'We could not send your request. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="jiib-public request-page">
      <SiteHeader />
      <section className="request-layout">
        <aside className="request-aside">
          <Link href="/" className="request-back" data-testid="link-request-home"><ArrowRight size={15} className="back-arrow" /> Back to home</Link>
          <div className="request-aside-copy">
            <SectionEyebrow>Join your school workspace</SectionEyebrow>
            <h1>A better-connected school starts <em>with you.</em></h1>
            <p>Request a staff account for your school. Your system administrator will review your details before access is approved.</p>
          </div>
          <div className="request-assurance"><ShieldCheck size={19} /><span><strong>Access is reviewed</strong><small>Submitting a request does not grant immediate access.</small></span></div>
          <div className="request-aside-footer">J-SCHOOLS <span>·</span> BUILT FOR SCHOOL TEAMS</div>
        </aside>
        <section className="request-form-area">
          <div className="request-card">
            <div className="request-card-heading">
              <span className="request-step-label">STAFF ACCESS REQUEST <span>01 / 01</span></span>
              <h2>{success ? 'Request received.' : 'Tell us a little about you.'}</h2>
          <p>{success ? 'Your sign-up is saved. Your school administrator must approve access before you can open the portal.' : 'Create your login details and request a portal. Your school administrator will review access before it is granted.'}</p>
            </div>
            {success ? (
              <div className="request-success" role="status" data-testid="status-request-success">
                <div className="success-icon"><CheckCircle2 size={25} /></div>
                <h3>Your sign-up is saved.</h3>
                <p>Your school administrator for <strong>{schoolSlug.trim()}</strong> must approve your staff access before you can use the portal. Check your email for a confirmation link if prompted.</p>
                <div className="success-actions">
                  <Link href="/login" className="button" data-testid="link-success-login">Go to log in <ArrowRight size={16} /></Link>
                  <Link href="/" className="text-link" data-testid="link-success-home">Return to home</Link>
                </div>
              </div>
            ) : (
              <form className="request-form" onSubmit={submitRequest}>
                <label className="field"><span>Full name</span><input data-testid="input-request-name" autoComplete="name" required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name as known at school" /></label>
                <label className="field"><span>Staff email</span><input data-testid="input-request-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@school.org" /></label>
                <label className="field"><span>School portal name</span><span className="slug-input"><span>jiib.school/</span><input data-testid="input-request-slug" autoComplete="organization" required value={schoolSlug} onChange={(event) => setSchoolSlug(event.target.value)} placeholder="your-school" /></span><small>Ask your school administrator if you are not sure.</small></label>
                <label className="field"><span>Request access as</span><select data-testid="select-request-role" value={requestedRole} onChange={(event) => setRequestedRole(event.target.value as PortalRequestValues['requestedRole'])}><option value="teacher">Teacher</option><option value="admin">School administrator</option></select></label>
                <div className="request-role-note" data-testid="text-request-role"><span className="item-icon"><GraduationCap size={18} /></span><span><strong>Access is reviewed by your school</strong><small>Your role and portal access are assigned only after an administrator approves your request.</small></span></div>
                <div className="form-fields-pair">
                  <label className="field"><span>Create password</span><input data-testid="input-request-password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>
                  <label className="field"><span>Confirm password</span><input data-testid="input-request-confirm-password" type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Enter it again" /></label>
                </div>
                {(validation || failure) && <p className="form-error" role="alert" data-testid={failure ? 'error-request-submit' : 'error-request-validation'}>{failure || validation}</p>}
                <button className="button request-submit" type="submit" disabled={pending} data-testid="button-submit-request">{pending ? <><span className="button-loading" aria-hidden="true" /> Sending your request…</> : <>Send access request <ArrowRight size={17} /></>}</button>
                <p className="form-approval-note"><ShieldCheck size={15} /> Your account can be used only after administrator approval.</p>
              </form>
            )}
          </div>
          {!success && <p className="request-login-prompt">Already have a staff account? <Link href="/login" data-testid="link-request-login">Log in</Link></p>}
        </section>
      </section>
      <div className="request-mobile-footer"><Brand /><span>School work, in sync.</span></div>
    </main>
  );
}
