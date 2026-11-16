import { AlertTriangle, ArrowRight, BedDouble, Check, ChevronDown, Clock3, Layers, Loader2, Mail, Moon, PenLine, PlaneTakeoff, RefreshCcw, Send, ShieldCheck, Sparkles, Square, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCoach } from "../components/Coach";
import { Avatar, Button, Modal, PageHeader } from "../components/ui";
import { useAutopilot, useAutopilotPrefs, type PlanAnswer, type PlanRow, type QueueItem } from "../contexts/AutopilotContext";
import { useData } from "../contexts/DataContext";
import { useGmail } from "../contexts/GmailContext";
import { useToast } from "../contexts/ToastContext";
import { templateCount, readTemplates, ROUNDS, type HoldWhy } from "../lib/autopilot";
import { ordinal } from "../lib/followupEngine";
import { timeIn, dayEndIn, dayStartIn, placeOf } from "../lib/zones";
import { minutesOf } from "../lib/autopilot";
import { dateFmt } from "../lib/days";
import { FillAsk } from "../components/FillAsk";

// Autopilot: follow-ups the CRM sends for you — only to influencers who never
// answered, with your own templates, at their daytime, never past your
// midnight. One screen: today's number and what's ready, "send N for me" with
// a plan you see before anything is queued, today's queue, and the night fill.

