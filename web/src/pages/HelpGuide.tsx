import { ArrowRight, BadgeCheck, BarChart3, CalendarDays, CircleSlash, Command, Gauge, Inbox, LayoutDashboard, Mail, MailPlus, Plus, Reply, Search, Send, Settings, Sparkles, Upload, Users, CopyX, Youtube, Building2, Receipt, FileBarChart } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

// The guide: "how do I…?" answered with a button that takes you there.
// Search filters tasks and questions together; nothing here is a manual.

type Task = { area: string; icon: ReactNode; title: string; how: string; to: string; cta: string; keys?: string[]; words?: string };

const DAILY: { n: number; title: string; text: string; to: string }[] = [
  { n: 1, title: "Open the dashboard", text: "Emails sent today vs your goal, who replied, what's due.", to: "/app" },
  { n: 2, title: "Clear the chips", text: "Follow up now, Reply needed and New thread on Influencers.", to: "/app/influencers?follow=attention" },
  { n: 3, title: "Write in Gmail", text: "Send from your own Gmail — the CRM tracks it within seconds.", to: "/app/settings#gmail" },
  { n: 4, title: "Log the rest", text: "A DM, WhatsApp or call? Log it on the profile so the clock resets.", to: "/app/influencers" },
];

const TASKS: Task[] = [
  { area: "Influencers", icon: <Plus />, title: "Add an influencer in seconds", how: "Add influencer → paste their YouTube link in Quick fill. Name, email, country, niche, views, engagement and stars fill in, and you see right away if they fit your criteria.", to: "/app/influencers", cta: "Add one", words: "new create quick fill youtube paste" },
  { area: "Influencers", icon: <BadgeCheck />, title: "See who fits your criteria", how: "The Fits criteria and Outside criteria chips sit above the list. Outside lists above-criteria first, then slightly below (yellow), then below (red).", to: "/app/influencers?criteria=outside", cta: "Open the list", words: "filter yellow red below above minimum views engagement subscribers" },
  { area: "Influencers", icon: <CircleSlash />, title: "Find people you can't reach", how: "“No contact info” marks anyone with no email, manager or DM-able profile. An Instagram, TikTok or WhatsApp is enough — they won't be marked.", to: "/app/influencers?contact=none", cta: "Show them", words: "missing email contact whatsapp instagram" },
  { area: "Settings", icon: <CalendarDays />, title: "Weekends: no follow-ups, scout day", how: "By default Saturday is new outreach and replies only — follow-ups show “Follow up Mon” and wait — and Sunday is a scout day: no emails, the goal becomes finding 10 new influencers. Emails you schedule for Monday count on Monday; the dashboard shows them under “Scheduled ahead”. Change either day or the goal in Settings → Weekends.", to: "/app/settings#weekend", cta: "Weekends", words: "saturday sunday weekend scout rest day schedule monday goal" },
  { area: "Influencers", icon: <CopyX />, title: "Fix a duplicate", how: "Two records with the same email, profile or YouTube channel get a red “Possible duplicate” alert and sit at the top of the list. Review & fix → keep one: its twin's emails, follow-ups, campaigns and files move into it. Two channels that share one inbox? “They're different” keeps both for good.", to: "/app/influencers", cta: "Influencers", words: "duplicate twin same email merge copy double two records" },
  { area: "Influencers", icon: <Upload />, title: "Import a spreadsheet", how: "Influencers → Import. Any CSV or Excel with names, emails, links, views. You see every row (and duplicates) before anything is saved.", to: "/app/influencers", cta: "Import", words: "csv excel xlsx bulk upload" },
  { area: "Follow-ups", icon: <Send />, title: "Follow up with people who went quiet", how: "Follow up now lists everyone whose follow-up day has come (business days, your own cadence). Send it in Gmail — the reminder clears by itself.", to: "/app/influencers?follow=due", cta: "Follow up now", words: "chase reminder due overdue cadence" },
  { area: "Follow-ups", icon: <MailPlus />, title: "Start a new thread after the cap", how: "After 4 follow-ups in one thread, the CRM tells you to start fresh with a new subject. The New thread chip lists who's ready.", to: "/app/influencers?follow=thread", cta: "See new threads", words: "thread cap fresh email subject" },
  { area: "Follow-ups", icon: <Reply />, title: "Answer people who replied", how: "Reply needed means they wrote last. Auto-replies never count; a manager's automatic no shows as “Managed · DM them”.", to: "/app/influencers?follow=reply", cta: "Reply needed", words: "replied answer response manager" },
  { area: "Gmail", icon: <Mail />, title: "Connect Gmail", how: "Settings → Gmail. Add every mailbox you send from. New mail shows up within seconds; scheduled emails count too, and a cancelled one disappears.", to: "/app/settings#gmail", cta: "Connect", words: "mailbox sync tracking scheduled" },
  { area: "Brands", icon: <Building2 />, title: "Track a brand deal", how: "Brands holds companies and their people; a deal becomes a Campaign with the money, the creator's fee and your margin.", to: "/app/brands", cta: "Open brands", words: "company sponsor deal" },
  { area: "Brands", icon: <BarChart3 />, title: "Run a campaign", how: "Campaigns → New. Pick the brand and the creators, set the price model, track delivery and the contract.", to: "/app/campaigns", cta: "Open campaigns", words: "deal money contract deliverables" },
  { area: "Money", icon: <Receipt />, title: "Chase an invoice", how: "Invoices remind you on the same business-day schedule as follow-ups until they're paid.", to: "/app/invoices", cta: "Open invoices", words: "payment paid unpaid" },
  { area: "Leads", icon: <Inbox />, title: "Check inbound leads", how: "People who emailed you first — creators wanting management, brands wanting creators. Answer them; a clear yes adds them for you.", to: "/app/leads", cta: "Open leads", words: "inbound incoming spam" },
  { area: "Planning", icon: <CalendarDays />, title: "Plan calls and deadlines", how: "Calendar shows meetings, due actions and follow-ups together. Link any of them to an influencer, brand or campaign.", to: "/app/calendar", cta: "Open calendar", words: "meeting call deadline task" },
  { area: "Results", icon: <LayoutDashboard />, title: "See how today is going", how: "The dashboard: emails sent (new, follow-ups, answers, scheduled), replies, reply rate, wins. Click any number to see who's behind it.", to: "/app", cta: "Dashboard", words: "stats numbers today goal" },
  { area: "Results", icon: <FileBarChart />, title: "Get your weekly report", how: "Every Monday morning (or Sunday evening) an email with your week: effort vs goal, replies, deals, each day — and a verdict. Preview it any time.", to: "/app/reports", cta: "Preview it", words: "weekly email summary report" },
  { area: "Settings", icon: <Youtube />, title: "Change your YouTube criteria", how: "Settings → YouTube: minimum views, minimum engagement, preferred and maximum subscribers. The list updates instantly.", to: "/app/settings#youtube", cta: "Set criteria", words: "criteria minimum maximum views engagement subscribers" },
  { area: "Settings", icon: <Gauge />, title: "Set your daily goal and cadence", how: "Settings → Follow-up rules and Coach: how many business days between follow-ups, your daily email goal, workdays and holidays.", to: "/app/settings#followups", cta: "Open settings", words: "goal cadence business days rules coach" },
  { area: "Settings", icon: <Sparkles />, title: "Make it look like yours", how: "Five themes — Agency, Light, Dark, Honey, Ocean — and your agency name and signature.", to: "/app/themes", cta: "Themes", words: "theme dark color" },
];

