// A brand's official website from Wikidata (free, no key): the item whose
// label or alias IS the name, that is a company / brand / product / service
// (never a person), and that lists an official website (P856). Used when the
// creator's own link is a short link, a tracker or another site.

import { domainFits, normalizeDomain } from "./sponsors.ts";

const squash = (s: string) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
const BUSINESS = /\b(?:compan(?:y|ies)|brand|manufacturer|maker|business|corporation|enterprise|retailer|store|shop|startup|service|software|app(?:lication)?|platform|website|web ?site|online|developer|publisher|video game|game|vpn|provider|producer|subsidiary|firm|e-?commerce|marketplace|bank|fintech|product|line of|range of|device|hardware|technology|tech|network|conglomerate|multinational|chain)\b/i;
const NOT_A_BRAND = /\b(?:born|human|person|singer|actor|actress|footballer|politician|youtuber|musician|rapper|player|writer|author|journalist|family name|surname|given name|disambiguation|village|city|town|river|mountain|film|album|song|episode|novel|painting|species|genus|asteroid|scholarly|society|association|research|university|college|school|institute|union|party|government|agency|ministry|church|hospital|journal|television series|tv series|band)\b/i;

// Things that share a brand's name but are never what a creator promotes: places, names, list pages.
const NEVER_A_SPONSOR = /^(?:Wikimedia (?:disambiguation|list|category)|(?:unisex |male |female )?(?:given name|family name|surname|name)$)|\b(?:town|city|village|township|census-designated place|unincorporated community|human settlement|hamlet|lieu-dit|commune|municipality|county|parish|neighbou?rhood|district|river|lake|mountain|island|footballer|politician|singer|actor|actress)\b/i;

type Fetcher =(url: string) => Promise<unknown>;
const defaultFetch: Fetcher = async (url) => {
  const res = await fetch(url, { headers: { "User-Agent": "InfluenceFlowCRM/1.0 (brand website check)", Accept: "application/json" }, signal: AbortSignal.timeout(9000) }).catch(() => null);
  return res?.ok ? res.json().catch(() => null) : null;
};

export type OfficialSite = { domain: string; label: string; description: string; id: string };

/** The official site of the brand with exactly this name, or null when Wikidata doesn't know it for sure. */
export async function officialSite(name: string, get: Fetcher = defaultFetch): Promise<OfficialSite | null> {
  const want = squash(name);
  if (want.length < 2) return null;
  const search = await get(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name.slice(0, 60))}&language=en&uselang=en&type=item&limit=7&format=json`) as { search?: { id: string; label?: string; description?: string; match?: { text?: string } }[] } | null;
  // The label must BE the name; an alias only counts when the website also fits the name (ESR ≠ "European Society of Radiology").
  const hits = (search?.search || []).filter((h) => (squash(h.label || "") === want || squash(h.match?.text || "") === want) && !NEVER_A_SPONSOR.test(h.description || "")).slice(0, 4);
  // A name shared by two or more things that could be what a creator promotes (Gamma the app, Gamma the
  // Dutch DIY chain, the Greek letter): too ambiguous to pick. Towns, surnames and disambiguation pages
  // are never a sponsor, so "Dell" (a brand + 12 places and names) is still Dell.
  if ((search?.search || []).filter((h) => squash(h.label || "") === want && !NEVER_A_SPONSOR.test(h.description || "")).length > 1) return null;
  const found: OfficialSite[] = [];
  for (const h of hits) {
    if (!/^Q\d+$/.test(h.id)) continue;
    const d = h.description || "";
    if (NOT_A_BRAND.test(d) && !BUSINESS.test(d)) continue;
    const data = await get(`https://www.wikidata.org/wiki/Special:EntityData/${h.id}.json`) as { entities?: Record<string, { claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } }; rank?: string }[]>; descriptions?: Record<string, { value: string }> }> } | null;
    const e = data?.entities?.[h.id];
    const desc = e?.descriptions?.en?.value || d;
    if (!BUSINESS.test(desc) || NOT_A_BRAND.test(desc) && !BUSINESS.test(desc)) continue;
    // Not a human (P31 = Q5).
    const isHuman = (e?.claims?.P31 || []).some((c) => (c.mainsnak?.datavalue?.value as { id?: string } | undefined)?.id === "Q5");
    if (isHuman) continue;
    const sites = (e?.claims?.P856 || []).filter((c) => c.rank !== "deprecated").sort((a, b) => Number(b.rank === "preferred") - Number(a.rank === "preferred"))
      .map((c) => normalizeDomain(String(c.mainsnak?.datavalue?.value || ""))).filter(Boolean);
    const byLabel = squash(h.label || "") === want;
    if (sites[0] && (byLabel || domainFits(name, sites[0]))) found.push({ domain: sites[0], label: h.label || name, description: desc.slice(0, 160), id: h.id });
  }
  // Two different companies with the same name and different sites: not sure — say nothing.
  const domains = new Set(found.map((f) => f.domain));
  return domains.size === 1 ? found[0] : null;
}


