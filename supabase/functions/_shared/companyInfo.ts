// A brand's LinkedIn page and company facts — only from sources that are about THIS company's website:
//   1. their own site links to it (footer, JSON-LD sameAs) — read with the site, free;
//   2. Wikidata: an item whose official website (P856) is their domain lists its LinkedIn ID (P4264), free;
//   3. Hunter.io's company record for their domain (HUNTER_API_KEY, free plan ≈ 50 credits a month):
//      LinkedIn, size, revenue estimate, industry, country. Kept only when Hunter's record is for the same
//      domain. Never a search by name, never a guess.
// Hunter's domain search also lists people at the company (role, work email, LinkedIn) — only when a
// member asks, one credit per brand; the answer is kept so the credit is never spent twice.

import { normalizeDomain } from "./sponsors.ts";

export type CompanyFacts = {
  /** The domain these facts were looked up for — a new website looks again. */
  domain: string;
  at: string;
  linkedin?: string;
  linkedin_via?: "site" | "wikidata" | "hunter";
  /** Wikidata was asked (so it isn't asked again for this domain). */
  wd_at?: string;
  /** Hunter was asked for the company record. */
  hunter_at?: string;
  size?: string; employees?: number; revenue?: string; industry?: string; country?: string; founded?: number; name?: string;
};

export type Person = { first: string; last: string; title: string; email: string; linkedin: string; confidence: number; department: string; seniority: string };
export type People = { at: string; domain: string; list: Person[]; total: number };

type Fetcher = (url: string, headers?: Record<string, string>) => Promise<{ status: number; body: unknown } | null>;
const defaultFetch: Fetcher = async (url, headers = {}) => {
  const res = await fetch(url, { headers: { "User-Agent": "InfluenceFlowCRM/1.0 (company page check)", Accept: "application/json", ...headers }, signal: AbortSignal.timeout(12_000) }).catch(() => null);
  if (!res) return null;
  return { status: res.status, body: await res.json().catch(() => null) };
};
const env = (k: string) => (typeof Deno !== "undefined" ? Deno.env.get(k) || "" : "");
const clip = (s: unknown, n = 120) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** "https://uk.linkedin.com/company/acme-inc/about/?x=1" → "https://www.linkedin.com/company/acme-inc". "" when it isn't a company page. */
export function linkedinCompany(url: string | undefined | null): string {
  const m = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.|www\.)?linkedin\.com\/(company|school|showcase)\/([A-Za-z0-9][\w%.-]{0,99})/i.exec(String(url || "").trim());
  if (!m) return "";
  const slug = decodeURIComponent(m[2]).replace(/[^\w.-]/g, "");
  return slug ? `https://www.linkedin.com/${m[1].toLowerCase()}/${slug}` : "";
}

/** The LinkedIn page their own website links to. */
export function siteLinkedin(socials: { platform: string; url: string }[] | undefined): string {
  for (const s of socials || []) if (s.platform === "LinkedIn") { const u = linkedinCompany(s.url); if (u) return u; }
  return "";
}

/**
 * Wikidata: items whose English label is the brand's name (or the domain label) AND whose official website
 * is this very domain → their LinkedIn company ID (P4264). "" unless exactly one comes back.
 */
