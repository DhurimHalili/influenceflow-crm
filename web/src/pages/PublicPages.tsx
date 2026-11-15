import { HelpGuide } from "./HelpGuide";
import { ArrowRight, Check, Copy, Eye, EyeOff, LifeBuoy, LockKeyhole, Mail } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Button, Input, Logo } from "../components/ui";
import { pwnedCount, pwnedMessage } from "../lib/pwned";

const LAST_EMAIL = "if.last-email";
const readLastEmail = () => { try { return localStorage.getItem(LAST_EMAIL) || ""; } catch { return ""; } };

// Common domain typos → suggestion ("gmial.com" → "gmail.com").
const DOMAIN_FIXES: Record<string, string> = { "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmal.com": "gmail.com", "gmail.co": "gmail.com", "gmail.con": "gmail.com", "gamil.com": "gmail.com", "hotmial.com": "hotmail.com", "hotmail.co": "hotmail.com", "outlok.com": "outlook.com", "outlook.co": "outlook.com", "yahooo.com": "yahoo.com", "yaho.com": "yahoo.com", "icloud.co": "icloud.com" };
const emailSuggestion = (email: string) => {
  const value = email.trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at < 1) return "";
  const fix = DOMAIN_FIXES[value.slice(at + 1)];
  return fix ? `${value.slice(0, at + 1)}${fix}` : "";
};

const strengthOf = (value: string) => {
  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 12) score++;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  const level = value.length < 8 ? 0 : Math.min(4, score);
  return { level, label: ["Too short", "Weak", "Fair", "Good", "Strong"][level] };
};

function PasswordField({ label, value, onChange, autoComplete, placeholder, meter = false, autoFocus = false }: { label: string; value: string; onChange: (value: string) => void; autoComplete: string; placeholder?: string; meter?: boolean; autoFocus?: boolean }) {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const strength = strengthOf(value);
  return <label className="field-wrap password-field"><span className="field-label">{label}</span><span className="password-input"><input className="field" type={show ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} onKeyUp={(event) => setCaps(event.getModifierState?.("CapsLock") ?? false)} autoComplete={autoComplete} placeholder={placeholder} autoFocus={autoFocus} required /><button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} title={show ? "Hide password" : "Show password"}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>{caps && <span className="field-hint caps-hint">Caps Lock is on</span>}{meter && value && <span className={`pw-meter level-${strength.level}`}><i><b /></i><span>{strength.label}</span></span>}</label>;
}

// The front door of a private CRM: sign in, ask to join, and a way to reach the
// owner. No marketing, no public pages — nothing here describes what's inside.
function AuthShell({ kicker, title, lead, children }: { kicker: string; title: string; lead: string; children: ReactNode }) {
  return <div className="auth-page is-private"><div className="auth-brand"><Logo inverse /><div><span><LockKeyhole size={13} aria-hidden="true" /> {kicker}</span><h1>{title}</h1><p>{lead}</p></div><small>Private · members only</small></div><main className="auth-main"><div className="auth-form">{children}<NeedHelp /></div></main></div>;
}

// The owner's address is never in the page or its code as written text, so
// scrapers reading the HTML or script files find nothing: it's put together
// only when a person asks for it.
const OWNER = [109, 111, 99, 46, 108, 105, 97, 109, 103, 64, 109, 105, 114, 117, 104, 100, 105, 108, 105, 108, 97, 104];
const ownerAddress = () => String.fromCharCode(...OWNER.slice().reverse());

function NeedHelp() {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState("");
  const [copied, setCopied] = useState(false);
  const reveal = () => setShown(ownerAddress());
  const copy = async () => { try { await navigator.clipboard.writeText(shown); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* the address is on screen to copy by hand */ } };
  return <div className={`auth-help${open ? " open" : ""}`}>
    <button type="button" className="auth-help-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}><LifeBuoy size={15} aria-hidden="true" /> Need help?</button>
    {open && <div className="auth-help-panel" role="region" aria-label="Contact the owner">
      <p>Locked out, waiting for approval, or not sure you're in the right place? Write to Dhurim, who runs this CRM.</p>
      {shown
        ? <div className="auth-help-mail"><a href={`mailto:${shown}?subject=${encodeURIComponent("InfluenceFlow access")}`}><Mail size={15} aria-hidden="true" /> {shown}</a><button type="button" onClick={() => void copy()}>{copied ? <><Check size={14} aria-hidden="true" /> Copied</> : <><Copy size={14} aria-hidden="true" /> Copy</>}</button></div>
        : <button type="button" className="auth-help-reveal" onClick={reveal}><Mail size={15} aria-hidden="true" /> Show email address</button>}
    </div>}
  </div>;
}

