import type { Brand, BrandBrief, BudgetPeriod, Creator, CreatorTier, SocialPlatform } from "../types";
import { SOCIAL_ORDER } from "./socials";
import { compact, currencySymbol } from "./utils";

// The agency brief for a brand — option lists, cleaning, summaries and the
// creator ⇄ brand matching that powers "Best-fit creators".

export const FORMATS = ["Integrated video", "Dedicated video", "Short / Reel", "Story", "Static post", "Livestream", "Unboxing / review", "UGC (no posting)", "Podcast mention", "Event / appearance"];
export const GOALS = ["Awareness", "Engagement", "Website traffic", "Sales", "App installs", "Product launch", "UGC library", "Community"];
export const AGES = ["13–17", "18–24", "25–34", "35–44", "45+"];
export const GENDERS: { value: BrandBrief["gender"]; label: string }[] = [{ value: "any", label: "Any" }, { value: "women", label: "Mostly women" }, { value: "men", label: "Mostly men" }];
export const PAYMENT_TERMS = ["Upfront", "50% upfront / 50% on delivery", "On delivery", "Net 15", "Net 30", "Net 60"];
export const USAGE_RIGHTS = ["Organic only", "Paid ads · 30 days", "Paid ads · 90 days", "Paid ads · 12 months", "Perpetual"];
export const EXCLUSIVITY = ["None", "30 days", "90 days", "6 months (category)"];
export const PERIODS: { value: BudgetPeriod; label: string; short: string }[] = [
  { value: "campaign", label: "per campaign", short: "/campaign" },
  { value: "month", label: "per month", short: "/mo" },
  { value: "quarter", label: "per quarter", short: "/qtr" },
  { value: "year", label: "per year", short: "/yr" },
];
export const BUDGET_PRESETS: { label: string; min: number; max: number }[] = [
  { label: "Under {c}1K", min: 0, max: 1000 },
  { label: "{c}1K–5K", min: 1000, max: 5000 },
  { label: "{c}5K–20K", min: 5000, max: 20000 },
  { label: "{c}20K–50K", min: 20000, max: 50000 },
  { label: "{c}50K+", min: 50000, max: 0 },
];

export const TIERS: { value: CreatorTier; label: string; range: string; min: number; max: number }[] = [
  { value: "nano", label: "Nano", range: "1K–10K", min: 0, max: 10_000 },
  { value: "micro", label: "Micro", range: "10K–100K", min: 10_000, max: 100_000 },
  { value: "mid", label: "Mid", range: "100K–500K", min: 100_000, max: 500_000 },
  { value: "macro", label: "Macro", range: "500K–1M", min: 500_000, max: 1_000_000 },
  { value: "mega", label: "Mega", range: "1M+", min: 1_000_000, max: Infinity },
];

export const emptyBrief = (): BrandBrief => ({
  niches: [], platforms: [], formats: [], tiers: [], budget_min: 0, budget_max: 0, budget_period: "campaign",
  goals: [], markets: [], ages: [], gender: "", payment_terms: "", usage_rights: "", exclusivity: "", gifting: false, avoid: [], next_launch: null,
});

const strings = (value: unknown, allowed?: string[]) => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const v = typeof item === "string" ? item.trim() : "";
    if (!v || out.some((x) => x.toLowerCase() === v.toLowerCase())) continue;
    if (allowed && !allowed.includes(v)) continue;
    out.push(v.slice(0, 60));
  }
  return out;
};
const amount = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/** Whatever came from storage, an import or an old backup → a clean brief. */
export const normalizeBrief = (value: unknown): BrandBrief => {
  const row = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const base = emptyBrief();
  const min = amount(row.budget_min);
  const max = amount(row.budget_max);
  return {
    ...base,
    niches: strings(row.niches),
    platforms: strings(row.platforms, SOCIAL_ORDER) as SocialPlatform[],
    formats: strings(row.formats),
    tiers: strings(row.tiers, TIERS.map((t) => t.value)) as CreatorTier[],
    // A swapped range is almost always a typo; keep it usable.
    budget_min: max && min > max ? max : min,
    budget_max: max && min > max ? min : max,
    budget_period: (PERIODS.map((p) => p.value) as string[]).includes(String(row.budget_period)) ? (row.budget_period as BudgetPeriod) : "campaign",
    goals: strings(row.goals),
    markets: strings(row.markets),
    ages: strings(row.ages, AGES),
    gender: (["any", "women", "men"] as const).includes(row.gender as "any") ? (row.gender as BrandBrief["gender"]) : "",
    payment_terms: typeof row.payment_terms === "string" ? row.payment_terms.slice(0, 60) : "",
    usage_rights: typeof row.usage_rights === "string" ? row.usage_rights.slice(0, 60) : "",
    exclusivity: typeof row.exclusivity === "string" ? row.exclusivity.slice(0, 60) : "",
    gifting: row.gifting === true,
    avoid: strings(row.avoid),
    next_launch: typeof row.next_launch === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.next_launch) ? row.next_launch : null,
  };
};

