import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, Building2, CalendarClock, CheckCircle2, Handshake, Inbox, Mail, RefreshCw, Reply, Send, ShieldCheck, Sparkles, Trash2, Trophy, UserPlus, Users, X, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { useGmail } from "../contexts/GmailContext";
import { useToast } from "../contexts/ToastContext";
import { useOutreachLogs } from "../hooks/useOutreach";
import { dailyBuckets, mailboxesOf, makeStats, rangeOf, type MetricKey, type RangeKey, type Row, type View } from "../lib/dashboardStats";
import { MailboxName, mailboxTone } from "./MailboxBits";
import { sendsAt } from "../lib/followupEngine";
import { dateLabel, relativeTime, stampLabel, timeLabel } from "../lib/utils";
import { Tabs } from "./ui";

// The outreach scoreboard: what you sent and what came back, for everyone or
// for one side (influencers / brands), over a range you pick. Every number
// opens the list of exactly what it counted, so it can be checked by eye.

type AheadItem = ReturnType<ReturnType<typeof makeStats>["scheduledAhead"]>[number];
type AheadDay = { key: string; day: Date; n: number; kinds: Record<AheadItem["role"], number>; items: AheadItem[] };
/** What a scheduled email is, in the words you'd use (same colours as the Emails sent mix). */
const AHEAD_KINDS: { role: AheadItem["role"]; one: string; many: string; cls: string }[] = [
  { role: "first", one: "new email", many: "new emails", cls: "k-first" },
  { role: "followup", one: "follow-up", many: "follow-ups", cls: "k-followups" },
  { role: "newthread", one: "new thread", many: "new threads", cls: "k-newthreads" },
  { role: "answer", one: "reply", many: "replies", cls: "k-answers" },
];

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
  // Every mailbox you connected or that shows up in your mail, busiest first.
  const mailboxes = useMemo(() => {
    const seen = mailboxesOf(sent, received);
    for (const m of gmail.mailboxes) if (!seen.includes(m.email.toLowerCase())) seen.push(m.email.toLowerCase());
    return seen;
  }, [sent, received, gmail.mailboxes]);
  const [boxPick, setBoxPick] = useState(() => { try { return localStorage.getItem("if.dash-mailbox") || ""; } catch { return ""; } });
  const box = mailboxes.includes(boxPick) ? boxPick : "";
  const base = useMemo(() => ({ sent, received, creators: data.creators, brands: data.brands, contacts: data.contacts, campaigns: data.campaigns, activities: data.activities, leads: gmail.leads }), [sent, received, data.creators, data.brands, data.contacts, data.campaigns, data.activities, gmail.leads]);
  const stats = useMemo(() => makeStats({ ...base, mailbox: box }), [base, box]);
  // Each mailbox's share, for the "who sent it" split (only with 2+ mailboxes).
  const perBox = useMemo(() => (mailboxes.length > 1 ? mailboxes.map((m) => ({ mailbox: m, stats: makeStats({ ...base, mailbox: m }) })) : []), [base, mailboxes]);
  const pickBox = (m: string) => { setBoxPick(m); remember("if.dash-mailbox", m); setOpen(null); };
  const pickRange = (v: string) => { setRangeKey(v as RangeKey); remember("if.momentum-range", v); setOpen(null); };
  const pickView = (v: View) => { setView(v); remember("if.dash-view", v); setOpen(null); };

  const c = (m: MetricKey, v: View = view, s = range.start, e = range.end) => stats.count(m, v, s, e);
  const delta = (m: MetricKey, v: View = view) => (range.compare ? c(m, v) - c(m, v, range.prevStart, range.prevEnd) : null);
  const show = (metric: MetricKey, v: View = view, title?: string) => setOpen((cur) => (cur && cur.metric === metric && cur.view === v && cur.start === range.start ? null : { metric, view: v, start: range.start, end: range.end, title: title || `${METRIC_WORD[metric]}${v === "creator" ? " · influencers" : v === "brand" ? " · brands" : ""}` }));

  const waiting = stats.scheduled(view);
  const nextSend = waiting.map((s) => sendsAt(s.at)).find(Boolean);
  // Emails waiting in Gmail's Scheduled folder for a day after this period:
  // they count on the day they go out, so they're shown apart, day by day.
  const ahead = useMemo(() => {
    if (range.horizon >= Number.MAX_SAFE_INTEGER) return [];
    const byDay = new Map<string, AheadDay>();
    for (const x of stats.scheduledAhead(view, range.horizon)) {
      const t = new Date(x.at);
      const day = new Date(t.getFullYear(), t.getMonth(), t.getDate());
      const k = day.toDateString();
      const row = byDay.get(k) || { key: k, day, n: 0, kinds: { first: 0, followup: 0, newthread: 0, answer: 0 }, items: [] };
      row.n++;
      row.kinds[x.role]++;
      row.items.push(x);
      byDay.set(k, row);
    }
    return [...byDay.values()].sort((a, b) => a.day.getTime() - b.day.getTime());
  }, [stats, view, range.horizon]);
  const [aheadOpen, setAheadOpen] = useState("");
  const openDay = ahead.find((d) => d.key === aheadOpen);
  const rate = stats.replyRate(view, range.start, range.end);
  // Replies are people (first answer to your outreach); the rest of each conversation is shown apart.
  const chatter = stats.conversation(view, range.start, range.end);

  // Daily chart: the last 14 days, split by what you sent; replies beside.
  // With one mailbox picked the scale stays the one of ALL mailboxes, so its
  // share is visibly smaller instead of being stretched to fill the chart.
  const days = dailyBuckets(14);
  const dayOf = (st: typeof stats, d: (typeof days)[number]) => {
    const first = st.count("first", view, d.start, d.end), followups = st.count("followups", view, d.start, d.end), answers = st.count("answers", view, d.start, d.end) + st.count("newthreads", view, d.start, d.end), replies = st.count("replies", view, d.start, d.end);
    return { ...d, "First emails": first, "Follow-ups": followups, "Answers & new threads": answers, Replies: replies, sent: first + followups + answers };
  };
  const daily = days.map((d) => dayOf(stats, d));
  const allStats = useMemo(() => (box ? makeStats(base) : null), [base, box]);
  const peak = Math.max(1, ...(allStats ? days.map((d) => dayOf(allStats, d)) : daily).map((d) => Math.max(d.sent, d.Replies)));
  const dailyTotals = { sent: daily.reduce((n, d) => n + d.sent, 0), replies: daily.reduce((n, d) => n + d.Replies, 0) };

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

    {mailboxes.length > 1 && <div className="ob-boxes" role="radiogroup" aria-label="Show stats for a mailbox">
      <button type="button" role="radio" aria-checked={!box} className={!box ? "on" : ""} onClick={() => pickBox("")}><Inbox size={13} /> All mailboxes <b>{mailboxes.length}</b></button>
      {mailboxes.map((m, i) => <button type="button" key={m} role="radio" aria-checked={box === m} className={`mbx-${mailboxTone(i)}${box === m ? " on" : ""}`} onClick={() => pickBox(box === m ? "" : m)} title={`Only what ${m} did`}><i className="mbx-dot" aria-hidden="true" /><MailboxName email={m} /></button>)}
    </div>}
    {box && <p className="ob-scope"><span className={`mbx-${mailboxTone(mailboxes.indexOf(box))}`}><i className="mbx-dot" aria-hidden="true" /></span><span>Only <b>{box}</b>: emails it sent, replies that came into it, and the people it emailed first (their negotiations and wins). DMs and calls aren't from a mailbox, so they're left out.</span><button type="button" onClick={() => pickBox("")}>Show all mailboxes</button></p>}

    {gmail.connected && <div className="ob-fresh">
      <span className={gmail.error ? "warn" : ""}>{gmail.error ? "Gmail needs attention — " : "Gmail checked "}{gmail.lastSyncAt ? relativeTime(gmail.lastSyncAt) : "not yet"}{!gmail.error && " · new mail shows up within a few minutes"}</span>
      <button type="button" onClick={() => void sync()} disabled={syncing} aria-label="Check Gmail now"><RefreshCw size={12} className={syncing ? "spin" : ""} /> {syncing ? "Checking…" : "Check now"}</button>
    </div>}

    <div className="ob-hero">
      <div className={`ob-total${open?.metric === "emails" && open.view === view ? " on" : ""}`}>
        <button type="button" className="ob-total-main" onClick={() => setOpen((cur) => (cur && cur.metric === "emails" && cur.view === view && cur.start === range.start ? null : { metric: "emails", view, start: range.start, end: range.end, horizon: range.horizon, title: `Emails sent${view === "creator" ? " · influencers" : view === "brand" ? " · brands" : ""}` }))} aria-label={`Emails sent: ${mix.total}. Show every email`}>
          <span className="ob-total-label"><span className="ob-ico"><Mail size={15} /></span><span><small>Emails sent</small><em>Every email · {box ? box : mailboxes.length > 1 ? `${mailboxes.length} mailboxes` : "all mailboxes"}{mix.scheduled ? " · scheduled included" : ""}</em></span></span>
          <span className="ob-total-row"><strong>{mix.total.toLocaleString("en-US")}</strong>{emailsDelta !== null && <em className={emailsDelta === 0 ? "delta-flat" : emailsDelta > 0 ? "delta-up" : "delta-down"}>{emailsDelta === 0 ? `— ${range.prevLabel}` : `${emailsDelta > 0 ? "+" : ""}${emailsDelta} ${range.prevLabel}`}</em>}</span>
        </button>
        <div className="ob-mix-bar" role="img" aria-label={parts.map((p) => `${p.n} ${p.label.toLowerCase()}`).join(", ")}>{mix.total ? PARTS.filter((p) => p.n > 0).map((p) => <i key={p.key} className={`mix-${p.tone}`} style={{ flexGrow: p.n }} />) : <i className="mix-empty" />}</div>
        <div className="ob-mix">{parts.map((p) => {
          const on = open?.metric === p.key && open.view === view;
          return <button type="button" key={p.key} className={`ob-mix-item${on ? " on" : ""}`} onClick={() => setOpen((cur) => (cur && cur.metric === p.key && cur.view === view ? null : { metric: p.key, view, start: range.start, end: range.end, horizon: range.horizon, title: p.label }))} aria-expanded={on} title={p.hint}>
            <i className={`mix-dot mix-${p.tone}`} aria-hidden="true" /><b>{p.n.toLocaleString("en-US")}</b><span>{p.label}</span>{mix.total > 0 && p.n > 0 && <small>{Math.round((p.n / mix.total) * 100)}%</small>}
          </button>;
        })}</div>
        {!box && perBox.length > 1 && <MailboxSplit rows={perBox.map((b, i) => {
          const m = b.stats.emailMix(view, range.start, range.end, range.horizon);
          const rr = b.stats.replyRate(view, range.start, range.end);
          return { mailbox: b.mailbox, tone: mailboxTone(i), sent: m.total, first: m.first, followups: m.followups, replies: b.stats.count("replies", view, range.start, range.end), rate: rr.pct, prev: range.compare ? b.stats.emailMix(view, range.prevStart, range.prevEnd).total : null };
        })} prevLabel={range.prevLabel} onPick={pickBox} />}
                {mix.otherFollowups > 0 && <p className="ob-mix-foot"><span><Send size={11} /> +{mix.otherFollowups} follow-up{mix.otherFollowups === 1 ? "" : "s"} by DM, WhatsApp or call — not emails</span></p>}
        {ahead.length > 0 && <div className="ob-ahead" aria-label="Emails scheduled for later days">
          <span className="ob-ahead-label"><CalendarClock size={13} /><span><b>Scheduled ahead</b><small>Not in {range.key === "today" ? "today's" : "this period's"} count — each one counts on the day it sends{nextSend ? ` · next ${nextSend}` : ""}. Tap a day to see who.</small></span></span>
          <div className="ob-ahead-days">{ahead.slice(0, 7).map((d, i) => <button type="button" key={d.key} className={`ob-ahead-day${i === 0 ? " next" : ""}${aheadOpen === d.key ? " on" : ""}`} aria-expanded={aheadOpen === d.key} onClick={() => setAheadOpen(aheadOpen === d.key ? "" : d.key)} title={d.day.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}>
            <span className="ahd-head"><em>{d.day.toLocaleDateString("en-US", { weekday: "short" })}</em><small>{d.day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small></span>
            <strong>{d.n}<span> email{d.n === 1 ? "" : "s"}</span></strong>
            <span className="ahd-kinds">{AHEAD_KINDS.filter((k) => d.kinds[k.role] > 0).map((k) => <span key={k.role} className={`ahd-kind ${k.cls}`}><i aria-hidden="true" /><b>{d.kinds[k.role]}</b> {d.kinds[k.role] === 1 ? k.one : k.many}</span>)}</span>
          </button>)}{ahead.length > 7 && <span className="ob-ahead-more">+{ahead.slice(7).reduce((n, d) => n + d.n, 0)} later</span>}</div>
          {openDay && <ul className="ob-ahead-list" aria-label={`Scheduled for ${openDay.day.toLocaleDateString("en-US", { weekday: "long" })}`}>{openDay.items.map((x) => { const k = AHEAD_KINDS.find((y) => y.role === x.role)!; return <li key={x.key}>
            <span className={`ahd-pill ${k.cls}`}>{k.one}</span>
            <Link to={x.to}>{x.name}</Link>
            <small>{new Date(x.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}{x.mailbox ? ` · ${x.mailbox}` : ""}</small>
          </li>; })}</ul>}
        </div>}
      </div>
      <button type="button" className={`ob-big ob-replies${open?.metric === "replies" && open.view === view ? " on" : ""}`} onClick={() => show("replies")} title="People who answered your outreach — each person once, on the day of their first answer. The rest of a conversation is never counted." aria-label={`Replies received: ${c("replies")} ${c("replies") === 1 ? "person" : "people"}, each counted once. Show the list`}>
        <span className="ob-big-top"><span className="ob-ico"><Reply size={15} /></span><small>Replies received</small></span>
        <strong>{c("replies").toLocaleString("en-US")}</strong>
        <span className="ob-note">{chatter ? `One per person · ${chatter.toLocaleString("en-US")} conversation message${chatter === 1 ? "" : "s"} not counted` : "One per person · auto-replies never count"}</span>
        <Delta value={delta("replies")} />
      </button>
      <div className="ob-big ob-rate" title="Of the people you first contacted in this range, how many have answered so far">
        <span className="ob-big-top"><span className="ob-ico"><CheckCircle2 size={15} /></span><small>Reply rate</small></span>
        <strong>{rate.pct === null ? "—" : `${rate.pct}%`}</strong>
        <span className="ob-note">{rate.contacted ? `${rate.replied} of ${rate.contacted} new conversations answered${rate.declined ? ` · ${rate.declined} said no` : ""}` : "No new conversations in this range"}</span>
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
      <div className="daily-strip-head"><span>Daily outreach · last 14 days{view !== "all" ? ` · ${view === "creator" ? "influencers" : "brands"}` : ""}<b className="daily-scope">{box ? <><i className={`mbx-dot mbx-${mailboxTone(mailboxes.indexOf(box))}`} aria-hidden="true" />{box}</> : mailboxes.length > 1 ? `All ${mailboxes.length} mailboxes` : ""}{" "}<em>{dailyTotals.sent.toLocaleString("en-US")} sent · {dailyTotals.replies.toLocaleString("en-US")} {dailyTotals.replies === 1 ? "reply" : "replies"}</em></b></span><span className="daily-legend"><i className="lg-emails" /> First emails <i className="lg-followups" /> Follow-ups <i className="lg-answers" /> Answers <i className="lg-replies" /> Replies</span></div>
      <div className="daily-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={daily} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barCategoryGap="20%" onClick={(e) => { const i = typeof e?.activeTooltipIndex === "number" ? e.activeTooltipIndex : Number(e?.activeTooltipIndex); const d = days[i]; if (d) setOpen({ metric: "emails", view, start: d.start, end: d.end, title: `Emails sent · ${new Date(d.start).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}` }); }}>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} tick={{ fill: "var(--muted)", fontSize: 10 }} />
        <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={Math.max(24, String(peak).length * 8 + 10)} domain={[0, peak]} tick={{ fill: "var(--muted)", fontSize: 11 }} />
        <Tooltip cursor={{ fill: "rgba(var(--accent-rgb),.07)" }} content={<DayTip scope={box} />} />
        <Bar dataKey="First emails" stackId="o" fill="var(--accent)" style={{ cursor: "pointer" }} />
        <Bar dataKey="Follow-ups" stackId="o" fill="#24a6a1" style={{ cursor: "pointer" }} />
        <Bar dataKey="Answers & new threads" stackId="o" fill="#8c95a7" radius={[3, 3, 0, 0]} style={{ cursor: "pointer" }} />
        <Bar dataKey="Replies" fill="#d59b48" radius={[3, 3, 0, 0]} style={{ cursor: "pointer" }} />
      </BarChart></ResponsiveContainer></div>
      <p className="daily-hint">Tap a day to see every email you sent that day.</p>
    </div>

    <TrackingCheck box={box} />
  </section>;
}

type SplitRow = { mailbox: string; tone: number; sent: number; first: number; followups: number; replies: number; rate: number | null; prev: number | null };

/** "Who sent it": each mailbox's share of the emails, side by side. Tap one to see only its numbers. */
function MailboxSplit({ rows, prevLabel, onPick }: { rows: SplitRow[]; prevLabel: string; onPick: (m: string) => void }) {
  const total = rows.reduce((n, r) => n + r.sent, 0);
  const top = Math.max(1, ...rows.map((r) => r.sent));
  return <div className="ob-split" aria-label="Emails by mailbox">
    <div className="ob-split-head"><span>Who sent it</span>{total > 0 && <div className="ob-split-bar" role="img" aria-label={rows.map((r) => `${r.mailbox}: ${r.sent}`).join(", ")}>{rows.filter((r) => r.sent > 0).map((r) => <i key={r.mailbox} className={`mbx-${r.tone}`} style={{ flexGrow: r.sent }} />)}</div>}</div>
    <ul>{rows.map((r) => {
      const delta = r.prev === null ? null : r.sent - r.prev;
      return <li key={r.mailbox} className={`mbx-${r.tone}`}>
        <button type="button" onClick={() => onPick(r.mailbox)} title={`${r.mailbox}: ${r.first} new conversation${r.first === 1 ? "" : "s"}, ${r.followups} follow-up${r.followups === 1 ? "" : "s"} — tap to see only this mailbox`}>
          <span className="sp-who"><i className="mbx-dot" aria-hidden="true" /><MailboxName email={r.mailbox} /></span>
          <span className="sp-sent"><b>{r.sent.toLocaleString("en-US")}</b><small>{total ? `${Math.round((r.sent / total) * 100)}%` : "—"}</small></span>
          <span className="sp-bar" aria-hidden="true"><i style={{ width: `${(r.sent / top) * 100}%` }} /></span>
          <span className="sp-mix">{r.first} new · {r.followups} follow-up{r.followups === 1 ? "" : "s"}</span>
          <span className="sp-replies"><Reply size={11} /> {r.replies}{r.rate !== null && <em>{r.rate}% reply</em>}</span>
          {delta !== null && <span className={`sp-delta ${delta > 0 ? "delta-up" : delta < 0 ? "delta-down" : "delta-flat"}`} title={prevLabel}>{delta === 0 ? "—" : `${delta > 0 ? "+" : ""}${delta}`}</span>}
          <ArrowRight size={13} className="sp-go" />
        </button>
      </li>;
    })}</ul>
  </div>;
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
type DayRow = { label: string; start: number; sent: number; Replies: number; "First emails": number; "Follow-ups": number; "Answers & new threads": number };
/** One day of the chart: what went out, what came back, for which mailbox. */
function DayTip({ active, payload, scope }: { active?: boolean; payload?: { payload?: DayRow }[]; scope: string }) {
  const d = active ? payload?.[0]?.payload : undefined;
  if (!d) return null;
  const parts: [string, number, string][] = [["First emails", d["First emails"], "lg-emails"], ["Follow-ups", d["Follow-ups"], "lg-followups"], ["Answers & new threads", d["Answers & new threads"], "lg-answers"]];
  return <div className="day-tip" role="status">
    <strong>{new Date(d.start).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</strong>
    <small>{scope || "All mailboxes"}</small>
    {d.sent || d.Replies ? <p className="day-tip-total"><b>{d.sent}</b> sent{d.Replies ? <> · <b>{d.Replies}</b> {d.Replies === 1 ? "reply" : "replies"}</> : null}</p> : <p className="day-tip-none">Nothing sent, no replies</p>}
    {d.sent > 0 && <ul>{parts.filter(([, n]) => n > 0).map(([k, n, cls]) => <li key={k}><i className={cls} aria-hidden="true" />{k}<b>{n}</b></li>)}</ul>}
  </div>;
}

function TrackingCheck({ box }: { box: string }) {
  const data = useData();
  const gmail = useGmail();
  const [open, setOpen] = useState(false);
  const [goneOpen, setGoneOpen] = useState(false);
  // With one mailbox picked, only its own tracking check.
  const cover = gmail.mailboxes.filter((m) => !box || m.email.toLowerCase() === box).map((m) => m.coverage).filter((x): x is NonNullable<typeof x> => !!x);
  // Tracked mail that has since left Gmail (last 30 days), newest first — the CRM never deletes sent mail.
  const since = Date.now() - 30 * 86400000;
  const gone = (data.emailEvents || []).filter((e) => e.gone && (!box || (e.mailbox || "") === box) && new Date(e.gone_at || e.at).getTime() >= since).sort((a, b) => (b.gone_at || b.at).localeCompare(a.gone_at || a.at));
  if (!cover.length && !gone.length) return null;
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
  const days = cover[0]?.days ?? 0;
  const nameOf = new Map<string, { name: string; to: string }>([...data.creators.map((c) => [c.id, { name: c.name, to: `/app/influencers/${c.id}` }] as [string, { name: string; to: string }]), ...data.brands.map((b) => [b.id, { name: b.name, to: `/app/brands/${b.id}` }] as [string, { name: string; to: string }])]);
  const list = [...people.values()].sort((a, b) => b.last.localeCompare(a.last));
  return <div className={`ob-check${untracked || gone.length ? " has-gaps" : ""}`}>
    {cover.length > 0 && <ShieldCheck size={16} />}
    {cover.length > 0 && <p><b>Tracking check</b>{box ? ` · ${box}` : ""} · last {days} days: {untracked ? <>{tracked} of {sent} emails you sent are in your CRM. <b>{untracked}</b> went to {list.length === 1 ? "someone" : `${list.length} people`} the CRM doesn't know.</> : <>all {sent} emails you sent are tracked{pending ? ` (${pending} still being read)` : ""}.</>}{warmup > 0 && <span className="ob-check-warm"> {warmup} warm-up email{warmup === 1 ? "" : "s"} left out.</span>}</p>}
    {untracked > 0 && <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide" : "Review"}</button>}
    {open && <ul className="ob-check-list">{list.slice(0, 30).map((p) => <li key={p.email}>
      <span><b>{p.email}</b><small>{p.n} email{p.n === 1 ? "" : "s"} · {relativeTime(p.last)}{p.subject ? ` · “${p.subject}”` : ""}</small></span>
      <Link to={`/app/influencers?new=1&email=${encodeURIComponent(p.email)}`}>Add influencer</Link>
      <Link to={`/app/brands?new=1&email=${encodeURIComponent(p.email)}`}>Add brand</Link>
    </li>)}<li className="ob-check-note">Added people get their whole email history on the next Gmail check. Personal mail can stay out — it's never counted.</li></ul>}
    {gone.length > 0 && <div className="ob-gone">
      <p><Trash2 size={14} aria-hidden="true" /><span><b>{gone.length} tracked email{gone.length === 1 ? "" : "s"}</b> left Gmail in the last 30 days ({[gone.filter((e) => e.gone === "trash").length ? `${gone.filter((e) => e.gone === "trash").length} in Trash` : "", gone.filter((e) => e.gone === "deleted").length ? `${gone.filter((e) => e.gone === "deleted").length} deleted for good` : ""].filter(Boolean).join(", ")}). The CRM didn't do it — check tools connected to {box || "your mailboxes"} and Workspace retention rules. They still count as sent.</span></p>
      <button type="button" onClick={() => setGoneOpen(!goneOpen)} aria-expanded={goneOpen}>{goneOpen ? "Hide" : "See which"}</button>
      {goneOpen && <ul className="ob-check-list">{gone.slice(0, 40).map((e) => { const who = nameOf.get(e.entity_id); return <li key={e.id}>
        <span><b>{who ? <Link to={who.to}>{who.name}</Link> : e.counterpart}</b><small>{e.direction === "out" ? "You emailed" : "They emailed"} {dateLabel(e.at)} · “{e.subject || "(no subject)"}” · {e.mailbox || "Gmail"} · {e.gone === "trash" ? "in Trash" : "deleted for good"}{e.gone_at ? `, seen ${relativeTime(e.gone_at)}` : ""}</small></span>
      </li>; })}</ul>}
    </div>}
  </div>;
}
