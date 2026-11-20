// Apollo.io (APOLLO_API_KEY, or a member's own key from Settings) — the first place the people finder looks.
//   People search  POST /api/v1/mixed_people/api_search   — FREE (no credits): everyone at the brand's website
//                  whose title matches; first name, obfuscated last name, title, "has an email".
//   Unlock         POST /api/v1/people/match              — 1 credit (0 when nothing is found): full name,
//                  LinkedIn profile, work email + Apollo's email status. Personal emails / phones never asked for.
//   Company        GET  /api/v1/organizations/enrich      — 1 credit: LinkedIn page, size, revenue, industry,
//                  country, founded — kept only when Apollo's record is for this very domain.
// Key in the x-api-key header only (never a URL). 600 calls an hour per key.

import { normalizeDomain } from "./sponsors.ts";
import { cred } from "./keyring.ts";
import { linkedinCompany, type CompanyFacts, type HunterAnswer } from "./companyInfo.ts";
import { APOLLO_SENIORITIES, searchTitles, seniorityOf, type SeniorityFilter } from "../../../web/src/lib/peopleFinder.ts";

const API = "https://api.apollo.io/api/v1";
const apolloKey = () => cred("APOLLO_API_KEY");
export const apolloConfigured = () => !!apolloKey();

export type Call = (method: "GET" | "POST", url: string, body: unknown, key: string) => Promise<{ status: number; body: unknown } | null>;
const defaultCall: Call = async (method, url, body, key) => {
  const res = await fetch(url, {
    method,
    headers: { "x-api-key": key, "Content-Type": "application/json", Accept: "application/json", "Cache-Control": "no-cache", "User-Agent": "InfluenceFlowCRM/1.0" },
    ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!res) return null;
  return { status: res.status, body: await res.json().catch(() => null) };
};

/** Why Apollo said no, in the finder's terms ("plan" = this endpoint isn't on the key's Apollo plan). */
export type ApolloWhy = "no_key" | "quota" | "bad_key" | "busy" | "none" | "error" | "plan";
const status = (r: { status: number; body: unknown }): { ok: false; why: ApolloWhy } | null => {
  const text = (() => { try { return JSON.stringify(r.body ?? "").slice(0, 600); } catch { return ""; } })();
  if (r.status === 401) return { ok: false, why: "bad_key" };
  if (r.status === 403) return { ok: false, why: /API_INACCESSIBLE|not permitted|not authorized|paid plan|upgrade/i.test(text) ? "plan" : "bad_key" };
  if (r.status === 429) return { ok: false, why: "busy" };
  if (/insufficient credits|out of credits|credit limit|not enough credits/i.test(text)) return { ok: false, why: "quota" };
  if (r.status === 402) return { ok: false, why: "quota" };
  if (r.status === 404 || r.status === 422 || r.status === 400) return { ok: false, why: "none" };
  if (r.status >= 300) return { ok: false, why: "error" };
  return null;
};
const clip = (s: unknown, n = 120) => String(s ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, n);
const profile = (u: unknown) => { const s = String(u || "").trim().split("?")[0]; return /^https?:\/\/([a-z]{2,3}\.|www\.)?linkedin\.com\/in\/[\w%.-]{2,100}\/?$/i.test(s) ? s.replace(/^http:/, "https:").slice(0, 300) : ""; };
const mail = (e: unknown) => { const s = String(e || "").trim().toLowerCase(); return /^[^\s@<>"]{1,64}@[a-z0-9.-]+\.[a-z]{2,}$/.test(s) && !/email_not_unlocked|domain\.com$/.test(s) ? s.slice(0, 160) : ""; };

export type FoundPerson = { ext_id: string; first_name: string; last_name: string; last_hint: string; title: string; seniority: number; has_email: boolean; email: string; email_status: string; linkedin_url: string };

/**
 * Everyone Apollo has at this website whose CURRENT title matches your titles (similar titles included),
 * optionally only from a seniority up. Free. Up to `pages` × 100.
 */
export async function apolloPeople(domain: string, titles: string[], seniority: SeniorityFilter, opts: { pages?: number; call?: Call; key?: string } = {}): Promise<HunterAnswer<{ list: FoundPerson[]; total: number }> | { ok: false; why: ApolloWhy }> {
  const d = normalizeDomain(domain);
  const key = opts.key ?? apolloKey();
  const call = opts.call || defaultCall;
  if (!key) return { ok: false, why: "no_key" };
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return { ok: false, why: "none" };
  const list: FoundPerson[] = [];
  let total = 0;
  for (let page = 1; page <= Math.max(1, Math.min(5, opts.pages ?? 3)); page++) {
    const body: Record<string, unknown> = {
      q_organization_domains_list: [d], person_titles: searchTitles(titles), include_similar_titles: true, page, per_page: 100,
      ...(APOLLO_SENIORITIES[seniority].length ? { person_seniorities: APOLLO_SENIORITIES[seniority] } : {}),
    };
    const r = await call("POST", `${API}/mixed_people/api_search`, body, key);
    if (!r) { if (page === 1) return { ok: false, why: "error" }; break; }
    const bad = status(r);
    if (bad) { if (page === 1) return bad; break; }
    const b = (r.body || {}) as { people?: Record<string, unknown>[]; total_entries?: unknown; pagination?: { total_entries?: unknown } };
    total = Math.max(total, Number(b.total_entries ?? b.pagination?.total_entries) || 0);
    const got = Array.isArray(b.people) ? b.people : [];
    for (const p of got) {
      const id = String(p.id || "");
      if (!/^[\w-]{6,64}$/.test(id) || list.some((x) => x.ext_id === id)) continue;
      const title = clip(p.title, 160);
      const last = clip(p.last_name, 80);
      list.push({
        ext_id: id, first_name: clip(p.first_name, 80), last_name: last, last_hint: last ? "" : clip(p.last_name_obfuscated, 40), title,
        seniority: seniorityOf(title), has_email: p.has_email === true || !!mail(p.email), email: "", email_status: "", linkedin_url: profile(p.linkedin_url),
      });
    }
    if (got.length < 100 || list.length >= total) break;
  }
  return { ok: true, value: { list: list.filter((p) => p.first_name), total: Math.max(total, list.length) } };
}

export type Unlocked = { first_name: string; last_name: string; title: string; email: string; email_status: string; linkedin_url: string; seniority: number };

/** One person in full (1 credit when Apollo finds them): by Apollo id, else by LinkedIn / name + website. Work email only. */
export async function apolloUnlock(who: { id?: string; first_name?: string; last_name?: string; linkedin_url?: string; domain: string; company?: string }, opts: { call?: Call; key?: string } = {}): Promise<HunterAnswer<Unlocked> | { ok: false; why: ApolloWhy }> {
  const key = opts.key ?? apolloKey();
  const call = opts.call || defaultCall;
  if (!key) return { ok: false, why: "no_key" };
  const d = normalizeDomain(who.domain);
  const body: Record<string, unknown> = { reveal_personal_emails: false, reveal_phone_number: false };
  if (who.id && /^[\w-]{6,64}$/.test(who.id)) body.id = who.id;
  if (who.linkedin_url && profile(who.linkedin_url)) body.linkedin_url = profile(who.linkedin_url);
  if (who.first_name) body.first_name = clip(who.first_name, 80);
  if (who.last_name) body.last_name = clip(who.last_name, 80);
  if (d) body.domain = d;
  if (who.company) body.organization_name = clip(who.company, 120);
  if (!body.id && !body.linkedin_url && !(body.first_name && body.last_name && d)) return { ok: false, why: "none" };
  const r = await call("POST", `${API}/people/match`, body, key);
  if (!r) return { ok: false, why: "error" };
  const bad = status(r); if (bad) return bad;
  const p = ((r.body || {}) as { person?: Record<string, unknown> | null }).person;
  if (!p || p.match_confidence === "none") return { ok: false, why: "none" };
  // Never somebody at another company: their current employer must be this website (when Apollo says).
  const org = (p.organization || {}) as { primary_domain?: unknown; website_url?: unknown };
  const at = normalizeDomain(String(org.primary_domain || org.website_url || ""));
  if (d && at && at !== d) return { ok: false, why: "none" };
  const title = clip(p.title, 160);
  const email = mail(p.email);
  return { ok: true, value: { first_name: clip(p.first_name, 80), last_name: clip(p.last_name, 80), title, email, email_status: email ? clip(p.email_status, 30) : "", linkedin_url: profile(p.linkedin_url), seniority: seniorityOf(title) } };
}

const money = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? (n >= 1e9 ? `$${(n / 1e9).toFixed(1).replace(/\.0$/, "")}B` : n >= 1e6 ? `$${Math.round(n / 1e6)}M` : `$${Math.round(n / 1e3)}K`) : ""; };
const COUNTRY: Record<string, string> = { "united states": "US", "united kingdom": "GB", germany: "DE", france: "FR", canada: "CA", australia: "AU", netherlands: "NL", spain: "ES", italy: "IT", sweden: "SE", denmark: "DK", norway: "NO", finland: "FI", poland: "PL", ireland: "IE", switzerland: "CH", austria: "AT", belgium: "BE", china: "CN", "hong kong": "HK", taiwan: "TW", japan: "JP", "south korea": "KR", singapore: "SG", india: "IN", brazil: "BR", mexico: "MX", israel: "IL", "new zealand": "NZ", portugal: "PT", "czech republic": "CZ", czechia: "CZ", estonia: "EE", lithuania: "LT", latvia: "LV", "united arab emirates": "AE", turkey: "TR", ukraine: "UA" };

/** Apollo's company record for exactly this website (1 credit). */
export async function apolloCompany(domain: string, opts: { call?: Call; key?: string; name?: string } = {}): Promise<HunterAnswer<Omit<CompanyFacts, "domain" | "at">> | { ok: false; why: ApolloWhy }> {
  const key = opts.key ?? apolloKey();
  const call = opts.call || defaultCall;
  const d = normalizeDomain(domain);
  if (!key) return { ok: false, why: "no_key" };
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return { ok: false, why: "none" };
  const r = await call("GET", `${API}/organizations/enrich?domain=${encodeURIComponent(d)}`, null, key);
  if (!r) return { ok: false, why: "error" };
  const bad = status(r); if (bad) return bad;
  const o = ((r.body || {}) as { organization?: Record<string, unknown> | null }).organization;
  if (!o) return { ok: false, why: "none" };
  if (normalizeDomain(String(o.primary_domain || o.website_url || "")) !== d) return { ok: false, why: "none" };
  const out: Omit<CompanyFacts, "domain" | "at"> = { linkedin: linkedinCompany(String(o.linkedin_url || "")), name: clip(o.name, 80) };
  const emp = Number(o.estimated_num_employees);
  if (Number.isFinite(emp) && emp > 0) out.employees = Math.round(emp);
  const rev = clip(o.annual_revenue_printed, 30) || money(o.annual_revenue);
  if (rev) out.revenue = rev.startsWith("$") ? rev : `$${rev}`;
  if (o.industry) out.industry = clip(o.industry, 60).replace(/\b\w/g, (c) => c.toUpperCase());
  const cc = COUNTRY[String(o.country || "").toLowerCase()];
  if (cc) out.country = cc;
  if (Number.isFinite(Number(o.founded_year)) && Number(o.founded_year) > 1800) out.founded = Number(o.founded_year);
  return { ok: true, value: out };
}
