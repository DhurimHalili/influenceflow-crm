import { formatDistanceToNow, isBefore, parseISO } from "date-fns";

export const uid = () => crypto.randomUUID();

export const today = () => new Date().toISOString().slice(0, 10);

export const sanitize = (value: string) => value.replace(/<[^>]*>/g, "").trim();

export const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value || 0);

export const compact = (value: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);

export const dateLabel = (value?: string | null) => {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
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

export const isOverdue = (value: string) => isBefore(parseISO(value), new Date());

export const download = (name: string, value: string, type = "application/json") => {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const toCSV = (rows: Record<string, string | number | boolean | null | undefined>[], headers?: Record<string, string>) => {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  // Neutralize spreadsheet formula injection: attacker-controlled cells
  // (names, notes, domains) starting with = + - @ tab CR are prefixed so
  // Excel/Sheets treat them as plain text, never as executable formulas.
  const escape = (value: unknown) => {
    let text = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  // BOM first: without it Excel mangles non-ASCII characters. Friendly
  // headers second: raw keys (contact_email) become readable columns (Email).
  const head = keys.map((key) => escape(headers?.[key] ?? key)).join(",");
  return CSV_BOM + [head, ...rows.map((row) => keys.map((key) => escape(row[key])).join(","))].join("\n");
};

export const CSV_BOM = "\ufeff";

export const isValidEmail = (value: string) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const isValidUrl = (value: string) => !value || /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}/i.test(value);

export const followupWords = (count: number) =>
  count <= 0 ? "No follow-ups yet" : count === 1 ? "Followed up once" : count === 2 ? "Followed up twice" : `Followed up ${count} times`;

export const PRIORITY_LABELS: Record<string, string> = { none: "No priority", soon: "Follow up soon", urgent: "Urgent" };
export const MEETING_KIND_LABELS: Record<string, string> = { meeting: "Meeting", task: "Task", reminder: "Reminder" };

export type RatingDimKey = "stars_consistency" | "stars_demographics" | "stars_niche";

export const RATING_DIMS: { key: RatingDimKey; label: string; hint: string }[] = [
  { key: "stars_consistency", label: "Posting consistency", hint: "How reliably they publish" },
  { key: "stars_demographics", label: "Audience demographics", hint: "Who actually watches them" },
  { key: "stars_niche", label: "Niche alignment", hint: "How well they fit your brands" },
];

// Overall rating = average of the dimensions the user actually rated.
// Unrated dimensions never drag the score; nothing rated = 0 (unrated).
export const overallStars = (dims: { stars_consistency?: number | null; stars_demographics?: number | null; stars_niche?: number | null }) => {
  const rated = [dims.stars_consistency || 0, dims.stars_demographics || 0, dims.stars_niche || 0].filter((v) => v > 0);
  if (!rated.length) return 0;
  return Math.min(5, Math.max(0, Math.round(rated.reduce((a, b) => a + b, 0) / rated.length)));
};

// Engagement score: measured performance mapped to stars, kept separate
// from the user's own ratings. Bands match the labels used across the app:
// under 4% needs review (1-2), 4-8% healthy (3-4), 8%+ high performer (5).
export const engagementStars = (rate: number) => {
  const v = Number(rate) || 0;
  if (v <= 0) return 0;
  if (v < 2) return 1;
  if (v < 4) return 2;
  if (v < 6) return 3;
  if (v < 8) return 4;
  return 5;
};

export const isPastDay = (value?: string | null) => {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
};

export const isTodayDay = (value?: string | null) => {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
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