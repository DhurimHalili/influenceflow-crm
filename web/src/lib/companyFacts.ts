// Company facts you can trust (owner's rule, Nov 2026): size, revenue, age, home, industry, listing, parent —
// taken ONLY from a source that is about this very company, never guessed, never a credit spent:
//   • Wikidata — the item whose official website (P856) IS the brand's domain; every value keeps its date
//     ("as of 2024") and the reference it cites (annual report, filing) when Wikidata has one;
//   • their own website — the Organization block it publishes (JSON-LD: founding date, employees, country);
//   • their own store — Shopify's public shop file (country, base currency) and the products the site lists.
// Paid lookups (Apollo, Clay, Hunter) cost credits and their size / revenue are ESTIMATES: shown apart,
// labelled "estimate", and never mixed into a verified value.
// Shared by the app and brand-match (explicit `.ts` imports, no npm packages).

export type FactSource = "wikidata" | "site" | "store";
export type Fact<T> = { v: T; via: FactSource; /** When it was true ("2024", "2023-06-30"). */ as_of?: string; /** Where Wikidata got it (a report / filing URL). */ ref?: string };

export type VerifiedFacts = {
  at: string;
  /** The Wikidata item (Q-id) these came from, when any. */
  qid?: string;
  employees?: Fact<number>;
  revenue?: Fact<{ amount: number; currency: string }>;
  founded?: Fact<number>;
  /** ISO 3166 alpha-2 of where the company is. */
  country?: Fact<string>;
  /** City / place of the head office. */
  hq?: Fact<string>;
  industry?: Fact<string[]>;
  /** Listed on a stock exchange. */
  listed?: Fact<{ exchange: string; ticker: string }>;
  /** Part of a group. */
  parent?: Fact<string>;
  /** The registered / legal name. */
  legal?: Fact<string>;
};

// ----- Wikidata entity JSON → facts ------------------------------------------------------------------------

type Snak = { snaktype?: string; datavalue?: { value?: unknown } };
type Claim = { rank?: string; mainsnak?: Snak; qualifiers?: Record<string, Snak[]>; references?: { snaks?: Record<string, Snak[]> }[] };
export type WikiEntity = { id?: string; claims?: Record<string, Claim[]> };

