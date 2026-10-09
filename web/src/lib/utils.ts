import { formatDistanceToNow, isBefore } from "date-fns";

export const uid = () => crypto.randomUUID();

// Local calendar date (YYYY-MM-DD). toISOString() is UTC and returns
// yesterday's date after midnight for anyone east of Greenwich.
export const today = () => dayKey(new Date());

export const sanitize = (value: string) => value.replace(/<[^>]*>/g, "").trim();

// Workspace currency, set once by the data layer from the user's settings,
// so every money() call across the app follows it.
let activeCurrency = "USD";
export const setActiveCurrency = (currency: string) => {
  activeCurrency = currency || "USD";
};
export const currencySymbol = () =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: activeCurrency }).formatToParts(0).find((p) => p.type === "currency")?.value || "$";

export const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: activeCurrency, maximumFractionDigits: 0 }).format(value || 0);

export const compact = (value: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);

export const dateLabel = (value?: string | null) => {
  const d = parseDay(value);
  if (!d) return "Not set";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);
};

export const shortDate = (value?: string | null) => {
  const d = parseDay(value);
  if (!d) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }).format(d);
};

// "Due today", "Due tomorrow", "Overdue · 3 days", "Due Friday", "Due Oct 12".
export const dueLabel = (value?: string | null) => {
  const d = parseDay(value);
  if (!d) return "";
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - start.getTime()) / 86400000);
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff < 0) return `Overdue · ${-diff} day${diff === -1 ? "" : "s"}`;
  if (diff < 7) return `Due ${new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(d)}`;
  return `Due ${shortDate(value)}`;
};

export const timeLabel = (value: string) =>
  new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));

export const relativeTime = (value: string) => formatDistanceToNow(new Date(value), { addSuffix: true });

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/\/+$/, "");

// A due DATE is overdue only once that whole day has passed.
export const isOverdue = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return isPastDay(value);
  const d = parseDay(value);
  return d ? isBefore(d, new Date()) : false;
};

export const download = (name: string, value: string, type = "application/json") => {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = "none";
  // In the DOM and revoked later: Safari/Firefox can drop a download whose
  // object URL is revoked in the same tick as the click.
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 4000);
};

export const toCSV = (rows: Record<string, string | number | boolean | null | undefined>[], headers?: Record<string, string>, delimiter: "," | ";" = ",") => {
  if (!rows.length) return "";
  // Union of keys across all rows, in first-seen order, so no column is ever
  // dropped because the first record happened to lack it.
  const keys: string[] = [];
  for (const row of rows) for (const key of Object.keys(row)) if (!keys.includes(key)) keys.push(key);
  // Neutralize spreadsheet formula injection: attacker-controlled cells
  // (names, notes, domains) starting with = + - @ tab CR are prefixed so
  // Excel/Sheets treat them as plain text, never as executable formulas.
  // Plain negative numbers are left alone.
  const escape = (value: unknown) => {
    let text = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  // BOM first: without it Excel mangles non-ASCII characters. Friendly
  // headers second: raw keys (contact_email) become readable columns (Email).
  const head = keys.map((key) => escape(headers?.[key] ?? key)).join(delimiter);
  return CSV_BOM + [head, ...rows.map((row) => keys.map((key) => escape(row[key])).join(delimiter))].join("\r\n");
};

export const CSV_BOM = "\ufeff";

export const isValidEmail = (value: string) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const isValidUrl = (value: string) => !value || /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}/i.test(value);

export const followupWords = (count: number) =>
  count <= 0 ? "No follow-ups yet" : count === 1 ? "Followed up once" : count === 2 ? "Followed up twice" : `Followed up ${count} times`;

export const PRIORITY_LABELS: Record<string, string> = { none: "No priority", soon: "Follow up soon", urgent: "Urgent" };
export const MEETING_KIND_LABELS: Record<string, string> = { meeting: "Meeting", task: "Task", reminder: "Reminder" };

export type RatingDimKey = "stars_demographics" | "stars_niche" | "stars_engagement" | "stars_consistency";
export type WeightKey = "audience" | "niche" | "engagement" | "consistency";

// Ordered by how much each factor moves campaign results in influencer
// marketing: who the audience is decides whether a brand buys at all, niche
// fit decides whether the message lands, engagement is the quality-of-
// attention signal (and the best fake-follower tell), consistency is
// reliability — important, but the easiest gap to manage with a brief.
export const RATING_DIMS: { key: RatingDimKey; weight: WeightKey; label: string; short: string; hint: string }[] = [
  { key: "stars_demographics", weight: "audience", label: "Audience quality & demographics", short: "Audience", hint: "Right age, geo and gender for your brands — and real followers" },
  { key: "stars_niche", weight: "niche", label: "Niche & brand fit", short: "Brand fit", hint: "Content, tone and values match the brands you pitch" },
  { key: "stars_engagement", weight: "engagement", label: "Engagement quality", short: "Engagement", hint: "Your call — comments, saves and community, not just the ER number" },
  { key: "stars_consistency", weight: "consistency", label: "Posting consistency", short: "Consistency", hint: "Publishes reliably and delivers on time" },
];

export type RatingWeightsValue = Record<WeightKey, number>;

// Market-standard agency scorecard weights (percent, sums to 100).
export const DEFAULT_RATING_WEIGHTS: RatingWeightsValue = { audience: 35, niche: 30, engagement: 20, consistency: 15 };

