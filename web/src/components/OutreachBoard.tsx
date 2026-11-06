import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, Building2, CalendarClock, CheckCircle2, Handshake, Mail, RefreshCw, Reply, Send, ShieldCheck, Sparkles, Trophy, UserPlus, Users, X, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { useGmail } from "../contexts/GmailContext";
import { useToast } from "../contexts/ToastContext";
import { useOutreachLogs } from "../hooks/useOutreach";
import { dailyBuckets, makeStats, rangeOf, type MetricKey, type RangeKey, type Row, type View } from "../lib/dashboardStats";
import { sendsAt } from "../lib/followupEngine";
import { relativeTime, stampLabel, timeLabel } from "../lib/utils";
import { Tabs } from "./ui";

// The outreach scoreboard: what you sent and what came back, for everyone or
// for one side (influencers / brands), over a range you pick. Every number
// opens the list of exactly what it counted, so it can be checked by eye.

const RANGES: { value: RangeKey; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "This week" },
  { value: "lastweek", label: "Last week" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "all", label: "All time" },
];
const VIEWS: { value: View; label: string; icon: typeof Users }[] = [
  { value: "all", label: "Everyone", icon: Sparkles },
  { value: "creator", label: "Influencers", icon: Users },
  { value: "brand", label: "Brands", icon: Building2 },
];

const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode: the choice lasts this visit
  }
};
const recall = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
};

type Open = { metric: MetricKey; view: View; start: number; end: number; horizon?: number; title: string } | null;

const METRIC_WORD: Record<MetricKey, string> = { emails: "Emails sent", followups: "Follow-ups", first: "New conversations", newthreads: "New threads", answers: "Answers", replies: "Replies received", negotiations: "Negotiations started", wins: "Wins", lost: "Lost", added: "Added", e_first: "New conversations", e_followups: "Follow-ups by email", e_answers: "Answers", e_newthreads: "New threads", e_scheduled: "Scheduled emails" };

