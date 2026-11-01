import { BarChart3, Clock3, HandCoins, MailCheck, Reply, Send, Trophy } from "lucide-react";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Metric, PageHeader, Tabs } from "../components/ui";
import { useData } from "../contexts/DataContext";
import { useSessionState } from "../hooks/useSessionState";
import { profitOf } from "../lib/deal";
import { businessDaysBetween, timeline } from "../lib/followupEngine";
import { DEFAULT_FOLLOWUP_RULES } from "../lib/prefs";
import { money } from "../lib/utils";

// What's working: who replies, how fast, after which follow-up, and where the
// money comes from. Everything is computed from your own records.

type Row = { key: string; contacted: number; replied: number; won: number };
const RANGES = [{ value: "30", label: "30 days" }, { value: "90", label: "90 days" }, { value: "365", label: "12 months" }, { value: "all", label: "All time" }];
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const median = (values: number[]) => {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export default function ReportsPage() {
  const data = useData();
  const [range, setRange] = useSessionState("reports.range", "90");
  const rules = data.profile.preferences?.followup_rules || DEFAULT_FOLLOWUP_RULES;
  const from = range === "all" ? 0 : Date.now() - Number(range) * 86400000;

  const report = useMemo(() => {
    const events = data.emailEvents || [];
    // Outreach: everyone you first reached in the range, and whether / how they answered.
    const outreach = [
      ...data.creators.map((c) => ({ type: "creator" as const, record: c, niche: c.niche || "No niche", country: c.country || "Not set" })),
      ...data.brands.map((b) => ({ type: "brand" as const, record: b as never as typeof data.creators[number], niche: b.brand_type || "No industry", country: (b.brief?.markets || [])[0] || "Not set" })),
    ].map((item) => {
      const touches = timeline({ type: item.type, record: item.record }, data.followups, events);
      const firstOut = touches.find((t) => t.dir === "out");
      const firstIn = firstOut ? touches.find((t) => t.dir === "in" && t.at > firstOut.at) : undefined;
      const outsBefore = firstIn ? touches.filter((t) => t.dir === "out" && t.at <= firstIn.at).length : 0;
      return { ...item, firstOut, firstIn, outsBefore, won: ["roster", "signed"].includes(item.record.pipeline_status) };
    }).filter((item) => item.firstOut && new Date(item.firstOut.at).getTime() >= from);

    const replied = outreach.filter((o) => o.firstIn);
    const replyDays = replied.map((o) => businessDaysBetween(new Date(o.firstOut!.at), new Date(o.firstIn!.at), rules));
    const byRound = [1, 2, 3, 4].map((round) => ({ name: round === 1 ? "First email" : round === 4 ? "3rd follow-up +" : `${round - 1}${round === 2 ? "st" : "nd"} follow-up`, Replies: replied.filter((o) => (round === 4 ? o.outsBefore >= 4 : o.outsBefore === round)).length }));

    const group = (key: (o: (typeof outreach)[number]) => string, onlyCreators = true) => {
      const map = new Map<string, Row>();
      for (const o of outreach) {
        if (onlyCreators && o.type !== "creator") continue;
        const k = key(o);
        const row = map.get(k) || { key: k, contacted: 0, replied: 0, won: 0 };
        row.contacted++;
        if (o.firstIn) row.replied++;
        if (o.won) row.won++;
        map.set(k, row);
      }
      return Array.from(map.values()).sort((a, b) => b.contacted - a.contacted).slice(0, 12);
    };

    // Money: campaigns started (or created) in the range, cancelled ones left out.
    const campaigns = data.campaigns.filter((c) => !c.archived_at && c.status !== "cancelled" && new Date(c.start_date || c.created_at).getTime() >= from);
    const months = new Map<string, { name: string; Revenue: number; Profit: number }>();
    const monthKey = (iso: string) => iso.slice(0, 7);
    const last12 = Array.from({ length: 12 }, (_, i) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - (11 - i));
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
    for (const key of last12) months.set(key, { name: new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(`${key}-01T12:00:00`)), Revenue: 0, Profit: 0 });
    for (const c of data.campaigns.filter((c) => !c.archived_at && c.status !== "cancelled")) {
      const m = months.get(monthKey(c.start_date || c.created_at));
      if (m) { m.Revenue += c.agreed_payment || 0; m.Profit += profitOf(c); }
    }
    const brands = new Map<string, { name: string; deals: number; revenue: number; profit: number }>();
    for (const c of campaigns) {
      const name = data.brands.find((b) => b.id === c.brand_id)?.name || "No brand";
      const row = brands.get(name) || { name, deals: 0, revenue: 0, profit: 0 };
      row.deals++;
      row.revenue += c.agreed_payment || 0;
      row.profit += profitOf(c);
      brands.set(name, row);
    }
    return {
      contacted: outreach.length,
      replied: replied.length,
      medianDays: median(replyDays),
      afterFollowup: replied.filter((o) => o.outsBefore > 1).length,
      byRound,
      byNiche: group((o) => o.niche),
      byCountry: group((o) => o.country),
      revenue: campaigns.reduce((s, c) => s + (c.agreed_payment || 0), 0),
      profit: campaigns.reduce((s, c) => s + profitOf(c), 0),
      deals: campaigns.length,
      months: Array.from(months.values()),
      topBrands: Array.from(brands.values()).sort((a, b) => b.profit - a.profit).slice(0, 10),
      gmail: events.length > 0,
    };
  }, [data.creators, data.brands, data.campaigns, data.followups, data.emailEvents, from, rules]);

  const table = (title: string, rows: Row[], label: string) => <div className="dash-panel report-table"><div className="panel-heading"><div><span>Reply rate</span><h2>{title}</h2></div></div>{rows.length ? <table><thead><tr><th>{label}</th><th>Contacted</th><th>Replied</th><th>Rate</th><th>Won</th></tr></thead><tbody>{rows.map((r) => <tr key={r.key}><td>{r.key}</td><td>{r.contacted}</td><td>{r.replied}</td><td><span className="rate-bar"><i style={{ width: `${pct(r.replied, r.contacted)}%` }} />{pct(r.replied, r.contacted)}%</span></td><td>{r.won}</td></tr>)}</tbody></table> : <p className="muted-copy">No outreach in this range yet.</p>}</div>;

  return <div className="reports-page">
    <PageHeader eyebrow="Insights" title="Reports" description="What's working — who replies, how fast, after which follow-up, and where the money comes from." actions={<Tabs active={range} onChange={setRange} tabs={RANGES} />} />
    <section className="metric-row report-metrics">
      <Metric label="People contacted" value={report.contacted} detail="influencers and brands, first contact in range" icon={<Send size={15} />} />
      <Metric label="Reply rate" value={`${pct(report.replied, report.contacted)}%`} detail={`${report.replied} replied`} icon={<Reply size={15} />} />
      <Metric label="Typical reply time" value={report.replied ? `${report.medianDays} business day${report.medianDays === 1 ? "" : "s"}` : "—"} detail="median, first email to first reply" icon={<Clock3 size={15} />} />
      <Metric label="Won by following up" value={report.replied ? `${pct(report.afterFollowup, report.replied)}%` : "—"} detail="of replies came after a follow-up" icon={<MailCheck size={15} />} />
      <Metric label="Profit" value={money(report.profit)} detail={`${money(report.revenue)} revenue · ${report.deals} deal${report.deals === 1 ? "" : "s"}`} icon={<HandCoins size={15} />} />
    </section>
    {!report.gmail && <p className="report-hint"><Trophy size={14} /> Reply data comes from follow-ups and replies you log — connect Gmail in Settings and it fills in by itself.</p>}
    <section className="reports-grid">
      <div className="dash-panel"><div className="panel-heading"><div><span>Follow-ups</span><h2>When people reply</h2></div></div><div className="report-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={report.byRound} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} /><Tooltip cursor={{ fill: "var(--surface-alt)" }} contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface-solid)" }} /><Bar dataKey="Replies" fill="var(--accent)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div><p className="muted-copy">Replies grouped by which message they answered — proof of how much each follow-up is worth.</p></div>
      <div className="dash-panel"><div className="panel-heading"><div><span>Money</span><h2>Revenue & profit · 12 months</h2></div><BarChart3 size={16} /></div><div className="report-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={report.months} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} /><Tooltip formatter={(v) => money(Number(v))} cursor={{ fill: "var(--surface-alt)" }} contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface-solid)" }} /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="Revenue" fill="color-mix(in srgb, var(--accent) 35%, var(--line))" radius={[6, 6, 0, 0]} /><Bar dataKey="Profit" fill="var(--success)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
      {table("By niche", report.byNiche, "Niche")}
      {table("By country", report.byCountry, "Country")}
      <div className="dash-panel report-table wide"><div className="panel-heading"><div><span>Money</span><h2>Best brands by profit</h2></div></div>{report.topBrands.length ? <table><thead><tr><th>Brand</th><th>Deals</th><th>Revenue</th><th>Profit</th><th>Margin</th></tr></thead><tbody>{report.topBrands.map((b) => <tr key={b.name}><td>{b.name}</td><td>{b.deals}</td><td>{money(b.revenue)}</td><td><b>{money(b.profit)}</b></td><td>{pct(b.profit, b.revenue)}%</td></tr>)}</tbody></table> : <p className="muted-copy">No campaigns in this range yet.</p>}</div>
    </section>
  </div>;
}
