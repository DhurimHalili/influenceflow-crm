import { AlertTriangle, CalendarDays, Target, Check, LoaderCircle, Mail, Plus, RefreshCcw, ShieldCheck, Sparkles, Trophy, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { useGmail } from "../contexts/GmailContext";
import { useToast } from "../contexts/ToastContext";
import { cadencePreview } from "../lib/followupEngine";
import { mailboxStats } from "../lib/mailboxStats";
import { DEFAULT_FOLLOWUP_RULES } from "../lib/prefs";
import { relativeTime } from "../lib/utils";
import type { FollowupRules } from "../types";
import { Button, Tabs } from "./ui";

const RESULT: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Mailbox connected — your recent emails are being matched to your CRM now." },
  reconnected: { ok: true, text: "Mailbox reconnected — syncing again." },
  "missing-read": { ok: false, text: "Connected, but reading email wasn't allowed. Reconnect and tick “View your email messages” so replies can be tracked." },
  cancelled: { ok: false, text: "Gmail connection cancelled." },
  "no-refresh": { ok: false, text: "Google didn't give lasting access. Remove InfluenceFlow under Google Account → Security → Third-party access, then connect again." },
  "too-many": { ok: false, text: "You've reached the mailbox limit. Disconnect one first." },
  "in-use": { ok: false, text: "That mailbox is already connected to another InfluenceFlow account." },
  failed: { ok: false, text: "Gmail couldn't be connected. Please try again." },
};

function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const w = 4;
  const gap = 2;
  return <svg className="mbx-spark" viewBox={`0 0 ${values.length * (w + gap)} 24`} preserveAspectRatio="none" aria-hidden="true">{values.map((v, i) => <rect key={i} x={i * (w + gap)} y={24 - Math.max(v ? 3 : 1, (v / max) * 24)} width={w} height={Math.max(v ? 3 : 1, (v / max) * 24)} rx={1.5} className={v ? "on" : ""} />)}</svg>;
}