export function OutreachBoard() {
  const data = useData();
  const gmail = useGmail();
  const { toast } = useToast();
  const { sent, received } = useOutreachLogs();
  const [rangeKey, setRangeKey] = useState<RangeKey>(() => recall("if.momentum-range", RANGES.map((r) => r.value), "today"));
  const [view, setView] = useState<View>(() => recall("if.dash-view", ["all", "creator", "brand"] as const, "all"));
  const [open, setOpen] = useState<Open>(null);
  const range = rangeOf(rangeKey);
  const stats = useMemo(
    () => makeStats({ sent, received, creators: data.creators, brands: data.brands, contacts: data.contacts, campaigns: data.campaigns, activities: data.activities, leads: gmail.leads }),
    [sent, received, data.creators, data.brands, data.contacts, data.campaigns, data.activities, gmail.leads],
  );
  const pickRange = (v: string) => { setRangeKey(v as RangeKey); remember("if.momentum-range", v); setOpen(null); };
  const pickView = (v: View) => { setView(v); remember("if.dash-view", v); setOpen(null); };

  const c = (m: MetricKey, v: View = view, s = range.start, e = range.end) => stats.count(m, v, s, e);
  const delta = (m: MetricKey, v: View = view) => (range.compare ? c(m, v) - c(m, v, range.prevStart, range.prevEnd) : null);
  const show = (metric: MetricKey, v: View = view, title?: string) => setOpen((cur) => (cur && cur.metric === metric && cur.view === v && cur.start === range.start ? null : { metric, view: v, start: range.start, end: range.end, title: title || `${METRIC_WORD[metric]}${v === "creator" ? " · influencers" : v === "brand" ? " · brands" : ""}` }));

  const waiting = stats.scheduled(view);
  const nextSend = waiting.map((s) => sendsAt(s.at)).find(Boolean);
  const rate = stats.replyRate(view, range.start, range.end);
  const people = stats.repliers(view, range.start, range.end);

  // Daily chart: the last 14 days, split by what you sent; replies beside.
  const days = dailyBuckets(14);
  const daily = days.map((d) => ({
    ...d,
    "First emails": c("first", view, d.start, d.end),
    "Follow-ups": c("followups", view, d.start, d.end),
    "Answers & new threads": c("answers", view, d.start, d.end) + c("newthreads", view, d.start, d.end),
    Replies: c("replies", view, d.start, d.end),
  }));

  const syncing = gmail.syncing;
  const sync = async () => {
    const res = await gmail.syncNow(true);
    toast(res.ok ? "Gmail checked — the numbers are up to date" : res.message || "Couldn't reach Gmail — it retries by itself", res.ok ? "success" : "error");
  };

  // "Emails sent" is the total; the mix shows what those emails were, and the parts add up to it.
  const mix = stats.emailMix(view, range.start, range.end, range.horizon);
  const emailsDelta = range.compare ? mix.total - stats.emailMix(view, range.prevStart, range.prevEnd).total : null;
  const PARTS: { key: MetricKey; n: number; label: string; hint: string; tone: string }[] = [
    { key: "e_first", n: mix.first, label: "New conversations", hint: "First email to someone", tone: "first" },
    { key: "e_followups", n: mix.followups, label: "Follow-ups", hint: "Chasing your own email", tone: "followups" },
    { key: "e_answers", n: mix.answers, label: "Answers", hint: "Replying, negotiating, lead answers", tone: "answers" },
    { key: "e_newthreads", n: mix.newthreads, label: "New threads", hint: "Fresh thread after the follow-up cap", tone: "newthreads" },
    { key: "e_scheduled", n: mix.scheduled, label: "Scheduled", hint: "Waiting in Gmail — counted by send time; cancel it and it's gone", tone: "scheduled" },
  ];
  const parts = PARTS.filter((p) => p.n > 0 || p.key === "e_first" || p.key === "e_followups");

  const sides: { seg: "creator" | "brand"; title: string; icon: typeof Users; tiles: { key: MetricKey; label: string; icon: typeof Mail; invert?: boolean }[] }[] = [
    { seg: "creator", title: "Influencers", icon: Users, tiles: [
      { key: "emails", label: "Emails sent", icon: Mail },
      { key: "followups", label: "Follow-ups", icon: Send },
      { key: "replies", label: "Replies", icon: Reply },
      { key: "negotiations", label: "Negotiations started", icon: Handshake },
      { key: "wins", label: "Roster signings", icon: Trophy },
      { key: "lost", label: "Negotiations lost", icon: XCircle, invert: true },
      { key: "added", label: "Influencers added", icon: UserPlus },
    ] },
    { seg: "brand", title: "Brands", icon: Building2, tiles: [
      { key: "emails", label: "Emails sent", icon: Mail },
      { key: "followups", label: "Follow-ups", icon: Send },
      { key: "replies", label: "Replies", icon: Reply },
      { key: "negotiations", label: "Deals in talks", icon: Handshake },
      { key: "wins", label: "Deals closed", icon: Trophy },
      { key: "lost", label: "Deals lost", icon: XCircle, invert: true },
      { key: "added", label: "Brands added", icon: UserPlus },
    ] },
  ];

  const Delta = ({ value, invert = false }: { value: number | null; invert?: boolean }) => {
    if (value === null) return null;
    const good = invert ? value < 0 : value > 0;
    return <em className={value === 0 ? "delta-flat" : good ? "delta-up" : "delta-down"} title={range.prevLabel}>{value === 0 ? `— ${range.prevLabel}` : `${value > 0 ? "+" : ""}${value} ${range.prevLabel}`}</em>;
  };

  return <section className="dash-panel outreach-board" aria-label="Outreach scoreboard">
    <div className="ob-head">
      <div className="ob-title"><span>Outreach</span><h2>{range.label}</h2></div>
      <div className="ob-controls">
        <div className="ob-views" role="radiogroup" aria-label="Show stats for">{VIEWS.map((v) => <button key={v.value} type="button" role="radio" aria-checked={view === v.value} className={view === v.value ? "on" : ""} onClick={() => pickView(v.value)}><v.icon size={13} />{v.label}</button>)}</div>
        <Tabs active={rangeKey} onChange={pickRange} tabs={RANGES} />
      </div>
    </div>

    {gmail.connected && <div className="ob-fresh">
      <span className={gmail.error ? "warn" : ""}>{gmail.error ? "Gmail needs attention — " : "Gmail checked "}{gmail.lastSyncAt ? relativeTime(gmail.lastSyncAt) : "not yet"}{!gmail.error && " · new mail shows up within a few minutes"}</span>
      <button type="button" onClick={() => void sync()} disabled={syncing} aria-label="Check Gmail now"><RefreshCw size={12} className={syncing ? "spin" : ""} /> {syncing ? "Checking…" : "Check now"}</button>
    </div>}

    <div className="ob-hero">
      <div className={`ob-total${open?.metric === "emails" && open.view === view ? " on" : ""}`}>
        <button type="button" className="ob-total-main" onClick={() => setOpen((cur) => (cur && cur.metric === "emails" && cur.view === view && cur.start === range.start ? null : { metric: "emails", view, start: range.start, end: range.end, horizon: range.horizon, title: `Emails sent${view === "creator" ? " · influencers" : view === "brand" ? " · brands" : ""}` }))} aria-label={`Emails sent: ${mix.total}. Show every email`}>
          <span className="ob-total-label"><span className="ob-ico"><Mail size={15} /></span><span><small>Emails sent</small><em>Every email · all mailboxes{mix.scheduled ? " · scheduled included" : ""}</em></span></span>
          <span className="ob-total-row"><strong>{mix.total.toLocaleString("en-US")}</strong>{emailsDelta !== null && <em className={emailsDelta === 0 ? "delta-flat" : emailsDelta > 0 ? "delta-up" : "delta-down"}>{emailsDelta === 0 ? `— ${range.prevLabel}` : `${emailsDelta > 0 ? "+" : ""}${emailsDelta} ${range.prevLabel}`}</em>}</span>
        </button>
        <div className="ob-mix-bar" role="img" aria-label={parts.map((p) => `${p.n} ${p.label.toLowerCase()}`).join(", ")}>{mix.total ? PARTS.filter((p) => p.n > 0).map((p) => <i key={p.key} className={`mix-${p.tone}`} style={{ flexGrow: p.n }} />) : <i className="mix-empty" />}</div>
        <div className="ob-mix">{parts.map((p) => {
          const on = open?.metric === p.key && open.view === view;
          return <button type="button" key={p.key} className={`ob-mix-item${on ? " on" : ""}`} onClick={() => setOpen((cur) => (cur && cur.metric === p.key && cur.view === view ? null : { metric: p.key, view, start: range.start, end: range.end, horizon: range.horizon, title: p.label }))} aria-expanded={on} title={p.hint}>
            <i className={`mix-dot mix-${p.tone}`} aria-hidden="true" /><b>{p.n.toLocaleString("en-US")}</b><span>{p.label}</span>{mix.total > 0 && p.n > 0 && <small>{Math.round((p.n / mix.total) * 100)}%</small>}
          </button>;
        })}</div>
        {(mix.otherFollowups > 0 || mix.later > 0) && <p className="ob-mix-foot">{mix.otherFollowups > 0 && <span><Send size={11} /> +{mix.otherFollowups} follow-up{mix.otherFollowups === 1 ? "" : "s"} by DM, WhatsApp or call — not emails</span>}{mix.later > 0 && <span><CalendarClock size={11} /> {mix.later} more scheduled for later{nextSend ? ` · next ${nextSend}` : ""}</span>}</p>}
      </div>
      <button type="button" className={`ob-big ob-replies${open?.metric === "replies" && open.view === view ? " on" : ""}`} onClick={() => show("replies")} aria-label={`Replies received: ${c("replies")}. Show the list`}>
        <span className="ob-big-top"><span className="ob-ico"><Reply size={15} /></span><small>Replies received</small></span>
        <strong>{c("replies").toLocaleString("en-US")}</strong>
        <span className="ob-note">{people ? `from ${people} ${people === 1 ? "person" : "people"}` : "Auto-replies never count"}</span>
        <Delta value={delta("replies")} />
      </button>
      <div className="ob-big ob-rate" title="Of the people you first contacted in this range, how many have answered so far">
        <span className="ob-big-top"><span className="ob-ico"><CheckCircle2 size={15} /></span><small>Reply rate</small></span>
        <strong>{rate.pct === null ? "—" : `${rate.pct}%`}</strong>
        <span className="ob-note">{rate.contacted ? `${rate.replied} of ${rate.contacted} new conversations answered` : "No new conversations in this range"}</span>
        <span className="ob-meter" aria-hidden="true"><i style={{ width: `${rate.pct || 0}%` }} /></span>
      </div>
    </div>

    {open && <Ledger open={open} rows={stats.rows(open.metric, open.view, open.start, open.end, open.horizon)} onClose={() => setOpen(null)} />}

    <div className={`ob-sides view-${view}`}>{sides.filter((s) => view === "all" || view === s.seg).map((side) => <div key={side.seg} className={`ob-side side-${side.seg}`}>
      <div className="ob-side-head"><side.icon size={15} /><strong>{side.title}</strong>{view === "all" && <button type="button" onClick={() => pickView(side.seg)}>Only {side.title.toLowerCase()} <ArrowRight size={12} /></button>}</div>
      <div className="ob-tiles">{side.tiles.map((t) => {
        const n = t.key === "emails" ? stats.emailMix(side.seg, range.start, range.end, range.horizon).total : c(t.key, side.seg);
        const on = open?.metric === t.key && open.view === side.seg;
        return <button type="button" key={t.key} className={`ob-tile${on ? " on" : ""}${t.invert && n ? " is-loss" : ""}`} onClick={() => t.key === "emails" ? setOpen((cur) => (cur && cur.metric === "emails" && cur.view === side.seg ? null : { metric: "emails", view: side.seg, start: range.start, end: range.end, horizon: range.horizon, title: `Emails sent · ${side.title.toLowerCase()}` })) : show(t.key, side.seg, `${t.label} · ${side.title.toLowerCase()}`)} aria-expanded={on} aria-label={`${side.title}, ${t.label}: ${n}. Show the list`}>
          <span className="ob-tile-ico"><t.icon size={13} /></span>
          <strong>{n.toLocaleString("en-US")}</strong>
          <small>{t.label}</small>
          <Delta value={t.key === "emails" ? (range.compare ? n - stats.emailMix(side.seg, range.prevStart, range.prevEnd).total : null) : delta(t.key, side.seg)} invert={t.invert} />
        </button>;
      })}</div>
    </div>)}</div>

    <div className="daily-strip">
      <div className="daily-strip-head"><span>Daily outreach · last 14 days{view !== "all" ? ` · ${view === "creator" ? "influencers" : "brands"}` : ""}</span><span className="daily-legend"><i className="lg-emails" /> First emails <i className="lg-followups" /> Follow-ups <i className="lg-answers" /> Answers <i className="lg-replies" /> Replies</span></div>
      <div className="daily-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={daily} margin={{ top: 6, right: 4, left: -18, bottom: 0 }} barCategoryGap="20%" onClick={(e) => { const i = typeof e?.activeTooltipIndex === "number" ? e.activeTooltipIndex : Number(e?.activeTooltipIndex); const d = days[i]; if (d) setOpen({ metric: "emails", view, start: d.start, end: d.end, title: `Emails sent · ${new Date(d.start).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}` }); }}>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} tick={{ fill: "var(--muted)", fontSize: 10 }} />
        <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={34} tick={{ fill: "var(--muted)", fontSize: 11 }} />
        <Tooltip cursor={{ fill: "rgba(var(--accent-rgb),.07)" }} contentStyle={{ background: "var(--surface-solid)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13, color: "var(--text)" }} />
        <Bar dataKey="First emails" stackId="o" fill="var(--accent)" style={{ cursor: "pointer" }} />
        <Bar dataKey="Follow-ups" stackId="o" fill="#24a6a1" style={{ cursor: "pointer" }} />
        <Bar dataKey="Answers & new threads" stackId="o" fill="#8c95a7" radius={[3, 3, 0, 0]} style={{ cursor: "pointer" }} />
        <Bar dataKey="Replies" fill="#d59b48" radius={[3, 3, 0, 0]} style={{ cursor: "pointer" }} />
      </BarChart></ResponsiveContainer></div>
      <p className="daily-hint">Tap a day to see every email you sent that day.</p>
    </div>

    <TrackingCheck />
  </section>;
}

function Ledger({ open, rows, onClose }: { open: NonNullable<Open>; rows: Row[]; onClose: () => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 12);
  return <div className="ob-ledger" role="region" aria-label={open.title}>
    <div className="ob-ledger-head"><strong>{open.title}</strong><span>{rows.length} {rows.length === 1 ? "item" : "items"}</span><button type="button" onClick={onClose} aria-label="Close the list"><X size={14} /></button></div>
    {rows.length ? <ol>{shown.map((r) => <li key={r.key}>
      <Link to={r.to}><b>{r.name}</b></Link>
      <span className={`ob-tag tag-${r.segment}`}>{r.tag}</span>
      <time dateTime={r.at} title={stampLabel(r.at)}>{sameDay(r.at) ? timeLabel(r.at) : stampLabel(r.at).split(" · ")[0]}</time>
      {r.sub && <small>{r.sub}</small>}
    </li>)}</ol> : <p className="ob-empty">Nothing here for this range.</p>}
    {rows.length > 12 && <button type="button" className="ob-more" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${rows.length}`}</button>}
  </div>;
}

const sameDay = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

/** What you sent in Gmail vs what the CRM tracks — the reason to trust the numbers above. */
function TrackingCheck() {
  const data = useData();
  const gmail = useGmail();
  const [open, setOpen] = useState(false);
  const cover = gmail.mailboxes.map((m) => m.coverage).filter((x): x is NonNullable<typeof x> => !!x);
  if (!cover.length) return null;
  const known = new Set([...data.creators.flatMap((c) => [c.contact_email, c.secondary_email || "", ...(c.team || []).filter((t) => !t.removed).map((t) => t.email)]), ...data.brands.flatMap((b) => [b.contact_email, b.secondary_email || ""]), ...data.contacts.map((p) => p.email)].map((e) => (e || "").toLowerCase()).filter(Boolean));
  const sent = cover.reduce((s, x) => s + x.sent, 0);
  const pending = cover.reduce((s, x) => s + x.pending, 0);
  const warmup = cover.reduce((s, x) => s + (x.warmup || 0), 0);
  // Grouped by person; anyone you've added since the last check counts as tracked.
  const people = new Map<string, { email: string; n: number; last: string; subject: string }>();
  let untracked = 0;
  for (const x of cover) for (const u of x.untracked) {
    if (u.to.some((e) => known.has(e))) continue;
    untracked++;
    const email = u.to[0];
    const p = people.get(email) || { email, n: 0, last: "", subject: "" };
    p.n++;
    if (u.at > p.last) { p.last = u.at; p.subject = u.subject; }
    people.set(email, p);
  }
  const tracked = Math.max(0, sent - untracked - pending);
  const days = cover[0].days;
  const list = [...people.values()].sort((a, b) => b.last.localeCompare(a.last));
  return <div className={`ob-check${untracked ? " has-gaps" : ""}`}>
    <ShieldCheck size={16} />
    <p><b>Tracking check</b> · last {days} days: {untracked ? <>{tracked} of {sent} emails you sent are in your CRM. <b>{untracked}</b> went to {list.length === 1 ? "someone" : `${list.length} people`} the CRM doesn't know.</> : <>all {sent} emails you sent are tracked{pending ? ` (${pending} still being read)` : ""}.</>}{warmup > 0 && <span className="ob-check-warm"> {warmup} warm-up email{warmup === 1 ? "" : "s"} left out.</span>}</p>
    {untracked > 0 && <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide" : "Review"}</button>}
    {open && <ul className="ob-check-list">{list.slice(0, 30).map((p) => <li key={p.email}>
      <span><b>{p.email}</b><small>{p.n} email{p.n === 1 ? "" : "s"} · {relativeTime(p.last)}{p.subject ? ` · “${p.subject}”` : ""}</small></span>
      <Link to={`/app/influencers?new=1&email=${encodeURIComponent(p.email)}`}>Add influencer</Link>
      <Link to={`/app/brands?new=1&email=${encodeURIComponent(p.email)}`}>Add brand</Link>
    </li>)}<li className="ob-check-note">Added people get their whole email history on the next Gmail check. Personal mail can stay out — it's never counted.</li></ul>}
  </div>;
}
