// Smart time: when each follow-up goes out, so it reads like a person sent it.
//
//   • Inside THEIR day: 8:00–22:00 where they live (a country with several
//     zones = awake in all of them). No country → your own day, but as close
//     as possible to when you first emailed them.
//   • Close to the time of day you first emailed them (±1 h is "the same
//     time"); your last follow-up's time is the second choice.
//   • Never on another day: everything goes out before YOUR midnight.
//   • Never mechanical: no :00 / :15 / :30 when another minute is as good, odd
//     seconds, and sends from one mailbox kept apart (as far as the evening
//     allows — 20 sends in 3 hours sit ~4–9 minutes apart; 100 sit closer).
//   • Tight evening: people with a known country are placed first (their
//     window is the one that closes); no-country people take what's left,
//     even hours away from their first email's time.
// Pure — no React, no DOM. The server plans with the same code.

import { clockIn, dayEndIn, localMinute, validZone } from "./zones.ts";

export const AWAKE_FROM = 8 * 60;
/** Last minute a send may land in their day (21:59). */
export const AWAKE_TO = 22 * 60 - 1;
const MIN = 60_000;

export type PlanItem = {
  id: string;
  mailbox: string;
  /** Their time zones ([] = country unknown). */
  zones: string[];
  /** When the email this thread started with went out (ms). */
  firstAt: number;
  /** When your last follow-up went out (ms), if there was one. */
  lastAt?: number;
  /** Placed earlier among equals (e.g. days overdue). */
  weight?: number;
};

export type PlanOptions = {
  now: number;
  userZone: string;
  /** Earliest send (default: 2 minutes from now). */
  from?: number;
  /** Latest send (default: 3 minutes before your midnight). */
  until?: number;
  /** Sends already queued — kept apart from like any other. */
  taken?: { mailbox: string; at: number }[];
  /** Same seed → same plan (preview and start agree). */
  seed?: number;
};

export type Placed = { id: string; at: number; zone: string; theirClock: string; offBy: number };
export type Unplaced = { id: string; why: "asleep" | "full"; zone: string; theirClock: string; opensAt: number | null };
export type Plan = { placed: Placed[]; unplaced: Unplaced[]; from: number; until: number; gap: number };

/** A cheap, stable hash (FNV-1a) — the "random" in a plan is repeatable. */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
const circ = (a: number, b: number) => { const d = Math.abs(a - b) % 1440; return Math.min(d, 1440 - d); };

/** The send window for a plan: from now (+2 min) to just before your midnight. */
export function dayWindow(now: number, userZone: string, from?: number, until?: number) {
  const zone = validZone(userZone) ? userZone : "UTC";
  const start = Math.ceil(Math.max(now + 2 * MIN, from ?? 0) / MIN) * MIN;
  const end = Math.min(until ?? Infinity, dayEndIn(zone, now) - 3 * MIN);
  return { start, end: Math.floor(end / MIN) * MIN, zone };
}

/** Is everyone in these zones awake at this instant? */
export const awakeAt = (zones: string[], ms: number) => zones.every((z) => { const m = localMinute(z, ms); return m >= AWAKE_FROM && m <= AWAKE_TO; });

/** The next instant their day starts (all zones awake), looking up to 30 h ahead. */
export function opensAt(zones: string[], from: number): number | null {
  if (!zones.length) return null;
  for (let t = Math.ceil(from / (5 * MIN)) * 5 * MIN; t < from + 30 * 3_600_000; t += 5 * MIN) if (awakeAt(zones, t)) return t;
  return null;
}

/**
 * Times for every item, or why one can't go today. Known-country people are
 * placed first (their window closes), each at the cheapest free minute:
 * close to their first email's time of day, human-looking, apart from the
 * other sends of the same mailbox.
 */
