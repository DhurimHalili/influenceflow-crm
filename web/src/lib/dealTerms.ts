// How the brand pays. Every common structure for creator sponsorships, with
// the revenue math — so "Brand pays" (and therefore your profit) is always
// computed the same way, from the terms you agreed.
//
// The brand side is separate from the creator side: you can sell a CPM deal to
// the brand and still pay the creator a fixed fee (that's where the risk —
// and the upside — sits with you), or pass a % on.

export type BrandModel =
  | "flat" | "guaranteed_views" | "cpm" | "hybrid" | "bonus_tiers"
  | "cpa" | "rev_share" | "cpc" | "cpi" | "cpl"
  | "retainer" | "usage_rights" | "whitelisting" | "ugc" | "gifted";

export type BonusTier = { views: number; bonus: number };
export type BrandTerms = {
  model: BrandModel;
  /** Flat / UGC / guaranteed / licensing price, or the base of a hybrid. */
  fee?: number;
  cpm?: number;
  /** Views counted only within this many days after posting (CPM deals). */
  window_days?: number;
  /** Most the brand will pay (CPM / performance deals). */
  cap?: number;
  /** Least the brand will pay (a minimum guarantee). */
  floor?: number;
  est_views?: number;
  actual_views?: number;
  guaranteed_views?: number;
  /** Per sale / click / install / lead. */
  unit_rate?: number;
  est_units?: number;
  actual_units?: number;
  rev_share_pct?: number;
  est_sales?: number;
  actual_sales?: number;
  monthly_fee?: number;
  months?: number;
  term_days?: number;
  product_value?: number;
  tiers?: BonusTier[];
  /** Hybrid: which performance part rides on top of the base fee. */
  kicker?: "cpm" | "cpa" | "rev_share";
};

export type ModelInfo = { id: BrandModel; label: string; group: "Fixed" | "Performance" | "Rights & retainers"; blurb: string; example: string };
export const BRAND_MODELS: ModelInfo[] = [
  { id: "flat", label: "Flat fee", group: "Fixed", blurb: "One agreed price for the deliverables, whatever the video does.", example: "5,000 for one integrated video" },
  { id: "guaranteed_views", label: "Flat + view guarantee", group: "Fixed", blurb: "A flat fee, but you promise a minimum number of views — miss it and you owe a make-good post or a partial refund.", example: "6,000 guaranteed 150k views in 30 days" },
  { id: "ugc", label: "UGC (content only)", group: "Fixed", blurb: "The creator makes the video, the brand posts it. No posting on the creator's channel.", example: "800 per video, raw files included" },
  { id: "gifted", label: "Gifted / seeding", group: "Fixed", blurb: "Product instead of cash. Worth tracking for relationships, not revenue.", example: "Product worth 300, optional post" },
  { id: "cpm", label: "CPM (views)", group: "Performance", blurb: "The brand pays per 1,000 views — counted only for a set window after posting (often 30 days). Views after the window don't count, even if the video takes off.", example: "25 per 1,000 views for 30 days, capped at 10,000" },
  { id: "hybrid", label: "Hybrid: base + performance", group: "Performance", blurb: "A guaranteed base fee plus a performance kicker (CPM, per sale or % of sales) on top.", example: "2,000 base + 15 CPM over 30 days" },
  { id: "bonus_tiers", label: "Base + view bonuses", group: "Performance", blurb: "A base fee with bonuses unlocked when the video crosses view milestones.", example: "3,000 + 1,000 at 200k views + 2,000 at 500k" },
  { id: "cpa", label: "CPA / per sale", group: "Performance", blurb: "A fixed amount per purchase made through the creator's link or code.", example: "12 per sale" },
  { id: "rev_share", label: "Revenue share / affiliate %", group: "Performance", blurb: "A percentage of the sales the creator drives (affiliate commission).", example: "15% of tracked sales" },
  { id: "cpi", label: "CPI / per install", group: "Performance", blurb: "Per app or game install — common for mobile games.", example: "1.50 per install" },
  { id: "cpl", label: "CPL / per sign-up", group: "Performance", blurb: "Per lead, trial or sign-up.", example: "4 per sign-up" },
  { id: "cpc", label: "CPC / per click", group: "Performance", blurb: "Per click on the creator's link.", example: "0.40 per click" },
  { id: "retainer", label: "Retainer / ambassador", group: "Rights & retainers", blurb: "A monthly fee for an ongoing partnership (a set number of posts each month).", example: "4,000 / month for 6 months" },
  { id: "usage_rights", label: "Usage rights / licensing", group: "Rights & retainers", blurb: "The brand pays to use the creator's content in its own ads for a set term.", example: "1,500 for 90 days of paid usage" },
  { id: "whitelisting", label: "Whitelisting / Spark Ads", group: "Rights & retainers", blurb: "The brand runs ads through the creator's own account for a set term.", example: "2,000 for 30 days of Spark Ads" },
];
export const modelInfo = (id: BrandModel) => BRAND_MODELS.find((m) => m.id === id) || BRAND_MODELS[0];

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
};
const bound = (value: number, t: BrandTerms) => {
  let v = value;
  if (n(t.floor)) v = Math.max(v, n(t.floor));
  if (n(t.cap)) v = Math.min(v, n(t.cap));
  return Math.round(v * 100) / 100;
};

