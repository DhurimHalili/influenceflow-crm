import { ArrowRight, Check, Mail, TrendingUp, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { useGmail } from "../contexts/GmailContext";
import { useToast } from "../contexts/ToastContext";
import { useToday } from "../hooks/useChase";
import { useMailboxOrder } from "../hooks/useOutreach";
import { RAMP_MAX, RAMP_STEP, rampPlan, shiftStart, shouldAsk, stampNew, type RampPlan } from "../lib/goalRamp";
import { dateFmt } from "../lib/days";
import { dayKeyIn, validZone } from "../lib/zones";
import { freeStage, stageBusy, STAGE_FREE, takeStage } from "../lib/popupStage";
import { hasSupabase } from "../lib/supabase";

// The weekly goal ramp (owner's rule, lib/goalRamp): 10 a day per mailbox in its first week, +10 each week, up to 50.
// A popup asks on the first open of a week when your daily goal isn't this week's number: "Change it to 40"
// sets it at once; "Keep 20 this week" stays quiet until next Monday (or until a new mailbox changes the number).

const ID = "goal-ramp";
const zoneOf = (tz: string | undefined) => { if (validZone(tz)) return tz!; try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };

/** This week's ramp for your connected mailboxes. Mounted once with `stamp` to write down new mailboxes' first week. */
export function useGoalRamp(stamp = false) {
  const data = useData();
  const gmail = useGmail();
  const day = useToday();
  const prefs = data.profile.preferences;
  const zone = zoneOf(prefs.timezone);
  const today = useMemo(() => dayKeyIn(zone, Date.now()), [zone, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const boxes = useMemo(() => gmail.mailboxes.map((m) => m.email.toLowerCase()), [gmail.mailboxes]);
  const plan = useMemo(() => rampPlan(prefs.mailbox_ramp, boxes, today), [prefs.mailbox_ramp, boxes, today]);
  const ready = hasSupabase && data.cloudLive && data.ready && !data.demoSeeded && gmail.loaded;

  useEffect(() => {
    if (!stamp || !ready || !boxes.length) return;
    // The day the CRM first recorded mail from each mailbox (not the emails' own dates: a new mailbox's old history doesn't count).
    const firstSeen: Record<string, string> = {};
    for (const e of data.emailEvents || []) {
      const m = (e.mailbox || "").toLowerCase();
      if (!m || !e.created_at) continue;
      const d = dayKeyIn(zone, new Date(e.created_at).getTime());
      if (!firstSeen[m] || d < firstSeen[m]) firstSeen[m] = d;
    }
    const next = stampNew(prefs.mailbox_ramp, boxes, today, firstSeen);
    if (next) data.updateProfile({ preferences: { ...prefs, mailbox_ramp: next } });
  }, [stamp, ready, boxes, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const goal = prefs.daily_email_goal || 50;
  const setGoal = (n: number) => data.updateProfile({ preferences: { ...prefs, daily_email_goal: n } });
  const keep = () => data.updateProfile({ preferences: { ...prefs, goal_skip: { week: plan.week, total: plan.total } } });
  const shift = (mailbox: string, weeks: number) => {
    const box = plan.boxes.find((b) => b.mailbox === mailbox);
    if (!box) return;
    data.updateProfile({ preferences: { ...prefs, mailbox_ramp: { ...(prefs.mailbox_ramp || {}), [mailbox]: shiftStart(box.start, weeks, today) } } });
  };
  return { plan, goal, ready, today, setGoal, keep, shift, ask: ready && shouldAsk({ goal, plan, skip: prefs.goal_skip }) };
}

let shownThisLoad = false;

export function GoalRampLayer() {
  const ramp = useGoalRamp(true);
  const { toast } = useToast();
  const { pathname } = useLocation();
  const [open, setOpen] = useState<null | { from: number; plan: RampPlan }>(null);
  const [turn, setTurn] = useState(0);
  useEffect(() => { const again = () => setTurn((t) => t + 1); window.addEventListener(STAGE_FREE, again); return () => window.removeEventListener(STAGE_FREE, again); }, []);
  useEffect(() => {
    if (!ramp.ask || open || shownThisLoad || !pathname.startsWith("/app") || pathname.startsWith("/app/settings")) return;
    const t = window.setTimeout(() => {
      if (shownThisLoad || stageBusy(ID) || !takeStage(ID)) return;
      shownThisLoad = true;
      setOpen({ from: ramp.goal, plan: ramp.plan });
    }, 600);
    return () => window.clearTimeout(t);
  }, [ramp.ask, ramp.goal, ramp.plan, open, pathname, turn]);

  const close = useCallback(() => { setOpen(null); freeStage(ID); }, []);
  if (!open) return null;
  const { plan, from } = open;
  return <GoalRampPopup plan={plan} from={from} onClose={close}
    onChange={() => { ramp.setGoal(plan.total); close(); toast(`Daily goal is now ${plan.total} — ${plan.boxes.length} mailbox${plan.boxes.length === 1 ? "" : "es"} this week`, "success", { label: "Undo", run: () => ramp.setGoal(from) }); }}
    onKeep={() => { ramp.keep(); close(); toast(`Okay — your goal stays ${from} this week. We'll ask again next Monday.`, "info"); }} />;
}

function Stairs({ week, color, delay = 0 }: { week: number; color: string; delay?: number }) {
  const steps = RAMP_MAX / RAMP_STEP;
  return <span className="gr-stairs" aria-hidden="true" style={{ "--mbx-c": color } as CSSProperties}>
    {Array.from({ length: steps }, (_, i) => {
      const n = i + 1;
      const state = n < week ? "past" : n === week || (week > steps && n === steps) ? "now" : n === week + 1 ? "next" : "later";
      return <i key={n} className={state} style={{ height: `${28 + n * 14}%`, "--i": i, "--delay": `${delay}ms` } as CSSProperties} />;
    })}
  </span>;
}

function useCount(from: number, to: number, ms = 900) {
  const [v, setV] = useState(from);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(to); return; }
    let raf = 0; const t0 = performance.now() + 450;
    const tick = (t: number) => { const p = Math.max(0, Math.min(1, (t - t0) / ms)); setV(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, ms]);
  return v;
}

function GoalRampPopup({ plan, from, onClose, onChange, onKeep }: { plan: RampPlan; from: number; onClose: () => void; onChange: () => void; onKeep: () => void }) {
  const order = useMailboxOrder();
  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const shown = useCount(from, plan.total);
  const up = plan.total > from;
  const weekOf = dateFmt({ day: "numeric", month: "short" }).format(new Date(`${plan.week}T12:00:00`));
  useEffect(() => {
    primary.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab" || !card.current) return;
      const f = Array.from(card.current.querySelectorAll<HTMLElement>("button:not([disabled])"));
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const n = plan.boxes.length;
  return <div className="gr-scrim">
    <div ref={card} className="gr" role="alertdialog" aria-modal="true" aria-labelledby="gr-title" aria-describedby="gr-lead">
      <div className="gr-head">
        <span className="gr-eyebrow"><TrendingUp size={14} aria-hidden="true" /> New week · {weekOf}</span>
        <button type="button" className="gr-x" onClick={onClose} aria-label="Close — ask me next time I open the CRM"><X size={17} /></button>
        <div className="gr-hero" aria-live="polite">
          <span className={`gr-old${from === plan.total ? " same" : ""}`}>{from}</span>
          <ArrowRight className="gr-arrow" size={26} aria-hidden="true" />
          <b className="gr-new">{shown}</b>
          <span className="gr-unit">emails a day</span>
        </div>
      </div>
      <div className="gr-body">
        <h2 id="gr-title">{up ? `This week your target goes up to ${plan.total} a day.` : `This week your mailboxes are set for ${plan.total} a day.`}</h2>
        <p id="gr-lead" className="gr-lead">Every mailbox starts at {RAMP_STEP} emails a day and adds {RAMP_STEP} each week, up to {RAMP_MAX}. You have {n} mailbox{n === 1 ? "" : "es"}, so this week's target is <b>{plan.total}</b>{up ? "" : ` — your goal is ${from}`}.</p>
        <ul className="gr-boxes">
          {plan.boxes.map((b, i) => {
            const idx = Math.max(0, order.indexOf(b.mailbox));
            return <li key={b.mailbox} className={`mbx-${idx % 6}`}>
              <span className="gr-mail"><Mail size={14} aria-hidden="true" /><span>{b.mailbox}</span></span>
              <span className="gr-week">Week {b.week}{b.full ? " · full speed" : ""}</span>
              <Stairs week={b.week} color="var(--mbx)" delay={i * 160} />
              <b className="gr-per">{b.perDay}<small>/day</small></b>
            </li>;
          })}
        </ul>
        <p className="gr-next">{plan.nextTotal > plan.total ? <>Next Monday: <b>{plan.nextTotal} a day</b>.</> : <>Every mailbox is at full speed — {plan.total} a day from here on.</>}</p>
        <div className="gr-actions">
          <button ref={primary} type="button" className="gr-go" onClick={onChange}><Check size={16} aria-hidden="true" /> Change my goal to {plan.total}</button>
          <button type="button" className="gr-keep" onClick={onKeep}>Keep {from} this week</button>
        </div>
        <p className="gr-foot">Settings → Daily goal shows each mailbox's week, if one started earlier or later.</p>
      </div>
    </div>
  </div>;
}

/** Settings → Daily goal: each mailbox's week (move it if it started earlier or later) and "Use N". */
export function GoalRampSettings() {
  const ramp = useGoalRamp();
  const order = useMailboxOrder();
  const { toast } = useToast();
  if (!ramp.ready || !ramp.plan.boxes.length) return null;
  const { plan, goal } = ramp;
  return <div className="gr-set">
    <div className="gr-set-head"><span><b>This week's ramp: {plan.total} a day</b><small>{RAMP_STEP} a day per mailbox in its first week, +{RAMP_STEP} every Monday, up to {RAMP_MAX}.{plan.nextTotal > plan.total ? ` Next week: ${plan.nextTotal}.` : ""}</small></span>
      {goal !== plan.total && <button type="button" className="btn btn-sm" onClick={() => { const before = goal; ramp.setGoal(plan.total); toast(`Daily goal is now ${plan.total}`, "success", { label: "Undo", run: () => ramp.setGoal(before) }); }}>Use {plan.total}</button>}
    </div>
    <ul className="gr-set-list">{plan.boxes.map((b) => <li key={b.mailbox} className={`mbx-${Math.max(0, order.indexOf(b.mailbox)) % 6}`}>
      <span className="gr-mail"><Mail size={14} aria-hidden="true" /><span>{b.mailbox}</span></span>
      <Stairs week={b.week} color="var(--mbx)" />
      <span className="day-stepper" role="group" aria-label={`Ramp week for ${b.mailbox}`}>
        <button type="button" onClick={() => ramp.shift(b.mailbox, -1)} disabled={b.week <= 1} aria-label="One week earlier in the ramp">−</button>
        <b>Week {b.week}</b>
        <button type="button" onClick={() => ramp.shift(b.mailbox, 1)} disabled={b.full} aria-label="One week further in the ramp">+</button>
      </span>
      <b className="gr-per">{b.perDay}<small>/day</small></b>
    </li>)}</ul>
  </div>;
}
