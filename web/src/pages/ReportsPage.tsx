import { BestTimeCard } from "../components/Insights";
import { BarChart3, Clock3, Ghost, HandCoins, Inbox, Mail, MailPlus, Reply, Send, Smile, Target, ThumbsDown, TrendingDown, Trophy, Users } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Metric, PageHeader, Tabs } from "../components/ui";
import { WeeklyReportButton } from "../components/WeeklyReport";
import { MailboxName, mailboxTone } from "../components/MailboxBits";
import { useData } from "../contexts/DataContext";
import { useGmail } from "../contexts/GmailContext";
import { useSessionState } from "../hooks/useSessionState";
import { profitOf } from "../lib/deal";
import { businessDaysBetween, timeline } from "../lib/followupEngine";
import { mailboxStats } from "../lib/mailboxStats";
import { declined, replyTone } from "../lib/replyReader";
import { DEFAULT_FOLLOWUP_RULES } from "../lib/prefs";
import { dateLabel, lossReasonLabel, money } from "../lib/utils";
import type { Activity, Brand, Creator, EntityStatus } from "../types";

// What's working: how many people you reach turn into replies, deals and
// roster signings; how fast; which follow-up and which mailbox earns them;
// and where the money comes from. Everything is computed from your records.

type Row = { key: string; contacted: number; replied: number; won: number };
type Who = "creator" | "brand";
const replied = (r: { repliedLogged: number }) => r.repliedLogged;
const RANGES = [{ value: "30", label: "30 days" }, { value: "90", label: "90 days" }, { value: "365", label: "12 months" }, { value: "all", label: "All time" }];
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
/** A headline rate: one decimal under 10%, so 4.5% and 4.9% don't both read "5%". */
const rateText = (a: number, b: number) => {
  if (!b) return "0";
  const v = (a / b) * 100;
  return v > 0 && v < 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v));
};
const median = (values: number[]) => {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
};

// How far a record got: 1 reached out · 2 replied · 3 negotiating · 4 won (roster / signed).
const RANK: Partial<Record<EntityStatus, number>> = { contacted: 1, no_reply: 1, inbound: 1, replied: 2, negotiating: 3, roster: 4, signed: 4 };
const rankFromText = (text: string) => {
  const m = text.match(/(?:updated to|moved to) (\w+)/i);
  return m ? RANK[m[1].toLowerCase() as EntityStatus] || 0 : 0;
};

