import { ArrowRight, Check, Moon, PenLine, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAutopilot, useAutopilotPrefs } from "../contexts/AutopilotContext";
import { useData } from "../contexts/DataContext";
import { useChase } from "../hooks/useChase";
import { useCoach } from "./Coach";
import { minutesOf } from "../lib/autopilot";
import { dateFmt } from "../lib/days";
import { planTimes } from "../lib/smartTime";
import { dayEndIn, dayStartIn } from "../lib/zones";
import { freeStage, stageBusy, STAGE_FREE, takeStage } from "../lib/popupStage";

// "Night fill is off" — 3 hours before your fill start time (21:00 unless you changed it), when today's emails
// are short of your goal, follow-ups are due that Autopilot could send, and the night fill is OFF, so at the
// start time nothing would happen. Turn it on right here (or write templates first when there are none).
// Closing it brings it back in an hour; "Not tonight" lets you be till tomorrow. Never on a light/scout day.

const ID = "fill-warn";
const HOUR = 3_600_000;
const store = {
  get: (k: string) => { try { return localStorage.getItem(k) || ""; } catch { return "off"; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode: shown once per load */ } },
};

export function FillWarnLayer() {
  const auto = useAutopilot();
  const ap = useAutopilotPrefs();
  const data = useData();
  const chase = useChase();
  const { stats } = useCoach();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const [turn, setTurn] = useState(0);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(t); }, []);
  useEffect(() => { const again = () => setTurn((t) => t + 1); window.addEventListener(STAGE_FREE, again); return () => window.removeEventListener(STAGE_FREE, again); }, []);

  const startAt = dayStartIn(auto.zone, now) + minutesOf(ap.start) * 60_000;
  const endAt = dayEndIn(auto.zone, now);
  const inWindow = now >= startAt - 3 * HOUR && now < endAt - 30 * 60_000;
  const waitingToday = auto.today.filter((i) => i.status === "pending" || i.status === "sending").length;
  // stats.value already counts what Autopilot has waiting today (and Gmail's scheduled ones) — never subtract twice.
  const left = Math.max(0, stats.target - stats.value);
  const noTemplate = auto.pool.held.filter((h) => h.why === "no-template").length;
  // Where {W.whens} follow-ups would land (the same planner the night fill uses, from the start time).
  const tonight = useMemo(() => {
    if (!inWindow || !auto.pool.ready.length) return [] as number[];
    const taken = auto.items.filter((i) => i.status === "pending" || i.status === "sending").map((i) => ({ mailbox: i.mailbox, at: new Date(i.send_at).getTime() }));
    return planTimes(auto.pool.ready.map((r) => ({ id: r.id, mailbox: r.mailbox, zones: r.zones, firstAt: r.firstAt, lastAt: r.lastAt, weight: r.overdueDays })), { now, userZone: auto.zone, from: Math.max(now, startAt), taken, seed: 7 }).placed.map((p) => p.at).sort((a, b) => a - b);
  }, [inWindow, auto.pool.ready, auto.items, auto.zone, now, startAt]);
  const canFill = Math.min(left, tonight.length, auto.canWithin);
  const key = `if.fillwarn.${data.profile.id}.${auto.todayKey}`;
  const due = auto.enabled && auto.loaded && data.ready && !data.demoSeeded && !ap.fill && inWindow && stats.unit === "emails" && !chase.today.followupsPaused && left > 0 && (canFill > 0 || noTemplate > 0);

  useEffect(() => {
    if (!due || open || pathname.startsWith("/app/settings") || !pathname.startsWith("/app")) return;
    const saved = store.get(key);
    if (saved === "off" || (saved && Number(saved) > Date.now())) return;
    const t = window.setTimeout(() => { if (!stageBusy(ID) && takeStage(ID)) setOpen(true); }, 1400);
    return () => window.clearTimeout(t);
  }, [due, open, pathname, key, now, turn]);

  const close = useCallback((how: "snooze" | "off" | "write") => {
    store.set(key, how === "off" ? "off" : String(Date.now() + (how === "write" ? 40 * 60_000 : HOUR)));
    setOpen(false);
    freeStage(ID);
  }, [key]);
  const turnOn = () => { const prefs = data.profile.preferences; data.updateProfile({ preferences: { ...prefs, autopilot: { ...ap, fill: true } } }); };

  if (!open) return null;
  return <FillWarn
    now={now} startAt={startAt} endAt={endAt} start={ap.start} on={ap.fill} goal={stats.target} value={stats.value} left={left}
    waiting={waitingToday} canFill={canFill} times={tonight.slice(0, Math.max(canFill, 0))} ready={auto.pool.ready.length} noTemplate={canFill > 0 ? 0 : noTemplate}
    onTurnOn={turnOn} onClose={close} onWrite={() => { close("write"); navigate("/app/settings#follow-templates"); }} onSettings={() => { close("snooze"); navigate("/app/autopilot"); }}
  />;
}

