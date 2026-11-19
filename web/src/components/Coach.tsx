import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Check, Flame, Radar, Target, Trophy, X, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { useChase } from "../hooks/useChase";
import { foundToday, normalizeWeekend } from "../lib/dayMode";
import { useOutreach } from "../hooks/useOutreach";
import { coachStats, pickNudge, type CoachStats, type Nudge } from "../lib/coach";

// The coach lives in three places: a card on the dashboard, a small progress
// ring in the top bar, and a nudge that slides in when you open the CRM or come
// back after a while. Hitting the daily goal (or clearing every overdue
// follow-up) gets a full-screen green celebration — silent, a few seconds,
// and it respects "reduce motion".

const todayKey = () => new Date().toDateString();
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const NUDGE_KEY = "if.coach.nudge-at";
const NUDGE_GAP_MS = 12 * 3600_000;
const nudgeDue = () => Date.now() - (Number(store.get(NUDGE_KEY)) || 0) > NUDGE_GAP_MS;
const markSeen = () => store.set(NUDGE_KEY, String(Date.now()));

export function useCoach(): { stats: CoachStats; nudge: Nudge; enabled: boolean } {
  const data = useData();
  const chase = useChase();
  const prefs = data.profile.preferences;
  const goal = prefs.daily_email_goal || 50;
  const log = useOutreach();
  const mode = chase.today.mode;
  const scoutGoal = normalizeWeekend(prefs.weekend).scout_goal;
  const found = useMemo(() => foundToday(data.creators), [data.creators]);
  const stats = useMemo(() => {
    const overdueList = chase.due.map((c) => (c.state.kind === "due" ? c.state.overdueDays : 0));
    return coachStats({ log, goal, overdue: chase.due.length, oldestOverdueDays: overdueList.length ? Math.max(...overdueList) : 0, replyNeeded: chase.reply.length, mode, found, scoutGoal });
  }, [log, goal, chase.due, chase.reply, mode, found, scoutGoal]);
  const nudge = useMemo(() => pickNudge(stats), [stats]);
  return { stats, nudge, enabled: prefs.coach !== false };
}

/** Today's number split three ways: sent, scheduled in Gmail, waiting in Autopilot (scout days: nothing waits). */
const partsOf = (s: CoachStats) => {
  if (s.unit === "found") return { sent: s.value, gmail: 0, autopilot: 0 };
  const autopilot = Math.min(s.autopilot, s.scheduled);
  return { sent: Math.max(0, s.sentToday - s.scheduled), gmail: s.scheduled - autopilot, autopilot };
};

/** The goal ring: solid = sent, mid = scheduled in Gmail, pale = waiting in Autopilot — same order as the legend. */
function Ring({ value, goal, stats, size = 34 }: { value: number; goal: number; stats?: CoachStats; size?: number }) {
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;
  const p = stats ? partsOf(stats) : { sent: value, gmail: 0, autopilot: 0 };
  const share = (n: number) => (goal ? n / goal : 0);
  const sent = Math.min(1, share(p.sent));
  const gmail = Math.min(1 - sent, share(p.gmail));
  const auto = Math.min(1 - sent - gmail, share(p.autopilot));
  const arc = (from: number, len: number, cls: string) => len > 0 && <circle cx={size / 2} cy={size / 2} r={r} className={`fill ${cls}`} strokeDasharray={`${c * len} ${c}`} strokeDashoffset={-c * from} />;
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="coach-ring-svg" aria-hidden="true">
    <circle cx={size / 2} cy={size / 2} r={r} className="track" />
    {arc(sent + gmail, auto, "waiting auto")}
    {arc(sent, gmail, "waiting gmail")}
    <circle cx={size / 2} cy={size / 2} r={r} className={`fill${sent >= 1 ? " done" : ""}`} strokeDasharray={c} strokeDashoffset={c * (1 - sent)} />
  </svg>;
}
/** "23 sent · 1 scheduled in Gmail · 17 waiting in Autopilot" — for tooltips and screen readers. */
const madeOf = (s: CoachStats) => {
  if (s.unit === "found" || !s.scheduled) return "";
  const p = partsOf(s);
  return [`${p.sent} sent`, p.gmail ? `${p.gmail} scheduled in Gmail` : "", p.autopilot ? `${p.autopilot} waiting in Autopilot` : ""].filter(Boolean).join(" · ");
};
/** The ring's key: one line per part, with the swatch the ring draws it in. Only when something still waits. */
function RingKey({ stats }: { stats: CoachStats }) {
  if (stats.unit === "found" || !stats.scheduled) return null;
  const p = partsOf(stats);
  return <ul className="coach-key" aria-label={madeOf(stats)}>
    <li><i className="sent" aria-hidden="true" /><b>{p.sent}</b> sent</li>
    {p.gmail > 0 && <li><i className="gmail" aria-hidden="true" /><b>{p.gmail}</b> in Gmail</li>}
    {p.autopilot > 0 && <li><i className="auto" aria-hidden="true" /><b>{p.autopilot}</b> Autopilot</li>}
  </ul>;
}

