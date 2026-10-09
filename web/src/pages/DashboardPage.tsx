import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertCircle, ArrowRight, ArrowUpRight, BarChart3, Building2, CalendarDays, CheckCircle2, Clock3, DollarSign, Handshake, Mail, Plus, Reply, Send, Sparkles, TrendingUp, Trophy, UserPlus, Users, XCircle, Zap } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { Button, EmptyState, Metric, PageHeader, Tabs } from "../components/ui";
import { currencySymbol, dateLabel, dayKey, dueLabel, isOverdue, isPastDay, isTodayDay, money, parseDay, relativeTime, timeLabel } from "../lib/utils";
import { ENTITY_STATUSES, STATUS_LABELS } from "../types";

const funnelColors = ["#7c6bf0", "#4d88e8", "#24a6a1", "#d59b48", "#69a969", "#895ee2", "#ce6475", "#8c95a7"];

export default function DashboardPage() {
  const data = useData();
  const navigate = useNavigate();
  const creators = data.creators.filter((item) => !item.archived_at);
  const brands = data.brands.filter((item) => !item.archived_at);
  const campaigns = data.campaigns.filter((item) => !item.archived_at);
  const active = campaigns.filter((item) => item.status === "active");
  const activeValue = active.reduce((sum, item) => sum + item.agreed_payment, 0);
  const agencyRevenue = active.reduce((sum, item) => sum + item.agreed_payment - item.creator_payout, 0);
  const creatorPayout = active.reduce((sum, item) => sum + item.creator_payout, 0);
  const completed = campaigns.filter((item) => item.status === "completed");
  const today = new Date().toDateString();
  const todayMeetings = data.meetings.filter((item) => new Date(item.starts_at).toDateString() === today).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  // Action due dates set on profiles show up in today's agenda too.
  const todayActions = [
    ...creators.filter((c) => c.next_action_date && isTodayDay(c.next_action_date)).map((c) => ({ id: c.id, name: c.name, action: c.next_action || "Follow up", to: `/app/influencers/${c.id}`, type: "creator" as const })),
    ...brands.filter((b) => b.next_action_date && isTodayDay(b.next_action_date)).map((b) => ({ id: b.id, name: b.name, action: b.next_action || "Follow up", to: `/app/brands/${b.id}`, type: "brand" as const })),
  ];
  const funnel = ENTITY_STATUSES.map((status, index) => ({ name: STATUS_LABELS[status], value: creators.filter((item) => item.pipeline_status === status).length, fill: funnelColors[index] }));
  // Real pipeline velocity: last 6 calendar months bucketed from the user's
  // own campaigns by creation month. No placeholders — a workspace without
  // campaigns honestly renders a flat $0k line.
  const velocity = (() => {
    const buckets: { key: string; month: string; deals: number; total: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        month: d.toLocaleDateString("en-US", { month: "short" }),
        deals: 0,
        total: 0,
      });
    }
    campaigns.forEach((item) => {
      const d = new Date(item.created_at);
      if (Number.isNaN(d.getTime())) return;
      const bucket = buckets.find((b) => b.key === `${d.getFullYear()}-${d.getMonth()}`);
      if (bucket) {
        bucket.deals += 1;
        bucket.total += item.agreed_payment || 0;
      }
    });
    return buckets.map(({ month, deals, total }) => ({ month, deals, value: Math.round(total / 1000) }));
  })();
  // Outreach momentum: real events bucketed into a selectable time range.
  // Emails = first contacts dated in range; follow-ups = logged follow-up
  // events; replies/negotiations/closed/lost = status-change events the app
  // writes to the activity log. Nothing is estimated or placeholder.
  const [momentumRange, setMomentumRangeRaw] = useState(() => {
    try {
      return localStorage.getItem("if.momentum-range") || "week";
    } catch {
      return "week";
    }
  });
  const setMomentumRange = (value: string) => {
    setMomentumRangeRaw(value);
    try {
      localStorage.setItem("if.momentum-range", value);
    } catch {
      // private mode: range resets next visit
    }
  };
  const momentum = (() => {
    const now = Date.now();
    const day = 86400000;
    const d = new Date(now);
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime();
    const dayLabel = (t: number) => new Date(t).toLocaleDateString("en-US", { day: "numeric", month: "short" });
    const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    let start = monday;
    let end = now;
    let label = `Week of ${dayLabel(start)}`;
    let prevLabel = "vs last week so far";
    if (momentumRange === "today") {
      start = midnight;
      label = `Today · ${new Date(now).toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "short" })}`;
      prevLabel = "vs yesterday";
    } else if (momentumRange === "yesterday") {
      end = midnight;
      start = midnight - day;
      label = `Yesterday · ${new Date(start).toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "short" })}`;
      prevLabel = "vs day before";
    } else if (momentumRange === "lastweek") {
      prevLabel = "vs week before";
      end = monday;
      start = monday - 7 * day;
      label = `Week of ${dayLabel(start)}`;
    } else if (momentumRange === "30" || momentumRange === "90") {
      const days = momentumRange === "30" ? 30 : 90;
      start = now - days * day;
      label = `Last ${days} days`;
      prevLabel = `vs prior ${days} days`;
    }
    const pEnd = start;
    // "Today" compares with the same hours of yesterday, "this week" with the
    // same elapsed part of last week — like-for-like, never a partial vs full.
    const span = momentumRange === "today" || momentumRange === "yesterday" ? day : momentumRange === "week" || momentumRange === "lastweek" ? 7 * day : end - start;
    const pStart = start - span;
    const pFinish = momentumRange === "today" || momentumRange === "week" ? pStart + (end - start) : pEnd;
    const inR = (iso: string | null, s = start, e = end) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return !Number.isNaN(t) && t >= s && t < e;
    };
    const statusIn = (status: string, s = start, e = end) =>
      data.activities.filter((a) => a.text.endsWith(` updated to ${status}`) && inR(a.at, s, e)).length;
    // Date-only first-contact stamps ("2026-10-08") are local calendar days.
    const inDay = (value: string | null, s = start, e = end) => {
      const dd = parseDay(value);
      if (!dd) return false;
      return dd.getTime() >= new Date(s).setHours(0, 0, 0, 0) && dd.getTime() < e;
    };
    const createdCampaigns = (s = start, e = end) =>
      data.activities.filter((a) => a.text.endsWith("campaign created") && inR(a.at, s, e)).length;
    // A lost deal is stamped exactly when a replied-or-beyond record moves to
    // denied (campaigns: cancelled). Early rejections carry no stamp and never
    // inflate this number.
    const lostIn = (s = start, e = end) =>
      [...creators, ...brands, ...data.contacts, ...campaigns].filter((item) => item.lost_at && inR(item.lost_at, s, e)).length;
    // Emails sent counts dated first contacts that are still live outreach.
    // Moving someone back to New revokes theirs (explicit undo); closing the
    // lead keeps history on the record but drops it from this tile.
    const LIVE_OUTREACH = ["contacted", "replied", "negotiating", "roster", "signed"];
    const emails = (s = start, e = end) =>
      creators.filter((c) => inDay(c.date_contacted, s, e) && LIVE_OUTREACH.includes(c.pipeline_status)).length +
      brands.filter((b) => inDay(b.date_contacted, s, e) && LIVE_OUTREACH.includes(b.pipeline_status)).length +
      data.contacts.filter((c) => inDay(c.date_contacted, s, e) && LIVE_OUTREACH.includes(c.pipeline_status)).length;
    const count = {
      emails: emails(),
      followups: data.followups.filter((f) => inR(f.at)).length,
      replies: statusIn("replied"),
      negotiating: statusIn("negotiating") + createdCampaigns(),
      closed: statusIn("completed") + statusIn("signed"),
      lost: lostIn(),
      added: creators.filter((c) => inR(c.created_at)).length,
    };
    const prev = {
      emails: emails(pStart, pFinish),
      followups: data.followups.filter((f) => inR(f.at, pStart, pFinish)).length,
      replies: statusIn("replied", pStart, pFinish),
      negotiating: statusIn("negotiating", pStart, pFinish) + createdCampaigns(pStart, pFinish),
      closed: statusIn("completed", pStart, pFinish) + statusIn("signed", pStart, pFinish),
      lost: lostIn(pStart, pFinish),
      added: creators.filter((c) => inR(c.created_at, pStart, pFinish)).length,
    };
    // Daily breakdown for the last 14 days: first contacts, follow-ups and
    // replies per calendar day.
    const daily = Array.from({ length: 14 }, (_, i) => {
      const s = midnight - (13 - i) * day;
      const e = s + day;
      return {
        key: dayKey(new Date(s)),
        label: new Date(s).toLocaleDateString("en-US", { weekday: "short", day: "numeric" }),
        Emails: emails(s, e),
        "Follow-ups": data.followups.filter((f) => inR(f.at, s, e)).length,
        Replies: statusIn("replied", s, e),
      };
    });
    return { label, prevLabel, count, prev, daily };
  })();
  const momentumTiles = [
    { key: "emails", label: "Emails sent", icon: Mail, invert: false },
    { key: "followups", label: "Follow-ups sent", icon: Send, invert: false },
    { key: "replies", label: "Replies received", icon: Reply, invert: false },
    { key: "negotiating", label: "Negotiations started", icon: Handshake, invert: false },
    { key: "closed", label: "Deals closed", icon: Trophy, invert: false },
    { key: "lost", label: "Deals lost", icon: XCircle, invert: true },
    { key: "added", label: "New creators added", icon: UserPlus, invert: false },
  ] as const;
  // One entry per record, most urgent reason first: overdue > due today >
  // stale lead (no movement in 7+ days with a next action set).
  const attention = (() => {
    const out: { id: string; type: string; title: string; detail: string; to: string; urgent: boolean; rank: number }[] = [];
    const seen = new Set<string>();
    const push = (item: (typeof out)[number]) => {
      if (seen.has(item.to)) return;
      seen.add(item.to);
      out.push(item);
    };
    campaigns.filter((item) => item.status !== "cancelled" && item.payment_status !== "paid" && item.invoice_due && isPastDay(item.invoice_due)).forEach((item) => push({ id: `inv-${item.id}`, type: `Invoice · ${dueLabel(item.invoice_due)}`, title: item.name, detail: `${data.brands.find((b) => b.id === item.brand_id)?.name || "Brand"} owes ${money(item.agreed_payment)}`, to: `/app/campaigns?id=${item.id}&billing=1`, urgent: true, rank: 0 }));
    campaigns.filter((item) => item.status === "active" && isOverdue(item.due_date)).forEach((item) => push({ id: item.id, type: "Campaign overdue", title: item.name, detail: `Was due ${dateLabel(item.due_date)}`, to: `/app/campaigns?id=${item.id}`, urgent: true, rank: 0 }));
    const actionables = [
      ...creators.map((c) => ({ ...c, kind: "Influencer", to: `/app/influencers/${c.id}` })),
      ...brands.map((b) => ({ ...b, kind: "Brand", to: `/app/brands/${b.id}` })),
    ];
    actionables.filter((item) => item.next_action_date && isPastDay(item.next_action_date)).sort((a, b) => (a.next_action_date || "").localeCompare(b.next_action_date || "")).forEach((item) => push({ id: item.id, type: `${item.kind} · ${dueLabel(item.next_action_date)}`, title: item.name, detail: item.next_action || "Action overdue", to: item.to, urgent: true, rank: 1 }));
    data.meetings.filter((m) => m.kind !== "meeting" && !m.done && new Date(m.ends_at).getTime() < Date.now()).forEach((m) => push({ id: m.id, type: `${m.kind === "task" ? "Task" : "Reminder"} overdue`, title: m.title, detail: `Was due ${dateLabel(m.starts_at)}`, to: `/app/calendar?open=${m.id}`, urgent: true, rank: 1 }));
    actionables.filter((item) => item.next_action_date && isTodayDay(item.next_action_date)).forEach((item) => push({ id: item.id, type: `${item.kind} · Due today`, title: item.name, detail: item.next_action || "Action due today", to: item.to, urgent: false, rank: 2 }));
    actionables.filter((item) => item.next_action && !item.next_action_date && !["signed", "denied"].includes(item.pipeline_status) && Date.now() - new Date(item.status_updated_at || item.created_at).getTime() > 7 * 86400000).forEach((item) => push({ id: item.id, type: `${item.kind} · No movement 7+ days`, title: item.name, detail: item.next_action!, to: item.to, urgent: false, rank: 3 }));
    return out.sort((a, b) => a.rank - b.rank);
  })();

  if (!data.ready) return <div className="dashboard-skeleton"><i /><i /><i /><i /></div>;

  return <div className="dashboard-page">
    <PageHeader eyebrow="Private workspace" title={`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${data.profile.display_name?.split(" ")[0] || "there"}.`} description="Here is what is moving, what is earning, and what needs your attention." actions={<Button onClick={() => navigate("/app/campaigns?new=1")}><Plus size={16} /> New campaign</Button>} />

    {!creators.length && !brands.length ? <EmptyState title="A clear workspace, ready for your relationships" text="Add your first influencer to start building your pipeline." action={<div className="empty-actions"><Button onClick={() => navigate("/app/influencers?new=1")}>Add influencer</Button></div>} /> : <>
      <section className="metric-row">
        <Metric label="Active deal value" value={money(activeValue)} detail={<><span className="positive"><TrendingUp size={13} /> {active.length} live deals</span></>} icon={<DollarSign size={15} />} />
        <Metric label="Agency revenue" value={money(agencyRevenue)} detail={`${activeValue ? Math.round(agencyRevenue / activeValue * 100) : 0}% retained`} icon={<Sparkles size={15} />} />
        <Metric label="Creator payouts" value={money(creatorPayout)} detail="Across active campaigns" icon={<Users size={15} />} />
        <Metric label="Outstanding invoices" value={money(campaigns.filter((item) => item.status !== "cancelled" && item.payment_status !== "paid").reduce((sum, item) => sum + item.agreed_payment, 0))} detail={(() => { const late = campaigns.filter((item) => item.status !== "cancelled" && item.payment_status !== "paid" && item.invoice_due && isPastDay(item.invoice_due)).length; return late ? <span className="negative">{late} overdue</span> : `${campaigns.filter((item) => item.payment_status === "paid").length} paid campaigns`; })()} icon={<BarChart3 size={15} />} />
      </section>

      <section className="dash-panel momentum-panel">
        <div className="panel-heading"><div><span>Outreach momentum</span><h2>{momentum.label}</h2></div><Tabs active={momentumRange} onChange={setMomentumRange} tabs={[{ value: "today", label: "Today" }, { value: "yesterday", label: "Yesterday" }, { value: "week", label: "This week" }, { value: "lastweek", label: "Last week" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }]} /></div>
        <div className="momentum-grid">{momentumTiles.map((tile) => {
          const curr = momentum.count[tile.key];
          const prev = momentum.prev[tile.key];
          const diff = curr - prev;
          const good = tile.invert ? diff < 0 : diff > 0;
          return <div className="momentum-tile" key={tile.key}><span className="momentum-icon"><tile.icon size={15} /></span><strong>{curr}</strong><small>{tile.label}</small><em className={diff === 0 ? "delta-flat" : good ? "delta-up" : "delta-down"} title={momentum.prevLabel}>{diff === 0 ? `— ${momentum.prevLabel}` : `${diff > 0 ? "+" : ""}${diff} ${momentum.prevLabel}`}</em></div>;
        })}</div>
        <div className="daily-strip"><div className="daily-strip-head"><span>Daily outreach · last 14 days</span><span className="daily-legend"><i className="lg-emails" /> Emails <i className="lg-followups" /> Follow-ups <i className="lg-replies" /> Replies</span></div><div className="daily-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={momentum.daily} margin={{ top: 6, right: 4, left: -18, bottom: 0 }} barCategoryGap="22%"><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="label" axisLine={false} tickLine={false} interval={0} tick={{ fill: "var(--muted)", fontSize: 10 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} width={34} tick={{ fill: "var(--muted)", fontSize: 11 }} /><Tooltip cursor={{ fill: "rgba(var(--accent-rgb),.06)" }} contentStyle={{ background: "var(--surface-solid)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13 }} /><Bar dataKey="Emails" stackId="o" fill="var(--accent)" radius={[0, 0, 0, 0]} /><Bar dataKey="Follow-ups" stackId="o" fill="#24a6a1" /><Bar dataKey="Replies" stackId="o" fill="#d59b48" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
      </section>

      <section className="dashboard-primary-grid">
        <div className="dash-panel pipeline-panel">
          <div className="panel-heading"><div><span>Relationship pipeline</span><h2>From prospect to partner</h2></div><Link to="/app/influencers">View all <ArrowUpRight size={14} /></Link></div>
          <div className="pipeline-summary"><div><strong>{creators.length}</strong><span>Influencers</span></div><div><strong>{creators.filter((item) => ["roster", "signed"].includes(item.pipeline_status)).length}</strong><span>Roster ready</span></div><div><strong>{creators.length ? Math.round(creators.filter((item) => ["roster", "signed"].includes(item.pipeline_status)).length / creators.length * 100) : 0}%</strong><span>Conversion</span></div></div>
          <div className="funnel-list">{funnel.map((stage) => <button key={stage.name} onClick={() => navigate(`/app/influencers?status=${stage.name.toLowerCase().replace(" ", "_")}`)}><span className="funnel-label"><i style={{ background: stage.fill }} />{stage.name}</span><span className="funnel-bar"><i style={{ width: `${Math.max(stage.value / Math.max(...funnel.map((item) => item.value), 1) * 100, stage.value ? 8 : 0)}%`, background: stage.fill }} /></span><strong>{stage.value}</strong></button>)}</div>
        </div>
        <div className="dash-panel today-panel">
          <div className="panel-heading"><div><span>Today</span><h2>Your agenda</h2></div><Link to="/app/calendar">Calendar <ArrowUpRight size={14} /></Link></div>
          <div className="today-date"><strong>{new Date().toLocaleDateString("en-US", { weekday: "long" })}</strong><span>{new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}</span></div>
          <div className="agenda-list">{todayMeetings.map((meeting, index) => <button key={meeting.id} onClick={() => navigate(`/app/calendar?open=${meeting.id}`)}><div className="agenda-time"><strong>{timeLabel(meeting.starts_at)}</strong><span>{Math.round((new Date(meeting.ends_at).getTime() - new Date(meeting.starts_at).getTime()) / 60000)} min</span></div><i className={`agenda-line line-${index % 3}`} /><div><strong>{meeting.title}</strong><span>{meeting.kind !== "meeting" ? `${meeting.kind === "task" ? "Task" : "Reminder"}${meeting.done ? " · done" : ""}` : meeting.related_type ? `Linked ${meeting.related_type === "creator" ? "influencer" : meeting.related_type}` : "Meeting"}</span></div><ChevronRightIcon /></button>)}{todayActions.map((a) => <button key={`${a.type}-${a.id}`} onClick={() => navigate(a.to)}><div className="agenda-time"><strong>Due</strong><span>today</span></div><i className="agenda-line line-action" /><div><strong>{a.action}</strong><span>{a.type === "creator" ? "Influencer" : "Brand"} · {a.name}</span></div><ChevronRightIcon /></button>)}{!todayMeetings.length && !todayActions.length && <div className="agenda-empty"><CalendarDays /><strong>No meetings today</strong><span>Use the quiet time to move a deal forward.</span><Link to="/app/calendar?new=1">Schedule a meeting</Link></div>}</div>
        </div>
      </section>

      <section className="dashboard-secondary-grid">
        <div className="dash-panel analytics-panel"><div className="panel-heading"><div><span>Pipeline velocity</span><h2>Value moved per month</h2></div><span className="chart-legend"><i /> Deal value</span></div><div className="area-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={velocity} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}><defs><linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--accent)" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 13 }} /><YAxis width={48} axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 13 }} tickFormatter={(value) => `${currencySymbol()}${value}k`} /><Tooltip contentStyle={{ background: "var(--surface-solid)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 14 }} formatter={(value) => [`${currencySymbol()}${value}k`, "Value"]} /><Area type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2.5} fill="url(#valueGradient)" /></AreaChart></ResponsiveContainer></div><div className="analytics-foot"><span><b>{campaigns.length ? Math.round(completed.length / campaigns.length * 100) : 0}%</b> campaign completion</span><span><b>{campaigns.filter((item) => item.status === "active" && isOverdue(item.due_date)).length}</b> overdue</span><span><b>{brands.length}</b> brands in pipeline</span></div></div>
        <div className="dash-panel attention-panel"><div className="panel-heading"><div><span>Follow-up workspace</span><h2>Needs attention</h2></div><span className="attention-count">{attention.length}</span></div><div className="attention-list">{attention.slice(0, 8).map((item) => <Link key={`${item.type}-${item.id}`} to={item.to}><span className={item.urgent ? "urgent" : ""}>{item.urgent ? <AlertCircle /> : <Clock3 />}</span><div><small>{item.type}</small><strong>{item.title}</strong><p>{item.detail}</p></div><ArrowRight /></Link>)}{!attention.length && <div className="all-clear"><CheckCircle2 /><strong>Everything is moving</strong><span>No overdue or stale work right now.</span></div>}</div></div>
      </section>

      <section className="dashboard-bottom-grid">
        <div className="dash-panel activity-panel"><div className="panel-heading"><div><span>Workspace pulse</span><h2>Latest activity</h2></div><span>{Math.min(data.activities.length, 12)} updates</span></div><div className="activity-list">{data.activities.slice(0, 12).map((activity) => <div key={activity.id}><span className={`activity-dot activity-${activity.entity_type || "system"}`} /> <p>{activity.text}<small>{relativeTime(activity.at)}</small></p></div>)}</div></div>
        <div className="quick-panel"><span><Zap size={15} /> Quick actions</span><h2>Keep the day in flow.</h2><div><button onClick={() => navigate("/app/influencers?new=1")}><Users /><span>Add influencer<small>Grow your pipeline</small></span><ArrowRight /></button><button onClick={() => navigate("/app/brands?new=1")}><Building2 /><span>Add brand<small>Track a new lead</small></span><ArrowRight /></button><button onClick={() => navigate("/app/calendar?new=1")}><CalendarDays /><span>Schedule meeting<small>Never lose a follow-up</small></span><ArrowRight /></button></div></div>
      </section>
    </>}
  </div>;
}

function ChevronRightIcon() { return <ArrowRight size={15} />; }