type Part = "morning" | "afternoon" | "night";
const partOf = (start: string): Part => { const m = minutesOf(start); return m < 12 * 60 ? "morning" : m < 17 * 60 ? "afternoon" : "night"; };
const WORDS: Record<Part, { name: string; when: string; whens: string; shift: string; not: string }> = {
  morning: { name: "Morning fill", when: "this morning", whens: "this morning's", shift: "morning", not: "Not today" },
  afternoon: { name: "Afternoon fill", when: "this afternoon", whens: "this afternoon's", shift: "afternoon", not: "Not today" },
  night: { name: "Night fill", when: "tonight", whens: "tonight's", shift: "night", not: "Not tonight" },
};
// Clouds by day: [top %, width px, drift s, delay s, opacity].
const CLOUDS: Record<"morning" | "afternoon", [number, number, number, number, number][]> = {
  morning: [[20, 74, 38, -6, .85], [40, 52, 52, -30, .6], [27, 40, 64, -48, .5]],
  afternoon: [[18, 86, 30, -4, .95], [36, 60, 40, -22, .8], [24, 46, 48, -36, .7], [46, 38, 56, -12, .55]],
};
// Stars in the sky: [left %, top %, size px, twinkle s].
const STARS: [number, number, number, number][] = [[6, 18, 2, 2.6], [14, 42, 1.5, 3.4], [22, 12, 2.5, 2.1], [31, 30, 1.5, 3.9], [39, 8, 2, 2.8], [47, 36, 1.5, 3.1], [56, 16, 2.5, 2.4], [64, 44, 1.5, 3.6], [72, 10, 2, 2.9], [79, 28, 1.5, 3.3], [87, 14, 2.5, 2.2], [94, 38, 1.5, 3.7], [10, 58, 1.5, 3.0], [52, 56, 1.5, 2.7], [83, 52, 2, 3.2]];