function AuthPage({ mode, returnTo }: { mode: "login" | "signup"; returnTo?: string }) {
  const { user, loading: authLoading, recovery, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const presetEmail = new URLSearchParams(location.search).get("email") || "";
  const [email, setEmail] = useState(() => presetEmail || (mode === "login" ? readLastEmail() : ""));
  const [password, setPassword] = useState("");
  const [error, setError] = useState<{ message: string; code?: string; attemptsLeft?: number } | null>(null);
  const [loading, setLoading] = useState(false);
  // Bot traps for sign-up: a field people never see (bots fill every field) and a
  // form sent faster than anyone can type. Either way nothing is sent and the bot
  // gets the same calm answer a person would, so it learns nothing.
  const [trap, setTrap] = useState("");
  const [openedAt] = useState(() => Date.now());
  const [held, setHeld] = useState(false);
  if (!authLoading && user) return <Navigate to={recovery ? "/update-password" : ((location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/app")} replace />;
  const suggestion = emailSuggestion(email);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(null);
    if (mode === "signup" && (trap.trim() || Date.now() - openedAt < 2500)) { setHeld(true); return; }
    setLoading(true);
    if (mode === "signup") {
      const leaks = await pwnedCount(password);
      if (leaks) { setLoading(false); setError({ message: pwnedMessage(leaks), code: "pwned" }); return; }
    }
    const result = await (mode === "login" ? signIn(email, password) : signUp(email, password));
    setLoading(false);
    if (result.error) { setError({ message: result.error, code: result.code, attemptsLeft: result.attemptsLeft }); return; }
    try { localStorage.setItem(LAST_EMAIL, email.trim().toLowerCase()); } catch { /* ignore */ }
    navigate(returnTo || (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/app", { replace: true });
  };
  const resetLink = `/forgot-password?email=${encodeURIComponent(email.trim())}`;
  return <AuthShell kicker="Private workspace" title={mode === "login" ? "Members only." : "Ask to join."} lead={mode === "login" ? "This CRM is private. Sign in with your account to continue." : "Every account is approved by hand before it can open anything."}>
    <span className="auth-kicker">{mode === "login" ? "Sign in" : "Request access"}</span><h2>{mode === "login" ? "Welcome back" : "Ask to join"}</h2><p>{mode === "login" ? "Enter the email and password you signed up with." : "Create your login. The owner approves every member by hand, and you'll get an email once you're in."}</p>
    {held ? <div className="form-note" role="status"><span>Thanks — your request is noted. You'll get an email if it's approved.</span></div> : null}
    <form onSubmit={submit} noValidate hidden={held}>
      {mode === "signup" && <label className="auth-trap" aria-hidden="true">Company website<input tabIndex={-1} autoComplete="off" value={trap} onChange={(event) => setTrap(event.target.value)} name="website" /></label>}
      <Input label="Email address" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@agency.com" required autoFocus={!email} />
      {suggestion && <button type="button" className="email-suggest" onClick={() => setEmail(suggestion)}>Did you mean <b>{suggestion}</b>?</button>}
      <PasswordField label="Password" value={password} onChange={setPassword} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "login" ? "Your password" : "At least 8 characters"} meter={mode === "signup"} autoFocus={!!email} />
      {mode === "login" && <Link className="forgot-inline" to={resetLink}>Forgot password?</Link>}
      {error && <div className={error.code === "pending" ? "form-note" : "form-error"} role={error.code === "pending" ? "status" : "alert"}><span>{error.message}{error.attemptsLeft !== undefined && error.attemptsLeft <= 3 ? ` ${error.attemptsLeft} attempt${error.attemptsLeft === 1 ? "" : "s"} left before a short lock.` : ""}</span>{(error.code === "invalid_credentials" || error.code === "locked") && <Link to={resetLink}>Reset password for {email.trim() || "this email"} →</Link>}{error.code === "exists" && <Link to={`/login?email=${encodeURIComponent(email.trim())}`}>Sign in instead →</Link>}</div>}
      <Button type="submit" size="lg" loading={loading} disabled={!email.trim() || !password}>{mode === "login" ? "Sign in" : "Request access"}<ArrowRight size={17} /></Button>
    </form>
    <p className="auth-switch">{mode === "login" ? "Not a member yet?" : "Already a member?"} <Link to={mode === "login" ? "/signup" : "/login"}>{mode === "login" ? "Ask to join" : "Sign in"}</Link></p>
  </AuthShell>;
}

export function ForgotPasswordPage() {
  const { sendPasswordReset, linkError } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState(() => new URLSearchParams(location.search).get("email") || readLastEmail());
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  const suggestion = emailSuggestion(email);
  const send = async () => {
    setError(""); setLoading(true);
    const message = await sendPasswordReset(email);
    setLoading(false);
    if (message) { setError(message); return; }
    setSentTo(email.trim().toLowerCase());
    setCooldown(60);
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void send(); };
  return <AuthShell kicker="Account recovery" title="Get back into your workspace." lead="We'll email you a secure link to choose a new password. Your workspace and data stay exactly as they are.">
    <span className="auth-kicker">Reset password</span><h2>{sentTo ? "Check your inbox" : "Forgot password"}</h2>
    {linkError && !sentTo && <div className="form-error" role="alert"><span>{linkError}</span></div>}
    {sentTo ? <div className="reset-sent">
      <p>If <b>{sentTo}</b> has an InfluenceFlow account, a reset link is on its way. It works once and expires after a short time.</p>
      <ul className="reset-tips"><li>Give it a minute, then check <b>Spam</b> / <b>Promotions</b>.</li><li>No email? Make sure this is the exact address you <b>signed up</b> with — we can't send links to addresses without an account.</li><li>Open the link in this browser if you can.</li></ul>
      <div className="reset-actions"><Button type="button" variant="secondary" onClick={() => void send()} disabled={cooldown > 0 || loading} loading={loading}>{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend link"}</Button><Button type="button" variant="ghost" onClick={() => { setSentTo(""); setError(""); }}>Use a different email</Button></div>
      {error && <div className="form-error" role="alert"><span>{error}</span></div>}
      <p className="auth-switch"><Link to={`/login?email=${encodeURIComponent(sentTo)}`}>Back to log in</Link></p>
    </div> : <><p>Enter the email you signed up with and we'll send you a reset link.</p><form onSubmit={submit} noValidate><Input label="Email address" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@agency.com" required autoFocus />{suggestion && <button type="button" className="email-suggest" onClick={() => setEmail(suggestion)}>Did you mean <b>{suggestion}</b>?</button>}{error && <div className="form-error" role="alert"><span>{error}</span></div>}<Button type="submit" size="lg" loading={loading} disabled={!email.trim()}>Send reset link<ArrowRight size={17} /></Button></form><p className="auth-switch"><Link to={`/login${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`}>Back to log in</Link></p></>}
  </AuthShell>;
}

export function UpdatePasswordPage() {
  const { user, loading: authLoading, linkError, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (pw1.length < 8) { setError("New password needs at least 8 characters."); return; }
    if (pw1 !== pw2) { setError("Passwords do not match."); return; }
    setLoading(true);
    const leaks = await pwnedCount(pw1);
    if (leaks) { setLoading(false); setError(pwnedMessage(leaks)); return; }
    const message = await updatePassword(pw1);
    setLoading(false);
    if (message) setError(message); else setDone(true);
  };
  return <AuthShell kicker="Account recovery" title="Choose a new password." lead="Pick something strong and unique — at least 8 characters. Your workspace data is untouched.">
    <span className="auth-kicker">Reset password</span><h2>{done ? "Password updated" : "New password"}</h2>
    {authLoading ? <p>Verifying your reset link…</p>
      : done ? <><p>Your new password is set and you're signed in on this device.</p><Button size="lg" onClick={() => navigate("/app", { replace: true })}>Open my workspace<ArrowRight size={17} /></Button></>
      : user ? <form onSubmit={submit} noValidate><p>Signed in as <b>{user.email}</b>.</p><PasswordField label="New password" value={pw1} onChange={setPw1} autoComplete="new-password" placeholder="At least 8 characters" meter autoFocus /><PasswordField label="Confirm password" value={pw2} onChange={setPw2} autoComplete="new-password" placeholder="Repeat it" />{pw2 && pw1 !== pw2 && <span className="field-hint error-text">Passwords don't match yet.</span>}{error && <div className="form-error" role="alert"><span>{error}</span></div>}<Button type="submit" size="lg" loading={loading} disabled={pw1.length < 8 || pw1 !== pw2}>Set new password<ArrowRight size={17} /></Button></form>
      : <><div className="form-error" role="alert"><span>{linkError || "This reset link is invalid, expired or was already used. Request a fresh one — it only takes a moment."}</span></div><p className="auth-switch"><Link to="/forgot-password">Request a new link</Link> · <Link to="/login">Back to log in</Link></p></>}
  </AuthShell>;
}

export const LoginPage = ({ returnTo }: { returnTo?: string } = {}) => <AuthPage mode="login" returnTo={returnTo} />;
export const SignupPage = () => <AuthPage mode="signup" />;

export function HelpPage() {
  return <HelpGuide />;
}