const val = (s: Snak | undefined) => (s?.snaktype === "value" ? s.datavalue?.value : undefined);
const qidOf = (v: unknown) => { const id = (v as { id?: unknown } | undefined)?.id; return typeof id === "string" && /^Q\d{1,12}$/.test(id) ? id : ""; };
/** "+2023-00-00T00:00:00Z" → "2023", "+2023-06-30T00:00:00Z" → "2023-06-30". */
export const wikiDate = (v: unknown): string => {
  const t = String((v as { time?: unknown } | undefined)?.time || "");
  const m = /^\+?(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (!m) return "";
  return m[2] === "00" ? m[1] : m[3] === "00" ? `${m[1]}-${m[2]}` : `${m[1]}-${m[2]}-${m[3]}`;
};
const refUrl = (c: Claim) => {
  for (const r of c.references || []) for (const s of r.snaks?.P854 || []) { const u = val(s); if (typeof u === "string" && /^https?:\/\/[^\s<>"]{4,300}$/.test(u)) return u; }
  return "";
};
/** The claims worth reading: never deprecated; preferred ones win; newest point in time (P585) first. */
function ranked(claims: Claim[] | undefined): Claim[] {
  const list = (claims || []).filter((c) => c.rank !== "deprecated" && val(c.mainsnak) !== undefined);
  const when = (c: Claim) => wikiDate(val(c.qualifiers?.P585?.[0])) || wikiDate(val(c.qualifiers?.P580?.[0]));
  return list.sort((a, b) => (b.rank === "preferred" ? 1 : 0) - (a.rank === "preferred" ? 1 : 0) || when(b).localeCompare(when(a)));
}
/** Still true? A claim with an end time (P582) in the past is history (a former parent, a delisting). */
const current = (c: Claim) => !wikiDate(val(c.qualifiers?.P582?.[0]));

export type RawFacts = {
  qid: string;
  employees?: { n: number; at?: string; ref?: string };
  revenue?: { amount: number; unit: string; at?: string; ref?: string };
  founded?: { year: number; ref?: string };
  country?: string; hq?: string; industry: string[];
  exchange?: { qid: string; ticker: string }; parent?: string; legal?: string;
  /** LinkedIn company id (P4264). */
  linkedin?: string;
};

/** Everything Wikidata says about the company, still as Q-ids where a name is needed. */
export function rawFacts(e: WikiEntity): RawFacts {
  const c = e.claims || {};
  const out: RawFacts = { qid: String(e.id || ""), industry: [] };
  const emp = ranked(c.P1128)[0];
  if (emp) { const n = Math.round(Number((val(emp.mainsnak) as { amount?: unknown })?.amount)); if (n > 0 && n < 5_000_000) out.employees = { n, at: wikiDate(val(emp.qualifiers?.P585?.[0])) || undefined, ref: refUrl(emp) || undefined }; }
  const rev = ranked(c.P2139)[0];
  if (rev) {
    const q = val(rev.mainsnak) as { amount?: unknown; unit?: unknown } | undefined;
    const amount = Number(q?.amount);
    const unit = String(q?.unit || "").split("/").pop() || "";
    if (amount > 0 && /^Q\d+$/.test(unit)) out.revenue = { amount, unit, at: wikiDate(val(rev.qualifiers?.P585?.[0])) || undefined, ref: refUrl(rev) || undefined };
  }
  const inc = ranked(c.P571)[0];
  if (inc) { const y = Number(wikiDate(val(inc.mainsnak)).slice(0, 4)); if (y > 1500 && y <= new Date().getFullYear()) out.founded = { year: y, ref: refUrl(inc) || undefined }; }
  out.country = qidOf(val(ranked(c.P17).filter(current)[0]?.mainsnak)) || undefined;
  out.hq = qidOf(val(ranked(c.P159).filter(current)[0]?.mainsnak)) || undefined;
  out.industry = ranked(c.P452).map((x) => qidOf(val(x.mainsnak))).filter(Boolean).slice(0, 3);
  const ex = ranked(c.P414).filter(current)[0];
  if (ex) { const q = qidOf(val(ex.mainsnak)); const t = val(ex.qualifiers?.P249?.[0]); if (q) out.exchange = { qid: q, ticker: typeof t === "string" ? t.slice(0, 12) : "" }; }
  out.parent = qidOf(val(ranked(c.P749).filter(current)[0]?.mainsnak)) || undefined;
  const legal = val(ranked(c.P1448)[0]?.mainsnak) as { text?: unknown } | undefined;
  if (legal && typeof legal.text === "string") out.legal = legal.text.replace(/[<>]/g, "").slice(0, 120);
  const li = val(ranked(c.P4264)[0]?.mainsnak);
  if (typeof li === "string" && /^[\w%.-]{2,100}$/.test(li)) out.linkedin = li;
  return out;
}

/** The Q-ids we need a name, a country code or a currency code for. */
export const qidsToName = (r: RawFacts) => Array.from(new Set([r.revenue?.unit, r.country, r.hq, ...r.industry, r.exchange?.qid, r.parent].filter((x): x is string => !!x)));
export type QidInfo = { label?: string; iso2?: string; currency?: string };

/** The finished facts: names filled in, anything we couldn't name left out (never a bare "Q123"). */
export function buildFacts(r: RawFacts, info: Map<string, QidInfo>, at: string): VerifiedFacts {
  const w = (extra: { as_of?: string; ref?: string } = {}) => ({ via: "wikidata" as const, ...(extra.as_of ? { as_of: extra.as_of } : {}), ...(extra.ref ? { ref: extra.ref } : {}) });
  const out: VerifiedFacts = { at, qid: r.qid || undefined };
  if (r.employees) out.employees = { v: r.employees.n, ...w({ as_of: r.employees.at, ref: r.employees.ref }) };
  const cur = r.revenue ? info.get(r.revenue.unit)?.currency : "";
  if (r.revenue && cur && /^[A-Z]{3}$/.test(cur)) out.revenue = { v: { amount: r.revenue.amount, currency: cur }, ...w({ as_of: r.revenue.at, ref: r.revenue.ref }) };
  if (r.founded) out.founded = { v: r.founded.year, ...w({ ref: r.founded.ref }) };
  const iso = r.country ? info.get(r.country)?.iso2 : "";
  if (iso && /^[A-Z]{2}$/.test(iso)) out.country = { v: iso, ...w() };
  const hq = r.hq ? info.get(r.hq)?.label : "";
  if (hq) out.hq = { v: hq, ...w() };
  const ind = r.industry.map((q) => info.get(q)?.label || "").filter(Boolean);
  if (ind.length) out.industry = { v: ind, ...w() };
  const ex = r.exchange ? info.get(r.exchange.qid)?.label : "";
  if (ex) out.listed = { v: { exchange: ex, ticker: r.exchange!.ticker }, ...w() };
  const parent = r.parent ? info.get(r.parent)?.label : "";
  if (parent) out.parent = { v: parent, ...w() };
  if (r.legal) out.legal = { v: r.legal, ...w() };
  return out;
}

/** Their own site's Organization block (JSON-LD) — what the company says about itself. */
export type SiteOrg = { employees?: number; founded?: number; country?: string; legal?: string };
const COUNTRY_WORDS: Record<string, string> = { "united states": "US", usa: "US", "united kingdom": "GB", uk: "GB", germany: "DE", deutschland: "DE", france: "FR", canada: "CA", australia: "AU", netherlands: "NL", spain: "ES", italy: "IT", sweden: "SE", denmark: "DK", norway: "NO", finland: "FI", poland: "PL", ireland: "IE", switzerland: "CH", austria: "AT", belgium: "BE", japan: "JP", china: "CN", "hong kong": "HK", taiwan: "TW", singapore: "SG", india: "IN", brazil: "BR", mexico: "MX", "new zealand": "NZ", portugal: "PT" };
export function siteOrg(o: Record<string, unknown>): SiteOrg {
  const out: SiteOrg = {};
  const ne = o.numberOfEmployees as unknown;
  const n = Math.round(Number(typeof ne === "object" && ne ? (ne as { value?: unknown; maxValue?: unknown }).value ?? (ne as { maxValue?: unknown }).maxValue : ne));
  if (n > 0 && n < 5_000_000) out.employees = n;
  const y = Number(String(o.foundingDate || "").slice(0, 4));
  if (y > 1500 && y <= new Date().getFullYear()) out.founded = y;
  const addr = (Array.isArray(o.address) ? o.address[0] : o.address) as Record<string, unknown> | string | undefined;
  const c = typeof addr === "object" && addr ? (typeof addr.addressCountry === "object" && addr.addressCountry ? (addr.addressCountry as { name?: unknown }).name : addr.addressCountry) : "";
  const cs = String(c || "").trim();
  const iso = /^[A-Z]{2}$/.test(cs) ? cs : COUNTRY_WORDS[cs.toLowerCase()] || "";
  if (iso) out.country = iso === "UK" ? "GB" : iso;
  if (typeof o.legalName === "string" && o.legalName.trim()) out.legal = o.legalName.replace(/[<>]/g, "").trim().slice(0, 120);
  return out;
}

/** Wikidata first (dated, cited); their own words fill only what Wikidata doesn't say. */
export function withSite(v: VerifiedFacts, org: SiteOrg | undefined): VerifiedFacts {
  if (!org) return v;
  const out = { ...v };
  if (!out.employees && org.employees) out.employees = { v: org.employees, via: "site" };
  if (!out.founded && org.founded) out.founded = { v: org.founded, via: "site" };
  if (!out.country && org.country) out.country = { v: org.country, via: "site" };
  if (!out.legal && org.legal) out.legal = { v: org.legal, via: "site" };
  return out;
}

// ----- bands, money, the view the app shows -----------------------------------------------------------------

/** Approximate USD per unit — ONLY to place a revenue in a band; the value itself is always shown in its own currency. */
const USD: Record<string, number> = { USD: 1, EUR: 1.08, GBP: 1.27, CHF: 1.13, CAD: 0.73, AUD: 0.65, NZD: 0.6, JPY: 0.0067, CNY: 0.14, HKD: 0.128, TWD: 0.031, KRW: 0.00073, SGD: 0.74, INR: 0.012, SEK: 0.095, NOK: 0.093, DKK: 0.145, PLN: 0.25, CZK: 0.043, HUF: 0.0027, BRL: 0.18, MXN: 0.055, ZAR: 0.054, TRY: 0.03, ILS: 0.27, AED: 0.27, SAR: 0.27, RUB: 0.011 };
export const toUsd = (amount: number, currency: string) => (USD[currency] ? amount * USD[currency] : NaN);

export const SIZE_BANDS = [
  { key: "s1", label: "1–10", hint: "Founder-run", min: 1, max: 10 },
  { key: "s2", label: "11–50", hint: "Small team", min: 11, max: 50 },
  { key: "s3", label: "51–200", hint: "Growing", min: 51, max: 200 },
  { key: "s4", label: "201–1K", hint: "Mid-size", min: 201, max: 1000 },
  { key: "s5", label: "1K–10K", hint: "Large", min: 1001, max: 10000 },
  { key: "s6", label: "10K+", hint: "Enterprise", min: 10001, max: Infinity },
] as const;
export const REVENUE_BANDS = [
  { key: "r1", label: "< $1M", min: 0, max: 1e6 },
  { key: "r2", label: "$1–10M", min: 1e6, max: 1e7 },
  { key: "r3", label: "$10–100M", min: 1e7, max: 1e8 },
  { key: "r4", label: "$100M–1B", min: 1e8, max: 1e9 },
  { key: "r5", label: "$1B+", min: 1e9, max: Infinity },
] as const;
export const AGE_BANDS = [
  { key: "a1", label: "Under 5 years", short: "< 5 yrs", min: 0, max: 4 },
  { key: "a2", label: "5 to 20 years", short: "5–20 yrs", min: 5, max: 20 },
  { key: "a3", label: "Over 20 years", short: "20+ yrs", min: 21, max: Infinity },
] as const;
export const sizeBand = (n: number | undefined) => (n && n > 0 ? SIZE_BANDS.find((b) => n >= b.min && n <= b.max)?.key : undefined);
export const revenueBand = (usd: number | undefined) => (usd !== undefined && Number.isFinite(usd) && usd > 0 ? REVENUE_BANDS.find((b) => usd >= b.min && usd < b.max)?.key : undefined);
export const ageBand = (founded: number | undefined, year = new Date().getFullYear()) => (founded ? AGE_BANDS.find((b) => year - founded >= b.min && year - founded <= b.max)?.key : undefined);

/** "$383.3B", "€12.4M", "¥2.1T" — the company's own currency, compact. */
export function moneyShort(amount: number, currency: string) {
  const sym: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥", CNY: "¥", KRW: "₩", INR: "₹", CHF: "CHF ", SEK: "SEK ", NOK: "NOK ", DKK: "DKK ", CAD: "CA$", AUD: "A$", HKD: "HK$", TWD: "NT$", SGD: "S$", BRL: "R$", PLN: "zł " };
  const s = sym[currency] ?? `${currency} `;
  const a = Math.abs(amount);
  const [d, u] = a >= 1e12 ? [1e12, "T"] : a >= 1e9 ? [1e9, "B"] : a >= 1e6 ? [1e6, "M"] : a >= 1e3 ? [1e3, "K"] : [1, ""];
  const n = amount / d;
  return `${s}${n >= 100 || !u ? Math.round(n) : n.toFixed(1).replace(/\.0$/, "")}${u}`;
}

/** An estimate string from a paid service ("$10M-$50M", "$1.2B", "10M") → USD, the low end of a range. */
export function estimateUsd(text: string | undefined): number | undefined {
  const m = /\$?\s*([\d.,]+)\s*([kmbt])?/i.exec(String(text || ""));
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, ""));
  const mult = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[(m[2] || "").toLowerCase() as "k"] || 1;
  return n > 0 ? n * mult : undefined;
}
/** "51-200" / "51–200" / "1,001-5,000" / "10000+" → the middle (or the floor for "+"). */
export function sizeFromText(text: string | undefined): number | undefined {
  const nums = (String(text || "").match(/\d[\d,]*/g) || []).map((x) => Number(x.replace(/,/g, ""))).filter((x) => x > 0);
  if (!nums.length) return undefined;
  return nums.length >= 2 ? Math.round((nums[0] + nums[1]) / 2) : nums[0];
}

type Estimates = { employees?: number; size?: string; revenue?: string; industry?: string; country?: string; founded?: number; facts_via?: string };
type StoreBits = { platform?: string; products?: number; price?: { median: number; currency: string } | null; programs?: unknown[]; geo?: { shop?: string; cur?: string; hq?: string } | null };

export type Shown<T> = { v: T; label: string; verified: boolean; via: string; as_of?: string; ref?: string };
/** One brand's company, ready for chips, filters and the profile. */
export type CompanyView = {
  employees?: Shown<number>; revenue?: Shown<number /* USD for bands */>; founded?: Shown<number>; country?: Shown<string>;
  hq?: string; industry?: string[]; listed?: { exchange: string; ticker: string }; parent?: string; legal?: string;
  size?: string; rev?: string; age?: string;
  shop?: string; products: number; price?: { median: number; currency: string }; program: boolean;
  /** "verified" = at least one fact from the company / Wikidata; "estimate" = only a paid service's numbers; "none". */
  quality: "verified" | "estimate" | "none";
};

const VIA_NAME: Record<string, string> = { wikidata: "Wikidata", site: "Their website", store: "Their store", apollo: "Apollo", clay: "Clay", hunter: "Hunter" };
export const viaName = (via: string) => VIA_NAME[via] || via;

export function companyView(intel: ({ company?: (Estimates & { verified?: VerifiedFacts | null }) | null } & StoreBits) | null | undefined): CompanyView {
  const co = intel?.company || null;
  const v = co?.verified || null;
  const est = co || {};
  const paid = est.facts_via || "";
  const out: CompanyView = { products: Math.max(0, Number(intel?.products) || 0), program: !!intel?.programs?.length, quality: "none" };
  const fact = <T,>(f: Fact<T> | undefined, label: (x: T) => string): Shown<T> | undefined => (f ? { v: f.v, label: label(f.v), verified: true, via: f.via, as_of: f.as_of, ref: f.ref } : undefined);
  out.employees = fact(v?.employees, (n) => n.toLocaleString("en-US"));
  if (!out.employees) {
    const n = est.employees || sizeFromText(est.size);
    if (n && paid) out.employees = { v: n, label: est.size ? est.size.replace(/\s*-\s*/, "–") : `≈ ${n.toLocaleString("en-US")}`, verified: false, via: paid };
  }
  if (v?.revenue) out.revenue = { v: toUsd(v.revenue.v.amount, v.revenue.v.currency), label: moneyShort(v.revenue.v.amount, v.revenue.v.currency), verified: true, via: "wikidata", as_of: v.revenue.as_of, ref: v.revenue.ref };
  else if (est.revenue && paid) { const usd = estimateUsd(est.revenue); if (usd) out.revenue = { v: usd, label: est.revenue.replace(/^(\d)/, "$$$1").replace(/\s*-\s*/, "–"), verified: false, via: paid }; }
  out.founded = fact(v?.founded, String) || (est.founded && paid ? { v: est.founded, label: String(est.founded), verified: false, via: paid } : undefined);
  out.country = fact(v?.country, String) || (intel?.geo?.hq ? { v: intel.geo.hq, label: intel.geo.hq, verified: true, via: "wikidata" } : est.country && paid ? { v: est.country, label: est.country, verified: false, via: paid } : undefined);
  out.hq = v?.hq?.v;
  out.industry = v?.industry?.v || (est.industry ? [est.industry] : undefined);
  out.listed = v?.listed?.v; out.parent = v?.parent?.v; out.legal = v?.legal?.v;
  out.size = sizeBand(out.employees?.v); out.rev = revenueBand(out.revenue?.v); out.age = ageBand(out.founded?.v);
  out.shop = intel?.geo?.shop || undefined;
  if (intel?.price && intel.price.median > 0) out.price = { median: intel.price.median, currency: intel.price.currency };
  const anyVerified = [out.employees, out.revenue, out.founded].some((x) => x?.verified) || !!(v?.listed || v?.parent || v?.industry || v?.hq || v?.country);
  out.quality = anyVerified ? "verified" : out.employees || out.revenue || out.founded ? "estimate" : "none";
  return out;
}

/** Price level of what they sell, from the median product price (their own store). */
export const priceLevel = (p: CompanyView["price"]) => { if (!p) return undefined; const usd = toUsd(p.median, p.currency || "USD"); if (!Number.isFinite(usd)) return undefined; return usd < 30 ? "budget" : usd < 150 ? "mid" : usd < 600 ? "premium" : "luxury"; };
export const PRICE_LABEL: Record<string, string> = { budget: "Under $30", mid: "$30–150", premium: "$150–600", luxury: "$600+" };