export function GmailSettings() {
  const gmail = useGmail();
  const data = useData();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState("");
  const [range, setRange] = useState<"30" | "all">("30");

  // Back from Google: say how it went, then sync straight away.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const result = params.get("gmail");
    if (!result) return;
    const info = RESULT[result] || RESULT.failed;
    const mailbox = params.get("mailbox");
    toast(mailbox && info.ok ? `${mailbox}: ${info.text}` : info.text, info.ok ? "success" : "error");
    navigate({ pathname: location.pathname, hash: "#gmail" }, { replace: true });
    void gmail.refreshStatus().then(() => (info.ok ? gmail.syncNow(true) : undefined));
    window.setTimeout(() => document.getElementById("gmail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const connect = async (reconnect?: string) => {
    setBusy(reconnect ? `re:${reconnect}` : "connect");
    try {
      await gmail.connect(reconnect);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't start the Gmail connection", "error");
      setBusy("");
    }
  };
  const disconnect = async (id: string, email: string) => {
    if (!confirm(`Disconnect ${email}? Google access is revoked right away. Its email history stays in your CRM.`)) return;
    setBusy(`off:${id}`);
    try {
      await gmail.disconnect(id, false);
      toast(`${email} disconnected — Google access revoked`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't disconnect", "error");
    }
    setBusy("");
  };
  const sync = async () => {
    setBusy("sync");
    const res = await gmail.syncNow(true);
    setBusy("");
    toast(res.ok ? res.message || "Gmail synced" : res.message || "Sync failed", res.ok ? (res.message ? "info" : "success") : "error");
  };
  const stats = mailboxStats(data.emailEvents || [], gmail.leads, gmail.mailboxes.map((m) => m.email), range === "30" ? 30 : null);
  const statFor = (email: string) => stats.find((s) => s.mailbox === email);
  const top = stats.length > 1 && stats[0].sent > 0 ? stats[0].mailbox : "";

  return <section id="gmail" className="settings-section"><div className="settings-heading"><span><Mail /></span><div><h2>Gmail</h2><p>Emails to and from your influencers and brands update the CRM by themselves — from every mailbox you connect.</p></div></div><div className="settings-body">
    {!gmail.loaded ? <p className="muted-copy"><LoaderCircle size={14} className="spin" /> Checking…</p>
      : gmail.connected ? <div className="mbx-wrap">
        <div className="mbx-head"><span>{gmail.mailboxes.length} mailbox{gmail.mailboxes.length === 1 ? "" : "es"} connected</span><div className="mbx-head-actions"><Tabs active={range} onChange={(v) => setRange(v as "30" | "all")} tabs={[{ value: "30", label: "30 days" }, { value: "all", label: "All time" }]} /><Button size="sm" variant="secondary" onClick={() => void sync()} loading={busy === "sync" || gmail.syncing}><RefreshCcw size={14} /> Sync now</Button></div></div>
        <div className="mbx-list">{gmail.mailboxes.map((m) => { const st = statFor(m.email); return <article className={`mbx-card${m.error ? " has-error" : ""}`} key={m.id}>
          <div className="mbx-id"><span className={`gmail-dot ${m.error ? "bad" : "ok"}`} /><div><strong>{m.email}{top === m.email && <em className="mbx-top" title="Sends the most in this range"><Trophy size={11} /> Top sender</em>}</strong><small>{m.lastSyncAt ? `Synced ${relativeTime(m.lastSyncAt)}` : "First sync in progress…"}{m.canSend ? " · can send" : " · read only"}{m.sentToday ? ` · ${m.sentToday} sent from the CRM today` : ""}</small></div><Button size="sm" variant="ghost" onClick={() => void disconnect(m.id, m.email)} loading={busy === `off:${m.id}`} aria-label={`Disconnect ${m.email}`}><Unplug size={14} /> <span className="hide-sm">Disconnect</span></Button></div>
          <div className="mbx-stats"><div><b>{st?.sent ?? 0}</b><span>Sent</span></div><div><b>{st?.reached ?? 0}</b><span>Reached</span></div><div><b>{st?.reached ? `${st.replyRate}%` : "—"}</b><span>Reply rate</span></div><div><b>{st?.received ?? 0}</b><span>Received</span></div><div><b>{st?.leads ?? 0}</b><span>Leads</span></div><div className="mbx-spark-cell"><Spark values={st?.daily || []} /><span>Sent per day</span></div></div>
          {m.error && <div className="gmail-error"><AlertTriangle size={14} /><span>{m.error}</span>{/reconnect|expired|granted|allowed/i.test(m.error) && <Button size="sm" onClick={() => void connect(m.email)} loading={busy === `re:${m.email}`}>Reconnect</Button>}</div>}
          {!m.canRead && !m.error && <div className="gmail-error"><AlertTriangle size={14} /><span>Reading email wasn't allowed, so replies can't be tracked.</span><Button size="sm" onClick={() => void connect(m.email)}>Reconnect</Button></div>}
        </article>; })}</div>
        {gmail.mailboxes.length < gmail.maxMailboxes && <button type="button" className="mbx-add" onClick={() => void connect()} disabled={busy === "connect"}>{busy === "connect" ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}<span><strong>Add another mailbox</strong><small>Run outreach from two or more addresses? Connect each one — everything lands in the same CRM, and stats stay per mailbox.</small></span></button>}
      </div>
      : <div className="gmail-card">
        <ul className="gmail-points">
          <li><Check size={14} /> You email someone → they move to <b>Contacted</b>; they reply → <b>Replied</b>; they write first → <b>Inbound</b>.</li>
          <li><Check size={14} /> New brands and creators who email you are spotted for you — newsletters, warm-up mail and personal email are filtered out.</li>
          <li><Check size={14} /> Follow-up flags count your emails and their replies — no logging by hand.</li>
          <li><Check size={14} /> Connect several mailboxes and see which one sends the most and gets the most replies.</li>
          <li><Check size={14} /> You stay in charge: any status you set yourself wins until a newer email arrives. Negotiating, Roster, Signed and Denied are never changed for you.</li>
        </ul>
        <Button onClick={() => void connect()} loading={busy === "connect"} disabled={gmail.loaded && !gmail.configured && !!gmail.error}><Mail size={15} /> Connect Gmail</Button>
        {!gmail.configured && gmail.loaded && <p className="field-hint">If connecting fails, Gmail isn't set up on the server yet — see the README “Gmail sync” section.</p>}
      </div>}
    {gmail.loaded && <AiStatus />}
    <p className="privacy-note gmail-privacy"><ShieldCheck size={15} /><span><strong>What InfluenceFlow keeps:</strong> for people in your CRM — who, when, the subject and Gmail's short preview, plus PDF/image attachments influencers send (media kits, rate cards, stats) in your private file storage. For possible new leads — the same metadata, only for messages that pass the strict scanner. Message bodies are read in memory to understand them and are never stored; the rest of your inbox is never stored. Google tokens are encrypted, never reach your browser, and access can be removed any time here or in your Google Account.</span></p>
  </div></section>;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORD = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] || "th"}`;

export function FollowupRulesSettings() {
  const data = useData();
  const { toast } = useToast();
  const prefs = data.profile.preferences;
  const saved = prefs.followup_rules || DEFAULT_FOLLOWUP_RULES;
  const [rules, setRules] = useState<FollowupRules>(saved);
  const [holiday, setHoliday] = useState("");
  useEffect(() => setRules(saved), [saved]);
  const dirty = JSON.stringify(rules) !== JSON.stringify(saved);
  const save = () => {
    data.updateProfile({ preferences: { ...prefs, followup_rules: rules } });
    toast("Follow-up rules saved — every flag is recalculated");
  };
  const setGap = (index: number, value: number) => setRules({ ...rules, gaps: rules.gaps.map((g, i) => (i === index ? value : g)) });
  const preview = cadencePreview(rules);
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(d);
  const dayStepper = (value: number, onChange: (v: number) => void, label: string) => <span className="day-stepper" role="group" aria-label={label}><button type="button" onClick={() => onChange(Math.max(0, value - 1))} aria-label={`Fewer days: ${label}`}>−</button><b>{value}</b><button type="button" onClick={() => onChange(Math.min(30, value + 1))} aria-label={`More days: ${label}`}>+</button></span>;

  return <section id="followups" className="settings-section"><div className="settings-heading"><span><CalendarDays /></span><div><h2>Follow-up rules</h2><p>When someone hasn't replied, how many business days to wait before each follow-up.</p></div></div><div className="settings-body">
    <div className="rules-grid">
      <div className="rules-steps">
        {rules.gaps.map((gap, i) => <div className="rule-step" key={i}><span className="rule-label">{i === 0 ? "After your first email" : `After your ${ORD(i)} follow-up`}</span>{dayStepper(gap, (v) => setGap(i, v), `wait before ${ORD(i + 1)} follow-up`)}<small>business day{gap === 1 ? "" : "s"} of waiting</small>{rules.gaps.length > 1 && <button type="button" className="rule-remove" onClick={() => setRules({ ...rules, gaps: rules.gaps.filter((_, j) => j !== i) })} aria-label="Remove this step">×</button>}</div>)}
        <button type="button" className="rule-add" onClick={() => setRules({ ...rules, gaps: [...rules.gaps, rules.then] })} disabled={rules.gaps.length >= 12}>+ Add a step</button>
        <div className="rule-step then"><span className="rule-label">Every follow-up after that</span>{dayStepper(rules.then, (v) => setRules({ ...rules, then: Math.max(1, v) }), "wait for later follow-ups")}<small>business days</small></div>
        <div className="rule-step then"><span className="rule-label">Stop reminding after</span>{dayStepper(rules.stop_after, (v) => setRules({ ...rules, stop_after: v }), "stop after follow-ups")}<small>{rules.stop_after === 0 ? "never stop" : `follow-up${rules.stop_after === 1 ? "" : "s"}`}</small></div>
        <div className="rule-days"><span className="rule-label">Reach back after a no <small>· one reminder to try Denied ones again</small></span><div className="chip-row">{[[0, "Never"], [14, "2 weeks"], [30, "1 month"], [60, "2 months"], [90, "3 months"]].map(([days, label]) => <button type="button" key={days} className={`pick-chip${(rules.reach_back_days ?? 30) === days ? " on" : ""}`} aria-pressed={(rules.reach_back_days ?? 30) === days} onClick={() => setRules({ ...rules, reach_back_days: Number(days) })}>{label}</button>)}</div></div>
        <div className="rule-days"><span className="rule-label">Business days</span><div className="chip-row">{DAY_NAMES.map((name, day) => <button type="button" key={name} className={`pick-chip${rules.workdays.includes(day) ? " on" : ""}`} aria-pressed={rules.workdays.includes(day)} onClick={() => setRules({ ...rules, workdays: rules.workdays.includes(day) ? rules.workdays.filter((d) => d !== day) : [...rules.workdays, day].sort() })}>{name}</button>)}</div></div>
        <div className="rule-days"><span className="rule-label">Days off <small>· holidays don't count</small></span><div className="holiday-row"><input type="date" className="field" value={holiday} onChange={(event) => setHoliday(event.target.value)} aria-label="Add a day off" /><Button size="sm" variant="secondary" disabled={!holiday || rules.holidays.includes(holiday)} onClick={() => { setRules({ ...rules, holidays: [...rules.holidays, holiday].sort() }); setHoliday(""); }}>Add</Button></div>{rules.holidays.length > 0 && <div className="chip-row">{rules.holidays.map((h) => <button type="button" key={h} className="pick-chip on" onClick={() => setRules({ ...rules, holidays: rules.holidays.filter((x) => x !== h) })} title="Remove">{h} ×</button>)}</div>}</div>
      </div>
      <div className="rules-preview" aria-live="polite">
        <span className="rule-label">How it plays out</span>
        <ol>{preview.map((step, i) => <li key={i}><i>{i === 0 ? "✉" : i}</i><span><strong>{step.label}</strong><small>{fmt(step.date)}</small></span></li>)}</ol>
        <p>A yellow flag appears on the follow-up day and stays until you follow up or they reply. Signed and Roster are never chased; Denied ones get a single reach-back reminder.</p>
      </div>
    </div>
    <div className="modal-actions rules-actions"><Button variant="ghost" onClick={() => setRules(DEFAULT_FOLLOWUP_RULES)} disabled={JSON.stringify(rules) === JSON.stringify(DEFAULT_FOLLOWUP_RULES)}>Agency default</Button><Button variant="ghost" onClick={() => setRules(saved)} disabled={!dirty}>Cancel</Button><Button onClick={save} disabled={!dirty || !rules.workdays.length}>Save rules</Button></div>
  </div></section>;
}

export function CoachSettings() {
  const data = useData();
  const { toast } = useToast();
  const prefs = data.profile.preferences;
  const goal = prefs.daily_email_goal || 50;
  const set = (patch: Partial<typeof prefs>) => data.updateProfile({ preferences: { ...prefs, ...patch } });
  return <section id="coach" className="settings-section"><div className="settings-heading"><span><Target /></span><div><h2>Daily goal & coach</h2><p>Your outreach target, and the nudges that keep you on it.</p></div></div><div className="settings-body">
    <div className="rule-step"><span className="rule-label">Emails & follow-ups per day</span><span className="day-stepper" role="group" aria-label="Daily goal"><button type="button" onClick={() => set({ daily_email_goal: Math.max(5, goal - 5) })} aria-label="Lower the goal">−</button><b>{goal}</b><button type="button" onClick={() => set({ daily_email_goal: Math.min(500, goal + 5) })} aria-label="Raise the goal">+</button></span><small>Counted from Gmail (each email once), follow-ups you log, and first contacts you mark.</small></div>
    <label className="switch-row coach-switch"><input type="checkbox" checked={prefs.coach !== false} onChange={(event) => { set({ coach: event.target.checked }); toast(event.target.checked ? "Coach on" : "Coach off — no nudges or celebrations"); }} /><span className="switch" aria-hidden="true" /> Show the coach — a daily challenge, a progress ring and a celebration when you hit the goal</label>
  </div></section>;
}

/** Which AI reads media kits, how many keys it has, and how to switch it on. */
function AiStatus() {
  const gmail = useGmail();
  const resting = gmail.aiReadyAt && new Date(gmail.aiReadyAt).getTime() > Date.now();
  if (gmail.ai) {
    const who = gmail.aiProvider === "gemini" ? `Gemini (${gmail.aiModel || "gemini-3.8-flash"}) · ${gmail.aiKeys} key${gmail.aiKeys === 1 ? "" : "s"}` : `Claude (${gmail.aiModel})`;
    return <div className={`ai-status ${resting ? "rest" : "on"}`}><Sparkles size={15} /><div><strong>AI reading is on — {who}</strong>
      <small>{resting ? `Every key has used its free quota for now. Files keep saving and wait in line; they're read automatically from ${new Date(gmail.aiReadyAt!).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}.` : "Media kits, rate cards and stats screenshots creators email you are read and filed; their audience goes to the Verified panel; prices they send or agree to update the rate card. When a key runs out, the next one takes over with the same model."}</small>
      {gmail.aiProvider === "gemini" && <small className="ai-note">Free-tier Gemini may use what it reads to improve Google's products. Only attachments and the creator's own words are sent — never your whole inbox.</small>}
    </div></div>;
  }
  return <div className="ai-status off"><Sparkles size={15} /><div><strong>AI reading is off</strong>
    <small>Without it, kits and stats screenshots are still saved and downloadable, and prices are read from emails by strict rules (“Integration: $1,500”, “$2,500 for the integration works for me”). The AI adds the audience numbers inside the files.</small>
    <details className="ai-setup"><summary>Switch it on with free Gemini keys</summary><ol>
      <li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a> → <b>Create API key</b>.</li>
      <li>Supabase → Edge Functions → <b>Secrets</b> → add <code>GEMINI_API_KEYS</code> with your key (several keys: separate them with commas).</li>
      <li>Done. The next sync reads every saved kit, media kits first.</li>
    </ol><p>Free quota is counted per Google Cloud <b>project</b>, not per key — several keys from one project share one quota.</p></details>
  </div></div>;
}