const short = (n: number) => `${currencySymbol()}${compact(n)}`;

/** "€5K–20K /campaign", "Up to €2K /mo", "From €50K /campaign", "" when unknown. */
export const budgetLabel = (raw: BrandBrief | undefined, withPeriod = true) => {
  const brief = raw || emptyBrief();
  const { budget_min: min, budget_max: max } = brief;
  if (!min && !max) return "";
  const period = withPeriod ? ` ${PERIODS.find((p) => p.value === brief.budget_period)?.short || ""}` : "";
  if (min && max) return min === max ? `${short(max)}${period}` : `${short(min)}–${compact(max)}${period}`;
  return max ? `Up to ${short(max)}${period}` : `From ${short(min)}${period}`;
};

/** Midpoint used to sort brands by budget. */
export const budgetValue = (raw: BrandBrief | undefined) => { const brief = raw || emptyBrief(); return (brief.budget_min && brief.budget_max ? (brief.budget_min + brief.budget_max) / 2 : brief.budget_max || brief.budget_min); };

export type BriefPart = { id: "looking" | "budget" | "audience" | "terms"; label: string; done: boolean };

/** How complete the brief is, by section — drives the profile progress ring. */
export const briefProgress = (raw: BrandBrief | undefined, socials = 0): { percent: number; parts: BriefPart[] } => {
  const brief = normalizeBrief(raw);
  const parts: BriefPart[] = [
    { id: "looking", label: "What they want", done: brief.niches.length > 0 && (brief.platforms.length > 0 || brief.formats.length > 0) },
    { id: "budget", label: "Budget", done: brief.budget_max > 0 || brief.budget_min > 0 },
    { id: "audience", label: "Audience & goals", done: brief.goals.length > 0 && (brief.markets.length > 0 || brief.ages.length > 0) },
    { id: "terms", label: "Deal terms", done: !!(brief.payment_terms || brief.usage_rights || brief.exclusivity) },
  ];
  const score = parts.filter((p) => p.done).length * 22 + (brief.tiers.length ? 6 : 0) + (socials ? 6 : 0);
  return { percent: Math.min(100, score), parts };
};

export const briefIsEmpty = (raw: BrandBrief | undefined) => { const brief = normalizeBrief(raw); return briefProgress(brief).percent === 0 && !brief.tiers.length; };

// ---------------------------------------------------------------------------
// Creator ⇄ brand matching
// ---------------------------------------------------------------------------

/** Biggest audience we know of: top follower count, else average views. */
export const creatorReach = (creator: Creator) => Math.max(0, ...(creator.socials || []).map((s) => s.followers || 0)) || creator.avg_views || 0;
export const tierOf = (reach: number): CreatorTier | null => (reach > 0 ? TIERS.find((t) => reach < t.max)?.value || "mega" : null);

const words = (value: string) => value.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
/** "Tech reviews" matches "Tech", "gaming" matches "Gaming & esports". */
export const nicheMatches = (creatorNiche: string, wanted: string[]) => {
  const have = words(creatorNiche);
  if (!have.length) return false;
  return wanted.some((w) => {
    const want = words(w);
    return want.some((x) => have.some((h) => h === x || (x.length > 3 && h.startsWith(x)) || (h.length > 3 && x.startsWith(h))));
  });
};

export type MatchReason = { label: string; ok: boolean | null };
export type Match = { score: number; reasons: MatchReason[] };

/**
 * 0–100 fit of a creator for a brand brief. Only what the brief actually
 * specifies counts, so a brief with just "Tech + YouTube" still ranks well.
 * Returns score -1 when the brief says nothing to match on.
 */