/** DuckDuckGo's free Instant Answer API: the "Official site" it lists for an entity with exactly this name. */
export async function duckSite(name: string, get: Fetcher = defaultFetch): Promise<string> {
  const q = encodeURIComponent(name.slice(0, 60));
  const d = await get(`https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1&t=influenceflow`) as { Heading?: string; Results?: { FirstURL?: string; Text?: string }[]; Type?: string } | null;
  if (!d || d.Type === "D") return "";
  // "Away (band)": a qualified heading is another thing with this name unless the qualifier says business.
  const qualifier = /\(([^)]*)\)/.exec(d.Heading || "")?.[1];
  if (qualifier !== undefined && !BUSINESS.test(qualifier)) return "";
  d.Heading = (d.Heading || "").replace(/\s*\([^)]*\)\s*/g, " ").trim();
  // The answer must be about this very name (not a near miss), and the site must carry it.
  if (squash(d.Heading || "").replace(/(?:vpn|inc|ltd|company|app)$/, "") !== squash(name).replace(/(?:vpn|inc|ltd|company|app)$/, "") && !squash(d.Heading || "").startsWith(squash(name))) return "";
  const site = normalizeDomain(String(d.Results?.[0]?.FirstURL || ""));
  return site && domainFits(name, site) ? site : "";
}

// Wikidata ids of the countries brands usually come from → ISO code (anything else: one more lookup).
const COUNTRY_Q: Record<string, string> = {
  Q30: "US", Q145: "GB", Q183: "DE", Q142: "FR", Q16: "CA", Q408: "AU", Q148: "CN", Q17: "JP", Q884: "KR", Q865: "TW", Q55: "NL", Q34: "SE", Q39: "CH",
  Q38: "IT", Q29: "ES", Q31: "BE", Q40: "AT", Q20: "NO", Q35: "DK", Q33: "FI", Q36: "PL", Q155: "BR", Q96: "MX", Q668: "IN", Q664: "NZ", Q27: "IE",
  Q334: "SG", Q8646: "HK", Q45: "PT", Q213: "CZ", Q801: "IL", Q43: "TR", Q159: "RU", Q212: "UA", Q28: "HU", Q218: "RO", Q41: "GR", Q878: "AE",
};

/**
 * The country a company is based in (Wikidata P17 "country" of the item whose official site is this
 * domain). "" when Wikidata doesn't know it for sure. One signal among several — never the market alone.
 */
export async function companyCountry(name: string, domain: string, get: Fetcher = defaultFetch): Promise<string> {
  const site = await officialSite(name, get).catch(() => null);
  if (!site || normalizeDomain(site.domain).split(".")[0] !== normalizeDomain(domain).split(".")[0]) return "";
  const data = await get(`https://www.wikidata.org/wiki/Special:EntityData/${site.id}.json`) as { entities?: Record<string, { claims?: Record<string, { mainsnak?: { datavalue?: { value?: { id?: string } } }; rank?: string }[]> }> } | null;
  const claims = data?.entities?.[site.id]?.claims || {};
  const q = (claims.P17 || []).filter((c) => c.rank !== "deprecated").map((c) => c.mainsnak?.datavalue?.value?.id || "")[0] || "";
  if (!q) return "";
  if (COUNTRY_Q[q]) return COUNTRY_Q[q];
  const c = await get(`https://www.wikidata.org/wiki/Special:EntityData/${q}.json`) as { entities?: Record<string, { claims?: Record<string, { mainsnak?: { datavalue?: { value?: string } } }[]> }> } | null;
  const iso = String(c?.entities?.[q]?.claims?.P297?.[0]?.mainsnak?.datavalue?.value || "");
  return /^[A-Z]{2}$/.test(iso) ? iso : "";
}