export async function wikidataLinkedin(name: string, domain: string, get: Fetcher = defaultFetch): Promise<string> {
  const d = normalizeDomain(domain);
  const label = d.split(".")[0];
  const clean = String(name || "").replace(/["\\\n]/g, "").trim().slice(0, 60);
  if (!label || clean.length < 2) return "";
  const names = Array.from(new Set([clean, label.charAt(0).toUpperCase() + label.slice(1), label.toUpperCase()]));
  const query = `SELECT ?site ?li WHERE { VALUES ?n { ${names.map((n) => `"${n}"@en`).join(" ")} } ?i rdfs:label ?n ; wdt:P856 ?site ; wdt:P4264 ?li } LIMIT 20`;
  const r = await get(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`);
  const rows = ((r?.body as { results?: { bindings?: { site?: { value?: string }; li?: { value?: string } }[] } } | null)?.results?.bindings || []);
  const ids = new Set(rows.filter((b) => normalizeDomain(String(b.site?.value || "")) === d).map((b) => String(b.li?.value || "")).filter((x) => /^[\w%.-]{2,100}$/.test(x)));
  return ids.size === 1 ? linkedinCompany(`https://www.linkedin.com/company/${[...ids][0]}`) : "";
}

export type HunterAnswer<T> = { ok: true; value: T } | { ok: false; why: "no_key" | "quota" | "bad_key" | "busy" | "none" | "error" };

const hunterKey = () => env("HUNTER_API_KEY");
export const hunterConfigured = () => !!hunterKey();
const hunterStatus = (status: number): HunterAnswer<never> | null =>
  status === 401 ? { ok: false, why: "bad_key" }
    : status === 429 ? { ok: false, why: "quota" } // Hunter: 429 = the plan's usage limit
      : status === 403 ? { ok: false, why: "busy" } // Hunter: 403 = rate limit
        : status === 404 || status === 400 ? { ok: false, why: "none" }
          : status >= 300 ? { ok: false, why: "error" } : null;

/** Hunter's company record for exactly this domain: LinkedIn, size, revenue, industry, country. */
export async function hunterCompany(domain: string, get: Fetcher = defaultFetch, key = hunterKey()): Promise<HunterAnswer<Omit<CompanyFacts, "domain" | "at">>> {
  const d = normalizeDomain(domain);
  if (!key) return { ok: false, why: "no_key" };
  if (!d) return { ok: false, why: "none" };
  const r = await get(`https://api.hunter.io/v2/companies/find?domain=${encodeURIComponent(d)}`, { "X-API-KEY": key });
  if (!r) return { ok: false, why: "error" };
  const bad = hunterStatus(r.status); if (bad) return bad;
  const c = (r.body as { data?: Record<string, unknown> } | null)?.data;
  if (!c) return { ok: false, why: "none" };
  // Only a record for this very domain (or one it lists as its own alias).
  const own = [c.domain, ...(Array.isArray(c.domainAliases) ? c.domainAliases : [])].map((x) => normalizeDomain(String(x || "")));
  if (!own.includes(d)) return { ok: false, why: "none" };
  const li = (c.linkedin as { handle?: string } | undefined)?.handle;
  const metrics = (c.metrics || {}) as { employees?: string; employeesCount?: number; estimatedAnnualRevenue?: string | null };
  const geo = (c.geo || {}) as { countryCode?: string };
  const cat = (c.category || {}) as { industry?: string; sector?: string };
  const out: Omit<CompanyFacts, "domain" | "at"> = { linkedin: li ? linkedinCompany(`https://www.linkedin.com/${String(li).replace(/^\/+/, "")}`) : "", name: clip(c.name, 80) };
  if (metrics.employees) out.size = clip(metrics.employees, 20);
  if (Number.isFinite(Number(metrics.employeesCount)) && Number(metrics.employeesCount) > 0) out.employees = Math.round(Number(metrics.employeesCount));
  if (metrics.estimatedAnnualRevenue) out.revenue = clip(metrics.estimatedAnnualRevenue, 30);
  if (cat.industry || cat.sector) out.industry = clip(cat.industry || cat.sector, 60);
  if (/^[A-Z]{2}$/.test(String(geo.countryCode || ""))) out.country = String(geo.countryCode);
  if (Number.isFinite(Number(c.foundedYear)) && Number(c.foundedYear) > 1800) out.founded = Number(c.foundedYear);
  return { ok: true, value: out };
}

/** Roles that close creator deals come first. */
const ROLE_RANK: [RegExp, number][] = [
  [/influencer|creator|talent|ambassador|affiliate|partnership|collab|sponsor/i, 5],
  [/brand|social|community|content|growth|pr\b|public relations|communication/i, 4],
  [/marketing|cmo|campaign|media/i, 3],
  [/founder|owner|ceo|chief executive|president|managing director/i, 2],
  [/business development|bd\b|sales|commercial/i, 1],
];
export const roleRank = (title: string) => { for (const [re, n] of ROLE_RANK) if (re.test(title)) return n; return 0; };

/** People Hunter knows at this domain, deal-makers first (marketing, communication, executive, sales, management). */
export async function hunterPeople(domain: string, get: Fetcher = defaultFetch, key = hunterKey()): Promise<HunterAnswer<{ list: Person[]; total: number }>> {
  const d = normalizeDomain(domain);
  if (!key) return { ok: false, why: "no_key" };
  if (!d) return { ok: false, why: "none" };
  const r = await get(`https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(d)}&type=personal&department=marketing,communication,executive,management,sales&limit=10`, { "X-API-KEY": key });
  if (!r) return { ok: false, why: "error" };
  const bad = hunterStatus(r.status); if (bad) return bad;
  const body = r.body as { data?: { domain?: string; emails?: Record<string, unknown>[] }; meta?: { results?: number } } | null;
  if (normalizeDomain(String(body?.data?.domain || d)) !== d) return { ok: false, why: "none" };
  const list: Person[] = (body?.data?.emails || []).map((e) => ({
    first: clip(e.first_name, 40), last: clip(e.last_name, 40), title: clip(e.position, 80),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e.value || "")) ? String(e.value).toLowerCase().slice(0, 120) : "",
    linkedin: /^https?:\/\/([a-z]{2,3}\.|www\.)?linkedin\.com\/in\/[\w%-]+/i.test(String(e.linkedin || "")) ? String(e.linkedin).split("?")[0].slice(0, 200) : "",
    confidence: Math.max(0, Math.min(100, Math.round(Number(e.confidence) || 0))), department: clip(e.department, 30), seniority: clip(e.seniority, 20),
  })).filter((p) => p.email && (p.first || p.last))
    .sort((a, b) => roleRank(b.title) - roleRank(a.title) || b.confidence - a.confidence);
  return { ok: true, value: { list, total: Math.max(list.length, Number(body?.meta?.results) || 0) } };
}