const TONE_ICON = { push: Zap, focus: Target, cheer: Flame, win: Trophy } as const;
const unitWord = (s: CoachStats) => (s.unit === "found" ? "found" : "emails");

export function CoachCard() {
  const { stats, nudge, enabled } = useCoach();
  if (!enabled) return null;
  const Icon = stats.unit === "found" ? Radar : TONE_ICON[nudge.tone];
  const ch = nudge.challenge;
  return <section className={`coach-card tone-${nudge.tone}${stats.unit === "found" ? " is-scout" : ""}`} aria-live="polite">
    <div className="coach-goal"><div className="coach-dial"><Ring value={stats.value} goal={stats.target} stats={stats} size={64} /><div><b>{stats.value}</b><small>of {stats.target}{stats.unit === "found" ? " found" : ""}</small></div></div><RingKey stats={stats} /></div>
    <div className="coach-body"><span className="coach-kicker"><Icon size={13} /> {stats.unit === "found" ? "Scout day" : stats.mode === "light" ? "Today's challenge · no follow-ups" : "Today's challenge"}</span><h2>{nudge.title}</h2><p>{nudge.body}</p>
      {ch && <div className="coach-progress"><i><b style={{ width: `${Math.min(100, (ch.current / Math.max(1, ch.target)) * 100)}%` }} /></i><small>{ch.label}: {ch.current}/{ch.target}</small></div>}
    </div>
    <div className="coach-side">
      <div className="coach-mini">{stats.streak > 0 && <span title="Weekdays in a row you hit the goal"><Flame size={12} /> {stats.streak}-day streak</span>}<span>Yesterday {stats.yesterday}</span>{stats.weekAvg > 0 && <span>7-day avg {stats.weekAvg}</span>}</div>
      {nudge.cta && <Link className="btn btn-primary btn-sm" to={nudge.cta.to}>{nudge.cta.label} <ArrowRight size={14} /></Link>}
    </div>
  </section>;
}

export function CoachRing() {
  const { stats, nudge, enabled } = useCoach();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  if (!enabled) return null;
  return <div className="coach-top">
    <button type="button" className={`coach-top-btn${stats.value >= stats.target ? " done" : ""}${stats.unit === "found" ? " is-scout" : ""}`} onClick={() => setOpen((v) => !v)} aria-expanded={open} title={stats.unit === "found" ? `Scout day: ${stats.value} of ${stats.target} new influencers found` : `${stats.sentToday} of ${stats.goal} emails today${madeOf(stats) ? ` — ${madeOf(stats)}` : ""}`}><Ring value={stats.value} goal={stats.target} stats={stats} size={28} /><span>{stats.unit === "found" && <Radar size={12} className="coach-top-unit" aria-hidden="true" />}{stats.value}<small>/{stats.target}</small></span></button>
    <AnimatePresence>{open && <motion.div className="coach-pop" role="dialog" aria-label="Today's goal" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
      <div className="coach-pop-head">
        <Ring value={stats.value} goal={stats.target} stats={stats} size={46} />
        <span><b>{stats.value}<small> / {stats.target}</small></b><em>{stats.unit === "found" ? "new influencers found today" : stats.scheduled ? "today, counting what still waits" : "emails sent today"}</em></span>
        <button type="button" className="coach-pop-x" onClick={() => setOpen(false)} aria-label="Close"><X size={15} /></button>
      </div>
      <RingKey stats={stats} />
      <strong>{nudge.title}</strong><p>{nudge.body}</p>
      {nudge.cta && <button type="button" className="btn btn-primary btn-sm" onClick={() => { setOpen(false); navigate(nudge.cta!.to); }}>{nudge.cta.label} <ArrowRight size={14} /></button>}
    </motion.div>}</AnimatePresence>
    {open && <button className="popover-scrim" onClick={() => setOpen(false)} aria-label="Close" />}
  </div>;
}

const CONFETTI = Array.from({ length: 42 }, (_, i) => ({ left: (i * 37) % 100, delay: (i % 7) * 0.08, hue: [142, 160, 120, 95, 175][i % 5], rot: (i * 47) % 360, size: 6 + (i % 4) * 2 }));