const FAQ: { q: string; a: string }[] = [
  { q: "What counts as “emails sent”?", a: "Every email you sent from any connected mailbox — first emails, follow-ups, answers, new threads — plus emails waiting in Gmail's Scheduled folder, counted on their send day. Cancel one and it disappears." },
  { q: "Why is someone yellow or red?", a: "They fell outside your YouTube criteria after a refresh. Yellow: the views are there but engagement is under your minimum. Red: average views are under your floor. A blue mark means they're above your subscriber maximum." },
  { q: "Will a refresh overwrite what I typed?", a: "No. Name, email, country, niche, views, engagement and stars stay fresh only until you change them — then they're yours. Stars you never set are filled from the channel." },
  { q: "Someone has no email — is that a problem?", a: "Not if you can DM them. Only influencers with no email, no manager and no Instagram, TikTok, WhatsApp or similar get the “No contact info” mark." },
  { q: "Can other members see my data?", a: "No. Every workspace is private — the database itself refuses to show your records to anyone else, the owner included." },
  { q: "Does archiving delete anything?", a: "No. Archived records wait in Archive until you restore or permanently delete them." },
];

const KEYS: [string, string[]][] = [["Search everything", ["/"]], ["Quick actions", ["Ctrl", "K"]], ["All shortcuts", ["?"]], ["Save notes", ["Ctrl", "S"]]];

