import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertCircle, ArrowRight, ArrowUpRight, BarChart3, Building2, CalendarDays, CheckCircle2, Clock3, DollarSign, Plus, Sparkles, TrendingUp, Users, Zap } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { Button, EmptyState, Metric, PageHeader } from "../components/ui";
import { useChase } from "../hooks/useChase";
import { useGmail } from "../contexts/GmailContext";
import { CoachCard } from "../components/Coach";
import { OutreachBoard } from "../components/OutreachBoard";
import { TeamBoard } from "../components/Team";
import { computePayout, profitOf } from "../lib/deal";
import { flagFor } from "../lib/followupEngine";
import { leadName, leadWaitingHours } from "../hooks/useLeadActions";
import { currencySymbol, dateLabel, daysAgoLabel, daysSince, dueLabel, isOverdue, isPastDay, isTodayDay, money, relativeTime, timeLabel } from "../lib/utils";
import { ENTITY_STATUSES, STATUS_LABELS } from "../types";

// One line a day, so the dashboard greets you with something to aim at.
const NUDGES = [
  "Five emails today beat fifty next week.",
  "Check your yellow flags first — they're the replies you'd otherwise miss.",
  "Every roster creator started as a cold email. Send one more.",
  "Reply to inbound leads while they're warm — speed wins deals.",
  "A no today is often a yes next quarter. Log it, move on.",
  "Pitch the creator you'd be proud to sign.",
  "Small daily outreach compounds into a full roster.",
  "Brands buy confidence: know your creators' numbers cold.",
  "Protect your margin — price the deal, not the hours.",
  "Clear the Needs-attention list and the rest of the day is yours.",
  "One thoughtful follow-up beats three generic ones.",
  "Your next big deal is probably already in your pipeline.",
  "Consistency closes. Show up for your pipeline today.",
  "Celebrate the replies — then book the call.",
];
const nudgeOfDay = () => NUDGES[Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000) % NUDGES.length];

function FirstWins() {
  const data = useData();
  const gmail = useGmail();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem("if.firstwins.hidden") === "1";
    } catch {
      return false;
    }
  });
  const creators = data.creators.filter((c) => !c.archived_at);
  const reached = [...creators, ...data.brands.filter((b) => !b.archived_at)].filter((r) => r.date_contacted || !["new"].includes(r.pipeline_status)).length;
  const replied = [...creators, ...data.brands].some((r) => ["replied", "negotiating", "roster", "signed"].includes(r.pipeline_status) || !!r.lost_at);
  const steps = [
    { done: creators.length > 0, label: "Add your first influencer", hint: "Paste a channel link — or import a CSV", to: "/app/influencers?new=1" },
    { done: gmail.connected, label: "Connect Gmail", hint: "Statuses and follow-ups update by themselves", to: "/app/settings#gmail" },
    { done: reached >= 10, label: "Reach out to 10 people", hint: `${Math.min(reached, 10)} of 10 so far`, to: "/app/influencers" },
    { done: replied, label: "Get your first reply", hint: "Follow up on day 2 — the flag will remind you", to: "/app/influencers?status=contacted" },
    { done: creators.some((c) => ["roster", "signed"].includes(c.pipeline_status)), label: "Sign your first roster creator", hint: "The moment it becomes an agency", to: "/app/influencers" },
  ];
  const done = steps.filter((x) => x.done).length;
  if (hidden || done === steps.length) return null;
  const cheer = ["Let's get your first win on the board.", "Great start — momentum is everything.", "You're building something real.", "Over halfway. Keep the streak alive.", "One step from a real agency milestone."][Math.min(done, 4)];
  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem("if.firstwins.hidden", "1");
    } catch {
      // fine: it stays hidden for this visit
    }
  };
  return <section className="dash-panel first-wins">
    <div className="fw-head"><div className="fw-ring" style={{ ["--p" as string]: `${(done / steps.length) * 100}%` }}><b>{done}/{steps.length}</b></div><div><span>Your first wins</span><h2>{cheer}</h2></div><button type="button" className="fw-hide" onClick={hide} aria-label="Hide first wins">Hide</button></div>
    <ol className="fw-steps">{steps.map((x) => <li key={x.label} className={x.done ? "done" : ""}><Link to={x.to}><i>{x.done ? <CheckCircle2 size={15} /> : null}</i><span><strong>{x.label}</strong><small>{x.done ? "Done" : x.hint}</small></span>{!x.done && <ArrowRight size={14} />}</Link></li>)}</ol>
  </section>;
}

const funnelColors = ["#7c6bf0", "#e0794a", "#4d88e8", "#24a6a1", "#d59b48", "#69a969", "#895ee2", "#ce6475", "#8c95a7"];

