import { BadgeCheck, Banknote, Building2, CalendarDays, Check, ExternalLink, Linkedin, Loader2, MapPin, Pencil, Plus, Search, Sparkles, UsersRound } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useData } from "../contexts/DataContext";
import { useMatch } from "../contexts/MatchContext";
import { useToast } from "../contexts/ToastContext";
import { brandDomain, countryName, type HunterPerson } from "../lib/match";
import { dateLabel } from "../lib/utils";
import type { Brand, BrandContact, SocialLink } from "../types";
import { Avatar, Button } from "./ui";

// Who to reach at a brand: its LinkedIn page (only from a source tied to its own website — their site,
// Wikidata, Hunter — or pasted by you), company facts, one-tap LinkedIn searches for the people who
// decide on creator deals, and people Hunter knows with their work email (on request, one credit).

/** A LinkedIn company / showcase / school page, cleaned — "" when it isn't one. */
function companyPage(url: string | undefined | null): string {
  const m = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.|www\.)?linkedin\.com\/(company|school|showcase)\/([A-Za-z0-9][\w%.-]{0,99})/i.exec(String(url || "").trim());
  if (!m) return "";
  let slug = m[2];
  try { slug = decodeURIComponent(slug); } catch { /* keep as typed */ }
  slug = slug.replace(/[^\w.-]/g, "");
  return slug ? `https://www.linkedin.com/${m[1].toLowerCase()}/${slug}` : "";
}

const VIA: Record<string, { label: string; tip: string; sure: boolean }> = {
  you: { label: "Added by you", tip: "You added this page.", sure: true },
  site: { label: "Linked from their website", tip: "Their own website links to this page.", sure: true },
  wikidata: { label: "Wikidata, same website", tip: "Wikidata lists this page for the company whose official website is theirs.", sure: true },
  hunter: { label: "Hunter, by website", tip: "Hunter's company record for their website lists this page. Worth a glance before you rely on it.", sure: false },
};

/** Searches for the people who say yes to creator deals. */
const ROLES: { label: string; words: string }[] = [
  { label: "Partnerships", words: "partnerships" },
  { label: "Influencer marketing", words: "influencer" },
  { label: "Creator / affiliate", words: "creator affiliate" },
  { label: "Marketing", words: "marketing" },
  { label: "Brand & social", words: "brand social" },
  { label: "Founder", words: "founder" },
];
const DEAL_MAKER = /influencer|creator|talent|ambassador|affiliate|partnership|collab|sponsor|brand|social|community|pr\b|marketing|cmo/i;

