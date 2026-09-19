import { motion } from "framer-motion";
import { ArrowRight, CalendarDays, Check, ChevronRight, Code2, Contact, Database, HeartHandshake, KeyRound, LockKeyhole, Menu, MessageCircle, Plus, ShieldCheck, Sparkles, Users, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { useToast } from "../contexts/ToastContext";
import { Button, Input, Logo } from "../components/ui";

function PublicNav({ dark = false }: { dark?: boolean }) {
  const [open, setOpen] = useState(false);
  return <nav className={`public-nav ${dark ? "nav-dark" : ""}`}><Link to="/"><Logo inverse={dark} /></Link><div className={`public-links ${open ? "open" : ""}`}><Link to="/help">Help</Link><Link to="/privacy">Privacy</Link><Link to="/hire">Hire us</Link><Link to="/login">Log in</Link><Link className="nav-cta" to="/signup">Start free <ArrowRight size={14} /></Link></div><button className="public-menu" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button></nav>;
}

export function LandingPage() {
  const { user } = useAuth();
  if (user) return <Navigate to="/app" replace />;
  return <div className="public-page landing-page">
    <section className="landing-hero">
      <PublicNav dark />
      <div className="hero-image" role="img" aria-label="Abstract violet aurora artwork" />
      <div className="hero-shade" />
      <div className="hero-grain" />
      <motion.div className="hero-copy" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
        <span className="open-source"><Code2 size={14} /> Free and open source / MIT</span>
        <h1><span>InfluenceFlow</span>Run your influencers, brands, campaigns & calendar in one private workspace.</h1>
        <p>Stop juggling Notion, Sheets & scattered tools. A calm, complete CRM built for independent agencies and freelancers.</p>
        <div className="hero-actions"><Link to="/signup" className="hero-primary">Build your workspace <ArrowRight size={17} /></Link><button onClick={() => document.getElementById("system")?.scrollIntoView({ behavior: "smooth" })}>See how it works <ChevronRight size={16} /></button></div>
      </motion.div>
      <div className="hero-foot"><span>Private by design</span><span>Your data. Your workflow. Your clients.</span></div>
    </section>

    <section className="public-section system-section" id="system">
      <div className="section-kicker">One connected system</div><h2>Move deals forward, without losing the human thread.</h2><p className="section-lead">InfluenceFlow keeps every relationship, conversation, deadline and dollar in context, from first outreach to final payout.</p>
      <div className="info-grid">
        <motion.article whileHover={{ y: -5 }}><span>01</span><div className="info-icon"><Users /></div><h3>Know your roster</h3><p>Compare creators by engagement, platform, niche and performance. Move them through a pipeline that stays current.</p><Link to="/signup">Organize influencers <ArrowRight size={15} /></Link></motion.article>
        <motion.article whileHover={{ y: -5 }}><span>02</span><div className="info-icon"><HeartHandshake /></div><h3>Close with confidence</h3><p>Keep brands, contacts, deliverables, payment math and creator assignments connected to every campaign.</p><Link to="/signup">Manage partnerships <ArrowRight size={15} /></Link></motion.article>
        <motion.article whileHover={{ y: -5 }}><span>03</span><div className="info-icon"><CalendarDays /></div><h3>Stay ahead</h3><p>See meetings, follow-ups, deadlines and stale deals before they become missed opportunities.</p><Link to="/signup">Own your schedule <ArrowRight size={15} /></Link></motion.article>
      </div>
    </section>

    <section className="privacy-band">
      <div className="privacy-visual"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><span><LockKeyhole /></span></div>
      <div className="privacy-copy"><span className="section-kicker">A private operating system</span><h2>Your relationships are your advantage. Keep them yours.</h2><p>Every hosted workspace is isolated by Postgres row-level security. Or self-host the open-source project on your own Supabase account for total control.</p><ul><li><ShieldCheck /> Per-user access enforced at the database</li><li><Database /> Exportable CSV and versioned JSON backups</li><li><KeyRound /> No shared sheets, ad tracking, or data resale</li></ul><Link to="/privacy">Read the privacy promise <ArrowRight size={15} /></Link></div>
    </section>

    <section className="public-cta"><Sparkles /><h2>Your next great partnership should not get lost in a spreadsheet.</h2><p>Start free. Import what you have. Build a workspace that feels like your agency.</p><Link to="/signup">Start your private workspace <ArrowRight size={17} /></Link></section>
    <PublicFooter />
  </div>;
}

function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  if (user) return <Navigate to="/app" replace />;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setLoading(true);
    const message = await (mode === "login" ? signIn(email, password) : signUp(email, password));
    setLoading(false);
    if (message) setError(message); else navigate("/app");
  };
  return <div className="auth-page"><div className="auth-brand"><Link to="/"><Logo inverse /></Link><div><span>{mode === "login" ? "Welcome back" : "Your agency, in flow"}</span><h1>{mode === "login" ? "Pick up where the relationship left off." : "Build a calmer way to run partnerships."}</h1><p>Private, focused, and designed around the work that moves creator businesses forward.</p></div><small>InfluenceFlow / Open source under MIT</small></div><main className="auth-main"><div className="auth-form"><span className="auth-kicker">{mode === "login" ? "Sign in" : "Create your workspace"}</span><h2>{mode === "login" ? "Welcome back" : "Start free"}</h2><p>{mode === "login" ? "Enter your workspace credentials." : "No credit card. Your data stays portable."}</p><form onSubmit={submit}><Input label="Email address" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@agency.com" required /><Input label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" minLength={6} required />{error && <div className="form-error">{error}</div>}<Button type="submit" size="lg" loading={loading}>{mode === "login" ? "Open workspace" : "Create private workspace"}<ArrowRight size={17} /></Button></form>{mode === "login" && <p className="auth-switch"><Link to="/forgot-password">Forgot your password?</Link></p>}<p className="auth-switch">{mode === "login" ? "New to InfluenceFlow?" : "Already have a workspace?"} <Link to={mode === "login" ? "/signup" : "/login"}>{mode === "login" ? "Create one" : "Log in"}</Link></p><small>By continuing you agree to our <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.</small></div></main></div>;
}

