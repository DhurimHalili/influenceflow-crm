import { AlertTriangle, CalendarDays, Check, LoaderCircle, Mail, RefreshCcw, ShieldCheck, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { useGmail } from "../contexts/GmailContext";
import { useToast } from "../contexts/ToastContext";
import { cadencePreview } from "../lib/followupEngine";
import { DEFAULT_FOLLOWUP_RULES } from "../lib/prefs";
import { relativeTime } from "../lib/utils";
import type { FollowupRules } from "../types";
import { Button } from "./ui";

const RESULT: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Gmail connected — your recent emails are being matched to your CRM now." },
  "missing-read": { ok: false, text: "Gmail connected, but reading email wasn't allowed. Reconnect and tick “View your email messages” so replies can be tracked." },
  cancelled: { ok: false, text: "Gmail connection cancelled." },
  "no-refresh": { ok: false, text: "Google didn't give lasting access. Remove InfluenceFlow under Google Account → Security → Third-party access, then connect again." },
  failed: { ok: false, text: "Gmail couldn't be connected. Please try again." },
};

export function GmailSettings() {
  const gmail = useGmail();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"" | "connect" | "disconnect" | "sync">("");

  // Back from Google: say how it went, then sync straight away.
  useEffect(() => {
    const result = new URLSearchParams(location.search).get("gmail");
    if (!result) return;
    const info = RESULT[result] || RESULT.failed;
    toast(info.text, info.ok ? "success" : "error");
    navigate({ pathname: location.pathname, hash: "#gmail" }, { replace: true });
    void gmail.refreshStatus().then(() => (result === "connected" ? gmail.syncNow(true) : undefined));
    window.setTimeout(() => document.getElementById("gmail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const connect = async () => {
    setBusy("connect");
    try {
      await gmail.connect();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't start the Gmail connection", "error");
      setBusy("");
    }
  };
  const disconnect = async () => {
    if (!confirm("Disconnect Gmail? Google access is revoked right away. The email history already in your CRM stays.")) return;
    setBusy("disconnect");
    await gmail.disconnect(false);
    setBusy("");
    toast("Gmail disconnected — Google access revoked");
  };
  const sync = async () => {
    setBusy("sync");
    const res = await gmail.syncNow(true);
    setBusy("");
    toast(res.ok ? "Gmail synced" : res.message || "Sync failed", res.ok ? "success" : "error");
  };

  return <section id="gmail" className="settings-section"><div className="settings-heading"><span><Mail /></span><div><h2>Gmail</h2><p>Emails to and from your influencers and brands update the CRM by themselves.</p></div></div><div className="settings-body">
    {!gmail.loaded ? <p className="muted-copy"><LoaderCircle size={14} className="spin" /> Checking…</p>
      : gmail.connected ? <div className="gmail-card connected">
        <div className="gmail-row"><span className="gmail-dot ok" /><div><strong>{gmail.email || "Gmail connected"}</strong><small>{gmail.lastSyncAt ? `Last synced ${relativeTime(gmail.lastSyncAt)}` : "First sync in progress…"}{gmail.canSend ? " · can send from the CRM" : ""}</small></div><div className="gmail-actions"><Button size="sm" variant="secondary" onClick={() => void sync()} loading={busy === "sync" || gmail.syncing}><RefreshCcw size={14} /> Sync now</Button><Button size="sm" variant="ghost" onClick={() => void disconnect()} loading={busy === "disconnect"}><Unplug size={14} /> Disconnect</Button></div></div>
        {gmail.error && <div className="gmail-error"><AlertTriangle size={14} /><span>{gmail.error}</span>{/reconnect/i.test(gmail.error) && <Button size="sm" onClick={() => void connect()}>Reconnect</Button>}</div>}
        {!gmail.canRead && <div className="gmail-error"><AlertTriangle size={14} /><span>Reading email wasn't allowed, so replies can't be tracked.</span><Button size="sm" onClick={() => void connect()}>Reconnect</Button></div>}
      </div>
      : <div className="gmail-card">
        <ul className="gmail-points">
          <li><Check size={14} /> You email someone → they move to <b>Contacted</b>; they reply → <b>Replied</b>; they write first → <b>Inbound</b>.</li>
          <li><Check size={14} /> Follow-up flags count your emails and their replies — no logging by hand.</li>
          <li><Check size={14} /> Send and follow up from the CRM, in the same Gmail thread.</li>
          <li><Check size={14} /> You stay in charge: any status you set yourself wins until a newer email arrives. Negotiating, Roster, Signed and Denied are never changed for you.</li>
        </ul>
        <Button onClick={() => void connect()} loading={busy === "connect"} disabled={gmail.loaded && !gmail.configured && !!gmail.error}><Mail size={15} /> Connect Gmail</Button>
        {!gmail.configured && gmail.loaded && <p className="field-hint">If connecting fails, Gmail isn't set up on the server yet — see the README “Gmail sync” section.</p>}
      </div>}
    <p className="privacy-note gmail-privacy"><ShieldCheck size={15} /><span><strong>What InfluenceFlow keeps:</strong> only emails to or from addresses in your CRM — who, when, the subject and Gmail's short preview. Message bodies and everything else in your inbox are never stored. Google access can be removed any time here or in your Google Account.</span></p>
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
        <div className="rule-days"><span className="rule-label">Business days</span><div className="chip-row">{DAY_NAMES.map((name, day) => <button type="button" key={name} className={`pick-chip${rules.workdays.includes(day) ? " on" : ""}`} aria-pressed={rules.workdays.includes(day)} onClick={() => setRules({ ...rules, workdays: rules.workdays.includes(day) ? rules.workdays.filter((d) => d !== day) : [...rules.workdays, day].sort() })}>{name}</button>)}</div></div>
        <div className="rule-days"><span className="rule-label">Days off <small>· holidays don't count</small></span><div className="holiday-row"><input type="date" className="field" value={holiday} onChange={(event) => setHoliday(event.target.value)} aria-label="Add a day off" /><Button size="sm" variant="secondary" disabled={!holiday || rules.holidays.includes(holiday)} onClick={() => { setRules({ ...rules, holidays: [...rules.holidays, holiday].sort() }); setHoliday(""); }}>Add</Button></div>{rules.holidays.length > 0 && <div className="chip-row">{rules.holidays.map((h) => <button type="button" key={h} className="pick-chip on" onClick={() => setRules({ ...rules, holidays: rules.holidays.filter((x) => x !== h) })} title="Remove">{h} ×</button>)}</div>}</div>
      </div>
      <div className="rules-preview" aria-live="polite">
        <span className="rule-label">How it plays out</span>
        <ol>{preview.map((step, i) => <li key={i}><i>{i === 0 ? "✉" : i}</i><span><strong>{step.label}</strong><small>{fmt(step.date)}</small></span></li>)}</ol>
        <p>A yellow flag appears on the follow-up day and stays until you follow up or they reply. Denied, Signed and Roster are never chased.</p>
      </div>
    </div>
    <div className="modal-actions rules-actions"><Button variant="ghost" onClick={() => setRules(DEFAULT_FOLLOWUP_RULES)} disabled={JSON.stringify(rules) === JSON.stringify(DEFAULT_FOLLOWUP_RULES)}>Agency default</Button><Button variant="ghost" onClick={() => setRules(saved)} disabled={!dirty}>Cancel</Button><Button onClick={save} disabled={!dirty || !rules.workdays.length}>Save rules</Button></div>
  </div></section>;
}
