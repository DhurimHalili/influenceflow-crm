import { ArrowRight, BatteryCharging, Check, ChevronDown, CircleCheckBig, Clock, Crosshair, ExternalLink, Gift, Layers, Pause, ShieldCheck, Sparkles, Youtube } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ServiceCard } from "../components/ApiKeys";
import { useData } from "../contexts/DataContext";
import { AI_SERVICES, readiness, usable, useKeyStatus, type Service, type ServiceRow } from "../lib/apiKeys";
import { hasSupabase } from "../lib/supabase";

// Getting started: plug in your own keys. Four stations (YouTube, an AI, Clay, Hunter), each with what it
// unlocks, the exact clicks to get the key, the real save card (checked with the service, sealed, never
// shown again) — and, below, an honest list of what already works and can be trusted without any keys.

type Step = { text: ReactNode; href?: string; link?: string };
type Station = { id: "youtube" | "ai" | "clay" | "hunter"; name: string; icon: typeof Youtube; minutes: number; unlocks: string[]; steps: Step[]; rule?: string; services: Service[] };

const STATIONS: Station[] = [
  {
    id: "youtube", name: "YouTube", icon: Youtube, minutes: 4, services: ["youtube"],
    unlocks: ["Quick fill from a channel link", "Avg views, engagement, subscribers", "Match: what creators post and who sponsors them"],
    steps: [
      { text: <>Create a Google Cloud project — call it “InfluenceFlow”.</>, href: "https://console.cloud.google.com/projectcreate", link: "New project" },
      { text: <>Turn on <b>YouTube Data API v3</b> for it → <b>Enable</b>.</>, href: "https://console.cloud.google.com/apis/library/youtube.googleapis.com", link: "Open the API" },
      { text: <>Credentials → <b>Create credentials</b> → <b>API key</b>.</>, href: "https://console.cloud.google.com/apis/credentials", link: "Credentials" },
      { text: <>Smart extra: edit the key → <b>API restrictions</b> → only YouTube Data API v3.</> },
      { text: <>Paste it below.</> },
    ],
    rule: "One project per person. YouTube's rules don't allow extra projects or accounts made to get more than the free 10,000 units a day — one key covers ~500 creators.",
  },
  {
    id: "ai", name: "An AI", icon: Sparkles, minutes: 2, services: ["gemini", "groq", "cloudflare", "openrouter"],
    unlocks: ["Media kits and rate cards read for you", "Prices written in unusual ways", "A second opinion on unclear replies", "“Ask AI” in Smart import"],
    steps: [
      { text: <>Open Google AI Studio and sign in with your Google account.</>, href: "https://aistudio.google.com/apikey", link: "AI Studio" },
      { text: <><b>Create API key</b> (pick any project).</> },
      { text: <>Paste it below. Gemini's free tier is plenty — Groq, Cloudflare or OpenRouter are optional backups.</> },
    ],
  },
  {
    id: "clay", name: "Clay", icon: Layers, minutes: 3, services: ["clay"],
    unlocks: ["A brand's LinkedIn page, size and revenue", "The people at a brand by job title"],
    steps: [
      { text: <>Make a free Clay account.</>, href: "https://www.clay.com", link: "clay.com" },
      { text: <>API and CLI → API keys → <b>Add API key</b> (scope: Public API).</>, href: "https://app.clay.com/workspaces/~/api-and-cli?tab=api-keys", link: "API keys" },
      { text: <>Copy it right away — Clay shows it once — and paste it below.</> },
    ],
  },
  {
    id: "hunter", name: "Hunter", icon: Crosshair, minutes: 2, services: ["hunter"],
    unlocks: ["Work emails of the people who decide", "Company facts when Clay has none"],
    steps: [
      { text: <>Make a free Hunter account.</>, href: "https://hunter.io/users/sign_up", link: "Sign up" },
      { text: <>Open <b>API</b> and copy your key.</>, href: "https://hunter.io/api-keys", link: "API keys" },
      { text: <>Paste it below.</> },
    ],
    rule: "Hunter allows one account per person.",
  },
];

/** What already works — and can be trusted — without any keys, and what waits for them. */
const WORKS: { title: string; text: string }[] = [
  { title: "Every email tracked", text: "Sent, received, scheduled and replies from all your connected Gmail boxes — read by rules, not AI." },
  { title: "Follow-ups and “Reply needed”", text: "When to follow up, who's waiting for your answer, new-thread reminders, weekends." },
  { title: "Statuses moved by email", text: "Contacted → Replied → Negotiating → Roster, “Said no” and auto-replies are all rule-based." },
  { title: "Prices written plainly", text: "“$2,500 for a dedicated video” is read without AI. Unusual wording waits for an AI key." },
  { title: "Dashboard, Reports, weekly email", text: "Every number and the Excel backup — no key involved." },
  { title: "The rest of your CRM", text: "Influencers, brands, campaigns, invoices, calendar, duplicates, import, notes — all yours." },
];
const WAITS: { title: string; text: string; key: string }[] = [
  { title: "YouTube stats and Quick fill", text: "Views, engagement, subscribers, niche from a channel link.", key: "YouTube" },
  { title: "Match video reading", text: "What creators post and which brands sponsor them.", key: "YouTube" },
  { title: "Media kits and tricky emails", text: "Rate cards, PDFs, unusual price wording, unclear replies.", key: "An AI" },
  { title: "People at a brand", text: "LinkedIn people, work emails, company size and revenue.", key: "Clay / Hunter" },
];

export default function SetupKeysPage() {
  const data = useData();
  const cloud = hasSupabase && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(data.profile.id || "") && !data.demoSeeded;
  const { status, error, reload } = useKeyStatus(cloud);
  const ready = readiness(status);
  const row = (s: Service) => status?.rows.find((r) => r.service === s);
  const doneOf = (st: Station) => st.services.some((s) => usable(row(s)));
  const left = STATIONS.filter((st) => !doneOf(st)).reduce((n, st) => n + st.minutes, 0);
  const firstOpen = STATIONS.find((st) => !doneOf(st))?.id || "youtube";
  const [open, setOpen] = useState<string | null>(null);
  const current = open ?? firstOpen;

  return <div className="setup">
    <header className="setup-hero">
      <div className="setup-hero-text">
        <span className="setup-eyebrow"><BatteryCharging size={14} aria-hidden="true" /> Getting started</span>
        <h1>Plug in your keys.</h1>
        <p>Your CRM sees YouTube, reads mail with AI and finds the people at brands with <b>your own</b> keys — free, about 10 minutes for all four. They're checked with each service, locked on the server and never shown again.</p>
      </div>
      <div className={`setup-ring${ready.all ? " full" : ""}`} role="img" aria-label={`${ready.done} of 4 keys plugged in`} style={{ ["--p" as string]: `${(ready.done / 4) * 100}%` }}>
        <div><b>{status ? ready.done : "–"}</b><span>of 4</span></div>
        <small>{!status ? "Checking…" : ready.all ? "All plugged in" : `~${left} min to go`}</small>
      </div>
    </header>

    {!cloud ? <p className="lk-note">Sign in to your cloud workspace to add keys.</p>
      : error && !status ? <div className="lk-load-error" role="alert"><span>{error}</span><button type="button" className="text-link" onClick={() => void reload()}>Try again</button></div>
        : <>
          <ol className="setup-cells" aria-label="Your four keys">{STATIONS.map((st, i) => {
            const done = !!status && doneOf(st);
            const Icon = st.icon;
            return <li key={st.id}><button type="button" className={`setup-cell${done ? " done" : ""}${current === st.id ? " on" : ""}`} aria-expanded={current === st.id} aria-controls={`station-${st.id}`} onClick={() => { setOpen(st.id); requestAnimationFrame(() => document.getElementById(`station-${st.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })); }}>
              <span className="setup-cell-ico" aria-hidden="true">{done ? <Check size={16} /> : <Icon size={16} />}</span>
              <span className="setup-cell-txt"><small>{i + 1} · {st.minutes} min</small><b>{st.name}</b></span>
              <span className="setup-cell-bar" aria-hidden="true"><i /></span>
            </button></li>;
          })}</ol>

          {STATIONS.map((st, i) => {
            const done = !!status && doneOf(st);
            const expanded = current === st.id;
            const Icon = st.icon;
            return <section key={st.id} id={`station-${st.id}`} className={`setup-station${done ? " done" : ""}${expanded ? " open" : ""}`} aria-labelledby={`st-${st.id}`}>
              <button type="button" className="setup-station-head" onClick={() => setOpen(expanded ? "" : st.id)} aria-expanded={expanded}>
                <span className="setup-num" aria-hidden="true">{done ? <Check size={16} /> : i + 1}</span>
                <span className="setup-station-title"><h2 id={`st-${st.id}`}><Icon size={18} aria-hidden="true" /> {st.name}</h2><small>{done ? "Plugged in" : <><Clock size={12} aria-hidden="true" /> ~{st.minutes} min · <Gift size={12} aria-hidden="true" /> Free</>}</small></span>
                <ChevronDown size={18} className="setup-chev" aria-hidden="true" />
              </button>
              {expanded && <div className="setup-station-body">
                <div className="setup-unlocks"><small>Unlocks</small>{st.unlocks.map((u) => <span key={u}><Sparkles size={11} aria-hidden="true" />{u}</span>)}</div>
                <div className="setup-grid">
                  <ol className="setup-steps">{st.steps.map((s, n) => <li key={n}><span className="setup-step-n" aria-hidden="true">{n + 1}</span><span>{s.text}{s.href && <> <a href={s.href} target="_blank" rel="noopener noreferrer">{s.link}<ExternalLink size={11} aria-hidden="true" /></a></>}</span></li>)}
                    {st.rule && <li className="setup-rule"><ShieldCheck size={14} aria-hidden="true" /><span>{st.rule}</span></li>}
                  </ol>
                  <div className="setup-cards">
                    {!status ? <div className="lk-card lk-skeleton"><i /><i /><i /></div>
                      : st.id === "ai" ? <AiCards rows={AI_SERVICES.map((s) => row(s)!).filter(Boolean)} owner={status.owner} onChanged={reload} />
                        : <ServiceCard row={row(st.services[0])!} owner={status.owner} onChanged={reload} />}
                  </div>
                </div>
                {i < STATIONS.length - 1 && done && <button type="button" className="setup-next" onClick={() => setOpen(STATIONS[i + 1].id)}>Next: {STATIONS[i + 1].name} <ArrowRight size={14} aria-hidden="true" /></button>}
              </div>}
            </section>;
          })}

          {ready.all && status && <div className="setup-done" role="status"><CircleCheckBig size={22} aria-hidden="true" /><div><b>All four plugged in.</b> Your CRM now runs fully on your own keys — the reminders stop. Change or check them any time in <Link to="/app/settings#keys">Settings → Your API keys</Link>.</div></div>}
        </>}

    <section className="setup-trust" aria-labelledby="trust-title">
      <h2 id="trust-title">What you can trust right now — keys or not</h2>
      <p>Most of the CRM never needed a key. Until yours are in, this is how things stand:</p>
      <div className="setup-trust-grid">
        <div className="setup-works"><h3><CircleCheckBig size={16} aria-hidden="true" /> Works and is accurate</h3><ul>{WORKS.map((w) => <li key={w.title}><b>{w.title}</b><span>{w.text}</span></li>)}</ul></div>
        <div className="setup-waits"><h3><Pause size={16} aria-hidden="true" /> Waits for your keys</h3><ul>{WAITS.map((w) => <li key={w.title}><b>{w.title}</b><span>{w.text}</span><em>{w.key}</em></li>)}</ul><p>Nothing is lost while it waits — it all fills in once the key is in.</p></div>
      </div>
    </section>
  </div>;
}

function AiCards({ rows, owner, onChanged }: { rows: ServiceRow[]; owner: boolean; onChanged: () => Promise<void> }) {
  const gemini = rows.find((r) => r.service === "gemini");
  const backups = rows.filter((r) => r.service !== "gemini");
  const [more, setMore] = useState(backups.some((r) => r.keys.length > 0));
  return <>
    {gemini && <ServiceCard row={gemini} owner={owner} onChanged={onChanged} />}
    <button type="button" className="setup-more" onClick={() => setMore(!more)} aria-expanded={more}><ChevronDown size={14} aria-hidden="true" className={more ? "up" : ""} /> {more ? "Hide backup readers" : "Backup readers (optional): Groq, Cloudflare, OpenRouter"}</button>
    {more && backups.map((r) => <ServiceCard key={r.service} row={r} owner={owner} onChanged={onChanged} backup />)}
  </>;
}
