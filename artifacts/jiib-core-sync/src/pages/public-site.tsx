import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import {
  ArrowDownRight,
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  GraduationCap,
  Menu,
  MessageCircle,
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-react';
import './public-site.css';

export type PortalRequestValues = {
  fullName: string;
  email: string;
  password: string;
  schoolSlug: string;
  requestedRole: 'admin' | 'teacher';
};

const schoolPhoto =
  'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1800&q=85';

function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={`jiib-brand${light ? ' jiib-brand--light' : ''}`}>
      <span className="jiib-brand-mark" aria-hidden="true"><GraduationCap size={22} strokeWidth={2.2} /></span>
      <span className="jiib-brand-type"><strong>JIIB</strong><small>CORE SYNC</small></span>
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
        <Link href="/" className="brand-link" aria-label="JIIB Core Sync home" data-testid="link-brand-home"><Brand /></Link>
        <button
          className="mobile-menu-toggle"
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
          data-testid="button-menu-toggle"
        >{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
        <nav className={`site-nav${menuOpen ? ' site-nav--open' : ''}`} aria-label="Main navigation">
          <a href={sectionHref('how-it-works')} onClick={() => setMenuOpen(false)}>How it works</a>
          <a href={sectionHref('school-day')} onClick={() => setMenuOpen(false)}>For your school</a>
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

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <Link href="/" className="brand-link" aria-label="JIIB Core Sync home" data-testid="link-footer-brand"><Brand light /></Link>
        <p>More time for the work that matters at school.</p>
        <div className="footer-links">
          <a href="#how-it-works">How it works</a>
          <Link href="/login" data-testid="link-footer-login">Log in</Link>
          <Link href="/signup" data-testid="link-footer-signup">Sign up</Link>
        </div>
      </div>
      <div className="footer-bottom"><span>JIIB Core Sync</span><span>Built for the everyday work of schools in Uganda.</span></div>
    </footer>
  );
}

function SectionEyebrow({ children }: { children: string }) {
  return <p className="section-eyebrow"><span />{children}</p>;
}

