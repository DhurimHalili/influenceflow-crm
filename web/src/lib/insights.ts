import type { Creator, EmailEvent, RateCard } from "../types";

// Insights from data you already have — nothing is sent anywhere.
//   • Reply speed: for each email you sent, how long until they answered.
//   • Best time to email: which weekday / time of day gets replies, from your
//     own sent mail (only emails that started a round count, not the chasers).
//   • Price intelligence: a creator's price per 1,000 views (CPM) against
//     similar creators in your CRM — same niche, then same country, then all.

const H = 3600_000;
const median = (list: number[]) => {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export type ReplySpeed = { replies: number; asked: number; medianHours: number; fastestHours: number; replyRate: number; usualDay: string; usualPart: string };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const PARTS = [
  { key: "morning", label: "Morning", hint: "6–12", from: 6, to: 12 },
  { key: "afternoon", label: "Afternoon", hint: "12–17", from: 12, to: 17 },
  { key: "evening", label: "Evening", hint: "17–22", from: 17, to: 22 },
  { key: "night", label: "Night", hint: "22–6", from: 22, to: 30 },
] as const;
const partOf = (d: Date) => {
  const h = d.getHours() < 6 ? d.getHours() + 24 : d.getHours();
  return PARTS.find((p) => h >= p.from && h < p.to)!;
};

/** Your emails and their replies with one person, in time order, one per Gmail message. */
const threadOf = (events: EmailEvent[], id: string) => {
  const seen = new Set<string>();
  // Scheduled sends haven't gone out: no reply timing from them yet.
  return events.filter((e) => e.entity_id === id && !e.scheduled && !seen.has(e.gmail_id) && seen.add(e.gmail_id)).sort((a, b) => a.at.localeCompare(b.at));
};

export function replySpeed(events: EmailEvent[], creatorId: string): ReplySpeed | null {
  const list = threadOf(events, creatorId);
  if (!list.length) return null;
  const gaps: number[] = [];
  let asked = 0;
  let waitingSince: number | null = null;
  for (const e of list) {
    const t = new Date(e.at).getTime();
    if (e.direction === "out") {
      if (waitingSince === null) { waitingSince = t; asked++; }
    } else if (waitingSince !== null) {
      gaps.push((t - waitingSince) / H);
      waitingSince = null;
    }
  }
  const ins = list.filter((e) => e.direction === "in");
  const dayCount = new Map<number, number>();
  const partCount = new Map<string, number>();
  for (const e of ins) {
    const d = new Date(e.at);
    dayCount.set(d.getDay(), (dayCount.get(d.getDay()) || 0) + 1);
    partCount.set(partOf(d).label, (partCount.get(partOf(d).label) || 0) + 1);
  }
  const top = <K,>(m: Map<K, number>) => Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0];
  const d = ins.length >= 2 ? top(dayCount) : undefined;
  const p = ins.length >= 2 ? top(partCount) : undefined;
  return { replies: gaps.length, asked, medianHours: median(gaps), fastestHours: gaps.length ? Math.min(...gaps) : 0, replyRate: asked ? gaps.length / asked : 0, usualDay: d && d[1] >= 2 ? LONG_DAYS[d[0]] : "", usualPart: p && p[1] >= 2 ? p[0].toLowerCase() : "" };
}

export const hoursLabel = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 36 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`);

export type TimeCell = { day: number; part: string; sent: number; replied: number; rate: number };
/** Reply rate by weekday × time of day for first emails / new rounds, replies counted within 5 days. */
export function bestTimes(events: EmailEvent[]): { cells: TimeCell[]; best: TimeCell | null; total: number; overall: number } {
  const byEntity = new Map<string, EmailEvent[]>();
  for (const e of events) byEntity.set(e.entity_id, [...(byEntity.get(e.entity_id) || []), e]);
  const cells = new Map<string, TimeCell>();
  let total = 0;
  let replied = 0;
  for (const id of byEntity.keys()) {
    const list = threadOf(events, id);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.direction !== "out" || (i > 0 && list[i - 1].direction === "out")) continue; // a chaser, not a new round
      const at = new Date(e.at);
      const reply = list.slice(i + 1).find((x) => x.direction === "in");
      const got = !!reply && new Date(reply.at).getTime() - at.getTime() <= 5 * 24 * H;
      const key = `${at.getDay()}|${partOf(at).key}`;
      const cell = cells.get(key) || { day: at.getDay(), part: partOf(at).key, sent: 0, replied: 0, rate: 0 };
      cell.sent++;
      if (got) cell.replied++;
      cells.set(key, cell);
      total++;
      if (got) replied++;
    }
  }
  const out = Array.from(cells.values()).map((c) => ({ ...c, rate: c.sent ? c.replied / c.sent : 0 }));
  const overall = total ? replied / total : 0;
  // Needs enough emails to mean something — and a smoothed rate so one lucky reply doesn't win.
  const score = (c: TimeCell) => (c.replied + overall * 5) / (c.sent + 5);
  const best = out.filter((c) => c.sent >= 8).sort((a, b) => score(b) - score(a))[0] || null;
  return { cells: out, best, total, overall };
}
export const dayName = (d: number) => DAYS[d];
export const longDay = (d: number) => LONG_DAYS[d];

// ---- price intelligence ------------------------------------------------------------

export type PriceKey = keyof Pick<RateCard, "video" | "dedicated" | "short">;
export const PRICE_LABEL: Record<PriceKey, string> = { video: "Integrated", dedicated: "Dedicated", short: "Short" };
export type PriceIntel = { key: PriceKey; cpm: number; peerCpm: number; diffPct: number; peers: number; group: string };

const viewsOf = (c: Creator) => (c.audience?.verified?.avg_views && c.audience.verified.avg_views > 0 ? c.audience.verified.avg_views : c.avg_views) || 0;
export const cpmOf = (c: Creator, key: PriceKey) => {
  const views = viewsOf(c);
  const rate = Number(c.rates?.[key]) || 0;
  return views > 0 && rate > 0 ? (rate / views) * 1000 : 0;
};
const same = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export function priceIntel(creator: Creator, all: Creator[]): PriceIntel[] {
  const out: PriceIntel[] = [];
  for (const key of ["video", "dedicated", "short"] as PriceKey[]) {
    const cpm = cpmOf(creator, key);
    if (!cpm) continue;
    const pool = all.filter((c) => c.id !== creator.id && !c.archived_at && cpmOf(c, key) > 0);
    const groups: [string, Creator[]][] = [
      [`${creator.niche} creators in ${creator.country}`, pool.filter((c) => same(c.niche, creator.niche) && same(c.country, creator.country))],
      [`${creator.niche} creators`, pool.filter((c) => same(c.niche, creator.niche))],
      [`creators in ${creator.country}`, pool.filter((c) => same(c.country, creator.country))],
      ["creators in your CRM", pool],
    ];
    const [group, peers] = groups.find(([, list]) => list.length >= 3) || ["", []];
    if (!peers.length) continue;
    const peerCpm = median(peers.map((c) => cpmOf(c, key)));
    if (!peerCpm) continue;
    out.push({ key, cpm, peerCpm, diffPct: Math.round(((cpm - peerCpm) / peerCpm) * 100), peers: peers.length, group });
  }
  return out;
}