export function HelpGuide() {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const tasks = useMemo(() => (needle ? TASKS.filter((t) => `${t.area} ${t.title} ${t.how} ${t.words || ""}`.toLowerCase().includes(needle)) : TASKS), [needle]);
  const faq = useMemo(() => (needle ? FAQ.filter((f) => `${f.q} ${f.a}`.toLowerCase().includes(needle)) : FAQ), [needle]);
  const areas = Array.from(new Set(tasks.map((t) => t.area)));
  return <div className="guide">
    <header className="guide-hero">
      <span className="guide-eyebrow">Guide</span>
      <h1>Where do you want to go?</h1>
      <label className="guide-search"><Search size={17} aria-hidden="true" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try “follow up”, “criteria”, “weekly report”…" aria-label="Search the guide" />{q && <button type="button" onClick={() => setQ("")} aria-label="Clear search">Clear</button>}</label>
    </header>

    {!needle && <section className="guide-loop" aria-label="Your daily loop">
      <h2>Your daily loop</h2>
      <ol>{DAILY.map((d) => <li key={d.n}><Link to={d.to}><b>{d.n}</b><span><strong>{d.title}</strong><small>{d.text}</small></span><ArrowRight size={15} aria-hidden="true" /></Link></li>)}</ol>
    </section>}

    {areas.map((area) => <section key={area} className="guide-area" aria-label={area}>
      <h2>{area}</h2>
      <div className="guide-tasks">{tasks.filter((t) => t.area === area).map((t) => <article key={t.title}>
        <span className="guide-ico" aria-hidden="true">{t.icon}</span>
        <div><h3>{t.title}</h3><p>{t.how}</p></div>
        <Link className="guide-go" to={t.to}>{t.cta} <ArrowRight size={13} aria-hidden="true" /></Link>
      </article>)}</div>
    </section>)}

    {faq.length > 0 && <section className="guide-faq"><h2>Questions</h2>{faq.map((f) => <details key={f.q}><summary>{f.q}<Plus size={15} aria-hidden="true" /></summary><p>{f.a}</p></details>)}</section>}
    {needle && !tasks.length && !faq.length && <div className="guide-empty"><Users size={20} aria-hidden="true" /><strong>Nothing for “{q.trim()}”</strong><span>Try fewer words, or press <kbd>/</kbd> anywhere to search your influencers and brands.</span></div>}

    <section className="guide-keys" aria-label="Keyboard shortcuts"><h2><Command size={15} aria-hidden="true" /> Faster with the keyboard</h2><ul>{KEYS.map(([label, keys]) => <li key={label}><span>{label}</span><span>{keys.map((k) => <kbd key={k}>{k}</kbd>)}</span></li>)}</ul><Link to="/app/settings" className="guide-go"><Settings size={13} aria-hidden="true" /> All settings</Link></section>
  </div>;
}
