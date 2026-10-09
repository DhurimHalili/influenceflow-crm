import { AlertTriangle, Bell, Building, Check, ChevronRight, LogOut, MonitorX, FileText, Gauge, Pencil, Plus, Database, Download, FileJson, HardDriveDownload, LockKeyhole, RefreshCcw, RotateCcw, Save, ShieldCheck, Sparkles, Trash2, Upload, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Avatar, Button, EmptyState, Input, Modal, PageHeader, Select, Tabs } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useData } from "../contexts/DataContext";
import { useToast } from "../contexts/ToastContext";
import { CURRENCIES } from "../lib/prefs";
import { creatorScore, money, dateLabel, DEFAULT_RATING_WEIGHTS, download, normalize, RATING_DIMS, ratingScore, resolveWeights, TEMPLATE_TOKENS, toCSV, uid, weightShares, type RatingWeightsValue } from "../lib/utils";
import { Stars, Textarea } from "../components/ui";
import type { EmailTemplate, ThemeName, WorkspaceData } from "../types";

const WEIGHT_HELP: Record<string, string> = {
  audience: "Decides whether the brand's buyers are even watching. The #1 factor in most agency scorecards.",
  niche: "Content and tone that match the product make the message land and keep the brand safe.",
  engagement: "Quality of attention — and the best signal for bought followers.",
  consistency: "Reliability: posts on schedule, delivers on time. Easiest gap to manage with a brief.",
};

function ScoringSettings() {
  const data = useData();
  const { toast } = useToast();
  const saved = resolveWeights(data.profile.rating_weights);
  const [weights, setWeights] = useState<RatingWeightsValue>(saved);
  useEffect(() => setWeights(resolveWeights(data.profile.rating_weights)), [data.profile.rating_weights]);
  const shares = weightShares(weights);
  const custom = !!data.profile.rating_weights;
  const dirty = (Object.keys(weights) as (keyof RatingWeightsValue)[]).some((k) => weights[k] !== saved[k]);
  const sample = { stars_demographics: 5, stars_niche: 4, stars_engagement: 2, stars_consistency: 3 };
  const rated = data.creators.filter((c) => !c.archived_at && RATING_DIMS.some((d) => (c[d.key] || 0) > 0));
  const changed = rated.filter((c) => Math.round(creatorScore(c, weights) * 10) !== Math.round(creatorScore(c, data.profile.rating_weights) * 10)).length;
  return <section id="scoring" className="settings-section"><div className="settings-heading"><span><Gauge /></span><div><h2>Creator scoring</h2><p>How the four evaluation stars combine into each influencer's overall rating.</p></div></div><div className="settings-body">
    <div className="weight-list">{RATING_DIMS.map((dim) => <div className="weight-row" key={dim.key}><div><strong>{dim.label}</strong><small>{WEIGHT_HELP[dim.weight]}</small></div><input type="range" min={0} max={60} step={5} value={weights[dim.weight]} onChange={(event) => setWeights({ ...weights, [dim.weight]: Number(event.target.value) })} aria-label={`${dim.label} weight`} /><b>{shares[dim.weight]}%</b></div>)}</div>
    <div className="weight-example"><span>Example: Audience 5★ · Brand fit 4★ · Engagement 2★ · Consistency 3★</span><span>Overall <Stars value={ratingScore(sample, weights)} showValue /> <small>(a plain average would say {((5 + 4 + 2 + 3) / 4).toFixed(1)})</small></span></div>
    <p className="settings-note">Set a factor to 0% if it doesn't matter for your agency — it then never moves the score. Unrated factors are always left out rather than counted as zero.{dirty && rated.length ? ` Saving re-scores ${changed} of your ${rated.length} rated influencers.` : ""}</p>
    <div className="settings-actions"><Button disabled={!dirty} onClick={() => { data.updateProfile({ rating_weights: weights }); toast("Scoring weights saved — every influencer re-scored"); }}><Save size={15} /> Save weights</Button><Button variant="ghost" disabled={!custom && !dirty} onClick={() => { setWeights(DEFAULT_RATING_WEIGHTS); data.updateProfile({ rating_weights: null }); toast("Back to market-standard weights (35 / 30 / 20 / 15)"); }}><RotateCcw size={15} /> Market defaults</Button></div>
  </div></section>;
}