export function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setLoading(true);
    const message = await sendPasswordReset(email);
    setLoading(false);
    if (message) setError(message); else setSent(true);
  };
  return <div className="auth-page"><div className="auth-brand"><Link to="/"><Logo inverse /></Link><div><span>Account recovery</span><h1>Get back into your workspace.</h1><p>We will email you a secure sign-in link to set a new password.</p></div><small>InfluenceFlow / Open source under MIT</small></div><main className="auth-main"><div className="auth-form"><span className="auth-kicker">Reset password</span><h2>Forgot password</h2>{sent ? <><p>Check your inbox. If an account exists for {email.trim()}, a reset link is on its way. Use it promptly — links expire automatically.</p><p className="auth-switch"><Link to="/login">Back to log in</Link></p></> : <><p>Enter your account email and we will send you a reset link.</p><form onSubmit={submit}><Input label="Email address" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@agency.com" required />{error && <div className="form-error">{error}</div>}<Button type="submit" size="lg" loading={loading}>Send reset link<ArrowRight size={17} /></Button></form><p className="auth-switch"><Link to="/login">Back to log in</Link></p></>}<small>By continuing you agree to our <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.</small></div></main></div>;
}

export function UpdatePasswordPage() {
  const { user, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"verifying" | "ready" | "invalid" | "done">("verifying");
  const [detail, setDetail] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const verified = useRef(false);
  useEffect(() => {
    if (verified.current) return;
    verified.current = true;
    let cancelled = false;
    const run = async () => {
      const hash = window.location.hash || "";
      const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
      const code = new URLSearchParams(query).get("code");
      if (!code) {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session || user) setStatus("ready");
        else { setStatus("invalid"); setDetail("This reset link is invalid or has already been used. Request a new one below."); }
        return;
      }
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (cancelled) return;
      if (error) { setStatus("invalid"); setDetail(error.message); }
      else setStatus("ready");
    };
    void run();
    return () => { cancelled = true; };
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (pw1.length < 8) { setError("New password needs at least 8 characters."); return; }
    if (pw1 !== pw2) { setError("Passwords do not match."); return; }
    setLoading(true);
    const message = await updatePassword(pw1);
    setLoading(false);
    if (message) setError(message); else setStatus("done");
  };
  return <div className="auth-page"><div className="auth-brand"><Link to="/"><Logo inverse /></Link><div><span>Account recovery</span><h1>Choose a new password.</h1><p>Pick something strong and unique — at least 8 characters.</p></div><small>InfluenceFlow / Open source under MIT</small></div><main className="auth-main"><div className="auth-form"><span className="auth-kicker">Reset password</span><h2>New password</h2>{status === "verifying" && <p>Verifying your reset link…</p>}{status === "invalid" && <><div className="form-error">{detail}</div><p className="auth-switch"><Link to="/forgot-password">Request a new link</Link></p></>}{status === "ready" && <form onSubmit={submit}><Input label="New password" type="password" value={pw1} onChange={(event) => setPw1(event.target.value)} placeholder="At least 8 characters" minLength={8} required /><Input label="Confirm password" type="password" value={pw2} onChange={(event) => setPw2(event.target.value)} placeholder="Repeat it" minLength={8} required />{error && <div className="form-error">{error}</div>}<Button type="submit" size="lg" loading={loading}>Set new password<ArrowRight size={17} /></Button></form>}{status === "done" && <><p>Your password is set. You are back in.</p><Button size="lg" onClick={() => navigate("/app")}>Open my workspace<ArrowRight size={17} /></Button></>}</div></main></div>;
}

export const LoginPage = () => <AuthPage mode="login" />;
export const SignupPage = () => <AuthPage mode="signup" />;

export function PublicFooter() {
  return <footer className="public-footer"><div><Logo /><p>Open infrastructure for independent influence.</p></div><div><span>Product</span><Link to="/help">Help & setup</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></div><div><span>Creator</span><a href="https://dhurimhalili.com" target="_blank" rel="noreferrer">Portfolio</a><a href="https://wa.me/38349878908" target="_blank" rel="noreferrer">WhatsApp</a><a href="https://linkedin.com" target="_blank" rel="noreferrer">LinkedIn</a></div><div className="footer-built">Built by <strong>Dhurim Halili</strong><span>MIT licensed / 2026</span></div></footer>;
}

const legalContent: Record<string, { label: string; title: string; intro: string; sections: { title: string; body: string }[] }> = {
  privacy: { label: "Privacy promise", title: "Your workspace belongs to you.", intro: "InfluenceFlow is designed to collect less, isolate every workspace, and keep your data portable.", sections: [
    { title: "What we store", body: "Your account email, profile settings, and the CRM records you choose to add. We do not sell personal information or use workspace data for advertising." },
    { title: "How access works", body: "Hosted data is protected by Supabase authentication and PostgreSQL row-level security. Policies restrict every record to its user_id owner." },
    { title: "Your control", body: "Export influencers, brands, contacts, and campaigns as CSV, or download a complete versioned JSON backup. Archived records can be restored or permanently removed." },
    { title: "Self-hosting", body: "The project is MIT licensed. You can deploy the app and database migrations to infrastructure you control." },
  ] },
  terms: { label: "Plain-language terms", title: "Use InfluenceFlow responsibly.", intro: "These terms keep the open-source product useful and sustainable. They are not a substitute for your own client agreements.", sections: [
    { title: "The service", body: "InfluenceFlow is provided as-is without a guarantee of uninterrupted availability. You are responsible for validating critical records and maintaining backups." },
    { title: "Your content", body: "You retain ownership of content entered into your workspace. You must have permission to store contact and campaign information." },
    { title: "Acceptable use", body: "Do not use the product to violate privacy laws, send abusive outreach, compromise other accounts, or operate unlawful campaigns." },
    { title: "Open-source license", body: "Source code is available under the MIT license. Third-party services and packages retain their respective terms." },
  ] },
};

export function LegalPage({ type }: { type: "privacy" | "terms" }) {
  const content = legalContent[type];
  return <div className="public-page inner-public"><PublicNav /><header className="legal-hero"><span>{content.label}</span><h1>{content.title}</h1><p>{content.intro}</p></header><main className="legal-content">{content.sections.map((section, index) => <section key={section.title}><span>0{index + 1}</span><div><h2>{section.title}</h2><p>{section.body}</p></div></section>)}<p className="legal-date">Last updated March 2026. Questions? <a href="mailto:hello@influenceflow.app">Contact us.</a></p></main><PublicFooter /></div>;
}

export function HelpPage({ embedded = false }: { embedded?: boolean }) {
  const content = <><header className="help-hero"><span>InfluenceFlow field guide</span><h1>From scattered notes to a working CRM in three steps.</h1><p>Set up your database, bring in your relationships, and make the daily workflow yours.</p></header><main className="help-content">
    <section className="three-steps"><article><b>1</b><h2>Connect</h2><p>Create a Supabase project, then run every migration in <code>supabase/migrations</code> in order.</p></article><article><b>2</b><h2>Configure</h2><p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then run <code>npm install</code> and <code>npm run dev</code>.</p></article><article><b>3</b><h2>Move in</h2><p>Import a CSV or start clean. Set your theme and reminder preference, then create your first campaign.</p></article></section>
    <section className="guide-sections"><Guide title="CSV import" icon={<Database />}><p>Use columns for name, email, channel, niche, platform, average views, engagement rate, status, and notes. The preview flags invalid email, URL, numeric, and duplicate rows before anything is saved.</p></Guide><Guide title="Backups & conflicts" icon={<ShieldCheck />}><p>Settings exports a versioned JSON v2 backup. Import validates the schema and shows a record summary. Name and channel duplicates are normalized before confirmation.</p></Guide><Guide title="Calendar & reminders" icon={<CalendarDays />}><p>Link meetings to any creator, brand, or campaign. Browser alerts fire at remind_at while the app is open. Choose browser, email, both, or off in Settings.</p></Guide><Guide title="Themes" icon={<Sparkles />}><p>Agency, Light, Dark, Honey, and Ocean each have a distinct workspace atmosphere. Your choice persists with the profile and falls back locally.</p></Guide><Guide title="Privacy" icon={<LockKeyhole />}><p>All workspace tables include user_id and RLS policies based on auth.uid(). Soft deletes use archived_at, and activity entries are append-only.</p></Guide><Guide title="GitHub Pages" icon={<Code2 />}><p>The app uses HashRouter so deep links work on static hosts. Build with <code>npm run build</code>, publish <code>dist</code>, and keep environment variables in your deployment settings.</p></Guide></section>
    <section className="faq"><span>Common questions</span><h2>FAQ</h2>{[{ q: "Can I self-host it?", a: "Yes. The app is MIT licensed and the Supabase schema ships with the project." }, { q: "Can teammates share one workspace?", a: "The current model is private per user. A team membership model is a natural extension for self-hosted deployments." }, { q: "How are duplicates handled?", a: "Trimmed, case-insensitive names and normalized channel links or domains trigger a review flow. Merge preserves linked campaigns and meetings." }, { q: "Does archiving remove data?", a: "No. Archived records live in the unified Trash until restored or permanently deleted." }, { q: "What counts as a lost deal?", a: "Only records that reached Replied or beyond and were then marked Denied (campaigns: Cancelled). Rejecting untouched leads or cold threads never inflates the number. When a live deal dies you can tag why in one tap — or skip." }].map((item) => <details key={item.q}><summary>{item.q}<Plus /></summary><p>{item.a}</p></details>)}</section>
  </main></>;
  if (embedded) return <div className="embedded-help">{content}</div>;
  return <div className="public-page inner-public"><PublicNav />{content}<PublicFooter /></div>;
}

function Guide({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) { return <article><span>{icon}</span><div><h3>{title}</h3>{children}</div></article>; }

export function HirePage({ embedded = false }: { embedded?: boolean }) {
  const { toast } = useToast();
  const location = useLocation();
  const appMode = embedded || location.pathname.startsWith("/app");
  const content = <><header className="hire-hero"><span>Built by Dhurim Halili</span><h1>Make your internal tools feel like an unfair advantage.</h1><p>I help focused teams turn messy operations into clear, useful software, from product strategy through a production-ready build.</p><div><a className="hire-primary" href="https://wa.me/38349878908" target="_blank" rel="noreferrer"><MessageCircle /> Start on WhatsApp</a><a href="https://linkedin.com" target="_blank" rel="noreferrer"><Contact /> Connect on LinkedIn</a></div></header><section className="hire-services"><span>Ways to work together</span><div><article><b>01</b><h2>Product clarity</h2><p>Workflow mapping, information architecture, and a practical product specification your team can execute.</p></article><article><b>02</b><h2>Custom systems</h2><p>Polished CRM, operations, and client portals built around the work you actually do.</p></article><article><b>03</b><h2>Design direction</h2><p>A distinctive interface system with responsive behavior, motion, and high-trust UX.</p></article></div></section><section className="hire-contact"><h2>Have something specific in mind?</h2><p>Send a short note about the workflow, who uses it, and what is getting in the way.</p><button onClick={() => { void navigator.clipboard?.writeText("+38349878908"); toast("WhatsApp number copied"); }}><Check /> Copy +383 49 878 908</button></section></>;
  if (appMode) return <div className="embedded-hire">{content}</div>;
  return <div className="public-page inner-public hire-page"><PublicNav />{content}<PublicFooter /></div>;
}