function FillWarn(p: {
  now: number; startAt: number; endAt: number; start: string; on: boolean; goal: number; value: number; left: number; waiting: number; canFill: number; times: number[]; ready: number; noTemplate: number;
  onTurnOn: () => void; onClose: (how: "snooze" | "off" | "write") => void; onWrite: () => void; onSettings: () => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const [lit, setLit] = useState(false);
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setTick(Date.now()), 1000); return () => window.clearInterval(t); }, []);
  const closeRef = useRef(p.onClose);
  closeRef.current = p.onClose;
  useEffect(() => {
    primary.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); closeRef.current("snooze"); return; }
      if (e.key !== "Tab" || !card.current) return;
      const f = Array.from(card.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"));
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, []);

  const hm = (ms: number) => dateFmt({ hour: "numeric", minute: "2-digit" }).format(ms);
  const toStart = Math.max(0, p.startAt - tick);
  const started = toStart === 0;
  const hh = Math.floor(toStart / HOUR), mm = Math.floor((toStart % HOUR) / 60_000), ss = Math.floor((toStart % 60_000) / 1000);
  const span = Math.max(1, p.endAt - Math.max(p.startAt, p.now));
  const from = Math.max(p.startAt, p.now);
  const pct = (ms: number) => Math.max(0, Math.min(100, ((ms - from) / span) * 100));
  const pctDone = Math.min(1, p.goal ? p.value / p.goal : 0);
  const templatesOnly = p.canFill === 0 && p.noTemplate > 0;
  const turnOn = () => { p.onTurnOn(); setLit(true); window.setTimeout(() => primary.current?.focus({ preventScroll: true }), 30); };
  // The scene and the words follow when the fill starts: before noon = morning, before 17:00 = afternoon, else night.
  const part = partOf(p.start);
  const W = WORDS[part];

  return <div className="fw-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) p.onClose("snooze"); }}>
    <div ref={card} className={`fw fw-${part}${lit ? " lit" : ""}`} role="alertdialog" aria-modal="true" aria-labelledby="fw-title" aria-describedby="fw-lead">
      <div className="fw-sky" aria-hidden="true">
        {part === "night" && STARS.map(([x, y, s, d], i) => <i key={i} className="fw-star" style={{ left: `${x}%`, top: `${y}%`, width: s, height: s, "--d": `${d}s` } as CSSProperties} />)}
        <span className="fw-sun"><i className="fw-rays" /></span>
        {part === "night" && <span className="fw-moon"><Moon size={30} /></span>}
        {part !== "night" && CLOUDS[part].map(([y, w, d, delay, o], i) => <svg key={i} className="fw-cloud" viewBox="0 0 64 34" style={{ top: `${y}%`, width: w, "--d": `${d}s`, "--delay": `${delay}s`, opacity: o } as CSSProperties}><path fill="#fff" d="M14 32a7 7 0 0 1-2-13.7A11 11 0 0 1 20 9a13 13 0 0 1 24-2 10 10 0 0 1 12 10 7.5 7.5 0 0 1-1 15z" /></svg>)}
        {part === "morning" && <><i className="fw-mist a" /><i className="fw-mist b" /></>}
        {part === "afternoon" && [0, 1, 2].map((i) => <i key={i} className={`fw-flare f${i}`} />)}
        <svg className="fw-hills" viewBox="0 0 400 60" preserveAspectRatio="none"><path d="M0 60V38c40-14 70-16 110-4s80 10 120-6 90-18 170 6v26z" /><path className="far" d="M0 60V46c50-10 90-12 140-2s90 6 140-6 80-8 120 2v20z" /></svg>
        {lit && [0, 1, 2].map((i) => <svg key={i} className={`fw-plane p${i}`} viewBox="0 0 24 24"><path d="M2 12 22 3l-6 19-4-8z" /><path d="m12 14 10-11" /></svg>)}
      </div>
      <div className="fw-top">
        <span className={`fw-state${lit ? " on" : ""}`}><i aria-hidden="true" />{W.name} · {lit ? "on" : "off"}</span>
        <button type="button" className="fw-x" onClick={() => p.onClose("snooze")} aria-label="Close — remind me in an hour"><X size={17} /></button>
      </div>
      <div className="fw-clock" aria-hidden={lit}>
        {lit ? <><b className="fw-big">On</b><span>{started ? "It starts within a few minutes" : `It starts at ${p.start}`}</span></>
          : started ? <><b className="fw-big">Now</b><span>It's past {p.start} — your fill time</span></>
            : <><b className="fw-big">{hh}:{String(mm).padStart(2, "0")}<small>:{String(ss).padStart(2, "0")}</small></b><span>until {p.start}, when your {W.name.toLowerCase()} would start</span></>}
      </div>

      <div className="fw-body">
        {lit ? <>
          <h2 id="fw-title"><Sparkles size={20} aria-hidden="true" /> Done. Your goal fills itself {W.when}.</h2>
          <p id="fw-lead" className="fw-lead">From {p.start} the CRM follows up for you until you reach {p.goal}, then it stops. Every email you send yourself before then means one fewer it needs to send. Someone replies? Their follow-up is cancelled.</p>
        </> : templatesOnly ? <>
          <h2 id="fw-title">The {W.name.toLowerCase()} can't help you yet.</h2>
          <p id="fw-lead" className="fw-lead">You're at <b>{p.value} of {p.goal}</b> and {p.noTemplate} {p.noTemplate === 1 ? "person is" : "people are"} due a follow-up, but you have no follow-up templates for {p.noTemplate === 1 ? "them" : "those rounds"}. Write a few (two minutes), then turn the {W.name.toLowerCase()} on.</p>
        </> : <>
          <h2 id="fw-title">{p.left} short of your goal, and nobody's on the {W.shift} shift.</h2>
          <p id="fw-lead" className="fw-lead">You're at <b>{p.value} of {p.goal}</b> today{p.waiting > 0 ? `, with ${p.waiting} follow-up${p.waiting === 1 ? "" : "s"} already waiting to go` : ""}. The {W.name.toLowerCase()} is <b>off</b>, so {started ? "nothing is going out" : `at ${p.start} nothing happens`}. Turn it on and the CRM sends up to <b>{p.canFill}</b> follow-up{p.canFill === 1 ? "" : "s"} for you {W.when}, only to people who never answered, at a good hour in their country.</p>
        </>}

        <div className="fw-goal" aria-label={`${p.value} of ${p.goal} emails today`}>
          <div className="fw-goal-bar"><i style={{ width: `${pctDone * 100}%` }} /><i className="fw-goal-add" style={{ left: `${pctDone * 100}%`, width: `${Math.min(1 - pctDone, p.goal ? p.canFill / p.goal : 0) * 100}%` }} /></div>
          <div className="fw-goal-legend"><span><b>{p.value}</b> sent today</span>{p.canFill > 0 && <span className="add"><b>+{p.canFill}</b> the fill can add</span>}<span>goal <b>{p.goal}</b></span></div>
        </div>

        {p.times.length > 0 && <div className="fw-night">
          <span className="fw-night-head">Where {W.whens} follow-ups would land</span>
          <div className="fw-line" role="img" aria-label={`${p.times.length} follow-ups between ${hm(p.times[0])} and ${hm(p.times[p.times.length - 1])}`}>
            {p.times.map((t, i) => <i key={i} className="fw-dot" style={{ left: `${pct(t)}%`, "--i": i } as CSSProperties} />)}
          </div>
          <div className="fw-line-ends"><span>{hm(from)}</span><span>Midnight</span></div>
        </div>}

        <div className="fw-actions">
          {lit ? <button ref={primary} type="button" className="fw-go" onClick={() => p.onClose("off")}><Check size={16} aria-hidden="true" /> Done</button>
            : templatesOnly ? <button ref={primary} type="button" className="fw-go" onClick={p.onWrite}><PenLine size={16} aria-hidden="true" /> Write my templates</button>
              : <button ref={primary} type="button" className="fw-go" onClick={turnOn}><span className="fw-switch" aria-hidden="true"><i /></span> Turn on the {W.name.toLowerCase()}</button>}
          {!lit && <button type="button" className="fw-later" onClick={() => p.onClose("off")}>{W.not}</button>}
          <button type="button" className="fw-link" onClick={p.onSettings}>{lit ? "See Autopilot" : `Change the ${p.start} start`} <ArrowRight size={14} aria-hidden="true" /></button>
        </div>
        {!lit && <p className="fw-foot">Close it and it's back in an hour. “{W.not}” lets you be till tomorrow.</p>}
      </div>
    </div>
  </div>;
}
