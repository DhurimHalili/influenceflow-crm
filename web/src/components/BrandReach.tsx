import { BadgeCheck, Banknote, Building2, CalendarDays, ExternalLink, Linkedin, MapPin, Pencil, Search, UsersRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useData } from "../contexts/DataContext";
import { useMatch } from "../contexts/MatchContext";
import { useToast } from "../contexts/ToastContext";
import { brandDomain, countryName } from "../lib/match";
import { dateLabel } from "../lib/utils";
import type { Brand, BrandContact, SocialLink } from "../types";
import { PeopleFinder } from "./PeopleFinder";
import { Button } from "./ui";

// Who to reach at a brand: its LinkedIn page (only from a source tied to its own website — their site,
// Wikidata, Hunter — or pasted by you), company facts, one-tap LinkedIn searches for the people who
// decide on creator deals, and the people finder (components/PeopleFinder.tsx: Apollo first, by your ranked titles).

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
  clay: { label: "Clay, by website", tip: "Clay's company record for their website lists this page. Worth a glance before you rely on it.", sure: false },
  apollo: { label: "Apollo, by website", tip: "Apollo's company record for their website lists this page. Worth a glance before you rely on it.", sure: false },
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

export function BrandReach({ brand, contacts }: { brand: Brand; contacts: BrandContact[] }) {
  const data = useData();
  const m = useMatch();
  const { toast } = useToast();
  const domain = brandDomain(brand);
  const intel = m.intel.get(brand.id)?.intel || null;
  const co = intel?.company && (!domain || intel.company.domain === domain) ? intel.company : null;
  const mine = (brand.socials || []).find((s) => s.platform === "LinkedIn");
  const minePage = companyPage(mine?.url);
  const page = minePage || co?.linkedin || "";
  const via = minePage ? "you" : co?.linkedin_via || "";
  const slug = page.replace(/^https:\/\/www\.linkedin\.com\//, "");
  const hunter = m.status?.hunter;
  const clay = m.status?.clay;
  const apollo = m.status?.apollo;
  const services = [apollo?.configured ? "Apollo" : "", clay?.configured ? "Clay" : "", hunter?.configured ? "Hunter" : ""].filter(Boolean);
  const canFacts = !!domain && ((!!apollo?.configured && !apollo.paused && !co?.apollo_at) || (!!clay?.configured && clay.left > 0 && !co?.clay_at) || (!!hunter?.configured && hunter.left > 0 && !co?.hunter_at));
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState("");
  const typedPage = companyPage(typed);
  const looked = !!co?.wd_at || !!co?.hunter_at || !!co?.clay_at || !!co?.apollo_at || via === "site";
  const facts = co && [co.size || (co.employees ? `${co.employees.toLocaleString("en-US")}` : ""), co.revenue, co.industry, co.founded, co.country].some(Boolean);
  const busyCompany = m.looking.has(`company:${brand.id}`);

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
  const viaInfo = VIA[via];

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
        {canFacts && <Button size="sm" variant="secondary" loading={busyCompany} onClick={() => void m.lookup(brand.id, "company")} title={`${services.join(", then ")} record for their website: LinkedIn, size, revenue, industry${apollo?.configured ? " · 1 Apollo credit" : ""}`}><Building2 size={13} /> Company facts</Button>}
      </div>
    </div>

    {facts && co ? <ul className="reach-facts" aria-label="Company facts">
      {(co.size || co.employees) && <li><UsersRound size={13} aria-hidden="true" /><b>{co.size || co.employees?.toLocaleString("en-US")}</b> people</li>}
      {co.revenue && <li><Banknote size={13} aria-hidden="true" /><b>{co.revenue.replace(/^(\d)/, "$$$1").replace(/\s*-\s*/, "–")}</b> a year</li>}
      {co.industry && <li><Building2 size={13} aria-hidden="true" />{co.industry}</li>}
      {co.founded && <li><CalendarDays size={13} aria-hidden="true" />Since {co.founded}</li>}
      {co.country && <li><MapPin size={13} aria-hidden="true" />{countryName(co.country)}</li>}
      <li className="reach-src">{co.facts_via === "apollo" ? "Apollo" : co.facts_via === "clay" ? "Clay" : "Hunter"} · {dateLabel((co.facts_via === "apollo" ? co.apollo_at : co.facts_via === "clay" ? co.clay_at : co.hunter_at) || co.at)}</li>
    </ul> : null}

    <PeopleFinder brand={brand} contacts={contacts} />

    <div className="reach-find">
      <small><Search size={12} aria-hidden="true" /> Or search LinkedIn yourself{page ? ` — inside ${brand.name}'s page` : ""}</small>
      <div className="reach-chips">{ROLES.map((r) => <a key={r.label} href={search(r.words)} target="_blank" rel="noopener noreferrer">{r.label}<ExternalLink size={11} aria-hidden="true" /></a>)}</div>
    </div>
  </div>;
}
