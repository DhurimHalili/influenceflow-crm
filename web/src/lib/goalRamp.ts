// The weekly ramp for the daily goal (owner's rule): every mailbox sends 10 a day in its first week and 10 more
// each week after, up to 50 a day. The daily goal = the sum over your mailboxes. 2 mailboxes in their 2nd week
// = 40; a mailbox at 20 plus a new one at 10 last week = 30 + 20 = 50 this week; 4 mailboxes at full speed = 200.
// Weeks run Monday to Sunday on your clock. `preferences.mailbox_ramp` keeps each mailbox's first week (its Monday).

export const RAMP_STEP = 10;
export const RAMP_MAX = 50;
/** Mailboxes connected before the ramp existed started together the week of 9 November 2026 (so 16 Nov = 20 each). */
export const RAMP_ANCHOR = "2026-11-09";

const DAY = 86_400_000;
const toMs = (key: string) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
const toKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const isDayKey = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(toMs(v));

/** The Monday of the week a day ("YYYY-MM-DD") is in. */
export function mondayOf(day: string): string {
  const ms = toMs(day);
  const dow = (new Date(ms).getUTCDay() + 6) % 7; // Monday 0 … Sunday 6
  return toKey(ms - dow * DAY);
}

/** Which week of its ramp a mailbox is in on `today` (1 = its first week). */
export function weekOf(start: string, today: string): number {
  return Math.max(1, Math.floor((toMs(mondayOf(today)) - toMs(mondayOf(start))) / (7 * DAY)) + 1);
}

export const perDay = (week: number) => Math.min(RAMP_MAX, RAMP_STEP * Math.max(1, week));

export type RampBox = { mailbox: string; start: string; week: number; perDay: number; next: number; full: boolean };
export type RampPlan = { boxes: RampBox[]; total: number; nextTotal: number; week: string };

/** This week's target for each mailbox you have, and the sum. A mailbox with no start yet counts as starting this week. */
export function rampPlan(starts: Record<string, string> | undefined, mailboxes: string[], today: string): RampPlan {
  const week = mondayOf(today);
  const seen = new Set<string>();
  const boxes: RampBox[] = [];
  for (const raw of mailboxes) {
    const mailbox = raw.trim().toLowerCase();
    if (!mailbox || seen.has(mailbox)) continue;
    seen.add(mailbox);
    const start = isDayKey(starts?.[mailbox]) ? mondayOf(starts![mailbox]) : week;
    const w = toMs(start) > toMs(week) ? 1 : weekOf(start, today);
    boxes.push({ mailbox, start, week: w, perDay: perDay(w), next: perDay(w + 1), full: perDay(w) >= RAMP_MAX });
  }
  return { boxes, total: boxes.reduce((s, b) => s + b.perDay, 0), nextTotal: boxes.reduce((s, b) => s + b.next, 0), week };
}

/** The ramp went live this week: a mailbox the CRM already tracked before it started with the others (anchor). */
export const RAMP_LIVE = "2026-11-16";

/**
 * Mailboxes that need a first week written down. `firstSeen` = the day the CRM first recorded mail from that
 * mailbox (email_events.created_at, not the email's own date — a new mailbox's old history doesn't count):
 * before the ramp went live → the anchor week; later → that week; never seen yet → this week.
 */
export function stampNew(starts: Record<string, string> | undefined, mailboxes: string[], today: string, firstSeen: Record<string, string> = {}): Record<string, string> | null {
  const out = { ...(starts || {}) };
  let changed = false;
  const week = mondayOf(today);
  for (const raw of mailboxes) {
    const m = raw.trim().toLowerCase();
    if (!m || isDayKey(out[m])) continue;
    const seen = firstSeen[m];
    const start = isDayKey(seen) && seen < RAMP_LIVE ? RAMP_ANCHOR : isDayKey(seen) ? mondayOf(seen) : week;
    out[m] = toMs(start) > toMs(week) ? week : toMs(start) < toMs(RAMP_ANCHOR) ? RAMP_ANCHOR : start;
    changed = true;
  }
  return changed ? out : null;
}

/** Ask when the goal isn't this week's number and they haven't said "keep mine" to this exact number this week. */
export function shouldAsk(o: { goal: number; plan: RampPlan; skip?: { week?: string; total?: number } | null }): boolean {
  if (!o.plan.boxes.length || o.plan.total === o.goal) return false;
  return !(o.skip && o.skip.week === o.plan.week && o.skip.total === o.plan.total);
}

/** Move a mailbox's ramp by whole weeks (Settings: it was already warm, or started later). Never past this week. */
export function shiftStart(start: string, weeks: number, today: string): string {
  const moved = toMs(mondayOf(start)) - weeks * 7 * DAY;
  return toKey(Math.min(moved, toMs(mondayOf(today))));
}

/** Keeps only well-formed entries (address → Monday), at most 30. */
export function readRamp(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== "object") return out;
  for (const [k, d] of Object.entries(v as Record<string, unknown>).slice(0, 30)) if (/^[^\s@]{1,64}@[^\s@]{1,190}$/.test(k) && isDayKey(d)) out[k.toLowerCase()] = mondayOf(d);
  return out;
}