const STARTER_TEMPLATES: Omit<EmailTemplate, "id">[] = [
  { name: "First outreach — creator", subject: "Paid partnership idea for {name}", body: "Hi {first_name},\n\nI've been following your {niche} content on {platform} and love how engaged your community is.\n\nI'm {my_name} and I run creator partnerships at our agency — we're putting together a campaign that feels like a natural fit for your channel. Budget is confirmed and the brief is flexible around your style.\n\nWould you be open to a quick call this week, or should I send the details over email?\n\nBest,\n{my_name}" },
  { name: "Follow-up (no reply)", subject: "Re: Paid partnership idea for {name}", body: "Hi {first_name},\n\nJust floating this back to the top of your inbox — happy to share budget and timing so you can decide quickly.\n\nIf now isn't the right time, no worries at all; just let me know and I won't chase.\n\nBest,\n{my_name}" },
  { name: "Brand pitch", subject: "Creators for {company}'s next campaign", body: "Hi {first_name},\n\nWe manage a roster of vetted creators in your space and have a few who fit {company}'s audience closely — strong engagement, brand-safe content, and proven conversions.\n\nCould I send over a short shortlist with rates and recent results?\n\nBest,\n{my_name}" },
];

function TemplateSettings() {
  const data = useData();
  const { toast } = useToast();
  const templates = data.profile.email_templates || [];
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const saveAll = (next: EmailTemplate[], message: string) => { data.updateProfile({ email_templates: next }); toast(message); };
  return <section id="templates" className="settings-section"><div className="settings-heading"><span><FileText /></span><div><h2>Email templates</h2><p>Reusable outreach emails. Apply one from any influencer or brand profile — tokens fill in automatically.</p></div></div><div className="settings-body">
    {templates.length ? <div className="template-list">{templates.map((t) => <div className="template-row" key={t.id}><div><strong>{t.name}</strong><small>{t.subject || "No subject"}</small></div><button className="icon-btn" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`} title="Edit"><Pencil size={15} /></button><button className="icon-btn danger" onClick={() => { if (confirm(`Delete template "${t.name}"?`)) saveAll(templates.filter((x) => x.id !== t.id), "Template deleted"); }} aria-label={`Delete ${t.name}`} title="Delete"><Trash2 size={15} /></button></div>)}</div> : <EmptyState title="No templates yet" text="Start from proven starters, or write a draft on any profile and click Save as template." action={<Button variant="secondary" onClick={() => saveAll(STARTER_TEMPLATES.map((t) => ({ ...t, id: uid() })), "3 starter templates added")}><Sparkles size={15} /> Add starter templates</Button>} />}
    <div className="settings-actions"><Button variant="secondary" onClick={() => setEditing({ id: "", name: "", subject: "", body: "" })}><Plus size={15} /> New template</Button><span className="settings-note">Tokens: {TEMPLATE_TOKENS.join(" ")}</span></div>
    <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit template" : "New template"} wide>{editing && <div className="entity-form"><Input label="Template name" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} placeholder="First outreach — creator" autoFocus /><Input label="Subject" value={editing.subject} onChange={(event) => setEditing({ ...editing, subject: event.target.value })} /><Textarea label="Body" rows={10} value={editing.body} onChange={(event) => setEditing({ ...editing, body: event.target.value })} hint={`Tokens: ${TEMPLATE_TOKENS.join(" ")}`} /><div className="modal-actions"><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button disabled={!editing.name.trim()} onClick={() => { const value = { ...editing, name: editing.name.trim() }; saveAll(editing.id ? templates.map((t) => (t.id === editing.id ? value : t)) : [...templates, { ...value, id: uid() }], editing.id ? "Template updated" : "Template saved"); setEditing(null); }}>Save template</Button></div></div>}</Modal>
  </div></section>;
}

const SECTIONS = [
  { id: "profile", label: "Profile & agency", icon: UserRound },
  { id: "security", label: "Account & security", icon: LockKeyhole },
  { id: "workspace", label: "Workspace", icon: Building },
  { id: "reminders", label: "Notifications", icon: Bell },
  { id: "scoring", label: "Creator scoring", icon: Gauge },
  { id: "templates", label: "Email templates", icon: FileText },
  { id: "data", label: "Data & backup", icon: Database },
  { id: "danger", label: "Danger zone", icon: AlertTriangle },
];

// Sticky section nav that highlights the section currently on screen.
function SettingsNav() {
  const [active, setActive] = useState("profile");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-90px 0px -55% 0px" },
    );
    SECTIONS.forEach((section) => {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);
  return <nav className="settings-nav" aria-label="Settings sections">{SECTIONS.map((section) => <a key={section.id} href={`#${section.id}`} className={`${active === section.id ? "active" : ""}${section.id === "danger" ? " danger" : ""}`} onClick={(event) => { event.preventDefault(); setActive(section.id); document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}><section.icon /> {section.label} <ChevronRight /></a>)}</nav>;
}

function ProfileSettings() {
  const data = useData(); const { user } = useAuth(); const { toast } = useToast();
  const prefs = data.profile.preferences;
  const [name, setName] = useState(data.profile.display_name);
  const [agency, setAgency] = useState(prefs.agency_name);
  const [signature, setSignature] = useState(prefs.email_signature);
  useEffect(() => { setName(data.profile.display_name); setAgency(prefs.agency_name); setSignature(prefs.email_signature); }, [data.profile.display_name, prefs.agency_name, prefs.email_signature]);
  const dirty = name.trim() !== data.profile.display_name || agency.trim() !== prefs.agency_name || signature !== prefs.email_signature;
  const save = () => { data.updateProfile({ display_name: name.trim(), preferences: { ...prefs, agency_name: agency.trim(), email_signature: signature } }); toast("Profile saved"); };
  const suggested = `Best,\n${name.trim() || "Your name"}\n${agency.trim() || "Your agency"}${user?.email ? `\n${user.email}` : ""}`;
  return <section id="profile" className="settings-section"><div className="settings-heading"><span><UserRound /></span><div><h2>Profile & agency</h2><p>How you appear inside the workspace and in the emails you send.</p></div></div><div className="settings-body">
    <div className="profile-card"><Avatar name={name || user?.email || "IF"} size="lg" /><div><strong>{name || "Add your name"}</strong><span>{agency || "Add your agency name"}</span><small>{user?.email}</small></div></div>
    <div className="form-grid"><Input label="Your name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex Morgan" hint="Fills {my_name} in email templates" /><Input label="Agency name" value={agency} onChange={(event) => setAgency(event.target.value)} placeholder="Northstar Talent" hint="Fills {agency} in email templates" /></div>
    <Textarea label="Email signature" rows={4} value={signature} onChange={(event) => setSignature(event.target.value)} placeholder={suggested} hint="Use {signature} in a draft or template to drop it in." />
    {!signature.trim() && <button type="button" className="text-link" onClick={() => setSignature(suggested)}>Use a suggested signature</button>}
    <div className="settings-actions"><Button disabled={!dirty || !name.trim()} onClick={save}><Save size={15} /> {dirty ? "Save profile" : "Saved"}</Button></div>
  </div></section>;
}

const passwordStrength = (value: string) => {
  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 12) score++;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  const level = value.length < 8 ? 0 : Math.min(4, score);
  return { level, label: ["Too short", "Weak", "Fair", "Good", "Strong"][level] };
};

function SecuritySettings() {
  const { user, updatePassword, signOut, sendPasswordReset } = useAuth(); const data = useData(); const { toast } = useToast(); const navigate = useNavigate();
  const [pw1, setPw1] = useState(""); const [pw2, setPw2] = useState(""); const [show, setShow] = useState(false); const [busy, setBusy] = useState("");
  const strength = passwordStrength(pw1);
  const changePassword = async () => {
    if (pw1.length < 8) return toast("New password needs at least 8 characters", "error");
    if (pw1 !== pw2) return toast("Passwords do not match", "error");
    setBusy("password");
    const message = await updatePassword(pw1);
    setBusy("");
    if (message) toast(message, "error");
    else { setPw1(""); setPw2(""); toast("Password updated"); }
  };
  const leave = async (opts?: { everywhere?: boolean; clearDevice?: boolean }) => {
    setBusy(opts?.everywhere ? "everywhere" : opts?.clearDevice ? "clear" : "signout");
    const synced = await data.flushAndWait();
    if (!synced && !confirm("Some recent changes haven't reached the cloud yet. Sign out anyway?")) { setBusy(""); return; }
    await signOut(opts);
    navigate("/login", { replace: true });
    toast(opts?.everywhere ? "Signed out on every device" : "Signed out");
  };
  const fmt = (value?: string | null) => (value ? new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—");
  return <section id="security" className="settings-section"><div className="settings-heading"><span><LockKeyhole /></span><div><h2>Account & security</h2><p>Sign-in details, password and active sessions.</p></div></div><div className="settings-body">
    <div className="account-facts"><div><small>Email</small><strong>{user?.email || "—"}</strong></div><div><small>Last sign-in</small><strong>{fmt(user?.last_sign_in_at)}</strong></div><div><small>Member since</small><strong>{fmt(user?.created_at)}</strong></div></div>
    <div className="settings-subsection"><h3>Change password</h3><div className="form-grid"><Input label="New password" type={show ? "text" : "password"} value={pw1} onChange={(event) => setPw1(event.target.value)} placeholder="At least 8 characters" minLength={8} autoComplete="new-password" /><Input label="Confirm password" type={show ? "text" : "password"} value={pw2} onChange={(event) => setPw2(event.target.value)} placeholder="Repeat it" autoComplete="new-password" error={pw2 && pw1 !== pw2 ? "Passwords don't match" : ""} /></div>
      {pw1 && <div className={`pw-meter level-${strength.level}`}><i><b /></i><span>{strength.label}</span></div>}
      <div className="settings-actions"><Button variant="secondary" loading={busy === "password"} disabled={pw1.length < 8 || pw1 !== pw2} onClick={changePassword}>Update password</Button><label className="inline-check"><input type="checkbox" checked={show} onChange={(event) => setShow(event.target.checked)} /> Show passwords</label><button type="button" className="text-link" onClick={async () => { if (!user?.email) return; const message = await sendPasswordReset(user.email); toast(message || "Reset link sent to your email", message ? "error" : "success"); }}>Email me a reset link instead</button></div></div>
    <div className="settings-subsection"><h3>Sessions</h3><div className="session-actions">
      <button onClick={() => void leave()} disabled={!!busy}><LogOut /><span><strong>{busy === "signout" ? "Signing out…" : "Sign out"}</strong><small>End the session on this device.</small></span><ChevronRight /></button>
      <button onClick={() => void leave({ clearDevice: true })} disabled={!!busy}><MonitorX /><span><strong>{busy === "clear" ? "Signing out…" : "Sign out & clear this device"}</strong><small>Also removes the cached workspace from this browser.</small></span><ChevronRight /></button>
      <button className="danger" onClick={() => { if (confirm("Sign out on every device, including this one?")) void leave({ everywhere: true }); }} disabled={!!busy}><ShieldCheck /><span><strong>{busy === "everywhere" ? "Signing out…" : "Sign out everywhere"}</strong><small>Revokes every active session — use it if a device was lost.</small></span><ChevronRight /></button>
    </div></div>
  </div></section>;
}

function WorkspaceSettings() {
  const data = useData(); const { toast } = useToast();
  const prefs = data.profile.preferences;
  const [pct, setPct] = useState(String(prefs.default_creator_percent));
  useEffect(() => setPct(String(prefs.default_creator_percent)), [prefs.default_creator_percent]);
  const set = (value: Partial<typeof prefs>, message: string) => { data.updateProfile({ preferences: { ...prefs, ...value } }); toast(message); };
  const pctNum = Number(pct);
  const pctValid = pct !== "" && pctNum >= 0 && pctNum <= 100;
  return <section id="workspace" className="settings-section"><div className="settings-heading"><span><Building /></span><div><h2>Workspace</h2><p>Defaults that shape money, deals and where you land.</p></div></div><div className="settings-body">
    <div className="form-grid">
      <Select label="Currency" value={prefs.currency} onChange={(event) => set({ currency: event.target.value as typeof prefs.currency }, `Currency set to ${event.target.value} — every amount now shows in it`)}>{CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select>
      <Select label="Open the app on" value={prefs.start_page} onChange={(event) => set({ start_page: event.target.value as typeof prefs.start_page }, "Start page saved")}><option value="dashboard">Dashboard</option><option value="influencers">Influencers</option><option value="calendar">Calendar</option></Select>
      <div className="field-wrap"><Input label="Default creator payout (%)" type="number" min={0} max={100} value={pct} onChange={(event) => setPct(event.target.value)} onBlur={() => { if (pctValid && pctNum !== prefs.default_creator_percent) set({ default_creator_percent: pctNum }, `New campaigns default to ${pctNum}% for the creator`); }} error={pctValid ? "" : "Enter 0–100"} hint={pctValid ? `On a ${money(10000)} deal: creator ${money(100 * pctNum)}, agency keeps ${money(10000 - 100 * pctNum)}` : ""} /></div>
      <div className="field-wrap"><span className="field-label">Theme</span><div className="theme-chips">{(["agency", "light", "dark", "honey", "ocean"] as ThemeName[]).map((t) => <button key={t} type="button" className={data.profile.theme === t ? "active" : ""} onClick={() => { data.updateProfile({ theme: t }); toast(`${t[0].toUpperCase()}${t.slice(1)} theme on`); }}><i className={`theme-swatch swatch-${t}`} />{t[0].toUpperCase() + t.slice(1)}</button>)}</div></div>
    </div>
  </div></section>;
}

function NotificationSettings() {
  const data = useData(); const { toast } = useToast();
  const prefs = data.profile.preferences;
  const [permission, setPermission] = useState(() => ("Notification" in window ? Notification.permission : "unsupported"));
  return <section id="reminders" className="settings-section"><div className="settings-heading"><span><Bell /></span><div><h2>Notifications</h2><p>How meeting reminders and due actions reach you.</p></div></div><div className="settings-body">
    <div className={`permission-banner perm-${permission}`}><Bell size={16} /><span><strong>Browser notifications: {permission === "granted" ? "on" : permission === "denied" ? "blocked" : permission === "unsupported" ? "not supported" : "not enabled"}</strong><small>{permission === "denied" ? "Allow notifications for this site in your browser's site settings." : permission === "granted" ? "Alerts arrive while InfluenceFlow is open in a tab." : "Enable them to get reminders and the daily action summary."}</small></span>{permission === "default" && <Button size="sm" onClick={async () => { const result = await Notification.requestPermission(); setPermission(result); toast(result === "granted" ? "Notifications enabled" : "Permission not granted", result === "granted" ? "success" : "info"); }}>Enable</Button>}{permission === "granted" && <Button size="sm" variant="secondary" onClick={() => { new Notification("InfluenceFlow", { body: "Test notification — reminders are working.", icon: "./favicon.svg" }); }}>Send test</Button>}</div>
    <div className="reminder-options">{(["browser", "email", "both", "off"] as const).map((option) => <button className={data.profile.reminder_prefs === option ? "selected" : ""} key={option} onClick={() => { data.updateProfile({ reminder_prefs: option }); toast(`Reminders set to ${option}`); }}><span>{option === "browser" ? "Browser" : option === "email" ? "Email" : option === "both" ? "Browser + email" : "Off"}</span><small>{option === "browser" ? "Alerts while the app is open" : option === "email" ? "Requires a configured email function" : option === "both" ? "Use every configured channel" : "No meeting reminders"}</small>{data.profile.reminder_prefs === option && <Check />}</button>)}</div>
    <label className="toggle-row"><span><strong>Daily action summary</strong><small>Once a day after 8:00, one alert listing actions due today and overdue.</small></span><input type="checkbox" role="switch" checked={prefs.action_digest} onChange={(event) => { data.updateProfile({ preferences: { ...prefs, action_digest: event.target.checked } }); toast(event.target.checked ? "Daily summary on" : "Daily summary off"); }} /></label>
  </div></section>;
}

function DangerZone({ onExport }: { onExport: () => void }) {
  const data = useData(); const { toast } = useToast();
  const [open, setOpen] = useState(false); const [typed, setTyped] = useState("");
  const total = data.creators.length + data.brands.length + data.campaigns.length + data.meetings.length;
  return <section id="danger" className="settings-section danger-zone"><div className="settings-heading"><span><AlertTriangle /></span><div><h2>Danger zone</h2><p>Irreversible actions. Export a backup first.</p></div></div><div className="settings-body">
    <div className="danger-row"><div><strong>Reset workspace</strong><small>Permanently deletes all {data.creators.length} influencers, {data.brands.length} brands, {data.campaigns.length} campaigns, {data.meetings.length} calendar entries, notes and history. Your account, settings and templates stay.</small></div><Button variant="danger" disabled={!total} onClick={() => { setTyped(""); setOpen(true); }}>Reset workspace</Button></div>
    <Modal open={open} onClose={() => setOpen(false)} title="Reset workspace?" description="This permanently deletes every record in this workspace, on every device. It cannot be undone.">
      <div className="entity-form"><Button variant="secondary" onClick={onExport}><Download size={15} /> Download a backup first</Button><Input label='Type RESET to confirm' value={typed} onChange={(event) => setTyped(event.target.value)} autoFocus /><div className="modal-actions"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" disabled={typed !== "RESET"} onClick={() => { data.resetWorkspace(); setOpen(false); toast("Workspace reset"); }}>Delete everything</Button></div></div>
    </Modal>
  </div></section>;
}

export function SettingsPage() {
  const data = useData(); const { toast } = useToast(); const fileRef = useRef<HTMLInputElement>(null); const [preview, setPreview] = useState<WorkspaceData | null>(null); const [importError, setImportError] = useState(""); const [conflictMode, setConflictMode] = useState("skip");
  const location = useLocation();
  useEffect(() => { if (location.hash) requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "smooth" })); }, [location.hash]);
  const exportBackup = () => download(`influenceflow-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ schema: "influenceflow-backup", version: 2, exported_at: new Date().toISOString(), data: { profile: data.profile, creators: data.creators, brands: data.brands, contacts: data.contacts, campaigns: data.campaigns, followups: data.followups, meetings: data.meetings, activities: data.activities, demoSeeded: false } }, null, 2));
  const readBackup = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; setImportError(""); file.text().then((raw) => { try { const parsed = JSON.parse(raw) as { schema?: string; version?: number; data?: WorkspaceData } | WorkspaceData; const workspace = "data" in parsed && parsed.data ? parsed.data : parsed as WorkspaceData; if (!workspace || !Array.isArray(workspace.creators) || !Array.isArray(workspace.brands) || !Array.isArray(workspace.campaigns)) throw new Error("Missing creator, brand, or campaign collections."); setPreview({ ...workspace, contacts: workspace.contacts || [], followups: workspace.followups || [], meetings: workspace.meetings || [], activities: workspace.activities || [], profile: workspace.profile || data.profile, demoSeeded: false }); } catch (error) { setImportError(error instanceof Error ? error.message : "Invalid JSON backup"); } }).catch(() => setImportError("Could not read this file.")); };
  const importNow = () => { if (!preview) return; let next = preview; if (conflictMode !== "replace") { const creatorKeys = new Set(data.creators.map((item) => normalize(item.name))); const brandKeys = new Set(data.brands.map((item) => normalize(item.name))); next = { ...preview, profile: data.profile, creators: [...data.creators, ...preview.creators.filter((item) => conflictMode === "keep-both" || !creatorKeys.has(normalize(item.name)))], brands: [...data.brands, ...preview.brands.filter((item) => conflictMode === "keep-both" || !brandKeys.has(normalize(item.name)))], contacts: [...data.contacts, ...preview.contacts], campaigns: [...data.campaigns, ...preview.campaigns], followups: [...data.followups, ...(preview.followups || [])], meetings: [...data.meetings, ...preview.meetings], activities: [...preview.activities, ...data.activities] }; } data.importBackup(next); toast(`Backup imported: ${preview.creators.length} influencers, ${preview.brands.length} brands, ${preview.campaigns.length} campaigns`); setPreview(null); };
  const exportCollection = (type: "influencers" | "brands" | "contacts" | "campaigns") => {
    const built: { rows: Record<string, string | number | boolean | null | undefined>[]; headers: Record<string, string> } =
      type === "influencers"
        ? { rows: data.creators.map((item) => ({ name: item.name, email: item.contact_email, channel: item.channel_link, niche: item.niche, platform: item.platform, avg_views: item.avg_views, engagement_rate: item.engagement_rate, stars: creatorScore(item, data.profile.rating_weights), demographics: item.stars_demographics || 0, niche_fit: item.stars_niche || 0, engagement_stars: item.stars_engagement || 0, consistency: item.stars_consistency || 0, priority: item.priority, status: item.pipeline_status, date_contacted: item.date_contacted || "", next_action: item.next_action || "", action_due: item.next_action_date || "", notes: item.notes || "" })), headers: { name: "Name", email: "Email", channel: "Channel", niche: "Niche", platform: "Platform", avg_views: "Avg views", engagement_rate: "Engagement %", stars: "Rating", demographics: "Audience", niche_fit: "Niche fit", engagement_stars: "Engagement stars", consistency: "Consistency", priority: "Priority", status: "Status", date_contacted: "Date contacted", next_action: "Next action", action_due: "Action due", notes: "Notes" } }
          : type === "brands"
            ? { rows: data.brands.map((item) => ({ company: item.name, domain: item.domain, type: item.brand_type, contact_email: item.contact_email, priority: item.priority, status: item.pipeline_status, date_contacted: item.date_contacted || "", next_action: item.next_action || "", action_due: item.next_action_date || "", notes: item.notes || "" })), headers: { company: "Company", domain: "Domain", type: "Type", contact_email: "Email", priority: "Priority", status: "Status", date_contacted: "Date contacted", next_action: "Next action", action_due: "Action due", notes: "Notes" } }
          : type === "contacts"
            ? { rows: data.contacts.map((item) => ({ brand: data.brands.find((brand) => brand.id === item.brand_id)?.name || "", first_name: item.first_name, last_name: item.last_name, title: item.title, email: item.email, linkedin_url: item.linkedin_url, status: item.pipeline_status, date_contacted: item.date_contacted || "", notes: item.notes || "" })), headers: { brand: "Brand", first_name: "First name", last_name: "Last name", title: "Title", email: "Email", linkedin_url: "LinkedIn", status: "Status", date_contacted: "Date contacted", notes: "Notes" } }
            : { rows: data.campaigns.map((item) => ({ name: item.name, brand: data.brands.find((brand) => brand.id === item.brand_id)?.name || "", platform: item.platform, agreed_payment: item.agreed_payment, creator_payout: item.creator_payout, status: item.status, start_date: item.start_date, due_date: item.due_date, notes: item.notes || "" })), headers: { name: "Campaign", brand: "Brand", platform: "Platform", agreed_payment: "Deal value", creator_payout: "Creator payout", status: "Status", start_date: "Start", due_date: "Due", notes: "Notes" } };
    download(`influenceflow-${type}.csv`, toCSV(built.rows, built.headers), "text/csv"); toast(`${type} CSV exported`);
  };

  return <div className="settings-page"><PageHeader eyebrow="Workspace control" title="Settings" description="Your profile, agency, security, notifications, scoring, templates and data — all in one place." />
    <div className="settings-layout"><SettingsNav /><main>
      <ProfileSettings />
      <SecuritySettings />
      <WorkspaceSettings />
      <NotificationSettings />
      <ScoringSettings />
      <TemplateSettings />
      <section id="data" className="settings-section"><div className="settings-heading"><span><Database /></span><div><h2>Data & backup</h2><p>Export everything in versioned formats or import a previous workspace safely.</p></div></div><div className="settings-body"><div className="data-actions"><button onClick={exportBackup}><span><HardDriveDownload /></span><div><strong>JSON backup v2</strong><small>All records, links, settings and activity</small></div><Download /></button><button onClick={() => fileRef.current?.click()}><span><Upload /></span><div><strong>Import backup</strong><small>Validate and preview before changes</small></div><ChevronRight /></button><input ref={fileRef} type="file" accept=".json,application/json" onChange={readBackup} hidden /></div><div className="csv-export-row"><span><FileJson /> CSV exports</span>{(["influencers", "brands", "contacts", "campaigns"] as const).map((type) => <button key={type} onClick={() => exportCollection(type)}>{type}<Download /></button>)}</div>{importError && <div className="import-error"><AlertTriangle /> <span><strong>Backup validation failed</strong>{importError}</span><button onClick={() => fileRef.current?.click()}><RefreshCcw /> Retry</button></div>}<div className="privacy-note"><LockKeyhole /><span><strong>Your exports are generated in the browser.</strong>Keep backup files somewhere private. They can contain contact and campaign details.</span></div></div>      </section>
      <DangerZone onExport={exportBackup} />
    </main></div>
    <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title="Backup preview" description="Review the schema and choose how name conflicts should be handled.">{preview && <div className="backup-preview"><div className="backup-counts"><span><b>{preview.creators.length}</b> influencers</span><span><b>{preview.brands.length}</b> brands</span><span><b>{preview.contacts.length}</b> contacts</span><span><b>{preview.campaigns.length}</b> campaigns</span><span><b>{preview.meetings.length}</b> meetings</span><span><b>{(preview.followups || []).length}</b> follow-ups</span></div><Select label="Conflict handling" value={conflictMode} onChange={(event) => setConflictMode(event.target.value)}><option value="skip">Merge and skip matching names</option><option value="keep-both">Merge and keep both</option><option value="replace">Replace current workspace</option></Select><div className="schema-valid"><ShieldCheck /><span><strong>Schema validation passed</strong>Core collections are present. Missing legacy collections were initialized safely.</span></div><div className="modal-actions"><Button variant="ghost" onClick={() => setPreview(null)}>Cancel</Button><Button onClick={importNow}>Import workspace</Button></div></div>}</Modal>
  </div>;
}

const themes: { id: ThemeName; label: string; description: string; note: string }[] = [
  { id: "agency", label: "Agency", description: "Editorial violet, warm paper and deliberate contrast.", note: "Premium default" },
  { id: "light", label: "Light", description: "Bright white space, ink-black type and maximum readability.", note: "Clear & spacious" },
  { id: "dark", label: "Dark", description: "Rich charcoal layers with quiet lavender highlights.", note: "Elegant depth" },
  { id: "honey", label: "Honey", description: "Warm amber surfaces, soft gold light and refined depth.", note: "Warm luxury" },
  { id: "ocean", label: "Ocean", description: "Deep-water blues, calm teal and fluid luminous accents.", note: "Living water" },
];

export function ThemesPage() {
  const data = useData(); const { toast } = useToast(); const apply = (id: ThemeName) => { data.updateProfile({ theme: id }); document.documentElement.dataset.theme = id; toast(`${themes.find((item) => item.id === id)?.label} theme applied`); };
  return <div className="themes-page"><PageHeader eyebrow="Workspace atmosphere" title="Themes" description="Five intentionally designed modes. Switch instantly without changing the way you work." />
    <div className="theme-showcase">{themes.map((theme, index) => <button key={theme.id} onClick={() => apply(theme.id)} className={`theme-preview preview-${theme.id} ${data.profile.theme === theme.id ? "selected" : ""}`}><div className="theme-preview-top"><span>0{index + 1}</span><em>{theme.note}</em>{data.profile.theme === theme.id && <b><Check /> Active</b>}</div><div className="mini-workspace"><div className="mini-side"><i /><i /><i /><i /></div><div className="mini-main"><span /><strong /><div><i /><i /><i /></div><p /><p /></div></div><div className="theme-preview-copy"><h2>{theme.label}</h2><p>{theme.description}</p><span>{data.profile.theme === theme.id ? "Current theme" : "Apply theme"} <ChevronRight /></span></div></button>)}</div>
  </div>;
}

type TrashType = "creator" | "brand" | "campaign";
export function DeletedPage() {
  const data = useData(); const { toast } = useToast(); const [tab, setTab] = useState<TrashType>("creator");
  const groups = { creator: data.creators.filter((item) => item.archived_at), brand: data.brands.filter((item) => item.archived_at), campaign: data.campaigns.filter((item) => item.archived_at) }; const rows = groups[tab]; const count = groups.creator.length + groups.brand.length + groups.campaign.length;
  const empty = () => { if (confirm(`Permanently delete all ${count} archived records? Related links may also be removed. This cannot be undone.`)) { (Object.keys(groups) as TrashType[]).forEach((type) => data.permanentlyDelete(type, groups[type].map((item) => item.id))); toast("Trash emptied"); } };
  return <div className="deleted-page"><PageHeader eyebrow="Unified trash" title="Archive" description="Restore soft-deleted records or permanently remove them when you are certain." actions={count ? <Button variant="danger" onClick={empty}><Trash2 size={15} /> Empty trash</Button> : undefined} /><Tabs active={tab} onChange={(value) => setTab(value as TrashType)} tabs={[{ value: "creator", label: "Influencers", count: groups.creator.length }, { value: "brand", label: "Brands", count: groups.brand.length }, { value: "campaign", label: "Campaigns", count: groups.campaign.length }]} />{!rows.length ? <EmptyState icon="archive" title={`${tab === "creator" ? "Influencer" : tab === "brand" ? "Brand" : "Campaign"} trash is empty`} text="Archived records appear here and can be restored until permanently deleted." /> : <div className="trash-list">{rows.map((item) => <div key={item.id}><span className="trash-icon">{tab === "creator" ? <UserRound /> : tab === "brand" ? <Database /> : <Sparkles />}</span><div><strong>{item.name}</strong><small>Archived {dateLabel(item.archived_at)}</small></div><span className="trash-type">{tab}</span><Button variant="secondary" size="sm" onClick={() => { data.archive(tab, [item.id], true); toast(`${item.name} restored`); }}><RotateCcw size={14} /> Restore</Button><button className="icon-btn danger" onClick={() => { if (confirm(`Permanently delete ${item.name}?`)) { data.permanentlyDelete(tab, [item.id]); toast("Record permanently deleted"); } }}><X size={16} /></button></div>)}</div>}</div>;
}