/** Performance part only (no base), for a given views / units / sales scenario. */
const performance = (t: BrandTerms, views: number, units: number, sales: number, kind: "cpm" | "cpa" | "rev_share" | "unit") => {
  if (kind === "cpm") return (n(t.cpm) * views) / 1000;
  if (kind === "rev_share") return (n(t.rev_share_pct) / 100) * sales;
  return n(t.unit_rate) * units;
};

export type Revenue = {
  /** What we expect the brand to pay with today's estimates. */
  expected: number;
  /** What the brand owes from actual results, when they're in. */
  actual: number | null;
  /** Lowest / highest the brand could pay under these terms (null = unbounded). */
  low: number;
  high: number | null;
  formula: string;
  /** A guarantee you might owe a make-good on. */
  warning?: string;
};

const fmt = (v: number) => Math.round(v).toLocaleString("en-US");

export function brandRevenue(t: BrandTerms): Revenue {
  const est = { views: n(t.est_views), units: n(t.est_units), sales: n(t.est_sales) };
  const act = { views: n(t.actual_views), units: n(t.actual_units), sales: n(t.actual_sales) };
  const hasActual = act.views > 0 || act.units > 0 || act.sales > 0;
  const fee = n(t.fee);
  switch (t.model) {
    case "flat":
    case "ugc":
      return { expected: fee, actual: null, low: fee, high: fee, formula: `${fmt(fee)} flat` };
    case "gifted":
      return { expected: 0, actual: null, low: 0, high: 0, formula: n(t.product_value) ? `Product worth ${fmt(n(t.product_value))} — no cash` : "Product only — no cash" };
    case "guaranteed_views": {
      const short = act.views > 0 && n(t.guaranteed_views) > 0 && act.views < n(t.guaranteed_views);
      return { expected: fee, actual: null, low: fee, high: fee, formula: `${fmt(fee)} flat · ${fmt(n(t.guaranteed_views))} views guaranteed${n(t.window_days) ? ` in ${n(t.window_days)} days` : ""}`, warning: short ? `Only ${fmt(act.views)} of ${fmt(n(t.guaranteed_views))} guaranteed views — a make-good is likely owed` : undefined };
    }
    case "cpm": {
      const window = n(t.window_days) ? ` · views in the first ${n(t.window_days)} days` : "";
      return { expected: bound(performance(t, est.views, 0, 0, "cpm"), t), actual: hasActual ? bound(performance(t, act.views, 0, 0, "cpm"), t) : null, low: n(t.floor), high: n(t.cap) || null, formula: `${fmt(n(t.cpm))} per 1,000 views${window}${n(t.cap) ? ` · capped at ${fmt(n(t.cap))}` : ""}${n(t.floor) ? ` · minimum ${fmt(n(t.floor))}` : ""}` };
    }
    case "hybrid": {
      const kicker = t.kicker || "cpm";
      const unit = kicker === "cpm" ? "cpm" : kicker === "rev_share" ? "rev_share" : "unit";
      const extra = (s: typeof est) => bound(performance(t, s.views, s.units, s.sales, unit), { ...t, floor: 0 });
      const desc = kicker === "cpm" ? `${fmt(n(t.cpm))} CPM${n(t.window_days) ? ` (${n(t.window_days)} days)` : ""}` : kicker === "rev_share" ? `${n(t.rev_share_pct)}% of sales` : `${fmt(n(t.unit_rate))} per sale`;
      return { expected: fee + extra(est), actual: hasActual ? fee + extra(act) : null, low: fee, high: n(t.cap) ? fee + n(t.cap) : null, formula: `${fmt(fee)} base + ${desc}${n(t.cap) ? ` (bonus capped at ${fmt(n(t.cap))})` : ""}` };
    }
    case "bonus_tiers": {
      const tiers = (t.tiers || []).filter((x) => n(x.views) && n(x.bonus)).sort((a, b) => a.views - b.views);
      const at = (views: number) => fee + tiers.filter((x) => views >= x.views).reduce((s, x) => s + x.bonus, 0);
      return { expected: at(est.views), actual: hasActual ? at(act.views) : null, low: fee, high: fee + tiers.reduce((s, x) => s + x.bonus, 0), formula: `${fmt(fee)} base${tiers.map((x) => ` + ${fmt(x.bonus)} at ${fmt(x.views)} views`).join("")}` };
    }
    case "cpa":
    case "cpi":
    case "cpl":
    case "cpc": {
      const per = { cpa: "sale", cpi: "install", cpl: "sign-up", cpc: "click" }[t.model];
      return { expected: bound(performance(t, 0, est.units, 0, "unit"), t), actual: hasActual ? bound(performance(t, 0, act.units, 0, "unit"), t) : null, low: n(t.floor), high: n(t.cap) || null, formula: `${fmt(n(t.unit_rate))} per ${per}${n(t.cap) ? ` · capped at ${fmt(n(t.cap))}` : ""}${n(t.floor) ? ` · minimum ${fmt(n(t.floor))}` : ""}` };
    }
    case "rev_share":
      return { expected: bound(performance(t, 0, 0, est.sales, "rev_share"), t), actual: hasActual ? bound(performance(t, 0, 0, act.sales, "rev_share"), t) : null, low: n(t.floor), high: n(t.cap) || null, formula: `${n(t.rev_share_pct)}% of tracked sales${n(t.floor) ? ` · minimum ${fmt(n(t.floor))}` : ""}${n(t.cap) ? ` · capped at ${fmt(n(t.cap))}` : ""}` };
    case "retainer": {
      const total = n(t.monthly_fee) * Math.max(1, n(t.months) || 1);
      return { expected: total, actual: null, low: total, high: total, formula: `${fmt(n(t.monthly_fee))} / month × ${Math.max(1, n(t.months) || 1)} months` };
    }
    case "usage_rights":
    case "whitelisting":
      return { expected: fee, actual: null, low: fee, high: fee, formula: `${fmt(fee)} for ${n(t.term_days) || 30} days of ${t.model === "whitelisting" ? "ads through the creator's account" : "paid usage"}` };
  }
}