export const matchCreator = (raw: BrandBrief | undefined, creator: Creator, ratingScore = 0): Match => {
  const brief = normalizeBrief(raw);
  const reasons: MatchReason[] = [];
  let earned = 0;
  let possible = 0;
  if (brief.niches.length) {
    possible += 35;
    const ok = nicheMatches(creator.niche, brief.niches);
    if (ok) earned += 35;
    reasons.push({ label: ok ? creator.niche || "Niche" : `Niche: ${creator.niche || "unknown"}`, ok });
  }
  if (brief.platforms.length) {
    possible += 25;
    const theirs = new Set<string>([creator.platform, ...(creator.socials || []).map((s) => s.platform)]);
    const hit = brief.platforms.filter((p) => theirs.has(p));
    if (hit.length) earned += 25;
    reasons.push({ label: hit.length ? hit.slice(0, 2).join(" + ") : `Not on ${brief.platforms.slice(0, 2).join("/")}`, ok: hit.length > 0 });
  }
  if (brief.tiers.length) {
    const tier = tierOf(creatorReach(creator));
    if (tier) {
      possible += 20;
      const ok = brief.tiers.includes(tier);
      // One size off still counts for something.
      const idx = TIERS.findIndex((t) => t.value === tier);
      const near = !ok && brief.tiers.some((t) => Math.abs(TIERS.findIndex((x) => x.value === t) - idx) === 1);
      earned += ok ? 20 : near ? 8 : 0;
      reasons.push({ label: `${TIERS[idx].label} creator`, ok: ok ? true : near ? null : false });
    }
  }
  const rates = Object.values(creator.rates || {}).filter((v) => typeof v === "number" && v > 0) as number[];
  const cap = brief.budget_max || 0;
  if (cap && rates.length && brief.budget_period === "campaign") {
    possible += 20;
    const cheapest = Math.min(...rates);
    const ok = cheapest <= cap;
    const near = !ok && cheapest <= cap * 1.25;
    earned += ok ? 20 : near ? 10 : 0;
    reasons.push({ label: ok ? "Rates fit budget" : near ? "Rates just over budget" : "Rates above budget", ok: ok ? true : near ? null : false });
  }
  if (!possible) return { score: -1, reasons };
  // Your own rating nudges ties — never more than 5 points.
  const bonus = ratingScore > 0 ? Math.round((ratingScore / 5) * 5) : 0;
  return { score: Math.min(100, Math.round((earned / possible) * 95) + bonus), reasons };
};

export const matchTone = (score: number) => (score >= 80 ? "great" : score >= 55 ? "good" : "weak");

/** Brands whose brief fits a creator — for the creator profile. */
export const brandsForCreator = (brands: Brand[], creator: Creator, ratingScore = 0) =>
  brands
    .filter((b) => !b.archived_at && b.pipeline_status !== "denied")
    .map((brand) => ({ brand, match: matchCreator(brand.brief, creator, ratingScore) }))
    .filter((x) => x.match.score >= 55)
    .sort((a, b) => b.match.score - a.match.score);

/** Combine two briefs (merge/duplicate review): lists are unioned, the first wins on single values. */
export const mergeBriefs = (keep?: BrandBrief, other?: BrandBrief): BrandBrief => {
  const a = normalizeBrief(keep || emptyBrief());
  const b = normalizeBrief(other || emptyBrief());
  const list = <T extends string>(x: T[], y: T[]) => Array.from(new Map([...x, ...y].map((v) => [v.toLowerCase(), v])).values());
  return normalizeBrief({
    ...a,
    niches: list(a.niches, b.niches), platforms: list(a.platforms, b.platforms), formats: list(a.formats, b.formats), tiers: list(a.tiers, b.tiers),
    goals: list(a.goals, b.goals), markets: list(a.markets, b.markets), ages: list(a.ages, b.ages), avoid: list(a.avoid, b.avoid),
    budget_min: a.budget_min || a.budget_max ? a.budget_min : b.budget_min, budget_max: a.budget_min || a.budget_max ? a.budget_max : b.budget_max,
    budget_period: a.budget_min || a.budget_max ? a.budget_period : b.budget_period,
    gender: a.gender || b.gender, payment_terms: a.payment_terms || b.payment_terms, usage_rights: a.usage_rights || b.usage_rights, exclusivity: a.exclusivity || b.exclusivity,
    gifting: a.gifting || b.gifting, next_launch: a.next_launch || b.next_launch,
  });
};
