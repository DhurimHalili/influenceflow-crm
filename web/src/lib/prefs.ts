import type { Currency, RateCard, WorkspacePreferences } from "../types";

export const CURRENCIES: { value: Currency; label: string }[] = [
  { value: "USD", label: "US Dollar ($)" },
  { value: "EUR", label: "Euro (€)" },
  { value: "GBP", label: "British Pound (£)" },
  { value: "CHF", label: "Swiss Franc (CHF)" },
  { value: "CAD", label: "Canadian Dollar (CA$)" },
  { value: "AUD", label: "Australian Dollar (A$)" },
];

export const DEFAULT_PREFERENCES: WorkspacePreferences = {
  agency_name: "",
  currency: "USD",
  default_creator_percent: 80,
  email_signature: "",
  action_digest: true,
  start_page: "dashboard",
};

export const EMPTY_RATES: RateCard = { video: 0, short: 0, story: 0, post: 0, stream: 0 };

export const RATE_FIELDS: { key: keyof RateCard; label: string; hint: string }[] = [
  { key: "video", label: "Integrated video", hint: "YouTube integration / dedicated video" },
  { key: "short", label: "Short / Reel / TikTok", hint: "Vertical short-form" },
  { key: "post", label: "Feed post", hint: "Instagram / LinkedIn post" },
  { key: "story", label: "Story set", hint: "3-frame story with link" },
  { key: "stream", label: "Live stream", hint: "Sponsored segment / hour" },
];

const isCurrency = (value: unknown): value is Currency => CURRENCIES.some((c) => c.value === value);

export const normalizePreferences = (value: unknown): WorkspacePreferences => {
  const v = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const pct = Number(v.default_creator_percent);
  return {
    agency_name: typeof v.agency_name === "string" ? v.agency_name : "",
    currency: isCurrency(v.currency) ? v.currency : DEFAULT_PREFERENCES.currency,
    default_creator_percent: Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : DEFAULT_PREFERENCES.default_creator_percent,
    email_signature: typeof v.email_signature === "string" ? v.email_signature : "",
    action_digest: v.action_digest !== false,
    start_page: v.start_page === "influencers" || v.start_page === "calendar" ? v.start_page : "dashboard",
  };
};

export const normalizeRates = (value: unknown): RateCard => {
  const v = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const n = (key: string) => Math.max(0, Number(v[key]) || 0);
  return { video: n("video"), short: n("short"), story: n("story"), post: n("post"), stream: n("stream") };
};

// Cost per 1,000 views for a deliverable price — the number brands compare.
export const cpm = (price: number, avgViews: number) => (price > 0 && avgViews > 0 ? (price / avgViews) * 1000 : 0);