/** The number "Brand pays" should show: actual results once they're in, else the estimate. */
export const brandPays = (t: BrandTerms) => {
  const r = brandRevenue(t);
  return r.actual ?? r.expected;
};

export const isPerformance = (m: BrandModel) => ["cpm", "hybrid", "bonus_tiers", "cpa", "rev_share", "cpi", "cpl", "cpc"].includes(m);

export const normalizeTerms = (value: unknown): BrandTerms => {
  const v = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  const model = BRAND_MODELS.some((m) => m.id === v.model) ? (v.model as BrandModel) : "flat";
  const out: BrandTerms = { model };
  for (const key of ["fee", "cpm", "window_days", "cap", "floor", "est_views", "actual_views", "guaranteed_views", "unit_rate", "est_units", "actual_units", "rev_share_pct", "est_sales", "actual_sales", "monthly_fee", "months", "term_days", "product_value"] as const) {
    const x = n(v[key]);
    if (x) out[key] = x;
  }
  if (v.kicker === "cpa" || v.kicker === "rev_share" || v.kicker === "cpm") out.kicker = v.kicker;
  if (Array.isArray(v.tiers)) out.tiers = v.tiers.map((x) => ({ views: n((x as BonusTier)?.views), bonus: n((x as BonusTier)?.bonus) })).filter((x) => x.views && x.bonus).slice(0, 6);
  return out;
};
