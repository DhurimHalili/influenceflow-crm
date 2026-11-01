import type { Currency, PayoutModel, RateCard, WorkspacePreferences } from "../types";

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
  default_deal_model: "fixed",
  email_signature: "",
  action_digest: true,
  start_page: "dashboard",
};

export const EMPTY_RATES: RateCard = { video: 0, dedicated: 0, short: 0, post: 0, carousel: 0, story: 0, stream: 0, podcast: 0, ugc: 0, link_in_bio: 0, usage_rights: 0, exclusivity: 0 };

export type RateGroup = "video" | "social" | "live" | "addon";
export type RateField = { key: keyof RateCard; label: string; short: string; hint: string; group: RateGroup };

// Every way a sponsorship is usually sold. Integrated and dedicated are
// separate prices — a dedicated video costs several times an integration.
// Add-ons are priced on top of a deliverable, so they never get a CPM.
export const RATE_FIELDS: RateField[] = [
  { key: "video", label: "Integrated video", short: "Integrated", hint: "60–90 s sponsored segment inside a video", group: "video" },
  { key: "dedicated", label: "Dedicated video", short: "Dedicated", hint: "A full video about the brand", group: "video" },
  { key: "short", label: "Short / Reel / TikTok", short: "Short", hint: "Vertical short-form video", group: "video" },
  { key: "post", label: "Feed post", short: "Post", hint: "Single image / video post", group: "social" },
  { key: "carousel", label: "Carousel", short: "Carousel", hint: "Multi-slide post", group: "social" },
  { key: "story", label: "Story set", short: "Stories", hint: "3-frame story with link", group: "social" },
  { key: "stream", label: "Live stream", short: "Stream", hint: "Sponsored segment / hour on stream", group: "live" },
  { key: "podcast", label: "Podcast ad read", short: "Podcast", hint: "Host-read audio spot", group: "live" },
  { key: "ugc", label: "UGC (no posting)", short: "UGC", hint: "Content for the brand's own channels", group: "live" },
  { key: "link_in_bio", label: "Link in bio / pinned", short: "Link in bio", hint: "Add-on · e.g. 7 days", group: "addon" },
  { key: "usage_rights", label: "Usage rights", short: "Usage", hint: "Add-on · paid ads / whitelisting, per 30 days", group: "addon" },
  { key: "exclusivity", label: "Exclusivity", short: "Exclusivity", hint: "Add-on · no competitors, per month", group: "addon" },
];

export const RATE_GROUPS: { id: RateGroup; label: string }[] = [
  { id: "video", label: "Video" },
  { id: "social", label: "Social posts" },
  { id: "live", label: "Live, audio & UGC" },
  { id: "addon", label: "Add-ons" },
];

/** Deliverables a brand can buy on their own (add-ons excluded). */
export const DELIVERABLE_RATES = RATE_FIELDS.filter((f) => f.group !== "addon");

const isCurrency = (value: unknown): value is Currency => CURRENCIES.some((c) => c.value === value);

export const normalizePreferences = (value: unknown): WorkspacePreferences => {
  const v = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const pct = Number(v.default_creator_percent);
  return {
    agency_name: typeof v.agency_name === "string" ? v.agency_name : "",
    currency: isCurrency(v.currency) ? v.currency : DEFAULT_PREFERENCES.currency,
    default_creator_percent: Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : DEFAULT_PREFERENCES.default_creator_percent,
    default_deal_model: v.default_deal_model === "percent" ? "percent" : ("fixed" as PayoutModel),
    email_signature: typeof v.email_signature === "string" ? v.email_signature : "",
    action_digest: v.action_digest !== false,
    start_page: v.start_page === "influencers" || v.start_page === "calendar" ? v.start_page : "dashboard",
  };
};

export const normalizeRates = (value: unknown): RateCard => {
  const v = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const n = (key: string) => Math.max(0, Number(v[key]) || 0);
  return Object.fromEntries(Object.keys(EMPTY_RATES).map((key) => [key, n(key)])) as unknown as RateCard;
};

// Cost per 1,000 views for a deliverable price — the number brands compare.
export const cpm = (price: number, avgViews: number) => (price > 0 && avgViews > 0 ? (price / avgViews) * 1000 : 0);
