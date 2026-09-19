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

export const toCSV = (rows: Record<string, string | number | boolean | null | undefined>[]) => {
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
  return [keys.map(escape).join(","), ...rows.map((row) => keys.map((key) => escape(row[key])).join(","))].join("\n");
};

export const isValidEmail = (value: string) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const isValidUrl = (value: string) => !value || /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}/i.test(value);

export const followupWords = (count: number) =>
  count <= 0 ? "No follow-ups yet" : count === 1 ? "Followed up once" : count === 2 ? "Followed up twice" : `Followed up ${count} times`;