import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CalendarClock, CirclePause, MailX, Radar, Reply, Send, Shuffle, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { useChase } from "../hooks/useChase";
import { foundToday, normalizeWeekend, pickLine } from "../lib/dayMode";

// The weekend briefing. On a no-follow-up day (Saturday) and a scout day
// (Sunday) the CRM says so once, the first time you open it that day: what's
// on, what waits, and a different line each time. "Show the rules" on the
// dashboard brings it back.

const OPEN_EVENT = "if:day-brief";
export const openDayBrief = () => window.dispatchEvent(new CustomEvent(OPEN_EVENT));
const seenKey = () => `if.day-brief.${new Date().toDateString()}`;
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return "1"; } },
  set: (k: string) => { try { localStorage.setItem(k, "1"); } catch { /* private mode */ } },
};

type Rule = { icon: typeof Send; label: string; note: string; state: "on" | "wait" | "goal"; value?: string };

export function DayBriefLayer() {
  const data = useData();
  const chase = useChase();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  const today = chase.today;
  const weekend = normalizeWeekend(data.profile.preferences?.weekend);
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState(() => Math.random());
  const special = today.mode !== "normal";

  // Once a day, automatically — never over the login screen or before data is in.
  useEffect(() => {
    if (!special || !weekend.reminders || !data.ready || !pathname.startsWith("/app")) return;
    if (store.get(seenKey())) return;
    const t = window.setTimeout(() => { store.set(seenKey()); setSeed(Math.random()); setOpen(true); }, 900);
    return () => window.clearTimeout(t);
  }, [special, weekend.reminders, data.ready, pathname]);
  useEffect(() => {
    const show = () => { setSeed(Math.random()); setOpen(true); };
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);

  const found = useMemo(() => foundToday(data.creators), [data.creators]);
  if (!special) return null;
  const mode = today.mode as "light" | "scout";
  const line = pickLine(mode, seed);
  const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const parked = chase.parked.due.length;
  const replies = chase.reply.length + chase.parked.reply.length;
  const rules: Rule[] = mode === "light"
    ? [
        { icon: Send, label: "New outreach", note: "First emails to people who've never heard from you", state: "on", value: "On" },
        { icon: Reply, label: "Replies", note: replies ? `${replies} ${replies === 1 ? "person is" : "people are"} waiting on an answer` : "Answer anyone who writes", state: "on", value: "On" },
        { icon: CirclePause, label: "Follow-ups", note: parked ? `${parked} parked — first on ${today.resume}'s list` : `Parked until ${today.resume}`, state: "wait", value: today.resumeShort },
        { icon: CalendarClock, label: "Schedule for later", note: `Write now, send ${today.resume} — it counts that day`, state: "on", value: "Fine" },
      ]
    : [
        { icon: Radar, label: "Find new influencers", note: found >= weekend.scout_goal ? "Goal reached — anything more is a bonus" : `${weekend.scout_goal - found} to go · add them to the CRM`, state: "goal", value: `${found}/${weekend.scout_goal}` },
        { icon: MailX, label: "Emails & replies", note: `Nothing goes out today — back ${today.replyResume === "tomorrow" ? "tomorrow" : `on ${today.replyResume}`}`, state: "wait", value: today.replyResumeShort },
        { icon: CalendarClock, label: "Schedule for later", note: `Write now, send ${today.replyResume} — it counts that day`, state: "on", value: "Fine" },
      ];
  const go = () => { setOpen(false); navigate(mode === "scout" ? "/app/influencers?new=1" : "/app/influencers?status=new"); };

  return <AnimatePresence>{open && <motion.div className="day-brief-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={() => setOpen(false)}>
    <motion.section className={`day-brief mode-${mode}`} role="dialog" aria-modal="true" aria-labelledby="day-brief-title" onClick={(e) => e.stopPropagation()} initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }} transition={{ type: "spring", stiffness: 320, damping: 28 }}>
      <div className="db-hero" aria-hidden="true">
        {mode === "scout" ? <div className="db-radar"><i className="db-ring r1" /><i className="db-ring r2" /><i className="db-ring r3" /><i className="db-sweep" /><b className="db-blip b1" /><b className="db-blip b2" /><b className="db-blip b3" /><b className="db-blip b4" /><span className="db-core"><Radar size={22} /></span></div>
          : <div className="db-lanes"><i className="db-lane l1" /><i className="db-lane l2" /><i className="db-lane l3" /><i className="db-lane l4" /><span className="db-plane"><Send size={24} /></span><span className="db-pause"><CirclePause size={18} /></span></div>}
      </div>
      <button type="button" className="db-close" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button>
      <div className="db-body">
        <span className="db-badge"><i />{dayName} · {mode === "scout" ? "Scout day" : "No follow-ups"}</span>
        <AnimatePresence mode="wait"><motion.div key={line.title} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
          <h2 id="day-brief-title">{line.title}</h2>
          <p>{line.line}</p>
        </motion.div></AnimatePresence>
        <ul className="db-rules">{rules.map((r) => <li key={r.label} className={`st-${r.state}`}>
          <span className="db-rule-ico"><r.icon size={15} /></span>
          <span className="db-rule-text"><b>{r.label}</b><small>{r.note}</small></span>
          <em>{r.value}</em>
          {r.state === "goal" && <i className="db-goal" aria-hidden="true"><u style={{ width: `${Math.min(100, (found / Math.max(1, weekend.scout_goal)) * 100)}%` }} /></i>}
        </li>)}</ul>
        <div className="db-actions">
          <button type="button" className="db-shuffle" onClick={() => setSeed((v) => (v + 0.37) % 1)} aria-label="Show another line" title="Another one"><Shuffle size={15} /></button>
          <button type="button" className="btn btn-ghost btn-md" onClick={() => setOpen(false)}>Got it</button>
          <button type="button" className="btn btn-primary btn-md" onClick={go}>{mode === "scout" ? "Start scouting" : "Find someone new"} <ArrowRight size={15} /></button>
        </div>
        <small className="db-foot">Change your weekend in Settings → Weekends.</small>
      </div>
    </motion.section>
  </motion.div>}</AnimatePresence>;
}

/** The slim line on the dashboard: today's rule at a glance, and the way back to the briefing. */
export function DayStrip() {
  const chase = useChase();
  const data = useData();
  const today = chase.today;
  const weekend = normalizeWeekend(data.profile.preferences?.weekend);
  const found = useMemo(() => foundToday(data.creators), [data.creators]);
  if (today.mode === "normal") return null;
  const parked = chase.parked.due.length + chase.parked.reply.length;
  const scout = today.mode === "scout";
  return <div className={`day-strip mode-${today.mode}`}>
    <span className="ds-ico" aria-hidden="true">{scout ? <Radar size={16} /> : <CirclePause size={16} />}</span>
    <span className="ds-text"><b>{scout ? "Scout day — no emails today" : "No follow-ups today"}</b><small>{scout ? `Find ${weekend.scout_goal} new influencers (${found} so far). Replies and follow-ups go out ${today.replyResume}.` : `New outreach and replies only.${parked ? ` ${parked} follow-up${parked === 1 ? "" : "s"} wait for ${today.resume}.` : ""} Scheduling for later is fine.`}</small></span>
    <button type="button" onClick={openDayBrief}>Show the rules</button>
  </div>;
}