export function LandingPage() {
  useEffect(() => {
    document.title = 'JIIB Core Sync | A school day in sync';

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

  return (
    <main className="jiib-public">
      <SiteHeader />
      <section className="hero">
        <div className="hero-copy">
          <SectionEyebrow>One shared school workspace</SectionEyebrow>
          <h1>Good school days<br />start <em>in sync.</em></h1>
          <p className="hero-intro">From Nursery to A-Level, bring the people, information and everyday decisions of your school into one clear place.</p>
          <div className="hero-actions">
            <Link href="/signup" className="button" data-testid="link-hero-signup">Sign up for portal access <ArrowRight size={17} /></Link>
            <Link href="/login" className="text-link" data-testid="link-hero-login">Already have an account? Log in</Link>
          </div>
          <div className="hero-note"><span className="hero-note-icon"><ShieldCheck size={17} /></span><span>School access is approved by your system administrator.</span></div>
        </div>
        <div className="hero-visual">
          <img src={schoolPhoto} alt="Students learning together in a bright classroom" />
          <div className="hero-image-shade" />
          <div className="hero-photo-caption"><span className="caption-dot" /> Made for the rhythm of a real school day</div>
          <div className="photo-note">
            <span className="photo-note-icon"><MessageCircle size={18} /></span>
            <span><strong>Everyone in the loop</strong><small>School and family, kept connected</small></span>
          </div>
          <span className="hero-image-index">01 / 04</span>
        </div>
        <div className="hero-bottomline"><span>ENROLMENT · MARKS · TERMS · FAMILIES</span><a href="#how-it-works">Explore the workspace <ArrowDownRight size={16} /></a></div>
      </section>

      <section className="intro-strip" aria-label="Platform overview">
        <p>One school. Many moving parts.</p>
        <div><span><UsersRound size={17} /> People</span><b>+</b><span><BookOpenCheck size={17} /> Learning</span><b>+</b><span><MessageCircle size={17} /> Families</span><b>=</b><strong>One shared picture</strong></div>
      </section>

      <section className="section workspace-section" id="how-it-works" data-reveal>
        <div className="section-heading">
          <SectionEyebrow>Everything has its place</SectionEyebrow>
          <h2>Less chasing.<br /><em>More teaching.</em></h2>
          <p>School information is most useful when it is where the team expects it. Core Sync gives staff a steady, shared view of the work across the term.</p>
        </div>
        <div className="workspace-grid">
          <article className="workspace-item workspace-item--wide" data-reveal>
            <span className="item-number">01</span><span className="item-icon"><UsersRound size={21} /></span>
            <h3>Know your learners</h3><p>Keep enrolment details and student records together, organised by class and house.</p>
            <span className="item-foot">STUDENT RECORDS <ArrowRight size={14} /></span>
          </article>
          <article className="workspace-item workspace-item--accent" data-reveal>
            <span className="item-number">02</span><span className="item-icon"><ClipboardList size={21} /></span>
            <h3>Bring marks into view</h3><p>Give teachers a practical place to enter assessments and help leaders follow progress.</p>
            <span className="item-foot">MARKS & PROGRESS <ArrowRight size={14} /></span>
          </article>
          <article className="workspace-item workspace-item--dark" data-reveal>
            <span className="item-number">03</span><span className="item-icon"><CalendarDays size={21} /></span>
            <h3>Keep the term moving</h3><p>Coordinate academic terms, important dates and the routines that keep school life on track.</p>
            <span className="item-foot">TERMS & OPERATIONS <ArrowRight size={14} /></span>
          </article>
          <article className="workspace-item workspace-item--wide workspace-item--soft" data-reveal>
            <span className="item-number">04</span><span className="item-icon"><MessageCircle size={21} /></span>
            <h3>Make family communication feel closer</h3><p>Share school updates and support more consistent conversations between school teams and families.</p>
            <span className="item-foot">FAMILY CONNECTIONS <ArrowRight size={14} /></span>
          </article>
        </div>
      </section>

      <section className="story-section" id="school-day" data-reveal>
        <div className="story-photo">
          <img src="https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?auto=format&fit=crop&w=1100&q=85" alt="Teacher guiding a class through a lesson" loading="lazy" />
          <span className="photo-side-label">A clearer view, from class to office</span>
        </div>
        <div className="story-copy">
          <SectionEyebrow>One day, one shared record</SectionEyebrow>
          <h2>From the first bell to the last update.</h2>
          <p className="story-lead">A teacher records marks. An administrator checks how the term is shaping up. A family gets a school message. The work connects—without every detail living in a different place.</p>
          <ul className="check-list">
            <li><Check size={17} /> Staff have a clearer view of what needs attention.</li>
            <li><Check size={17} /> Student information stays organised across school levels.</li>
            <li><Check size={17} /> Families can stay informed through school communication.</li>
          </ul>
          <Link href="/signup" className="text-link text-link--arrow" data-testid="link-story-signup">See how your school can get started <ArrowRight size={16} /></Link>
        </div>
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
          <p>Staff request an account for their school. A system administrator reviews each request before access is approved—so a request is never an automatic login.</p>
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
          <details><summary>Who can request a staff account?<ChevronDown size={18} /></summary><p>Teachers and school administrators can request access using their school portal name. A system administrator must approve the request before the account can be used.</p></details>
          <details><summary>How do I find my school portal name?<ChevronDown size={18} /></summary><p>Ask your school administrator for the portal name, also called the school slug. It identifies the correct school workspace.</p></details>
          <details><summary>Can parents sign up here?<ChevronDown size={18} /></summary><p>This request form is for school staff only. The parent portal uses phone verification provided by the school.</p></details>
          <details><summary>What does Core Sync help a school coordinate?<ChevronDown size={18} /></summary><p>Student enrolment, marks, family communication, academic terms and school operations—all in one shared workspace.</p></details>
        </div>
      </section>

      <section className="final-cta" data-reveal>
        <div className="final-cta-mark"><GraduationCap size={29} /></div>
        <p className="final-kicker">A school runs on people working together.</p>
        <h2>Let the school day<br />move <em>in sync.</em></h2>
        <Link href="/signup" className="button" data-testid="link-final-signup">Request portal access <ArrowRight size={17} /></Link>
        <p className="final-login">Already on Core Sync? <Link href="/login" data-testid="link-final-login">Log in here</Link></p>
      </section>
      <Footer />
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
    document.title = 'Request portal access | JIIB Core Sync';
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
          <div className="request-aside-footer">JIIB CORE SYNC <span>·</span> BUILT FOR SCHOOL TEAMS</div>
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