export default function DashboardPage() {
  const data = useData();
  const navigate = useNavigate();
  const chase = useChase();
  const gmail = useGmail();
  const creators = data.creators.filter((item) => !item.archived_at);
  const brands = data.brands.filter((item) => !item.archived_at);
  const campaigns = data.campaigns.filter((item) => !item.archived_at);
  const active = campaigns.filter((item) => item.status === "active");
  // Same deal math as the campaign page and Reports (lib/deal).
  const activeValue = active.reduce((sum, item) => sum + (Number(item.agreed_payment) || 0), 0);
  const agencyRevenue = active.reduce((sum, item) => sum + profitOf(item), 0);
  const creatorPayout = active.reduce((sum, item) => sum + computePayout(item), 0);
  // Money still owed: agreed deals (live or delivered) the brand hasn't paid. A
  // deal still being negotiated isn't owed yet; a cancelled one never is.
  const owed = campaigns.filter((item) => (item.status === "active" || item.status === "completed") && item.payment_status !== "paid");
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
    campaigns.filter((item) => item.status !== "cancelled").forEach((item) => {
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
    owed.filter((item) => item.invoice_due && isPastDay(item.invoice_due)).forEach((item) => push({ id: `inv-${item.id}`, type: `Invoice · ${dueLabel(item.invoice_due)}`, title: item.name, detail: `${data.brands.find((b) => b.id === item.brand_id)?.name || "Brand"} owes ${money(item.agreed_payment)}`, to: `/app/campaigns?id=${item.id}&billing=1`, urgent: true, rank: 0 }));
    // Someone reached out to you: reply fast, the longest-waiting first.
    [...creators.map((c) => ({ ...c, kind: "Influencer", to: `/app/influencers/${c.id}` })), ...brands.map((b) => ({ ...b, kind: "Brand", to: `/app/brands/${b.id}` }))]
      .filter((item) => item.pipeline_status === "inbound")
      .sort((a, b) => (a.date_contacted || a.status_updated_at || "").localeCompare(b.date_contacted || b.status_updated_at || ""))
      .forEach((item) => { const waited = daysSince(item.date_contacted || item.status_updated_at) || 0; push({ id: `in-${item.id}`, type: `Inbound ${item.kind.toLowerCase()} · ${waited ? `waiting ${daysAgoLabel(item.date_contacted || item.status_updated_at).replace(" ago", "")}` : "came in today"}`, title: item.name, detail: item.next_action || "Reached out to you — reply while they're warm", to: item.to, urgent: waited >= 1, rank: 0 }); });
    // New people who emailed you first (spotted by the Gmail scanner).
    // Waiting a day or more on your answer: its own, louder line.
    const stale = gmail.leads.filter((l) => leadWaitingHours(l) >= 24).sort((a, b) => a.last_at.localeCompare(b.last_at));
    if (stale.length) push({ id: "leads-waiting", type: `Gmail · waiting on your answer · ${Math.round(leadWaitingHours(stale[0]) / 24)}+ day${Math.round(leadWaitingHours(stale[0]) / 24) === 1 ? "" : "s"}`, title: stale.length === 1 ? leadName(stale[0]) : `${stale.length} inbound leads haven't heard back`, detail: `${stale.slice(0, 3).map((l) => l.company || leadName(l)).join(", ")} — answer in Gmail: a yes adds them, a no dismisses them`, to: "/app/leads", urgent: true, rank: 0 });
    const freshLeads = gmail.leads.filter((l) => l.status === "new" && !stale.includes(l));
    if (freshLeads.length) push({ id: "leads", type: `Gmail · ${freshLeads.length === 1 ? `new inbound ${freshLeads[0].kind === "creator" ? "creator" : "brand"}` : "new inbound leads"} · ${relativeTime(freshLeads[0].last_at)}`, title: freshLeads.length === 1 ? freshLeads[0].name || freshLeads[0].company || freshLeads[0].email : `${freshLeads.length} people emailed you first`, detail: freshLeads.length === 1 ? `“${freshLeads[0].subject || "(no subject)"}” — review and add to your CRM` : freshLeads.slice(0, 3).map((l) => l.company || l.name || l.email).join(", ") + " — review and add them", to: "/app/leads", urgent: true, rank: 0 });
    campaigns.filter((item) => item.status === "active" && isOverdue(item.due_date)).forEach((item) => push({ id: item.id, type: "Campaign overdue", title: item.name, detail: `Was due ${dateLabel(item.due_date)}`, to: `/app/campaigns?id=${item.id}`, urgent: true, rank: 0 }));
    const actionables = [
      ...creators.map((c) => ({ ...c, kind: "Influencer", to: `/app/influencers/${c.id}` })),
      ...brands.map((b) => ({ ...b, kind: "Brand", to: `/app/brands/${b.id}` })),
    ];
    actionables.filter((item) => item.next_action_date && isPastDay(item.next_action_date)).sort((a, b) => (a.next_action_date || "").localeCompare(b.next_action_date || "")).forEach((item) => push({ id: item.id, type: `${item.kind} · ${dueLabel(item.next_action_date)}`, title: item.name, detail: item.next_action || "Action overdue", to: item.to, urgent: true, rank: 1 }));
    data.meetings.filter((m) => m.kind !== "meeting" && !m.done && new Date(m.ends_at).getTime() < Date.now()).forEach((m) => push({ id: m.id, type: `${m.kind === "task" ? "Task" : "Reminder"} overdue`, title: m.title, detail: `Was due ${dateLabel(m.starts_at)}`, to: `/app/calendar?open=${m.id}`, urgent: true, rank: 1 }));
    actionables.filter((item) => item.next_action_date && isTodayDay(item.next_action_date)).forEach((item) => push({ id: item.id, type: `${item.kind} · Due today`, title: item.name, detail: item.next_action || "Action due today", to: item.to, urgent: false, rank: 2 }));
    // The follow-up engine: no reply after the business-day gap, or they wrote and you haven't answered.
    chase.due.sort((a, b) => (b.state.kind === "due" ? b.state.overdueDays : 0) - (a.state.kind === "due" ? a.state.overdueDays : 0)).forEach((item) => push({ id: `fu-${item.id}`, type: `${item.type === "creator" ? "Influencer" : "Brand"} · ${flagFor(item.state)?.short || "Follow up"}`, title: item.name, detail: flagFor(item.state)?.long || "", to: item.type === "creator" ? `/app/influencers/${item.id}` : `/app/brands/${item.id}`, urgent: item.state.kind === "due" && item.state.overdueDays > 0, rank: 0.5 }));
    chase.cancel.forEach((item) => push({ id: `cx-${item.id}`, type: `${item.type === "creator" ? "Influencer" : "Brand"} · Cancel scheduled email`, title: item.name, detail: flagFor(item.state)?.long || "", to: item.type === "creator" ? `/app/influencers/${item.id}` : `/app/brands/${item.id}`, urgent: true, rank: 0 }));
    chase.reply.forEach((item) => push({ id: `re-${item.id}`, type: `${item.type === "creator" ? "Influencer" : "Brand"} · Reply needed`, title: item.name, detail: flagFor(item.state)?.long || "", to: item.type === "creator" ? `/app/influencers/${item.id}` : `/app/brands/${item.id}`, urgent: item.state.kind === "reply-needed" && item.state.days >= 1, rank: 0.6 }));
    chase.managed.forEach((item) => push({ id: `mg-${item.id}`, type: `${item.type === "creator" ? "Influencer" : "Brand"} · Managed — DM them`, title: item.name, detail: flagFor(item.state)?.long || "", to: item.type === "creator" ? `/app/influencers/${item.id}` : `/app/brands/${item.id}`, urgent: false, rank: 2.5 }));
    chase.reach.forEach((item) => push({ id: `rb-${item.id}`, type: `${item.type === "creator" ? "Influencer" : "Brand"} · Reach back`, title: item.name, detail: flagFor(item.state)?.long || "", to: item.type === "creator" ? `/app/influencers/${item.id}` : `/app/brands/${item.id}`, urgent: false, rank: 2.6 }));
    actionables.filter((item) => item.next_action && !item.next_action_date && !["signed", "denied"].includes(item.pipeline_status) && Date.now() - new Date(item.status_updated_at || item.created_at).getTime() > 7 * 86400000).forEach((item) => push({ id: item.id, type: `${item.kind} · No movement 7+ days`, title: item.name, detail: item.next_action!, to: item.to, urgent: false, rank: 3 }));
    return out.sort((a, b) => a.rank - b.rank);
  })();

  if (!data.ready) return <div className="dashboard-skeleton"><i /><i /><i /><i /></div>;

  return <div className="dashboard-page">
    <PageHeader eyebrow="Private workspace" title={`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${data.profile.display_name?.split(" ")[0] || "there"}.`} description={nudgeOfDay()} actions={<Button onClick={() => navigate("/app/campaigns?new=1")}><Plus size={16} /> New campaign</Button>} />

    <CoachCard />
    <TeamBoard />
    <FirstWins />
    {!creators.length && !brands.length ? <EmptyState title="A clear workspace, ready for your relationships" text="Add your first influencer to start building your pipeline." action={<div className="empty-actions"><Button onClick={() => navigate("/app/influencers?new=1")}>Add influencer</Button></div>} /> : <>
      <section className="metric-row">
        <Metric label="Active deal value" value={money(activeValue)} detail={<><span className="positive"><TrendingUp size={13} /> {active.length} live deals</span></>} icon={<DollarSign size={15} />} />
        <Metric label="Your profit" value={money(agencyRevenue)} detail={`${activeValue ? Math.round(agencyRevenue / activeValue * 100) : 0}% margin on live deals`} icon={<Sparkles size={15} />} />
        <Metric label="Creator payouts" value={money(creatorPayout)} detail="Across active campaigns" icon={<Users size={15} />} />
        <Metric label="Outstanding invoices" value={money(owed.reduce((sum, item) => sum + (Number(item.agreed_payment) || 0), 0))} detail={(() => { const late = owed.filter((item) => item.invoice_due && isPastDay(item.invoice_due)).length; return late ? <span className="negative">{late} overdue</span> : `${campaigns.filter((item) => item.payment_status === "paid").length} paid campaigns`; })()} icon={<BarChart3 size={15} />} />
      </section>

      <OutreachBoard />

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