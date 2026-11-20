import { AlertTriangle, CalendarDays, CirclePause, Target, Check, LoaderCircle, Mail, MailPlus, Plus, Radar, RefreshCcw, RotateCcw, Send, ShieldCheck, Sparkles, Trophy, Unplug } from "lucide-react";
import { GoalRampSettings } from "./GoalRamp";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { useGmail } from "../contexts/GmailContext";
import { useToast } from "../contexts/ToastContext";
import { addDays, cadencePreview, rulesFrom, waitWords } from "../lib/followupEngine";
import { mailboxStats } from "../lib/mailboxStats";
import { DEFAULT_FOLLOWUP_RULES } from "../lib/prefs";
import { normalizeWeekend, type DayMode, type WeekendPrefs } from "../lib/dayMode";
import { openDayBrief } from "./DayBrief";
import { relativeTime } from "../lib/utils";
import { supabase } from "../lib/supabase";
import type { DayUnit, FollowupRules } from "../types";
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
  const stats = mailboxStats(data.emailEvents || [], gmail.mailboxes.map((m) => m.email), range === "30" ? 30 : null);
  const statFor = (email: string) => stats.find((s) => s.mailbox === email);
  const top = stats.length > 1 && stats[0].sent > 0 ? stats[0].mailbox : "";

  return <section id="gmail" className="settings-section"><div className="settings-heading"><span><Mail /></span><div><h2>Gmail</h2><p>Emails to and from your influencers and brands update the CRM by themselves — from every mailbox you connect.</p></div></div><div className="settings-body">
    {!gmail.loaded ? <p className="muted-copy"><LoaderCircle size={14} className="spin" /> Checking…</p>
      : gmail.connected ? <div className="mbx-wrap">
        <div className="mbx-head"><span>{gmail.mailboxes.length} mailbox{gmail.mailboxes.length === 1 ? "" : "es"} connected</span><div className="mbx-head-actions"><Tabs active={range} onChange={(v) => setRange(v as "30" | "all")} tabs={[{ value: "30", label: "30 days" }, { value: "all", label: "All time" }]} /><Button size="sm" variant="secondary" onClick={() => void sync()} loading={busy === "sync" || gmail.syncing}><RefreshCcw size={14} /> Sync now</Button></div></div>
        <div className="mbx-list">{gmail.mailboxes.map((m) => { const st = statFor(m.email); return <article className={`mbx-card${m.error ? " has-error" : ""}`} key={m.id}>
          <div className="mbx-id"><span className={`gmail-dot ${m.error ? "bad" : "ok"}`} /><div><strong>{m.email}{top === m.email && <em className="mbx-top" title="Sends the most in this range"><Trophy size={11} /> Top sender</em>}</strong><small>{m.lastSyncAt ? `Synced ${relativeTime(m.lastSyncAt)}` : "First sync in progress…"}{m.canSend ? " · can send" : " · read only"}{m.canModify ? " · can cancel scheduled sends" : " · reconnect to let the CRM cancel scheduled sends"}{m.sentToday ? ` · ${m.sentToday} sent from the CRM today` : ""}</small></div><Button size="sm" variant="ghost" onClick={() => void disconnect(m.id, m.email)} loading={busy === `off:${m.id}`} aria-label={`Disconnect ${m.email}`}><Unplug size={14} /> <span className="hide-sm">Disconnect</span></Button></div>
          <div className="mbx-stats"><div><b>{st?.sent ?? 0}</b><span>Sent</span></div><div><b>{st?.reached ?? 0}</b><span>Reached</span></div><div><b>{st?.reached ? `${st.replyRate}%` : "—"}</b><span>Reply rate</span></div><div><b>{st?.received ?? 0}</b><span>Received</span></div><div className="mbx-spark-cell"><Spark values={st?.daily || []} /><span>Sent per day</span></div></div>
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
    <p className="privacy-note gmail-privacy"><ShieldCheck size={15} /><span><strong>What InfluenceFlow keeps:</strong> for people in your CRM — who, when, the subject and Gmail's short preview, plus PDF/image attachments influencers send (media kits, rate cards, stats) in your private file storage. Message bodies are read in memory to understand them and are never stored; the rest of your inbox is never stored. Google tokens are encrypted, never reach your browser, and access can be removed any time here or in your Google Account.</span></p>
  </div></section>;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORD = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] || "th"}`;

/** Business days or every day — one switch per wait. */
function UnitSwitch({ value, onChange, label }: { value: DayUnit; onChange: (u: DayUnit) => void; label: string }) {
  return <span className="unit-switch" role="radiogroup" aria-label={label}>
    {([["business", "Business days"], ["calendar", "Every day"]] as const).map(([u, text]) => <button type="button" key={u} role="radio" aria-checked={value === u} className={value === u ? "on" : ""} onClick={() => onChange(u)}>{text}</button>)}
  </span>;
}

const THREAD_PRESETS: [number, number, string][] = [[7, 14, "1 to 2 weeks"], [14, 21, "2 to 3 weeks"], [21, 28, "3 to 4 weeks"], [30, 45, "1 month+"]];
const NO_PRESETS: [number, string][] = [[0, "Never"], [14, "2 weeks"], [30, "1 month"], [60, "2 months"], [90, "3 months"]];

export function FollowupRulesSettings() {
  const data = useData();
  const { toast } = useToast();
  const prefs = data.profile.preferences;
  const saved = useMemo(() => rulesFrom(prefs.followup_rules), [prefs.followup_rules]);
  const [rules, setRules] = useState<FollowupRules>(saved);
  const [holiday, setHoliday] = useState("");
  useEffect(() => setRules(saved), [saved]);
  const dirty = JSON.stringify(rules) !== JSON.stringify(saved);
  const save = () => {
    data.updateProfile({ preferences: { ...prefs, followup_rules: rules } });
    toast("Follow-up rules saved — every flag is recalculated");
  };
  const set = (patch: Partial<FollowupRules>) => setRules({ ...rules, ...patch });
  const setGap = (index: number, value: number) => set({ gaps: rules.gaps.map((g, i) => (i === index ? value : g)) });
  const preview = cadencePreview(rules);
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(d);
  const dayStepper = (value: number, onChange: (v: number) => void, label: string, max = 30, min = 0) => <span className="day-stepper" role="group" aria-label={label}><button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer days: ${label}`}>−</button><b>{value}</b><button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More days: ${label}`}>+</button></span>;
  const gapUnit = rules.gap_unit ?? "business";
  const cap = rules.thread_cap ?? 4;
  const tStart = rules.new_thread_gap ?? 14, tLate = Math.max(tStart, rules.new_thread_late ?? 21), tUnit = rules.new_thread_unit ?? "calendar";
  const noDays = rules.reach_back_days ?? 30, noUnit = rules.reach_back_unit ?? "calendar";
  const dayWord = (n: number, u: DayUnit) => (u === "calendar" ? `day${n === 1 ? "" : "s"}` : `business day${n === 1 ? "" : "s"}`);
  // The window drawn to scale: 0 = the last follow-up, a week of air after the late day.
  const span = Math.max(tLate + 7, 14);
  const pct = (n: number) => `${Math.round((n / span) * 1000) / 10}%`;
  const ticks = Array.from({ length: Math.floor(span / 7) + 1 }, (_, i) => i * 7).filter((t) => t <= span);
  const thread = preview.find((p) => p.until);
  const lastFollow = [...preview].reverse().find((p) => !p.until);
  const noOn = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return noDays ? addDays(d, noDays, noUnit, rules) : null; })();
  // Gmail reopens a Denied record when you email them 14+ days after the no, so the wait never goes below that.
  const noMin = noUnit === "calendar" ? 14 : 10;

  return <section id="followups" className="settings-section"><div className="settings-heading"><span><CalendarDays /></span><div><h2>Follow-up rules</h2><p>When to follow up, when a thread is done and a new one starts, and when to write again after a no. Pick for each wait whether only business days count or every day.</p></div></div><div className="settings-body">
    <div className="rules-grid">
      <div className="rules-steps">
        <div className="rule-card">
          <header><span className="rule-ico" aria-hidden="true"><Send size={15} /></span><div><b>Follow-ups</b><small>While they haven't answered, in one email thread</small></div><UnitSwitch value={gapUnit} onChange={(u) => set({ gap_unit: u })} label="How follow-up waits count" /></header>
          {rules.gaps.map((gap, i) => <div className="rule-step" key={i}><span className="rule-label">{i === 0 ? "After your first email" : `After your ${ORD(i)} follow-up`}</span>{dayStepper(gap, (v) => setGap(i, v), `wait before ${ORD(i + 1)} follow-up`)}<small>{gapUnit === "calendar" ? `${dayWord(gap, gapUnit)} later` : `${dayWord(gap, gapUnit)} of waiting`}</small>{rules.gaps.length > 1 && <button type="button" className="rule-remove" onClick={() => set({ gaps: rules.gaps.filter((_, j) => j !== i) })} aria-label="Remove this step">×</button>}</div>)}
          <button type="button" className="rule-add" onClick={() => set({ gaps: [...rules.gaps, rules.then] })} disabled={rules.gaps.length >= 12}>+ Add a step</button>
          <div className="rule-step then"><span className="rule-label">Every follow-up after that</span>{dayStepper(rules.then, (v) => set({ then: Math.max(1, v) }), "wait for later follow-ups", 30, 1)}<small>{dayWord(rules.then, gapUnit)}</small></div>
          <div className="rule-step then"><span className="rule-label">Follow-ups in one thread</span>{dayStepper(cap, (v) => set({ thread_cap: Math.min(12, v) }), "follow-ups before a new thread", 12)}<small>{cap === 0 ? "no limit — never a new thread" : `then the next email is a new thread`}</small></div>
        </div>

        {cap > 0 && <div className="rule-card is-thread">
          <header><span className="rule-ico" aria-hidden="true"><MailPlus size={15} /></span><div><b>New thread</b><small>After your {ORD(cap)} follow-up with no answer. People you follow up by hand too.</small></div><UnitSwitch value={tUnit} onChange={(u) => set({ new_thread_unit: u })} label="How the new-thread wait counts" /></header>
          <div className="rule-presets" role="group" aria-label="Quick picks">{THREAD_PRESETS.map(([a, z, label]) => <button type="button" key={label} className={`pick-chip${tUnit === "calendar" && tStart === a && tLate === z ? " on" : ""}`} aria-pressed={tUnit === "calendar" && tStart === a && tLate === z} onClick={() => set({ new_thread_gap: a, new_thread_late: z, new_thread_unit: "calendar" })}>{label}</button>)}</div>
          <div className="thread-window">
            <div className="tw-track" aria-hidden="true">
              <span className="tw-wait" style={{ width: pct(tStart) }} />
              <span className="tw-win" style={{ left: pct(tStart), width: pct(Math.max(tLate - tStart, 0.4)) }}><em>Best time</em></span>
              <span className="tw-late" style={{ left: pct(tLate) }}><em>Late</em></span>
              {ticks.map((t) => <i key={t} style={{ left: pct(t) }}><small>{t === 0 ? "0" : tUnit === "calendar" && t % 7 === 0 ? `${t / 7} wk` : t}</small></i>)}
            </div>
            <div className="tw-steps">
              <label><span>Start from</span>{dayStepper(tStart, (v) => set({ new_thread_gap: v, new_thread_late: Math.max(v, tLate) }), "new thread due from", 120)}<small>{dayWord(tStart, tUnit)} later</small></label>
              <label><span>Late after</span>{dayStepper(tLate, (v) => set({ new_thread_late: Math.max(v, tStart) }), "new thread late after", 180, tStart)}<small>{dayWord(tLate, tUnit)}</small></label>
            </div>
          </div>
        </div>}

        <div className="rule-card is-no">
          <header><span className="rule-ico" aria-hidden="true"><RotateCcw size={15} /></span><div><b>After a no</b><small>One new thread with someone who said no, once their answer is this old</small></div>{noDays > 0 && <UnitSwitch value={noUnit} onChange={(u) => set({ reach_back_unit: u, reach_back_days: Math.max(u === "calendar" ? 14 : 10, noDays) })} label="How the wait after a no counts" />}</header>
          <div className="rule-presets" role="group" aria-label="Quick picks">{NO_PRESETS.map(([d, label]) => <button type="button" key={label} className={`pick-chip${noDays === d && (d === 0 || noUnit === "calendar") ? " on" : ""}`} aria-pressed={noDays === d && (d === 0 || noUnit === "calendar")} onClick={() => set({ reach_back_days: d, ...(d ? { reach_back_unit: "calendar" as DayUnit } : {}) })}>{label}</button>)}</div>
          {noDays > 0 && <div className="rule-step then"><span className="rule-label">Or exactly</span>{dayStepper(noDays, (v) => set({ reach_back_days: v }), "wait after a no", 365, noMin)}<small>{dayWord(noDays, noUnit)}{noOn ? ` · a no today → ${fmt(noOn)}` : ""}</small></div>}
        </div>

        <label className="switch-row rule-switch"><input type="checkbox" checked={rules.auto_cancel_crossed !== false} onChange={(event) => set({ auto_cancel_crossed: event.target.checked })} /><span className="switch" aria-hidden="true" /><span>Cancel a scheduled follow-up when they reply first<small>Their answer arrives before your “just checking in” goes out? It's cancelled in Gmail for you (Trash, 30 days). Needs the mailbox's “Manage drafts and send” permission.</small></span></label>
        <div className="rule-days"><span className="rule-label">Business days <small>· an “every day” wait that ends on another day moves to the next of these</small></span><div className="chip-row">{DAY_NAMES.map((name, day) => <button type="button" key={name} className={`pick-chip${rules.workdays.includes(day) ? " on" : ""}`} aria-pressed={rules.workdays.includes(day)} onClick={() => set({ workdays: rules.workdays.includes(day) ? rules.workdays.filter((d) => d !== day) : [...rules.workdays, day].sort() })}>{name}</button>)}</div></div>
        <div className="rule-days"><span className="rule-label">Days off <small>· holidays don't count</small></span><div className="holiday-row"><input type="date" className="field" value={holiday} onChange={(event) => setHoliday(event.target.value)} aria-label="Add a day off" /><Button size="sm" variant="secondary" disabled={!holiday || rules.holidays.includes(holiday)} onClick={() => { set({ holidays: [...rules.holidays, holiday].sort() }); setHoliday(""); }}>Add</Button></div>{rules.holidays.length > 0 && <div className="chip-row">{rules.holidays.map((h) => <button type="button" key={h} className="pick-chip on" onClick={() => set({ holidays: rules.holidays.filter((x) => x !== h) })} title="Remove">{h} ×</button>)}</div>}</div>
      </div>
      <div className="rules-preview" aria-live="polite">
        <span className="rule-label">How it plays out</span>
        <ol>{preview.map((step, i) => <li key={i} className={step.until ? "is-thread" : ""}><i>{i === 0 ? "✉" : step.until ? <MailPlus size={13} /> : i}</i><span><strong>{step.label}</strong><small>{step.until ? `${fmt(step.date)} to ${fmt(step.until)}` : fmt(step.date)}</small></span></li>)}</ol>
        {thread && lastFollow && <p className="rp-note"><MailPlus size={13} aria-hidden="true" /> No answer after the {ORD(cap)} follow-up ({fmt(lastFollow.date)})? The new thread shows up {fmt(thread.date)} and turns late after {fmt(thread.until!)}.</p>}
        <p className="rp-note is-no"><RotateCcw size={13} aria-hidden="true" /> {noDays ? `They say no today? A new thread with them ${fmt(noOn!)}, ${waitWords(noDays, noUnit)} later.` : "Someone who says no is never reminded again."}</p>
        <p>A yellow flag appears on the follow-up day and stays until you follow up or they reply. Signed and Roster are never chased. Both new threads show in the “New thread” chip on Influencers.</p>
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
    <GoalRampSettings />
    <label className="switch-row coach-switch"><input type="checkbox" checked={prefs.coach !== false} onChange={(event) => { set({ coach: event.target.checked }); toast(event.target.checked ? "Coach on" : "Coach off — no nudges or celebrations"); }} /><span className="switch" aria-hidden="true" /> Show the coach — a daily challenge, a progress ring and a celebration when you hit the goal</label>
  </div></section>;
}

const PROVIDER_NAME: Record<string, string> = { claude: "Claude", gemini: "Gemini", groq: "Groq", cloudflare: "Cloudflare Workers AI", openrouter: "OpenRouter" };
const CAN_LABEL = (can: string[]) => [can.includes("text") && "emails", can.includes("image") && "screenshots", can.includes("pdf") && "PDF kits"].filter(Boolean).join(", ");
type TestRow = { provider: string; model: string; need: string; ok: boolean; ms: number; error?: string };

/** Which AI providers read emails and media kits, in the order they're tried, and a real test of each. */
function AiStatus() {
  const gmail = useGmail();
  const { toast } = useToast();
  const [testing, setTesting] = useState(false);
  const [tests, setTests] = useState<TestRow[] | null>(null);
  const chain = gmail.aiChain || [];
  const resting = gmail.aiReadyAt && new Date(gmail.aiReadyAt).getTime() > Date.now();
  const when = (iso: string) => new Date(iso).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const test = async () => {
    setTesting(true);
    const { data, error } = await supabase.functions.invoke("gmail-sync", { body: { action: "ai_test" } });
    setTesting(false);
    if (error && !data) return toast("Couldn't run the test — try again in a moment.", "error");
    const rows = ((data as { results?: TestRow[] })?.results || []) as TestRow[];
    setTests(rows);
    void gmail.refreshStatus();
    toast(rows.every((r) => r.ok) ? `All ${rows.length} AI checks passed` : `${rows.filter((r) => !r.ok).length} of ${rows.length} AI checks failed — see below`, rows.every((r) => r.ok) ? "success" : "error");
  };
  if (gmail.ai) {
    return <div className={`ai-status ${resting ? "rest" : "on"}`}><Sparkles size={15} /><div><strong>AI reading is on — {chain.length} provider{chain.length === 1 ? "" : "s"}</strong>
      <small>{resting ? `Every provider has used its quota for now. Files keep saving and wait in line; they're read automatically from ${when(gmail.aiReadyAt!)}.` : "Each email or file goes to the first provider below that can read it. If it's out of quota, slow or can't answer, the same work moves to the next one — nothing is left half done."}</small>
      {chain.length > 0 && <ol className="ai-chain">{chain.map((c, i) => {
        const waiting = c.readyAt && new Date(c.readyAt).getTime() > Date.now();
        const failed = tests?.filter((t) => t.provider === c.provider && !t.ok) || [];
        const passed = tests?.some((t) => t.provider === c.provider && t.ok);
        return <li key={c.provider}><span className="ai-step">{i + 1}</span><b>{PROVIDER_NAME[c.provider] || c.provider}</b><small>{c.models.join(" · ")} · {c.keys} key{c.keys === 1 ? "" : "s"} · reads {CAN_LABEL(c.can)}</small>
          <span className={`ai-state ${failed.length ? "bad" : waiting ? "wait" : "ok"}`}>{failed.length ? `Check failed: ${failed[0].error || "no answer"}` : waiting ? `Resting until ${when(c.readyAt!)}` : passed ? "Tested · working" : "Ready"}</span></li>;
      })}</ol>}
      <div className="ai-actions"><Button size="sm" variant="secondary" onClick={() => void test()} loading={testing}>Test every provider</Button></div>
      {chain.some((c) => c.provider === "gemini") && <small className="ai-note">Free-tier Gemini may use what it reads to improve Google's products. Only attachments and the creator's own words are sent — never your whole inbox.</small>}
    </div></div>;
  }
  return <div className="ai-status off"><Sparkles size={15} /><div><strong>AI reading is off</strong>
    <small>Without it, kits and stats screenshots are still saved and downloadable, and prices are read from emails by strict rules (“Integration: $1,500”, “$2,500 for the integration works for me”). The AI adds the audience numbers inside the files.</small>
    <details className="ai-setup"><summary>Switch it on</summary><ol>
      <li>Get a key from any of: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Gemini</a>, <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">Groq</a>, <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer">OpenRouter</a> or Cloudflare Workers AI.</li>
      <li>Supabase → Edge Functions → <b>Secrets</b> → add <code>GEMINI_API_KEYS</code>, <code>GROQ_API_KEY</code>, <code>OPENROUTER_API_KEY</code>, or <code>CLOUDFLARE_ACCOUNT_ID</code> + <code>CLOUDFLARE_AI_TOKEN</code>.</li>
      <li>Done. The next sync reads every saved kit, media kits first.</li>
    </ol></details>
  </div></div>;
}