export function planTimes(items: PlanItem[], opts: PlanOptions): Plan {
  const { start, end, zone: userZone } = dayWindow(opts.now, opts.userZone, opts.from, opts.until);
  const len = end >= start ? Math.floor((end - start) / MIN) + 1 : 0;
  const seed = opts.seed ?? 0;
  if (!items.length) return { placed: [], unplaced: [], from: start, until: end, gap: 0 };
  const ok = items.map((it) => ({ ...it, zones: it.zones.filter(validZone) }));
  // Local minute of every grid minute, per zone (computed once).
  const zoneSet = new Set<string>([userZone]);
  for (const it of ok) for (const z of it.zones) zoneSet.add(z);
  const local = new Map<string, Int16Array>();
  for (const z of zoneSet) { const a = new Int16Array(len); for (let i = 0; i < len; i++) a[i] = localMinute(z, start + i * MIN); local.set(z, a); }

  type Row = (typeof ok)[number] & { ref: string; awake: Uint8Array; size: number; anchor: number; second: number | null; known: boolean };
  const rows: Row[] = ok.map((it) => {
    const known = it.zones.length > 0;
    const ref = known ? it.zones[0] : userZone;
    const awake = new Uint8Array(len);
    let size = 0;
    for (let i = 0; i < len; i++) {
      const yes = known ? it.zones.every((z) => { const m = local.get(z)![i]; return m >= AWAKE_FROM && m <= AWAKE_TO; }) : true;
      if (yes) { awake[i] = 1; size++; }
    }
    const anchor = localMinute(ref, it.firstAt);
    const second = it.lastAt && Math.abs(it.lastAt - it.firstAt) > 5 * MIN ? localMinute(ref, it.lastAt) : null;
    return { ...it, ref, awake, size, anchor, second, known };
  });
  // Known countries first (their window is the one that closes), tightest window first, then the most overdue.
  const order = [...rows].sort((a, b) => Number(b.known) - Number(a.known) || a.size - b.size || (b.weight || 0) - (a.weight || 0) || a.id.localeCompare(b.id));
  const placeable = rows.filter((r) => r.size > 0).length;
  // As far apart as the evening allows: ~4–9 minutes per mailbox, closer only when it's crowded.
  const perBox = new Map<string, number>();
  for (const r of rows) if (r.size) perBox.set(r.mailbox, (perBox.get(r.mailbox) || 0) + 1);
  const busiest = Math.max(1, ...perBox.values());
  const first = Math.max(1, Math.min(9, Math.floor((len / busiest) * 0.5)));

  const attempt = (gap: number) => {
    const boxes = new Map<string, Uint8Array>();
    const any = new Uint8Array(len);
    const occupy = (mailbox: string, i: number) => {
      if (i < 0 || i >= len) return;
      let b = boxes.get(mailbox);
      if (!b) { b = new Uint8Array(len); boxes.set(mailbox, b); }
      b[i] = Math.min(255, b[i] + 1);
      any[i] = Math.min(255, any[i] + 1);
    };
    for (const t of opts.taken || []) occupy(t.mailbox, Math.round((t.at - start) / MIN));
    const placed: Placed[] = [];
    const unplaced: Unplaced[] = [];
    for (const r of order) {
      const theirNow = clockIn(r.ref, opts.now);
      if (!r.size) { unplaced.push({ id: r.id, why: "asleep", zone: r.known ? r.ref : "", theirClock: theirNow, opensAt: opensAt(r.zones, start) }); continue; }
      const box = boxes.get(r.mailbox);
      const loc = local.get(r.ref)!;
      const userLoc = local.get(userZone)!;
      let best = -1, bestCost = Infinity;
      for (let i = 0; i < len; i++) {
        if (!r.awake[i]) continue;
        if (box && gap > 0) {
          let clash = false;
          for (let k = Math.max(0, i - gap + 1); k < Math.min(len, i + gap); k++) if (box[k]) { clash = true; break; }
          if (clash) continue;
        }
        const lm = loc[i];
        const d1 = circ(lm, r.anchor);
        const d = r.second === null ? d1 : Math.min(d1, circ(lm, r.second) + 20);
        let cost = d <= 60 ? d * 0.25 : 15 + (d - 60) * (r.known ? 0.5 : 0.2);
        // Human minutes: nobody types "send at 9:00:00" every time.
        const mm = lm % 60;
        cost += mm % 30 === 0 ? 8 : mm % 15 === 0 ? 5 : mm % 5 === 0 ? 2.5 : 0;
        // Your own small hours, for no-country people in an early-morning plan.
        if (!r.known && userLoc[i] < 7 * 60) cost += 40;
        // Other mailboxes sending the same minute: allowed, just less pretty.
        cost += any[i] * 1.5;
        cost += (hash(`${seed}|${r.id}|${i}`) % 1000) / 1000 * 2.5;
        if (cost < bestCost) { bestCost = cost; best = i; }
      }
      if (best < 0) { unplaced.push({ id: r.id, why: "full", zone: r.known ? r.ref : "", theirClock: theirNow, opensAt: null }); continue; }
      occupy(r.mailbox, best);
      const sec = 3 + (hash(`${seed}|${r.id}|s`) % 55);
      const at = start + best * MIN + sec * 1000;
      placed.push({ id: r.id, at, zone: r.known ? r.ref : "", theirClock: clockIn(r.ref, at), offBy: circ(loc[best], r.anchor) });
    }
    return { placed, unplaced };
  };

  // The widest spacing that still fits everyone who's awake; closer only when it must.
  let out = attempt(first), gap = first;
  for (let g = first - 1; g >= 0 && out.placed.length < placeable; g--) { out = attempt(g); gap = g; }
  out.placed.sort((a, b) => a.at - b.at);
  return { ...out, from: start, until: end, gap };
}