/** Slide-in nudges on open / return, and the goal celebration. Mounted once in the app shell. */
export function CoachLayer() {
  const data = useData();
  const { stats, nudge, enabled } = useCoach();
  const navigate = useNavigate();
  const [toast, setToast] = useState<Nudge | null>(null);
  const [party, setParty] = useState<{ title: string; body: string } | null>(null);
  const prevSent = useRef<number | null>(null);
  const startOverdue = useRef<number | null>(null);
  const hiddenAt = useRef<number>(0);
  const latest = useRef(nudge);
  latest.current = nudge;

  // The slide-in is rare on purpose: at most once every 12 hours across every
  // tab and window (localStorage, not per tab), never over a profile you're
  // working in, and never on the dashboard — the coach card is right there, so
  // seeing it there counts too.
  const { pathname } = useLocation();
  const onDashboard = /^\/app\/?$/.test(pathname);
  const quietHere = onDashboard || /^\/app\/(influencers|brands)\/[^/]+/.test(pathname);
  const quietRef = useRef(quietHere);
  quietRef.current = quietHere;
  useEffect(() => {
    if (!enabled || !data.ready) return;
    if (onDashboard) { markSeen(); return; }
    if (quietHere || !nudgeDue()) return;
    const t = window.setTimeout(() => {
      if (quietRef.current || !nudgeDue()) return;
      markSeen();
      setToast(latest.current);
    }, 1600);
    return () => window.clearTimeout(t);
  }, [enabled, data.ready, onDashboard, quietHere]);
  useEffect(() => {
    if (!enabled) return;
    const onVis = () => {
      if (document.visibilityState === "hidden") hiddenAt.current = Date.now();
      else if (hiddenAt.current && Date.now() - hiddenAt.current > 2 * 3600_000 && !quietRef.current && nudgeDue()) {
        markSeen();
        setToast(latest.current);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [enabled]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 14000);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Celebrate crossing the goal, or clearing every overdue follow-up.
  useEffect(() => {
    if (!enabled || !data.ready) return;
    const day = todayKey();
    if (prevSent.current !== null && prevSent.current < stats.target && stats.value >= stats.target && store.get("if.coach.goal") !== day) {
      store.set("if.coach.goal", day);
      setParty(stats.unit === "found"
        ? { title: `Scouting done: ${stats.value} new influencers!`, body: "Monday's list is loaded. Rate them while they're fresh — then enjoy the rest of the day." }
        : { title: `Goal hit: ${stats.sentToday} emails today!`, body: stats.streak ? `That's ${stats.streak + 1} days in a row. Unstoppable.` : "That's how rosters get built. Take a breath — you earned it." });
    }
    prevSent.current = stats.value;
    if (startOverdue.current === null) startOverdue.current = stats.overdue;
    else if (startOverdue.current >= 3 && stats.overdue === 0 && store.get("if.coach.clear") !== day) {
      store.set("if.coach.clear", day);
      setParty({ title: "Every follow-up cleared!", body: `${startOverdue.current} chased today. Clean sheet — now back to new outreach.` });
      startOverdue.current = 0;
    }
  }, [enabled, data.ready, stats.value, stats.target, stats.unit, stats.sentToday, stats.overdue, stats.streak]);
  useEffect(() => {
    if (!party) return;
    const t = window.setTimeout(() => setParty(null), 5200);
    return () => window.clearTimeout(t);
  }, [party]);

  if (!enabled) return null;
  const Icon = toast ? TONE_ICON[toast.tone] : Zap;
  return <>
    <AnimatePresence>{toast && <motion.aside className={`coach-toast tone-${toast.tone}`} role="status" initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24 }}>
      <span className="coach-toast-icon"><Icon size={18} /></span>
      <div><strong>{toast.title}</strong><p>{toast.body}</p><div className="coach-toast-meta"><Ring value={stats.value} goal={stats.target} size={20} /> {stats.value}/{stats.target} {unitWord(stats)} today</div></div>
      <div className="coach-toast-actions">{toast.cta && <button type="button" className="btn btn-primary btn-sm" onClick={() => { setToast(null); navigate(toast.cta!.to); }}>{toast.cta.label}</button>}<button type="button" className="icon-btn" onClick={() => setToast(null)} aria-label="Dismiss"><X size={15} /></button></div>
    </motion.aside>}</AnimatePresence>
    <AnimatePresence>{party && <motion.div className="coach-party" role="alertdialog" aria-label={party.title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setParty(null)}>
      <div className="party-glow" />
      <div className="party-confetti" aria-hidden="true">{CONFETTI.map((c, i) => <i key={i} style={{ left: `${c.left}%`, animationDelay: `${c.delay}s`, background: `hsl(${c.hue} 70% 50%)`, transform: `rotate(${c.rot}deg)`, width: c.size, height: c.size * 1.6 }} />)}</div>
      <motion.div className="party-card" initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}>
        <span className="party-check"><Check size={44} strokeWidth={3} /></span>
        <h2>{party.title}</h2><p>{party.body}</p><small>Tap anywhere to keep going</small>
      </motion.div>
    </motion.div>}</AnimatePresence>
  </>;
}