const hm = (ms: number) => dateFmt({ hour: "numeric", minute: "2-digit" }).format(ms);
const left = (ms: number) => { const m = Math.max(0, Math.round(ms / 60_000)); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`; };
const inWords = (ms: number) => { const m = Math.round(ms / 60_000); return m <= 0 ? "now" : m < 60 ? `in ${m} min` : `in ${Math.floor(m / 60)} h ${m % 60} min`; };
const ORIGIN: Record<QueueItem["origin"], string> = { batch: "You started it", fill: "Night fill", manual: "From their profile" };
const REASON: Record<string, string> = {
  replied: "They replied — cancelled", you_followed_up: "You followed up yourself", scheduled_in_gmail: "You scheduled one in Gmail", goal_met: "Goal already met",
  day_over: "The day ended first", their_night: "Too late in their day", status: "No longer Contacted / No reply", gone: "Conversation gone from Gmail", fill_off: "Night fill switched off",
  by_you: "Cancelled by you", mailbox: "Mailbox can't send — reconnect it", mailbox_limit: "Mailbox hit its daily limit", no_recipient: "Couldn't tell who to send to", interrupted: "Interrupted — not sent", gmail_busy: "Gmail was busy", access: "Account not approved",
};
const HELD: Record<HoldWhy, { title: string; fix?: { to: string; label: string } }> = {
  "no-template": { title: "No template for that follow-up yet", fix: { to: "/app/settings#follow-templates", label: "Write one" } },
  mailbox: { title: "Their mailbox isn't connected or can't send", fix: { to: "/app/settings#gmail", label: "Reconnect" } },
  "new-thread": { title: "4 follow-ups done — a new thread is next", fix: { to: "/app/influencers?follow=thread", label: "See them" } },
  "past-4": { title: "Past the 4th follow-up" },
  "other-channel": { title: "On another channel, or email reminders off" },
  "no-thread": { title: "No email thread to reply in" },
  paused: { title: "A no-follow-up day (Settings → Weekends)", fix: { to: "/app/settings#weekend", label: "Weekends" } },
};

function Ring({ value, goal }: { value: number; goal: number }) {
  const size = 92, r = 40, c = 2 * Math.PI * r, p = Math.min(1, goal ? value / goal : 0);
  return <svg className="ap-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true"><circle cx={46} cy={46} r={r} className="track" /><circle cx={46} cy={46} r={r} className={`fill${p >= 1 ? " done" : ""}`} strokeDasharray={c} strokeDashoffset={c * (1 - p)} /></svg>;
}

export default function AutopilotPage() {
  const auto = useAutopilot();
  const data = useData();
  const gmail = useGmail();
  const { toast } = useToast();
  const { stats } = useCoach();
  const prefs = data.profile.preferences;
  const ap = useAutopilotPrefs();
  const templates = readTemplates(prefs?.followup_templates);
  const total = templateCount(templates);
  const [now, setNow] = useState(() => Date.now());
  const { watch } = auto;
  useEffect(() => watch(), [watch]);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(t); }, []);

  const can = auto.fits.placed.length;
  const asleep = auto.fits.unplaced.filter((u) => u.why === "asleep");
  const pendingToday = auto.today.filter((i) => i.status === "pending" || i.status === "sending");
  const goal = stats.goal;
  const gap = Math.max(0, goal - stats.sentToday - pendingToday.length);
  const [count, setCount] = useState(0);
  useEffect(() => { setCount((c) => (c ? Math.min(c, can) : Math.min(can, gap || can))); }, [can, gap]);
  const [plan, setPlan] = useState<PlanAnswer | null>(null);
  const [planning, setPlanning] = useState(false);
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [starting, setStarting] = useState(false);
  const [stopAll, setStopAll] = useState(false);
  const end = dayEndIn(auto.zone, now);
  const byRound = useMemo(() => { const m: Record<number, number> = {}; for (const r of auto.pool.ready) if (auto.fits.placed.some((p) => p.id === r.id)) m[r.round] = (m[r.round] || 0) + 1; return m; }, [auto.pool.ready, auto.fits.placed]);
  const nameOf = (id: string) => data.creators.find((c) => c.id === id)?.name || "Influencer";

  const makePlan = async (n = count, exclude: string[] = []) => {
    if (!n || planning) return;
    setPlanning(true);
    const r = await auto.plan(n, exclude);
    setPlanning(false);
    if (!r.ok) { toast(r.message, "error"); return; }
    if (!r.data.rows.length) { toast("Nobody fits in what's left of today — try earlier tomorrow", "info"); return; }
    setPlan(r.data);
    setDropped(new Set());
    requestAnimationFrame(() => document.getElementById("ap-plan")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const start = async () => {
    if (!plan || starting) return;
    const rows = plan.rows.filter((r) => !dropped.has(r.creatorId));
    if (!rows.length) return;
    setStarting(true);
    const r = await auto.start(rows);
    setStarting(false);
    if (!r.ok) { toast(r.message, "error"); return; }
    setPlan(null);
    const first = rows[0];
    const batch = r.data.batch;
    toast(`${r.data.queued} follow-up${r.data.queued === 1 ? "" : "s"} on autopilot — the first goes at ${hm(first.at)}${r.data.rejected.length ? ` · ${r.data.rejected.length} changed meanwhile and stayed out` : ""}`, "success", { label: "Undo", run: () => void auto.cancel({ batch }).then((x) => toast(x.ok ? "Undone — nothing will be sent" : x.message, x.ok ? "success" : "error")) });
  };

  const header = <PageHeader eyebrow="Follow-ups on autopilot" title="Autopilot" description="The CRM follows up with influencers who never answered — your own words, in their daytime, never past your midnight. The moment someone replies, anything waiting for them is cancelled." actions={<Link className="btn btn-secondary btn-md" to="/app/settings#follow-templates"><Layers size={15} /> Templates · {total}</Link>} />;

  if (!gmail.connected) return <div className="ap">{header}<section className="ap-setup"><Mail size={22} /><div><h2>Connect Gmail first</h2><p>Autopilot replies in your real Gmail threads, from the mailbox that wrote to them.</p></div><Link className="btn btn-primary btn-md" to="/app/settings#gmail">Connect Gmail <ArrowRight size={15} /></Link></section></div>;

  const queue = [...auto.today].sort((a, b) => a.send_at.localeCompare(b.send_at));
  const upcoming = queue.filter((i) => i.status === "pending" || i.status === "sending");
  const sent = queue.filter((i) => i.status === "sent").reverse();
  const missed = queue.filter((i) => i.status === "cancelled" || i.status === "failed").reverse();
  const heldGroups = new Map<HoldWhy, string[]>();
  for (const h of auto.pool.held) heldGroups.set(h.why, [...(heldGroups.get(h.why) || []), h.name]);
  const keep = plan ? plan.rows.filter((r) => !dropped.has(r.creatorId)) : [];
  const many = gmail.mailboxes.length > 1;

  return <div className="ap">
    {header}
    {!total && <section className="ap-setup">
      <PenLine size={22} />
      <div><h2>Write your follow-ups once</h2><p>Save a few ways to say each follow-up (1st to 4th). Autopilot spreads them evenly and picks the one that fits each email — {auto.pool.ready.length + auto.pool.held.length} follow-up{auto.pool.ready.length + auto.pool.held.length === 1 ? " is" : "s are"} due today.</p></div>
      <Link className="btn btn-primary btn-md" to="/app/settings#follow-templates">Write templates <ArrowRight size={15} /></Link>
    </section>}

    <section className="ap-hero" aria-label="Today">
      <div className="ap-goal">
        <Ring value={stats.sentToday} goal={goal} />
        <div><b>{stats.sentToday}<small>/{goal}</small></b><span>sent today</span><em>{gap > 0 ? `${gap} to go` : "Goal reached"} · {left(end - now)} left today</em></div>
      </div>
      <div className="ap-ready">
        <span className="ap-kicker"><PlaneTakeoff size={13} /> Ready to send</span>
        <b>{can}</b>
        <div className="ap-rounds">{ROUNDS.map((r) => byRound[r] ? <span key={r} className={`ap-round r${r}`}>{ordinal(r)} ×{byRound[r]}</span> : null)}</div>
        <p>{[asleep.length ? `${asleep.length} asleep till after your midnight` : "", auto.pool.byHand.length ? `${auto.pool.byHand.length} yours to write` : "", pendingToday.length ? `${pendingToday.length} already waiting` : ""].filter(Boolean).join(" · ") || "Only people who never answered."}</p>
      </div>
      <div className="ap-launch">
        {can > 0 ? <>
          <label className="ap-count-label" htmlFor="ap-count">Send for me</label>
          <div className="ap-count">
            <button type="button" onClick={() => setCount((c) => Math.max(1, c - 1))} aria-label="One fewer" disabled={count <= 1}>−</button>
            <input id="ap-count" type="number" min={1} max={can} value={count || ""} onChange={(e) => setCount(Math.max(1, Math.min(can, Math.round(Number(e.target.value) || 1))))} />
            <button type="button" onClick={() => setCount((c) => Math.min(can, c + 1))} aria-label="One more" disabled={count >= can}>+</button>
            <span>follow-up{count === 1 ? "" : "s"}</span>
          </div>
          <div className="ap-quick">
            {gap > 0 && gap < can && <button type="button" className={count === gap ? "on" : ""} onClick={() => setCount(gap)}>Close the gap · {gap}</button>}
            <button type="button" className={count === can ? "on" : ""} onClick={() => setCount(can)}>All {can}</button>
          </div>
          <Button onClick={() => void makePlan()} loading={planning} disabled={!count}>{planning ? "Planning…" : <>Plan {count} <ArrowRight size={15} /></>}</Button>
          <small>You see who, which words and when before anything is queued.</small>
        </> : <div className="ap-none">
          {auto.pool.held.some((h) => h.why === "paused") ? <><Moon size={18} /><p><b>No follow-ups today</b>It's a light day in your weekend settings — they wait for your next working day.</p></>
            : asleep.length ? <><BedDouble size={18} /><p><b>Everyone due is asleep</b>Their 8:00 comes after your midnight — plan them tomorrow.</p></>
            : auto.pool.held.length ? <><AlertTriangle size={18} /><p><b>Nothing can go yet</b>See why on the right — usually a missing template.</p></>
            : <><Check size={18} /><p><b>Nothing due right now</b>Follow-ups come back as their days arrive.</p></>}
        </div>}
      </div>
    </section>

    {plan && <section id="ap-plan" className="ap-plan" aria-label="Your plan">
      <header>
        <div>
          <h2>{keep.length} follow-up{keep.length === 1 ? "" : "s"}{keep.length ? ` · ${hm(keep[0].at)} – ${hm(keep[keep.length - 1].at)}` : ""}</h2>
          <p>{plan.ai ? <><Sparkles size={13} /> Words checked by AI against each email</> : <><ShieldCheck size={13} /> Words picked by the rules (no AI answered)</>} · spread evenly, never one text to everyone</p>
        </div>
        <button type="button" className="ap-x" onClick={() => setPlan(null)} aria-label="Close the plan"><X size={17} /></button>
      </header>
      <ol className="ap-timeline">
        {plan.rows.map((r) => <PlanItem key={r.creatorId} r={r} off={dropped.has(r.creatorId)} many={many} toggle={() => setDropped((d) => { const n = new Set(d); if (n.has(r.creatorId)) n.delete(r.creatorId); else n.add(r.creatorId); return n; })} />)}
      </ol>
      {plan.asleep.length > 0 && <p className="ap-plan-note"><BedDouble size={14} /> {plan.asleep.length} more can't go today — it's night where they are until after your midnight.</p>}
      <footer>
        <span>Cancelled by itself if anyone replies first. Nothing past {hm(end - 3 * 60_000)}.</span>
        <Button variant="ghost" onClick={() => void makePlan(count, [...dropped])} disabled={planning}><RefreshCcw size={14} /> New times</Button>
        <Button onClick={() => void start()} loading={starting} disabled={!keep.length}><PlaneTakeoff size={15} /> Start · {keep.length}</Button>
      </footer>
    </section>}

    <div className="ap-grid">
      <section className="ap-queue" aria-label="Today's queue">
        <header><h2>Today</h2>{upcoming.length > 0 && <button type="button" className="ap-stop" onClick={() => setStopAll(true)}><Square size={13} /> Stop all · {upcoming.length}</button>}</header>
        {!queue.length && <div className="ap-empty"><Clock3 size={18} /><p>Nothing on autopilot today. Plan some above{ap.fill ? ", or let the night fill top you up" : ""}.</p></div>}
        {upcoming.length > 0 && <ol className="ap-list">{upcoming.map((i) => <QueueLine key={i.id} i={i} name={nameOf(i.creator_id)} now={now} many={many} onCancel={() => void auto.cancel({ id: i.id }).then((r) => toast(r.ok ? "Cancelled — it won't be sent" : r.message, r.ok ? "success" : "error"))} />)}</ol>}
        {sent.length > 0 && <><h3><Check size={14} /> Sent · {sent.length}</h3><ol className="ap-list done">{sent.map((i) => <QueueLine key={i.id} i={i} name={nameOf(i.creator_id)} now={now} many={many} />)}</ol></>}
        {missed.length > 0 && <details className="ap-missed"><summary><Undo2 size={14} /> Didn't go · {missed.length}<ChevronDown size={14} /></summary><ol className="ap-list off">{missed.map((i) => <QueueLine key={i.id} i={i} name={nameOf(i.creator_id)} now={now} many={many} />)}</ol></details>}
      </section>

      <aside className="ap-side">
        <NightFill />
        {(heldGroups.size > 0 || asleep.length > 0) && <section className="ap-card ap-held">
          <h2>Can't go today</h2>
          {asleep.length > 0 && <details><summary><BedDouble size={14} /><span>Asleep till after your midnight</span><b>{asleep.length}</b></summary><ul>{asleep.slice(0, 30).map((u) => <li key={u.id}><Link to={`/app/influencers/${u.id}`}>{nameOf(u.id)}</Link><small>{u.zone ? `${timeIn(u.zone, now)} in ${placeOf(u.zone)}` : ""}{u.opensAt ? ` · their 8:00 = your ${hm(u.opensAt)}` : ""}</small></li>)}</ul></details>}
          {[...heldGroups.entries()].map(([why, names]) => <details key={why}><summary><AlertTriangle size={14} /><span>{HELD[why].title}</span><b>{names.length}</b></summary><ul>{names.slice(0, 30).map((n, k) => <li key={k}>{n}</li>)}</ul>{HELD[why].fix && <Link className="ap-fix" to={HELD[why].fix!.to}>{HELD[why].fix!.label} <ArrowRight size={13} /></Link>}</details>)}
        </section>}
        {auto.pool.byHand.length > 0 && <section className="ap-card ap-hand">
          <h2><PenLine size={15} /> Yours to write · {auto.pool.byHand.length}</h2>
          <p>They answered at some point — a template would read wrong, so Autopilot never writes to them.</p>
          <Link className="ap-fix" to="/app/influencers?follow=byhand">Follow up by hand <ArrowRight size={13} /></Link>
        </section>}
        <details className="ap-card ap-how">
          <summary><ShieldCheck size={15} /> How Autopilot stays safe<ChevronDown size={14} /></summary>
          <ul>
            <li><b>Only people who never answered.</b> Any reply — even an emoji, even their manager — and they're yours. Out-of-office doesn't count.</li>
            <li><b>Checked again right before each send.</b> Gmail is read fresh: their reply, a follow-up you sent yourself, or one you scheduled in Gmail cancels it.</li>
            <li><b>Your words, spread evenly.</b> Every template before any repeats; the one that fits each email first (never the same question twice).</li>
            <li><b>Their daytime, your day.</b> 8:00–22:00 where they live, near when you first wrote, odd minutes, spaced apart — and never after your midnight.</li>
          </ul>
        </details>
      </aside>
    </div>

    <Modal open={stopAll} onClose={() => setStopAll(false)} title={`Stop all ${upcoming.length} waiting follow-ups?`} description="Nothing more goes out today. They come back as due follow-ups you can plan again.">
      <div className="modal-actions">
        <Button variant="ghost" onClick={() => setStopAll(false)}>Keep them</Button>
        {ap.fill && <Button variant="secondary" onClick={() => { setStopAll(false); data.updateProfile({ preferences: { ...prefs, autopilot: { ...ap, fill: false } } }); void auto.cancel({ all: true }).then((r) => toast(r.ok ? `Stopped — ${r.data.cancelled} cancelled, night fill off` : r.message, r.ok ? "success" : "error")); }}><Moon size={14} /> Stop + fill off</Button>}
        <Button variant="danger" onClick={() => { setStopAll(false); void auto.cancel({ all: true }).then((r) => toast(r.ok ? `Stopped — ${r.data.cancelled} cancelled${ap.fill ? ". The night fill can still add others — turn it off to stop that too" : ""}` : r.message, r.ok ? "success" : "error")); }}><Square size={14} /> Stop all</Button>
      </div>
    </Modal>
  </div>;
}

function PlanItem({ r, off, toggle, many }: { r: PlanRow; off: boolean; toggle: () => void; many: boolean }) {
  const [open, setOpen] = useState(false);
  return <li className={`ap-step${off ? " off" : ""}`}>
    <time dateTime={new Date(r.at).toISOString()}><b>{hm(r.at)}</b>{r.zone ? <small>{timeIn(r.zone, r.at)} {placeOf(r.zone)}</small> : <small>no country</small>}</time>
    <i className="ap-dot" aria-hidden="true" />
    <div className="ap-step-body">
      <div className="ap-step-top">
        <Avatar name={r.name} size="sm" />
        <Link to={`/app/influencers/${r.creatorId}`} className="ap-name">{r.name}</Link>
        <span className={`ap-round r${r.round}`}>{ordinal(r.round)}</span>
        {many && <span className="ap-box">{r.mailbox.split("@")[0]}</span>}
      </div>
      <button type="button" className="ap-words" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span><b>{r.templateName}</b>{r.fit?.why ? <em>{r.fit.why}</em> : null}{r.fit?.echo ? <em className="warn">repeats your last question — no other template left</em> : null}</span>
        <ChevronDown size={14} />
      </button>
      {open && <div className="ap-text">{r.asked && <small>Answers: “{r.asked}”</small>}<p>{r.text}</p></div>}
    </div>
    <button type="button" className="ap-toggle" onClick={toggle} aria-pressed={!off} aria-label={off ? `Put ${r.name} back in` : `Leave ${r.name} out`} title={off ? "Put back" : "Leave out"}>{off ? <Undo2 size={15} /> : <X size={15} />}</button>
  </li>;
}

function QueueLine({ i, name, now, many, onCancel }: { i: QueueItem; name: string; now: number; many: boolean; onCancel?: () => void }) {
  const at = new Date(i.status === "sent" && i.sent_at ? i.sent_at : i.send_at).getTime();
  const zone = i.their_zone.split(",")[0];
  const waiting = i.status === "pending" || i.status === "sending";
  return <li className={`ap-line s-${i.status}`}>
    <time dateTime={new Date(at).toISOString()}><b>{hm(at)}</b><small>{waiting ? (i.status === "sending" ? "sending…" : inWords(at - now)) : zone ? `${timeIn(zone, at)} ${placeOf(zone)}` : ""}</small></time>
    <div>
      <span className="ap-line-top"><Link to={`/app/influencers/${i.creator_id}`}>{name}</Link><span className={`ap-round r${i.round}`}>{ordinal(i.round)}</span>{many && <span className="ap-box">{i.mailbox.split("@")[0]}</span>}</span>
      <small>{i.status === "cancelled" || i.status === "failed" ? REASON[i.reason] || "Didn't go" : `“${i.template_name}” · ${ORIGIN[i.origin]}`}{waiting && zone ? ` · ${timeIn(zone, at)} in ${placeOf(zone)}` : ""}</small>
    </div>
    {i.status === "sending" ? <Loader2 size={15} className="spin" aria-label="Sending" /> : i.status === "sent" ? <Send size={14} className="ap-sent" aria-label="Sent" /> : onCancel && i.status === "pending" ? <button type="button" className="ap-cancel" onClick={onCancel} aria-label={`Cancel the follow-up to ${name}`}><X size={14} /></button> : null}
  </li>;
}

function NightFill() {
  const auto = useAutopilot();
  const data = useData();
  const { toast } = useToast();
  const { stats } = useCoach();
  const prefs = data.profile.preferences;
  const ap = useAutopilotPrefs();
  const set = (patch: Partial<typeof ap>) => data.updateProfile({ preferences: { ...prefs, autopilot: { ...ap, ...patch } } });
  const now = Date.now();
  const startAt = dayStartIn(auto.zone, now) + minutesOf(ap.start) * 60_000;
  const inWindow = now >= startAt;
  const filled = auto.today.filter((i) => i.origin === "fill" && i.status !== "cancelled").length;
  const toggle = (on: boolean) => {
    set({ fill: on });
    if (!on) void auto.cancel({ origin: "fill" });
    toast(on ? `Night fill on — from ${ap.start} it tops up your goal of ${stats.goal}` : "Night fill off — nothing it queued will go", "success");
  };
  return <section className={`ap-card ap-fill${ap.fill ? " on" : ""}`}>
    <label className="ap-fill-head">
      <span className="ap-moon" aria-hidden="true"><Moon size={17} /></span>
      <span><b>Fill my goal at night</b><small>{ap.fill ? (inWindow ? `On · checking every 15 min till midnight${filled ? ` · ${filled} queued` : ""}` : `On · starts at ${ap.start}`) : "Off"}</small></span>
      <input type="checkbox" role="switch" checked={ap.fill} onChange={(e) => toggle(e.target.checked)} aria-label="Fill my goal at night" />
    </label>
    <p>When today's emails are short of your goal ({stats.goal}), the CRM follows up for you from your start time to midnight — only people who never answered, and it stops once the goal is met.</p>
    <div className="ap-fill-row">
      <label><span>Start at</span><input type="time" step={300} value={ap.start} onChange={(e) => /^\d{2}:\d{2}$/.test(e.target.value) && set({ start: e.target.value })} /></label>
      <div className="ap-cap"><span>At most a day</span>
        <span className="day-stepper" role="group" aria-label="Most follow-ups the CRM sends a day">
          <button type="button" onClick={() => set({ cap: Math.max(0, ap.cap - 5) })} aria-label="Lower" disabled={ap.cap === 0}>−</button>
          <b>{ap.cap || "Goal"}</b>
          <button type="button" onClick={() => set({ cap: Math.min(200, (ap.cap || 0) + 5) })} aria-label="Raise">+</button>
        </span>
      </div>
    </div>
    <small className="ap-fill-foot">{ap.cap ? `Leaves room: never more than ${ap.cap} from the CRM in a day — past that it asks first.` : "No ceiling: as many as your goal needs."}</small>
    {auto.day && auto.day.short > 0 && !auto.day.declined && !auto.day.extra_ok && ap.fill && <FillAsk short={auto.day.short} />}
  </section>;
}