export const resolveWeights = (weights?: Partial<RatingWeightsValue> | null): RatingWeightsValue => {
  const merged = { ...DEFAULT_RATING_WEIGHTS, ...(weights || {}) };
  const clean = Object.fromEntries(
    Object.entries(merged).map(([k, v]) => [k, Math.max(0, Number.isFinite(Number(v)) ? Number(v) : 0)]),
  ) as RatingWeightsValue;
  return Object.values(clean).some((v) => v > 0) ? clean : DEFAULT_RATING_WEIGHTS;
};

// Share of the overall score each factor carries, in percent (sums to 100).
export const weightShares = (weights?: Partial<RatingWeightsValue> | null) => {
  const w = resolveWeights(weights);
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Math.round((v / total) * 100)])) as RatingWeightsValue;
};

type DimValues = Partial<Record<RatingDimKey, number | null>>;

// Precise weighted score (0-5, one decimal). Only rated dimensions count and
// their weights are re-normalised, so an unrated factor never drags the
// score down, and a factor weighted 0 never moves it.
export const ratingScore = (dims: DimValues, weights?: Partial<RatingWeightsValue> | null) => {
  const w = resolveWeights(weights);
  let total = 0;
  let weightSum = 0;
  for (const dim of RATING_DIMS) {
    const value = Math.min(5, Math.max(0, Math.round(Number(dims[dim.key]) || 0)));
    if (value <= 0 || w[dim.weight] <= 0) continue;
    total += value * w[dim.weight];
    weightSum += w[dim.weight];
  }
  if (!weightSum) return 0;
  return Math.round((total / weightSum) * 10) / 10;
};

// Whole-star value stored in the database (integer column, used by older
// clients and exports).
export const overallStars = (dims: DimValues, weights?: Partial<RatingWeightsValue> | null) =>
  Math.min(5, Math.max(0, Math.round(ratingScore(dims, weights))));

export const ratedCount = (dims: DimValues) => RATING_DIMS.filter((d) => (Number(dims[d.key]) || 0) > 0).length;

export const scoreLabel = (score: number) =>
  score <= 0 ? "Unrated" : score >= 4.5 ? "Top pick" : score >= 3.8 ? "Strong fit" : score >= 3 ? "Solid" : score >= 2 ? "Risky" : "Poor fit";

// Engagement benchmarks per platform (typical healthy ER ranges). Shown as
// context next to the manual engagement rating, never used to set it.
export const ER_BENCHMARKS: Record<string, [number, number]> = {
  YouTube: [2, 5],
  Instagram: [1, 3.5],
  TikTok: [4, 10],
  Twitch: [3, 8],
  LinkedIn: [2, 5],
  Other: [1, 5],
};

export const erContext = (rate: number, platform: string) => {
  const [low, high] = ER_BENCHMARKS[platform] || ER_BENCHMARKS.Other;
  const v = Number(rate) || 0;
  if (v <= 0) return `No engagement rate entered · typical ${platform} range ${low}-${high}%`;
  const verdict = v < low ? "below" : v > high ? "above" : "within";
  return `${v}% is ${verdict} the typical ${platform} range (${low}-${high}%) — reference only`;
};

// Calendar-day helpers. Date-only strings ("2026-10-08") are parsed as LOCAL
// dates: new Date("2026-10-08") is UTC midnight and shows the previous day
// for anyone west of Greenwich.
export const parseDay = (value?: string | null) => {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const isPastDay = (value?: string | null) => {
  const d = parseDay(value);
  if (!d) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
};

export const isTodayDay = (value?: string | null) => {
  const d = parseDay(value);
  if (!d) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

export const LOSS_REASONS = [
  { value: "pricing", label: "Pricing didn't work" },
  { value: "rejected_creators", label: "Rejected the creators" },
  { value: "no_match", label: "No matching creators" },
  { value: "too_slow", label: "Too slow" },
  { value: "low_pay", label: "Offer too low" },
  { value: "competitor", label: "Chose someone else" },
] as const;

export const lossReasonLabel = (value: string) =>
  LOSS_REASONS.find((r) => r.value === value)?.label || "No reason given";

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export const TEMPLATE_TOKENS = ["{first_name}", "{name}", "{niche}", "{platform}", "{channel}", "{company}", "{my_name}", "{agency}", "{signature}"] as const;

// Fills known {tokens}; unknown or empty ones stay visible so nothing is
// silently dropped from an email.
export const fillTemplate = (value: string, vars: Record<string, string>) =>
  value.replace(/\{(first_name|name|niche|platform|channel|my_name|company|domain|agency|signature)\}/g, (match, key: string) => vars[key] || match);

export const unfilledTokens = (value: string) => Array.from(new Set(value.match(/\{(first_name|name|niche|platform|channel|my_name|company|domain|agency|signature)\}/g) || []));

export const gmailComposeUrl = (to: string, subject: string, body: string) =>
  `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

export const mailtoUrl = (to: string, subject: string, body: string) =>
  `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

// Any status past "new" means first contact already happened.
export const OUTREACH_STAGES = ["contacted", "replied", "negotiating", "roster", "signed", "no_reply"];

// Overall score for a record: weighted from the four ratings, falling back to
// a legacy whole-star rating for rows imported before the breakdown existed.
export const creatorScore = (creator: DimValues & { stars?: number | null }, weights?: Partial<RatingWeightsValue> | null) =>
  ratedCount(creator) > 0 ? ratingScore(creator, weights) : Math.min(5, Math.max(0, Number(creator.stars) || 0));