export default function ReportsPage() {
  const data = useData();
  const gmail = useGmail();
  const [range, setRange] = useSessionState("reports.range", "90");
  const [who, setWho] = useSessionState("reports.who", "creator");
  const [boxPick, setBox] = useSessionState("reports.mailbox", "");
  const rules = data.profile.preferences?.followup_rules || DEFAULT_FOLLOWUP_RULES;
  const from = range === "all" ? 0 : Date.now() - Number(range) * 86400000;

  // Your mailboxes, busiest first (connected ones and any that show up in your mail).
  const mailboxes = useMemo(() => {
    const n = new Map<string, number>();
    for (const e of data.emailEvents || []) if (e.mailbox && e.direction === "out") n.set(e.mailbox.toLowerCase(), (n.get(e.mailbox.toLowerCase()) || 0) + 1);
    for (const m of gmail.mailboxes) if (!n.has(m.email.toLowerCase())) n.set(m.email.toLowerCase(), 0);
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([m]) => m);
  }, [data.emailEvents, gmail.mailboxes]);
  const box = mailboxes.includes(boxPick) ? boxPick : "";
  const report = useMemo(() => {
    const events = data.emailEvents || [];
    const acts = new Map<string, Activity[]>();
    for (const a of data.activities) if (a.entity_id) acts.set(a.entity_id, [...(acts.get(a.entity_id) || []), a]);
    const wonByCampaign = new Set(data.campaigns.filter((c) => !c.archived_at && c.status !== "cancelled" && c.brand_id).map((c) => c.brand_id as string));

    type Item = { type: Who; record: Creator | Brand; niche: string; country: string };
    const items: Item[] = [
      ...data.creators.filter((c) => !c.archived_at).map((c) => ({ type: "creator" as const, record: c, niche: c.niche || "No niche", country: c.country || "Not set" })),
      ...data.brands.filter((b) => !b.archived_at).map((b) => ({ type: "brand" as const, record: b, niche: b.brand_type || "No industry", country: (b.brief?.markets || [])[0] || "Not set" })),
    ];
    const everyone = items.map((item) => {
      // An out-of-office or a management auto-decline isn't a reply.
      const all = timeline({ type: item.type, record: item.record as Creator }, data.followups, events);
      const managedNo = all.some((t) => t.dir === "in" && t.kind === "managed_no");
      const touches = all.filter((t) => !(t.dir === "in" && (t.kind === "auto" || t.kind === "reaction" || t.kind === "managed_no")));
      const first = touches[0];
      const inbound = item.record.pipeline_status === "inbound" || first?.dir === "in";
      const firstOut = touches.find((t) => t.dir === "out");
      const firstIn = inbound ? first : firstOut ? touches.find((t) => t.dir === "in" && t.at > firstOut.at) : undefined;
      const outsBefore = firstIn && firstOut && !inbound ? touches.filter((t) => t.dir === "out" && t.at <= firstIn.at).length : 0;
      const history = acts.get(item.record.id) || [];
      let rank = RANK[item.record.pipeline_status] || (first ? 1 : 0);
      // A live record is where it is now: moving someone back from Negotiating
      // to Replied is a correction, not a deal that got further. Only records
      // that ended (Denied, No reply) keep the furthest stage they reached.
      const ended = item.record.pipeline_status === "denied" || item.record.pipeline_status === "no_reply";
      if (ended) for (const a of history) rank = Math.max(rank, rankFromText(a.text));
      if (firstIn) rank = Math.max(rank, 2);
      if (item.record.lost_at) rank = Math.max(rank, 2); // a loss is only stamped after a reply
      if (item.type === "brand" && wonByCampaign.has(item.record.id)) rank = 4;
      const wonAct = history.filter((a) => rankFromText(a.text) === 4).map((a) => a.at).sort()[0];
      const wonAt = rank === 4 ? wonAct || item.record.status_updated_at : null;
      // Someone you moved along by hand with nothing logged (put straight on the roster after a call)
      // still counts — from the day you contacted or added them — so Reports never drops a record the board shows.
      const startAt = first?.at || (rank > 0 ? (item.record as Creator).date_contacted || item.record.created_at || null : null);
      // The mailbox that opened the conversation (or, for someone who wrote first, the one they wrote to).
      // A hand-logged first touch (a DM, a call) has no mailbox: the first real email decides.
      const mailbox = ((inbound ? first?.mailbox || touches.find((t) => t.mailbox)?.mailbox : touches.find((t) => t.dir === "out" && t.mailbox)?.mailbox) || "").toLowerCase();
      // How their first real answer read, which thread it came in, and whether they ever answered.
      // A record you moved on by hand (they answered on WhatsApp, a call…) has
      // no logged reply to read: its stage says how it went.
      const lostNow = !!item.record.lost_at && item.record.pipeline_status === "denied";
      const tone: "yes" | "no" | "neutral" | null = firstIn ? (firstIn.kind === "no" || declined(firstIn.detail) ? "no" : rank >= 3 || replyTone(firstIn.detail) === "yes" ? "yes" : "neutral") : rank >= 2 ? (lostNow ? "no" : rank >= 3 ? "yes" : "neutral") : null;
      const threadsStarted = Array.from(new Set(touches.filter((t) => t.dir === "out" && t.source === "gmail" && t.threadId).map((t) => t.threadId!)));
      const replyThread = firstIn?.threadId || "";
      const replyInNewThread = !!replyThread && threadsStarted.length > 1 && replyThread !== threadsStarted[0];
      const lastOut = [...touches].reverse().find((t) => t.dir === "out");
      const ghosted = !inbound && tone === null && !managedNo && !!lastOut && Date.now() - new Date(lastOut.at).getTime() > 7 * 86400000;
      return { ...item, first, firstOut, firstIn, inbound, outsBefore, rank, wonAt, startAt, mailbox, lost: lostNow, tone, managedNo, ghosted, threads: threadsStarted.length, replyInNewThread };
    });
    // Whose mailbox a record belongs to doesn't depend on the date range: a deal
    // signed this month with a brand first emailed last year still counts for that mailbox.
    const homeOf = new Map(everyone.map((p) => [p.record.id, p.mailbox]));
    const all = everyone.filter((p) => p.startAt && new Date(p.startAt).getTime() >= from);
    const people = box ? all.filter((p) => p.mailbox === box) : all;

    const outreach = people.filter((p) => !p.inbound);
    const inbound = people.filter((p) => p.inbound);
    const side = (list: typeof people) => list.filter((p) => p.type === who);
    const cohort = side(outreach);
    const stage = (n: number) => cohort.filter((p) => p.rank >= n).length;
    // Joined the roster (or signed) IN this range — counted by the day they joined (the deal was agreed),
    // whenever they were first emailed. That's the "Joined roster" tile; the steps before it follow
    // the people first contacted in the range.
    const joined = side(box ? everyone.filter((p) => p.mailbox === box) : everyone)
      .filter((p) => p.wonAt && new Date(p.wonAt).getTime() >= from)
      .map((p) => ({ id: p.record.id, name: p.record.name, at: p.wonAt!, startAt: p.startAt, inbound: p.inbound, still: ["roster", "signed", "active", "completed"].includes(p.record.pipeline_status), earlier: p.inbound || !p.startAt || new Date(p.startAt).getTime() < from }))
      .sort((a, b) => b.at.localeCompare(a.at));
    const leftLater = joined.filter((j) => !j.still).length;
    const funnel = [
      { key: "reached", label: "Reached out", value: cohort.length, icon: Send, now: "" },
      { key: "replied", label: "Replied", value: stage(2), icon: Reply, now: "" },
      { key: "negotiating", label: "Got to negotiating", value: stage(3), icon: HandCoins, now: `${cohort.filter((p) => p.record.pipeline_status === "negotiating").length} negotiating now` },
      { key: "won", label: who === "creator" ? "Joined roster" : "Signed", value: joined.length, icon: Trophy, now: leftLater > 0 ? `${joined.length - leftLater} ${who === "creator" ? "on roster" : "signed"} now · ${leftLater} left later` : "" },
    ];
    const inboundSide = side(inbound);
    // How long the deals closed in this range took, from first contact.
    const closeDays = joined.filter((j) => j.startAt && !j.inbound).map((j) => Math.max(0, (new Date(j.at).getTime() - new Date(j.startAt!).getTime()) / 86400000));
    const replied = cohort.filter((p) => p.firstIn && p.firstOut);
    const replyDays = replied.map((p) => businessDaysBetween(new Date(p.firstOut!.at), new Date(p.firstIn!.at), rules));
    // Which message they answered, and how: a new thread is its own bucket.
    const sideReplied = replied;
    const bucket = (p: (typeof replied)[number]) => (p.replyInNewThread ? 6 : Math.min(5, Math.max(1, p.outsBefore)));
    const byRound = [1, 2, 3, 4, 5, 6].map((b) => {
      const list = sideReplied.filter((p) => bucket(p) === b);
      return { name: b === 1 ? "First email" : b === 6 ? "New thread" : b === 5 ? "4th follow-up +" : `${["1st", "2nd", "3rd"][b - 2]} follow-up`, Interested: list.filter((p) => p.tone === "yes").length, "Not interested": list.filter((p) => p.tone === "no").length, Unclear: list.filter((p) => p.tone === "neutral").length };
    });
    const cohortSide = side(outreach);
    const quality = {
      interested: cohortSide.filter((p) => p.tone === "yes").length,
      declined: cohortSide.filter((p) => p.tone === "no").length,
      unclear: cohortSide.filter((p) => p.tone === "neutral").length,
      managed: cohortSide.filter((p) => p.tone === null && p.managedNo).length,
      ghosted: cohortSide.filter((p) => p.ghosted).length,
      waiting: cohortSide.filter((p) => p.tone === null && !p.managedNo && !p.ghosted).length,
      newThreads: cohortSide.filter((p) => p.threads > 1).length,
      newThreadReplies: cohortSide.filter((p) => p.replyInNewThread).length,
      oldThreadReplies: cohortSide.filter((p) => p.threads > 1 && p.firstIn && !p.replyInNewThread).length,
      avgFollowups: sideReplied.length ? Math.round((sideReplied.reduce((n, p) => n + Math.max(0, p.outsBefore - 1), 0) / sideReplied.length) * 10) / 10 : 0,
    };

    const losses = side(people).filter((p) => p.lost);
    const lossReasons = Array.from(losses.reduce((m, p) => m.set(p.record.lost_reason || "", (m.get(p.record.lost_reason || "") || 0) + 1), new Map<string, number>())).sort((a, b) => b[1] - a[1]);

    const group = (key: (p: (typeof people)[number]) => string) => {
      const map = new Map<string, Row>();
      for (const p of cohort) {
        const k = key(p);
        const row = map.get(k) || { key: k, contacted: 0, replied: 0, won: 0 };
        row.contacted++;
        if (p.rank >= 2) row.replied++;
        if (p.rank >= 4) row.won++;
        map.set(k, row);
      }
      return Array.from(map.values()).sort((a, b) => b.contacted - a.contacted).slice(0, 10);
    };

    // Money: agreed deals (live or delivered) started — or created — in the
    // range. A deal still being negotiated isn't revenue yet; cancelled never is.
    const agreed = data.campaigns.filter((c) => !c.archived_at && (c.status === "active" || c.status === "completed") && (!box || homeOf.get(c.brand_id || "") === box));
    const campaigns = agreed.filter((c) => new Date(c.start_date || c.created_at).getTime() >= from);
    const months = new Map<string, { name: string; Revenue: number; Profit: number }>();
    for (let i = 0; i < 12; i++) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - (11 - i));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.set(key, { name: new Intl.DateTimeFormat("en-US", { month: "short" }).format(d), Revenue: 0, Profit: 0 });
    }
    for (const c of agreed) {
      const m = months.get((c.start_date || c.created_at).slice(0, 7));
      if (m) { m.Revenue += c.agreed_payment || 0; m.Profit += profitOf(c); }
    }
    const brandRows = new Map<string, { name: string; deals: number; revenue: number; profit: number }>();
    for (const c of campaigns) {
      const name = data.brands.find((b) => b.id === c.brand_id)?.name || "No brand";
      const row = brandRows.get(name) || { name, deals: 0, revenue: 0, profit: 0 };
      row.deals++;
      row.revenue += c.agreed_payment || 0;
      row.profit += profitOf(c);
      brandRows.set(name, row);
    }

    const boxes = mailboxStats(events, gmail.leads, gmail.mailboxes.map((m) => m.email), range === "all" ? null : Number(range)).map((s) => ({ ...s, won: side(all.filter((p) => !p.inbound)).filter((p) => p.mailbox === s.mailbox && p.rank >= 4).length }));
    const leadsIn = gmail.leads.filter((l) => new Date(l.first_at).getTime() >= from && (who === "creator" ? l.kind === "creator" : l.kind !== "creator") && (!box || l.mailbox.toLowerCase() === box));


    return {
      funnel,
      joined,
      contacted: cohort.length,
      repliedCount: stage(2),
      wonCount: stage(4),
      allContacted: cohort.length,
      replyRate: pct(stage(2), cohort.length),
      medianReply: median(replyDays),
      afterFollowup: pct(replied.filter((p) => p.outsBefore > 1).length, replied.length),
      repliedLogged: replied.length,
      closeDays: median(closeDays),
      closedCount: closeDays.length,
      inbound: { count: inboundSide.length, won: inboundSide.filter((p) => p.rank >= 4).length, leads: leadsIn.length, leadsAdded: leadsIn.filter((l) => l.status === "added").length },
      losses: losses.length,
      lossReasons,
      lostAfterReply: pct(losses.length, Math.max(1, stage(2))),
      byRound,
      quality,
      byNiche: group((p) => p.niche),
      byCountry: group((p) => p.country),
      revenue: campaigns.reduce((s, c) => s + (c.agreed_payment || 0), 0),
      profit: campaigns.reduce((s, c) => s + profitOf(c), 0),
      deals: campaigns.length,
      months: Array.from(months.values()),
      topBrands: Array.from(brandRows.values()).sort((a, b) => b.profit - a.profit).slice(0, 8),
      boxes,
      gmail: events.length > 0,
    };
  }, [data.creators, data.brands, data.campaigns, data.followups, data.emailEvents, data.activities, gmail.leads, gmail.mailboxes, from, rules, who, range, box]);

  const top = report.funnel[0].value;
  const conversion = rateText(report.wonCount, report.contacted);
  const wonWord = who === "creator" ? "roster" : "signed";
  const earlier = report.joined.filter((j) => j.earlier);
  const table = (title: string, rows: Row[], label: string) => <div className="dash-panel report-table"><div className="panel-heading"><div><span>{who === "creator" ? "Influencers" : "Brands"}</span><h2>{title}</h2></div></div>{rows.length ? <table><thead><tr><th>{label}</th><th>Reached</th><th>Reply rate</th><th>{who === "creator" ? "Roster" : "Signed"}</th></tr></thead><tbody>{rows.map((r) => <tr key={r.key}><td>{r.key}</td><td>{r.contacted}</td><td><span className="rate-bar"><i style={{ width: `${pct(r.replied, r.contacted)}%` }} />{pct(r.replied, r.contacted)}%</span></td><td><b>{r.won}</b> <small className="muted">{pct(r.won, r.contacted)}%</small></td></tr>)}</tbody></table> : <p className="muted-copy">No outreach in this range yet.</p>}</div>;

  return <div className="reports-page">
    <PageHeader eyebrow="Insights" title="Reports" description="From first email to signed deal — what converts, how fast, and where the money comes from." actions={<><WeeklyReportButton /><Tabs active={range} onChange={setRange} tabs={RANGES} /></>} />

    {mailboxes.length > 1 && <div className="ob-boxes report-boxes" role="radiogroup" aria-label="Show reports for a mailbox">
      <button type="button" role="radio" aria-checked={!box} className={!box ? "on" : ""} onClick={() => setBox("")}><Inbox size={13} /> All mailboxes <b>{mailboxes.length}</b></button>
      {mailboxes.map((m, i) => <button type="button" key={m} role="radio" aria-checked={box === m} className={`mbx-${mailboxTone(i)}${box === m ? " on" : ""}`} onClick={() => setBox(box === m ? "" : m)} title={`Only the people ${m} emailed first`}><i className="mbx-dot" aria-hidden="true" /><MailboxName email={m} /></button>)}
    </div>}
    {box && <p className="ob-scope"><span className={`mbx-${mailboxTone(mailboxes.indexOf(box))}`}><i className="mbx-dot" aria-hidden="true" /></span><span>Only the people <b>{box}</b> emailed first (or who wrote to it first) — their replies, deals and money. The mailbox table below still compares every mailbox.</span><button type="button" onClick={() => setBox("")}>Show all mailboxes</button></p>}

    <section className="dash-panel funnel-hero">
      <div className="funnel-hero-head">
        <div className="funnel-headline"><span className="funnel-big">{report.contacted ? `${conversion}%` : "—"}</span><div><strong>of the {who === "creator" ? "influencers" : "brands"} you reached out to {who === "creator" ? "made it to your roster" : "signed"}</strong><small>{report.contacted ? `${report.wonCount} of ${report.contacted} · first contact in this range` : "Reach out to someone and this fills in"}</small></div></div>
        <Tabs active={who} onChange={(v) => setWho(v as Who)} tabs={[{ value: "creator", label: "Influencers" }, { value: "brand", label: "Brands" }]} />
      </div>
      <ol className="funnel-steps">{report.funnel.map((step, i) => { const prev = i ? report.funnel[i - 1].value : 0; return <li key={step.key} className={`fs-${step.key}`}>
        {i > 0 && <span className="fs-conv" aria-hidden="true">→</span>}
        <div className="fs-card"><span className="fs-icon"><step.icon size={15} /></span><b>{step.value}</b><small>{step.label}</small>{i === 0 && <span className="fs-step">first contact in this range</span>}{i > 0 && step.key !== "won" && <span className="fs-step" title={`${step.value} of the ${prev} who ${report.funnel[i - 1].label.toLowerCase()}`}>{pct(step.value, prev)}% of {i === 1 ? "those reached" : "those who replied"}</span>}{step.key === "won" && <span className="fs-step">{who === "creator" ? "joined" : "signed"} in this range</span>}{step.now && step.value !== Number.parseInt(step.now, 10) && <em className="fs-now" title="Counts everyone who reached this stage, including those who went on or ended later">{step.now}</em>}<i className="fs-bar"><em style={{ width: `${top ? Math.min(100, Math.max(step.value ? 4 : 0, (step.value / top) * 100)) : 0}%` }} /></i></div>
      </li>; })}</ol>
      <p className="funnel-note">{report.contacted ? <>Out of every <b>10</b> {who === "creator" ? "influencers" : "brands"} you contact, about <b>{Math.round((report.repliedCount / report.contacted) * 10)}</b> reply and <b>{Math.round((report.wonCount / report.contacted) * 100) / 10}</b> {who === "creator" ? "join your roster" : "sign"}.{report.closedCount ? <> It takes about <b>{report.closeDays} day{report.closeDays === 1 ? "" : "s"}</b> from first contact to {wonWord}.</> : null}</> : "Your funnel appears as soon as your first outreach is logged or synced from Gmail."}</p>
      {range !== "all" && earlier.length > 0 && <p className="funnel-joined"><Trophy size={14} aria-hidden="true" /><span>{who === "creator" ? "Joined roster" : "Signed"} counts the day it happened. {earlier.length === 1 ? "One was" : `${earlier.length} were`} first contacted before this range, so the steps before it and the {conversion}% above don't include {earlier.length === 1 ? "them" : "them"}: {earlier.map((j, k) => <span key={j.id}><Link to={`/app/${who === "creator" ? "influencers" : "brands"}/${j.id}`}>{j.name}</Link> <small>({j.inbound ? "wrote to you first" : j.startAt ? `first contact ${dateLabel(j.startAt)}` : "no contact date"} · {who === "creator" ? "joined" : "signed"} {dateLabel(j.at)})</small>{k < earlier.length - 1 ? ", " : "."}</span>)}</span></p>}
    </section>

    <section className="metric-row report-metrics">
      <Metric label="Reply rate" value={report.allContacted ? `${report.replyRate}%` : "—"} detail={`${report.allContacted} reached out to`} icon={<Reply size={15} />} />
      <Metric label="Typical reply time" value={replied(report) ? `${report.medianReply} business day${report.medianReply === 1 ? "" : "s"}` : "—"} detail="median, first email → first reply" icon={<Clock3 size={15} />} />
      <Metric label="Replied after a follow-up" value={replied(report) ? `${report.afterFollowup}%` : "—"} detail={`of ${replied(report)} logged repl${replied(report) === 1 ? "y" : "ies"} needed a follow-up first`} icon={<Target size={15} />} />
      <Metric label="Time to close" value={report.closedCount ? `${report.closeDays} days` : "—"} detail={`median, first contact → ${wonWord}`} icon={<Trophy size={15} />} />
      <Metric label="Profit" value={money(report.profit)} detail={`${money(report.revenue)} revenue · ${report.deals} deal${report.deals === 1 ? "" : "s"}`} icon={<HandCoins size={15} />} />
    </section>
    {!report.gmail && <p className="report-hint"><Mail size={14} /> Reply data comes from follow-ups and replies you log — <Link to="/app/settings#gmail">connect Gmail</Link> and it fills in by itself.</p>}

    <section className="reports-grid">
      <div className="dash-panel wide reply-quality"><div className="panel-heading"><div><span>Replies</span><h2>How people answer</h2></div></div>
        <div className="quality-tiles">
          <div className="q-tile q-yes"><Smile size={15} /><strong>{report.quality.interested}</strong><small>Interested</small><em>{pct(report.quality.interested, report.contacted)}% of reached</em></div>
          <div className="q-tile q-no"><ThumbsDown size={15} /><strong>{report.quality.declined}</strong><small>Not interested</small><em>said no themselves</em></div>
          <div className="q-tile q-managed"><Users size={15} /><strong>{report.quality.managed}</strong><small>Management / auto no</small><em>reach them on socials</em></div>
          <div className="q-tile q-ghost"><Ghost size={15} /><strong>{report.quality.ghosted}</strong><small>Ghosted</small><em>no answer for 7+ days</em></div>
          <div className="q-tile"><Clock3 size={15} /><strong>{report.quality.waiting}</strong><small>Still waiting</small><em>last email under 7 days ago</em></div>
          <div className="q-tile"><MailPlus size={15} /><strong>{report.quality.newThreads}</strong><small>Got a new thread</small><em>{report.quality.newThreadReplies} answered the new · {report.quality.oldThreadReplies} the old</em></div>
        </div>
        <div className="report-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={report.byRound} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} interval={0} /><YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} /><Tooltip cursor={{ fill: "var(--surface-alt)" }} contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface-solid)" }} /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="Interested" stackId="r" fill="var(--success)" /><Bar dataKey="Not interested" stackId="r" fill="#d9534f" /><Bar dataKey="Unclear" stackId="r" fill="color-mix(in srgb, var(--accent) 45%, var(--line))" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
        <p className="muted-copy">Which message people answered and how — {report.quality.avgFollowups ? `on average after ${report.quality.avgFollowups} follow-up${report.quality.avgFollowups === 1 ? "" : "s"}` : "most answer the first email"}. A “new thread” answer came after you started a fresh email.</p>
      </div>

      <div className="dash-panel side-stack">
        <div className="mini-stat"><span className="mini-icon inbound"><Inbox size={15} /></span><div><small>Came to you</small><strong>{report.inbound.count} inbound {who === "creator" ? "influencer" : "brand"}{report.inbound.count === 1 ? "" : "s"}</strong><p>{report.inbound.count ? `${pct(report.inbound.won, report.inbound.count)}% became ${wonWord}` : "None in this range"}{report.inbound.leads ? ` · ${report.inbound.leads} spotted in Gmail, ${report.inbound.leadsAdded} added` : ""}</p></div></div>
        <div className="mini-stat"><span className="mini-icon lost"><TrendingDown size={15} /></span><div><small>Where deals die</small><strong>{report.losses} lost after replying</strong><p>{report.losses ? report.lossReasons.slice(0, 3).map(([r, n]) => `${lossReasonLabel(r)} (${n})`).join(" · ") : "Nothing lost after a reply in this range"}</p></div></div>
        {report.lossReasons.length > 0 && <div className="loss-bars">{report.lossReasons.slice(0, 4).map(([r, n]) => <div key={r}><span>{lossReasonLabel(r)}</span><i><em style={{ width: `${pct(n, report.losses)}%` }} /></i><b>{n}</b></div>)}</div>}
      </div>

      {report.boxes.length > 0 && <div className="dash-panel report-table wide mailbox-report"><div className="panel-heading"><div><span>Gmail · {range === "all" ? "all time" : `last ${RANGES.find((r) => r.value === range)?.label.toLowerCase()}`}</span><h2>Your mailboxes</h2></div><Link to="/app/settings#gmail">Manage</Link></div><table><thead><tr><th>Mailbox</th><th title="Every email that went out from this mailbox in the range — first emails, follow-ups and answers, each message once">Emails sent</th><th>People reached</th><th>Reply rate</th><th>{who === "creator" ? "Roster" : "Signed"} from it</th><th>Inbound leads</th></tr></thead><tbody>{report.boxes.map((b, i) => { const tone = mailboxTone(mailboxes.indexOf(b.mailbox)); const topSent = Math.max(1, ...report.boxes.map((x) => x.sent)); const peak = Math.max(1, ...b.daily); return <tr key={b.mailbox} className={`mbx-${tone}${box === b.mailbox ? " is-picked" : ""}`}><td><button type="button" className="mbx-cell" onClick={() => setBox(box === b.mailbox ? "" : b.mailbox)} title={box === b.mailbox ? "Show all mailboxes" : `Show only ${b.mailbox}`}><i className="mbx-dot" aria-hidden="true" /><MailboxName email={b.mailbox} />{i === 0 && b.sent > 0 && report.boxes.length > 1 && <Trophy size={12} className="mbx-top" />}</button></td><td><span className="mbx-sent"><b>{b.sent}</b><i aria-hidden="true"><em style={{ width: `${(b.sent / topSent) * 100}%` }} /></i><span className="mbx-spark" aria-hidden="true">{b.daily.slice(-14).map((n, k) => <i key={k} style={{ height: `${Math.max(8, (n / peak) * 100)}%`, opacity: n ? 1 : 0.25 }} />)}</span></span></td><td>{b.reached}</td><td><span className="rate-bar"><i style={{ width: `${b.replyRate}%` }} />{b.reached ? `${b.replyRate}%` : "—"}</span></td><td>{b.won}</td><td>{b.leads}</td></tr>; })}</tbody></table></div>}

      <BestTimeCard />
      <div className="dash-panel wide"><div className="panel-heading"><div><span>Money</span><h2>Revenue & profit · 12 months</h2></div><BarChart3 size={16} /></div><div className="report-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={report.months} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} /><Tooltip formatter={(v) => money(Number(v))} cursor={{ fill: "var(--surface-alt)" }} contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface-solid)" }} /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="Revenue" fill="color-mix(in srgb, var(--accent) 35%, var(--line))" radius={[6, 6, 0, 0]} /><Bar dataKey="Profit" fill="var(--success)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
      {table("By niche", report.byNiche, who === "creator" ? "Niche" : "Industry")}
      {table("By country", report.byCountry, who === "creator" ? "Country" : "Market")}
      <div className="dash-panel report-table wide"><div className="panel-heading"><div><span>Money</span><h2>Best brands by profit</h2></div></div>{report.topBrands.length ? <table><thead><tr><th>Brand</th><th>Deals</th><th>Revenue</th><th>Profit</th><th>Margin</th></tr></thead><tbody>{report.topBrands.map((b) => <tr key={b.name}><td>{b.name}</td><td>{b.deals}</td><td>{money(b.revenue)}</td><td><b>{money(b.profit)}</b></td><td>{pct(b.profit, b.revenue)}%</td></tr>)}</tbody></table> : <p className="muted-copy">No campaigns in this range yet.</p>}</div>
    </section>
  </div>;
}
