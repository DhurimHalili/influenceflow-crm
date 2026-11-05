import { BestTimeCard } from "../components/Insights";
import { BarChart3, Clock3, Ghost, HandCoins, Inbox, Mail, MailPlus, Reply, Send, Smile, Target, ThumbsDown, TrendingDown, Trophy, Users } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Metric, PageHeader, Tabs } from "../components/ui";
import { useData } from "../contexts/DataContext";
import { useGmail } from "../contexts/GmailContext";
import { useSessionState } from "../hooks/useSessionState";
import { profitOf } from "../lib/deal";
import { businessDaysBetween, timeline } from "../lib/followupEngine";
import { mailboxStats } from "../lib/mailboxStats";
import { declined, replyTone } from "../lib/replyReader";
import { DEFAULT_FOLLOWUP_RULES } from "../lib/prefs";
import { lossReasonLabel, money } from "../lib/utils";
import type { Activity, Brand, Creator, EntityStatus } from "../types";

// What's working: how many people you reach turn into replies, deals and
// roster signings; how fast; which follow-up and which mailbox earns them;
// and where the money comes from. Everything is computed from your records.

type Row = { key: string; contacted: number; replied: number; won: number };
type Who = "creator" | "brand";
const RANGES = [{ value: "30", label: "30 days" }, { value: "90", label: "90 days" }, { value: "365", label: "12 months" }, { value: "all", label: "All time" }];
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
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
  const rules = data.profile.preferences?.followup_rules || DEFAULT_FOLLOWUP_RULES;
  const from = range === "all" ? 0 : Date.now() - Number(range) * 86400000;

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
    const people = items.map((item) => {
      // An out-of-office or a management auto-decline isn't a reply.
      const all = timeline({ type: item.type, record: item.record as Creator }, data.followups, events);
      const managedNo = all.some((t) => t.dir === "in" && t.kind === "managed_no");
      const touches = all.filter((t) => !(t.dir === "in" && (t.kind === "auto" || t.kind === "managed_no")));
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
      const startAt = first?.at || null;
      const mailbox = firstOut ? events.find((e) => e.entity_id === item.record.id && e.direction === "out" && e.at === firstOut.at)?.mailbox || "" : "";
      // How their first real answer read, which thread it came in, and whether they ever answered.
      const tone: "yes" | "no" | "neutral" | null = !firstIn ? null : firstIn.kind === "no" || declined(firstIn.detail) ? "no" : rank >= 3 || replyTone(firstIn.detail) === "yes" ? "yes" : "neutral";
      const threadsStarted = Array.from(new Set(touches.filter((t) => t.dir === "out" && t.source === "gmail" && t.threadId).map((t) => t.threadId!)));
      const replyThread = firstIn?.threadId || "";
      const replyInNewThread = !!replyThread && threadsStarted.length > 1 && replyThread !== threadsStarted[0];
      const lastOut = [...touches].reverse().find((t) => t.dir === "out");
      const ghosted = !inbound && !firstIn && !managedNo && !!lastOut && Date.now() - new Date(lastOut.at).getTime() > 7 * 86400000;
      return { ...item, first, firstOut, firstIn, inbound, outsBefore, rank, wonAt, startAt, mailbox, lost: !!item.record.lost_at && item.record.pipeline_status === "denied", tone, managedNo, ghosted, threads: threadsStarted.length, replyInNewThread };
    }).filter((p) => p.startAt && new Date(p.startAt).getTime() >= from);

    const outreach = people.filter((p) => !p.inbound);
    const inbound = people.filter((p) => p.inbound);
    const side = (list: typeof people) => list.filter((p) => p.type === who);
    const cohort = side(outreach);
    const stage = (n: number) => cohort.filter((p) => p.rank >= n).length;
    const funnel = [
      { key: "reached", label: "Reached out", value: cohort.length, icon: Send, now: "" },
      { key: "replied", label: "Replied", value: stage(2), icon: Reply, now: "" },
      { key: "negotiating", label: "Got to negotiating", value: stage(3), icon: HandCoins, now: `${cohort.filter((p) => p.record.pipeline_status === "negotiating").length} negotiating now` },
      { key: "won", label: who === "creator" ? "Roster" : "Signed", value: stage(4), icon: Trophy, now: "" },
    ];
    const inboundSide = side(inbound);
    const closeDays = side(people).filter((p) => p.wonAt && p.startAt).map((p) => Math.max(0, (new Date(p.wonAt!).getTime() - new Date(p.startAt!).getTime()) / 86400000));
    const replied = outreach.filter((p) => p.firstIn && p.firstOut);
    const replyDays = replied.map((p) => businessDaysBetween(new Date(p.firstOut!.at), new Date(p.firstIn!.at), rules));
    // Which message they answered, and how: a new thread is its own bucket.
    const sideReplied = side(replied);
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
      managed: cohortSide.filter((p) => !p.firstIn && p.managedNo).length,
      ghosted: cohortSide.filter((p) => p.ghosted).length,
      waiting: cohortSide.filter((p) => !p.firstIn && !p.managedNo && !p.ghosted).length,
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

    // Money: campaigns started (or created) in the range, cancelled ones left out.
    const campaigns = data.campaigns.filter((c) => !c.archived_at && c.status !== "cancelled" && new Date(c.start_date || c.created_at).getTime() >= from);
    const months = new Map<string, { name: string; Revenue: number; Profit: number }>();
    for (let i = 0; i < 12; i++) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - (11 - i));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.set(key, { name: new Intl.DateTimeFormat("en-US", { month: "short" }).format(d), Revenue: 0, Profit: 0 });
    }
    for (const c of data.campaigns.filter((c) => !c.archived_at && c.status !== "cancelled")) {
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

    const boxes = mailboxStats(events, gmail.leads, gmail.mailboxes.map((m) => m.email), range === "all" ? null : Number(range)).map((s) => ({ ...s, won: outreach.filter((p) => p.mailbox === s.mailbox && p.rank >= 4).length }));
    const leadsIn = gmail.leads.filter((l) => new Date(l.first_at).getTime() >= from);

    return {
      funnel,
      contacted: cohort.length,
      repliedCount: stage(2),
      wonCount: stage(4),
      allContacted: outreach.length,
      replyRate: pct(outreach.filter((p) => p.rank >= 2).length, outreach.length),
      medianReply: median(replyDays),
      afterFollowup: pct(replied.filter((p) => p.outsBefore > 1).length, replied.length),
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
  }, [data.creators, data.brands, data.campaigns, data.followups, data.emailEvents, data.activities, gmail.leads, gmail.mailboxes, from, rules, who, range]);

  const top = report.funnel[0].value;
  const conversion = pct(report.wonCount, report.contacted);
  const wonWord = who === "creator" ? "roster" : "signed";
  const table = (title: string, rows: Row[], label: string) => <div className="dash-panel report-table"><div className="panel-heading"><div><span>{who === "creator" ? "Influencers" : "Brands"}</span><h2>{title}</h2></div></div>{rows.length ? <table><thead><tr><th>{label}</th><th>Reached</th><th>Reply rate</th><th>{who === "creator" ? "Roster" : "Signed"}</th></tr></thead><tbody>{rows.map((r) => <tr key={r.key}><td>{r.key}</td><td>{r.contacted}</td><td><span className="rate-bar"><i style={{ width: `${pct(r.replied, r.contacted)}%` }} />{pct(r.replied, r.contacted)}%</span></td><td><b>{r.won}</b> <small className="muted">{pct(r.won, r.contacted)}%</small></td></tr>)}</tbody></table> : <p className="muted-copy">No outreach in this range yet.</p>}</div>;

  return <div className="reports-page">
    <PageHeader eyebrow="Insights" title="Reports" description="From first email to signed deal — what converts, how fast, and where the money comes from." actions={<Tabs active={range} onChange={setRange} tabs={RANGES} />} />

    <section className="dash-panel funnel-hero">
      <div className="funnel-hero-head">
        <div className="funnel-headline"><span className="funnel-big">{report.contacted ? `${conversion}%` : "—"}</span><div><strong>of the {who === "creator" ? "influencers" : "brands"} you reached out to {who === "creator" ? "joined your roster" : "signed"}</strong><small>{report.contacted ? `${report.wonCount} of ${report.contacted} · first contact in this range` : "Reach out to someone and this fills in"}</small></div></div>
        <Tabs active={who} onChange={(v) => setWho(v as Who)} tabs={[{ value: "creator", label: "Influencers" }, { value: "brand", label: "Brands" }]} />
      </div>
      <ol className="funnel-steps">{report.funnel.map((step, i) => { const prev = i ? report.funnel[i - 1].value : 0; return <li key={step.key} className={`fs-${step.key}`}>
        {i > 0 && <span className="fs-conv" title={`From ${report.funnel[i - 1].label.toLowerCase()}`}>{pct(step.value, prev)}%</span>}
        <div className="fs-card"><span className="fs-icon"><step.icon size={15} /></span><b>{step.value}</b><small>{step.label}</small>{step.now && step.value !== Number.parseInt(step.now, 10) && <em className="fs-now" title="Counts everyone who reached this stage, including those who went on to sign or ended later">{step.now}</em>}<i className="fs-bar"><em style={{ width: `${top ? Math.max(step.value ? 4 : 0, (step.value / top) * 100) : 0}%` }} /></i></div>
      </li>; })}</ol>
      <p className="funnel-note">{report.contacted ? <>Out of every <b>10</b> {who === "creator" ? "influencers" : "brands"} you contact, about <b>{Math.round((report.repliedCount / report.contacted) * 10)}</b> reply and <b>{Math.round((report.wonCount / report.contacted) * 100) / 10}</b> {who === "creator" ? "join your roster" : "sign"}.{report.closedCount ? <> It takes about <b>{report.closeDays} day{report.closeDays === 1 ? "" : "s"}</b> from first contact to {wonWord}.</> : null}</> : "Your funnel appears as soon as your first outreach is logged or synced from Gmail."}</p>
    </section>

    <section className="metric-row report-metrics">
      <Metric label="Reply rate" value={report.allContacted ? `${report.replyRate}%` : "—"} detail={`${report.allContacted} reached out to`} icon={<Reply size={15} />} />
      <Metric label="Typical reply time" value={report.medianReply || report.replyRate ? `${report.medianReply} business day${report.medianReply === 1 ? "" : "s"}` : "—"} detail="median, first email → first reply" icon={<Clock3 size={15} />} />
      <Metric label="Won by following up" value={report.replyRate ? `${report.afterFollowup}%` : "—"} detail="of replies came after a follow-up" icon={<Target size={15} />} />
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

      {report.boxes.length > 0 && <div className="dash-panel report-table wide mailbox-report"><div className="panel-heading"><div><span>Gmail</span><h2>Your mailboxes</h2></div><Link to="/app/settings#gmail">Manage</Link></div><table><thead><tr><th>Mailbox</th><th>Emails sent</th><th>People reached</th><th>Reply rate</th><th>{who === "creator" ? "Roster" : "Signed"} from it</th><th>Inbound leads</th></tr></thead><tbody>{report.boxes.map((b, i) => <tr key={b.mailbox}><td><span className="mbx-cell">{i === 0 && b.sent > 0 && report.boxes.length > 1 && <Trophy size={12} />}{b.mailbox}</span></td><td><b>{b.sent}</b></td><td>{b.reached}</td><td><span className="rate-bar"><i style={{ width: `${b.replyRate}%` }} />{b.reached ? `${b.replyRate}%` : "—"}</span></td><td>{b.won}</td><td>{b.leads}</td></tr>)}</tbody></table></div>}

      <BestTimeCard />
      <div className="dash-panel wide"><div className="panel-heading"><div><span>Money</span><h2>Revenue & profit · 12 months</h2></div><BarChart3 size={16} /></div><div className="report-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={report.months} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} /><Tooltip formatter={(v) => money(Number(v))} cursor={{ fill: "var(--surface-alt)" }} contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface-solid)" }} /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="Revenue" fill="color-mix(in srgb, var(--accent) 35%, var(--line))" radius={[6, 6, 0, 0]} /><Bar dataKey="Profit" fill="var(--success)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
      {table("By niche", report.byNiche, who === "creator" ? "Niche" : "Industry")}
      {table("By country", report.byCountry, who === "creator" ? "Country" : "Market")}
      <div className="dash-panel report-table wide"><div className="panel-heading"><div><span>Money</span><h2>Best brands by profit</h2></div></div>{report.topBrands.length ? <table><thead><tr><th>Brand</th><th>Deals</th><th>Revenue</th><th>Profit</th><th>Margin</th></tr></thead><tbody>{report.topBrands.map((b) => <tr key={b.name}><td>{b.name}</td><td>{b.deals}</td><td>{money(b.revenue)}</td><td><b>{money(b.profit)}</b></td><td>{pct(b.profit, b.revenue)}%</td></tr>)}</tbody></table> : <p className="muted-copy">No campaigns in this range yet.</p>}</div>
    </section>
  </div>;
}
