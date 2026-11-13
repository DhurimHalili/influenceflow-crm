// A brand's official website from Wikidata (free, no key): the item whose
// label or alias IS the name, that is a company / brand / product / service
// (never a person), and that lists an official website (P856). Used when the
// creator's own link is a short link, a tracker or another site.

import { domainFits, normalizeDomain } from "./sponsors.ts";

const squash = (s: string) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
const BUSINESS = /\b(?:compan(?:y|ies)|brand|manufacturer|maker|business|corporation|enterprise|retailer|store|shop|startup|service|software|app(?:lication)?|platform|website|web ?site|online|developer|publisher|video game|game|vpn|provider|producer|subsidiary|firm|e-?commerce|marketplace|bank|fintech|product|line of|range of|device|hardware|technology|tech|network|conglomerate|multinational|chain)\b/i;
const NOT_A_BRAND = /\b(?:born|human|person|singer|actor|actress|footballer|politician|youtuber|musician|rapper|player|writer|author|journalist|family name|surname|given name|disambiguation|village|city|town|river|mountain|film|album|song|episode|novel|painting|species|genus|asteroid|scholarly|society|association|research|university|college|school|institute|union|party|government|agency|ministry|church|hospital|journal|television series|tv series|band)\b/i;

type Fetcher = (url: string) => Promise<unknown>;
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
  const hits = (search?.search || []).filter((h) => squash(h.label || "") === want || squash(h.match?.text || "") === want).slice(0, 4);
  // A name shared by two or more things (Gamma the app, Gamma the Dutch DIY chain): too ambiguous to pick.
  // Any other thing with exactly this name (a genus, a surname, a store chain) makes it ambiguous.
  if ((search?.search || []).filter((h) => squash(h.label || "") === want).length > 1) return null;
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