export function BrandReach({ brand, contacts }: { brand: Brand; contacts: BrandContact[] }) {
  const data = useData();
  const m = useMatch();
  const { toast } = useToast();
  const domain = brandDomain(brand);
  const intel = m.intel.get(brand.id)?.intel || null;
  const co = intel?.company && (!domain || intel.company.domain === domain) ? intel.company : null;
  const people = intel?.people && (!domain || intel.people.domain === domain) ? intel.people : null;
  const mine = (brand.socials || []).find((s) => s.platform === "LinkedIn");
  const minePage = companyPage(mine?.url);
  const page = minePage || co?.linkedin || "";
  const via = minePage ? "you" : co?.linkedin_via || "";
  const slug = page.replace(/^https:\/\/www\.linkedin\.com\//, "");
  const hunter = m.status?.hunter;
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState("");
  const typedPage = companyPage(typed);
  const looked = !!co?.wd_at || !!co?.hunter_at || via === "site";
  const facts = co && [co.size || (co.employees ? `${co.employees.toLocaleString("en-US")}` : ""), co.revenue, co.industry, co.founded, co.country].some(Boolean);
  const busyCompany = m.looking.has(`company:${brand.id}`);
  const busyPeople = m.looking.has(`people:${brand.id}`);
  const known = useMemo(() => new Set(contacts.map((c) => c.email.toLowerCase()).filter(Boolean)), [contacts]);

  const savePage = (e: FormEvent) => {
    e.preventDefault();
    if (!typedPage) return;
    const before = brand.socials || [];
    const next: SocialLink[] = [...before.filter((s) => s.platform !== "LinkedIn"), { platform: "LinkedIn", url: typedPage, handle: "", followers: 0 }];
    data.updateBrand(brand.id, { socials: next }, { activity: `LinkedIn page added for ${brand.name}` });
    toast("LinkedIn page saved.", "success", { label: "Undo", run: () => data.updateBrand(brand.id, { socials: before }, { quiet: true }) });
    setEditing(false); setTyped("");
  };
  const search = (words: string) => slug.startsWith("company/")
    ? `https://www.linkedin.com/${slug}/people/?keywords=${encodeURIComponent(words)}`
    : `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${words} ${brand.name}`)}`;
  const addPerson = (p: HunterPerson) => {
    const c = data.addContact({ brand_id: brand.id, first_name: p.first || p.email.split("@")[0], last_name: p.last, title: p.title, email: p.email, linkedin_url: p.linkedin, pipeline_status: "new", date_contacted: null, notes: `Found by Hunter (${p.confidence}% sure of the email).` });
    toast(`${p.first || p.email} added to ${brand.name}'s people.`, "success", { label: "Undo", run: () => data.deleteContact(c.id) });
  };
  const viaInfo = VIA[via];
  const hunterLine = !hunter?.configured ? "" : hunter.left > 0 ? `${hunter.left} Hunter credit${hunter.left === 1 ? "" : "s"} left this month` : "Hunter credits used up — more on the 1st";

  return <div className="reach">
    <div className={`reach-li${page ? " found" : ""}`}>
      <span className="reach-li-mark" aria-hidden="true"><Linkedin size={18} /></span>
      <div className="reach-li-main">
        <small>LinkedIn page</small>
        {page && !editing ? <>
          <a href={page} target="_blank" rel="noopener noreferrer" className="reach-li-url">linkedin.com/{slug}<ExternalLink size={12} aria-hidden="true" /></a>
          {viaInfo && <span className={`reach-via${viaInfo.sure ? " sure" : ""}`} title={viaInfo.tip}>{viaInfo.sure ? <BadgeCheck size={11} aria-hidden="true" /> : null}{viaInfo.label}</span>}
        </> : editing || !page ? <>
          {!editing && <p className="reach-li-none">{!domain ? "Add their website first — the page is only taken from a source tied to it." : looked ? "Not on their website, Wikidata or Hunter — paste it if you find it." : "Checking their website and Wikidata…"}</p>}
          {(editing || !page) && <form className="reach-li-form" onSubmit={savePage}>
            <input value={typed} onChange={(e) => setTyped(e.target.value.slice(0, 300))} placeholder="linkedin.com/company/…" aria-label={`${brand.name}'s LinkedIn page`} aria-invalid={!!typed && !typedPage} />
            <Button size="sm" variant="secondary" disabled={!typedPage}>Save</Button>
            {editing && <Button size="sm" variant="ghost" type="button" onClick={() => { setEditing(false); setTyped(""); }}>Cancel</Button>}
          </form>}
          {typed && !typedPage && <small className="reach-err">That isn't a company page — it looks like linkedin.com/company/name.</small>}
        </> : null}
      </div>
      <div className="reach-li-actions">
        {page && !editing && <button type="button" className="mx-icon-btn" onClick={() => { setTyped(minePage || page); setEditing(true); }} aria-label="Change LinkedIn page" title="Change"><Pencil size={13} /></button>}
        {hunter?.configured && domain && !co?.hunter_at && <Button size="sm" variant="secondary" loading={busyCompany} disabled={hunter.left <= 0} onClick={() => void m.lookup(brand.id, "company")} title="Hunter's record for their website: LinkedIn, size, revenue, industry · 1 credit"><Building2 size={13} /> Company facts</Button>}
      </div>
    </div>

    {facts && co ? <ul className="reach-facts" aria-label="Company facts">
      {(co.size || co.employees) && <li><UsersRound size={13} aria-hidden="true" /><b>{co.size || co.employees?.toLocaleString("en-US")}</b> people</li>}
      {co.revenue && <li><Banknote size={13} aria-hidden="true" /><b>{co.revenue}</b> a year</li>}
      {co.industry && <li><Building2 size={13} aria-hidden="true" />{co.industry}</li>}
      {co.founded && <li><CalendarDays size={13} aria-hidden="true" />Since {co.founded}</li>}
      {co.country && <li><MapPin size={13} aria-hidden="true" />{countryName(co.country)}</li>}
      <li className="reach-src">Hunter · {dateLabel(co.hunter_at || co.at)}</li>
    </ul> : null}

    <div className="reach-find">
      <small><Search size={12} aria-hidden="true" /> Find who decides on creator deals{page ? "" : " — LinkedIn search"}</small>
      <div className="reach-chips">{ROLES.map((r) => <a key={r.label} href={search(r.words)} target="_blank" rel="noopener noreferrer">{r.label}<ExternalLink size={11} aria-hidden="true" /></a>)}</div>
    </div>

    {hunter?.configured && domain ? <div className="reach-people">
      <div className="reach-people-head">
        <span><Sparkles size={13} aria-hidden="true" /> <b>People with work emails</b>{people ? <small> · Hunter, {dateLabel(people.at)}{people.total > people.list.length ? ` · ${people.total} known in all` : ""}</small> : <small> · from Hunter, deal-makers first</small>}</span>
        <Button size="sm" variant={people ? "ghost" : "secondary"} loading={busyPeople} disabled={hunter.left <= 0} onClick={() => void m.lookup(brand.id, "people")} title="Uses 1 Hunter credit">{people ? "Search again" : "Find people"}</Button>
      </div>
      {people && (people.list.length ? <ul className="reach-people-list">{people.list.map((p) => {
        const added = known.has(p.email.toLowerCase());
        return <li key={p.email} className={DEAL_MAKER.test(p.title) ? "maker" : ""}>
          <Avatar name={`${p.first} ${p.last}`.trim() || p.email} size="sm" />
          <span className="reach-person"><strong>{`${p.first} ${p.last}`.trim() || p.email}</strong><small>{p.title || "Role not listed"}</small></span>
          <span className="reach-mail"><a href={`mailto:${p.email}`}>{p.email}</a><small>{p.confidence}% sure</small></span>
          {p.linkedin ? <a className="mx-icon-btn" href={p.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${p.first}'s LinkedIn`} title="LinkedIn"><Linkedin size={13} /></a> : <span className="reach-gap" />}
          {added ? <span className="reach-added"><Check size={12} aria-hidden="true" /> Added</span> : <Button size="sm" variant="secondary" onClick={() => addPerson(p)}><Plus size={12} /> Add</Button>}
        </li>;
      })}</ul> : <p className="reach-empty">Hunter knows no one at {domain} in marketing, communication, sales or leadership yet.</p>)}
      {hunterLine && <p className="reach-credits">{busyPeople || busyCompany ? <Loader2 size={11} className="spin" aria-hidden="true" /> : null}{hunterLine}. A search is kept, so the same brand never costs twice.</p>}
    </div> : null}
  </div>;
}
