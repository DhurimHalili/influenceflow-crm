// Your bar for a YouTube influencer — set in Settings, checked on quick fill,
// on every refresh and in the list.
//
//   minimum average views  50K  — the hard floor: under it they're out
//   minimum engagement     1%   — under it with the views there: slightly below
//   preferred subscribers  50K  — a plus when they have it; smaller is fine
//   maximum subscribers    1M   — above it: too big for you ("over")
//
// One verdict per influencer:
//   fits   — inside every rule
//   over   — bigger than your maximum
//   slight — the views are there, the engagement isn't
//   hard   — under your view floor (the worst)
//   none   — no YouTube numbers yet: nothing is judged

import type { Creator, YouTubeCriteria } from "../types";

export const DEFAULT_CRITERIA: YouTubeCriteria = { on: true, min_views: 50_000, min_er: 1, pref_subs: 50_000, max_subs: 1_000_000 };

export type CriteriaLevel = "fits" | "over" | "slight" | "hard" | "none";
export type Verdict = {
  level: CriteriaLevel;
  /** Short label for chips: "Fits criteria", "Below criteria"… */
  label: string;
  /** One sentence: what is off and by how much. */
  why: string;
  /** Everything checked, for a detailed view. */
  checks: { key: "views" | "er" | "subs" | "max"; ok: boolean; soft?: boolean; text: string }[];
  /** 50K+ subscribers (your preferred size). */
  plus: boolean;
  views: number; er: number; subs: number;
};

/** Order for "Outside criteria": over → slightly below → below. */
export const LEVEL_RANK: Record<CriteriaLevel, number> = { fits: 0, over: 1, slight: 2, hard: 3, none: 4 };
export const LEVEL_LABEL: Record<CriteriaLevel, string> = { fits: "Fits criteria", over: "Above criteria", slight: "Slightly below", hard: "Below criteria", none: "Not checked" };

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const normalizeCriteria = (value: unknown): YouTubeCriteria => {
  const v = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const num = (x: unknown, fallback: number, min: number, max: number) => {
    const y = Number(x);
    return x === undefined || x === null || x === "" || !Number.isFinite(y) ? fallback : Math.min(max, Math.max(min, y));
  };
  const minSubs = num(v.pref_subs, DEFAULT_CRITERIA.pref_subs, 0, 1e9);
  return {
    on: v.on === undefined ? true : v.on !== false,
    min_views: Math.round(num(v.min_views, DEFAULT_CRITERIA.min_views, 0, 1e9)),
    min_er: Math.round(num(v.min_er, DEFAULT_CRITERIA.min_er, 0, 100) * 100) / 100,
    pref_subs: Math.round(minSubs),
    // 0 = no maximum.
    max_subs: Math.round(num(v.max_subs, DEFAULT_CRITERIA.max_subs, 0, 1e10)),
  };
};

/** "50000" → "50K", "1000000" → "1M" (for sentences). */
export const short = (value: number) => {
  const v = Math.round(value);
  if (v >= 1e6) return `${Math.round(v / 1e5) / 10}M`.replace(".0M", "M");
  if (v >= 1e3) return `${Math.round(v / 100) / 10}K`.replace(".0K", "K");
  return String(v);
};

/** Subscribers on YouTube: what the last read said, else the YouTube link's follower count. */
export const youtubeSubs = (c: Pick<Creator, "youtube" | "socials">) =>
  n(c.youtube?.subscribers) || n((c.socials || []).find((s) => s.platform === "YouTube")?.followers);

const hasYouTube = (c: Pick<Creator, "youtube" | "socials" | "platform">) =>
  !!c.youtube?.channel_id || (c.socials || []).some((s) => s.platform === "YouTube" && (s.url || s.handle)) || c.platform === "YouTube";

/** Judge numbers against the bar. Works for a saved record and for a form draft. */
export function judge(input: { views: number; er: number; subs: number; youtube: boolean }, criteria: YouTubeCriteria = DEFAULT_CRITERIA): Verdict {
  const { views, er, subs } = input;
  const base = { views, er, subs, plus: subs >= criteria.pref_subs && criteria.pref_subs > 0 };
  if (!criteria.on || !input.youtube || !(views > 0)) return { ...base, level: "none", label: LEVEL_LABEL.none, why: !criteria.on ? "Criteria checks are off in Settings." : "No YouTube numbers yet.", checks: [] };
  const checks: Verdict["checks"] = [
    { key: "views", ok: views >= criteria.min_views, text: views >= criteria.min_views ? `${short(views)} avg views — over your ${short(criteria.min_views)} minimum` : `${short(views)} avg views — under your ${short(criteria.min_views)} minimum` },
    { key: "er", ok: er >= criteria.min_er, text: er >= criteria.min_er ? `${er}% engagement — at least ${criteria.min_er}%` : `${er}% engagement — under your ${criteria.min_er}% minimum` },
    { key: "subs", ok: true, soft: !base.plus, text: !subs ? "Subscribers hidden or unknown" : base.plus ? `${short(subs)} subscribers — your preferred size, a big plus` : `${short(subs)} subscribers — under your preferred ${short(criteria.pref_subs)}, no big deal` },
  ];
  if (criteria.max_subs > 0) checks.push({ key: "max", ok: subs <= criteria.max_subs, text: subs <= criteria.max_subs ? `Under your ${short(criteria.max_subs)} subscriber maximum` : `${short(subs)} subscribers — over your ${short(criteria.max_subs)} maximum` });
  const viewsOk = views >= criteria.min_views;
  const erOk = er >= criteria.min_er;
  const over = criteria.max_subs > 0 && subs > criteria.max_subs;
  // Worst first: the view floor is non-negotiable.
  if (!viewsOk) {
    const gap = Math.round((1 - views / criteria.min_views) * 100);
    return { ...base, level: "hard", label: LEVEL_LABEL.hard, why: `${short(views)} avg views is ${gap}% under your ${short(criteria.min_views)} floor${!erOk ? `, and ${er}% engagement is under ${criteria.min_er}% too` : ""}.`, checks };
  }
  if (over) return { ...base, level: "over", label: LEVEL_LABEL.over, why: `${short(subs)} subscribers is past your ${short(criteria.max_subs)} maximum — likely out of your league or budget.`, checks };
  if (!erOk) return { ...base, level: "slight", label: LEVEL_LABEL.slight, why: `The views are there (${short(views)}), but ${er}% engagement is under your ${criteria.min_er}% minimum.`, checks };
  return { ...base, level: "fits", label: LEVEL_LABEL.fits, why: base.plus ? `${short(views)} avg views, ${er}% engagement and ${short(subs)} subscribers — everything you look for.` : `${short(views)} avg views and ${er}% engagement — a smaller channel${subs ? ` (${short(subs)} subscribers)` : ""}, which is fine.`, checks };
}

/** The verdict for a saved influencer: their own numbers (your edits win), YouTube's subscriber count. */
export const verdictOf = (c: Pick<Creator, "avg_views" | "engagement_rate" | "youtube" | "socials" | "platform">, criteria?: YouTubeCriteria) =>
  judge({ views: n(c.avg_views), er: n(c.engagement_rate), subs: youtubeSubs(c), youtube: hasYouTube(c) }, criteria);