const WEEKEND_OPTIONS: { mode: DayMode; icon: typeof Send; label: string; note: string }[] = [
  { mode: "normal", icon: Send, label: "Normal day", note: "Everything goes out, follow-ups too" },
  { mode: "light", icon: CirclePause, label: "No follow-ups", note: "New outreach and replies only" },
  { mode: "scout", icon: Radar, label: "Scout day", note: "No emails — find new influencers" },
];

/** Saturday and Sunday: normal, no-follow-up or scout days, the scouting goal and the briefing. */
export function WeekendSettings() {
  const data = useData();
  const { toast } = useToast();
  const prefs = data.profile.preferences;
  const w = normalizeWeekend(prefs.weekend);
  const save = (patch: Partial<WeekendPrefs>, message: string) => {
    data.updateProfile({ preferences: { ...prefs, weekend: { ...w, ...patch } } });
    toast(message);
  };
  const anyScout = w.saturday === "scout" || w.sunday === "scout";
  return <section id="weekend" className="settings-section"><div className="settings-heading"><span><CalendarDays /></span><div><h2>Weekends</h2><p>What Saturday and Sunday are for. Follow-ups never shout “today” on a day they're off — they wait for the next working day.</p></div></div><div className="settings-body">
    <div className="wk-days">{(["saturday", "sunday"] as const).map((day) => <div className="wk-day" key={day} role="radiogroup" aria-label={day === "saturday" ? "Saturday" : "Sunday"}>
      <span className="rule-label">{day === "saturday" ? "Saturday" : "Sunday"}</span>
      {WEEKEND_OPTIONS.map((o) => <button type="button" key={o.mode} role="radio" aria-checked={w[day] === o.mode} className={`wk-opt mode-${o.mode}${w[day] === o.mode ? " on" : ""}`} onClick={() => w[day] !== o.mode && save({ [day]: o.mode }, `${day === "saturday" ? "Saturday" : "Sunday"}: ${o.label.toLowerCase()}`)}>
        <span className="wk-ico"><o.icon size={15} /></span><span><b>{o.label}</b><small>{o.note}</small></span>{w[day] === o.mode && <Check size={15} className="wk-check" />}
      </button>)}
    </div>)}</div>
    <div className={`wk-extra${anyScout ? "" : " is-off"}`}>
      <div className="rule-step then"><span className="rule-label">Scouting goal <small>· replaces the email goal on a scout day</small></span><span className="day-stepper" role="group" aria-label="Influencers to find on a scout day"><button type="button" onClick={() => save({ scout_goal: Math.max(1, w.scout_goal - 1) }, `Scouting goal: ${Math.max(1, w.scout_goal - 1)}`)} aria-label="Lower the scouting goal" disabled={!anyScout}>−</button><b>{w.scout_goal}</b><button type="button" onClick={() => save({ scout_goal: Math.min(200, w.scout_goal + 1) }, `Scouting goal: ${Math.min(200, w.scout_goal + 1)}`)} aria-label="Raise the scouting goal" disabled={!anyScout}>+</button></span><small>new influencers added that day</small></div>
      <label className="switch-row rule-switch"><input type="checkbox" checked={w.reminders} onChange={(e) => save({ reminders: e.target.checked }, e.target.checked ? "Weekend briefing on" : "Weekend briefing off")} /><span className="switch" aria-hidden="true" /><span>Show the weekend briefing<small>Once a day, the first time you open the CRM on a no-follow-up or scout day — what's on, what waits, and a fresh line to start with.</small></span></label>
      <button type="button" className="wk-preview" onClick={openDayBrief}>Preview the briefing</button>
    </div>
  </div></section>;
}
