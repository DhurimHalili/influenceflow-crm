// Mailbox guard (owner's rule, Nov 2026): no mailbox ends the day past its daily limit (the weekly ramp, 10 → 50).
// When your own sends push a mailbox over — replies, a new email, a follow-up by hand — the CRM takes back what
// hasn't gone out yet, in this order: Autopilot's follow-ups (latest first), then follow-ups you scheduled in
// Gmail, then new emails you scheduled, and replies last. Sent mail is never touched. Shared by the app (settings,
// the list of what was taken back) and gmail-sync (`guard.ts`), so both read the same rules.
// Explicit `.ts` imports only — the server imports this file directly.

export type GuardPrefs = { on: boolean; gmail: boolean };
/** Default: on, and allowed to cancel emails you scheduled in Gmail too (follow-ups first). */
export const readGuard = (v: unknown): GuardPrefs => {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return { on: o.on !== false, gmail: o.gmail !== false };
};

export type WaitingRole = "followup" | "new" | "reply";
export type Waiting = {
  source: "autopilot" | "gmail";
  /** autosend_queue id, or the Gmail message id. */
  id: string;
  mailbox: string;
  /** When it would go (ms). */
  at: number;
  role: WaitingRole;
  entityType: "creator" | "brand" | "";
  entityId: string;
  round?: number;
};
export type BoxLoad = { mailbox: string; limit: number; used: number };
export type Trim = Waiting & { used: number; limit: number };

/** Something about to go (or already going) is never pulled back: Gmail may be sending it this minute. */
export const SAFE_MS = 2 * 60_000;
const ORDER: Record<string, number> = { autopilot: 0, followup: 1, new: 2, reply: 3 };
const rank = (w: Waiting) => (w.source === "autopilot" ? ORDER.autopilot : ORDER[w.role] ?? 9);

/**
 * Which waiting emails to take back so every mailbox is at (or under) its limit again.
 * `used` already counts everything waiting today, so each one taken back lowers it by one.
 */
export function planTrims(boxes: BoxLoad[], waiting: Waiting[], prefs: GuardPrefs, now: number): { trims: Trim[]; stillOver: BoxLoad[] } {
  const trims: Trim[] = [];
  const stillOver: BoxLoad[] = [];
  if (!prefs.on) return { trims, stillOver: boxes.filter((b) => b.used > b.limit) };
  for (const b of boxes) {
    let over = b.used - b.limit;
    if (over <= 0) continue;
    const box = b.mailbox.toLowerCase();
    const pool = waiting
      .filter((w) => w.mailbox.toLowerCase() === box && w.at > now + SAFE_MS && (w.source === "autopilot" || prefs.gmail))
      .sort((a, c) => rank(a) - rank(c) || c.at - a.at);
    for (const w of pool) {
      if (over <= 0) break;
      trims.push({ ...w, used: b.used, limit: b.limit });
      over--;
    }
    if (over > 0) stillOver.push({ ...b, used: b.limit + over });
  }
  return { trims, stillOver };
}

type Ev = { gmail_id: string; thread_id: string; direction: "in" | "out"; at: string; reply_kind?: string | null; scheduled?: boolean };
/** What a scheduled email is, read from its own thread: answering their latest message = reply; after an email of yours = follow-up; else a new email. */
export function roleOf(email: { gmail_id: string; thread_id: string; at: string }, thread: Ev[]): WaitingRole {
  const before = thread
    .filter((e) => e.gmail_id !== email.gmail_id && e.thread_id === email.thread_id && e.at < email.at)
    .filter((e) => e.direction === "out" || !["auto", "reaction"].includes(e.reply_kind || ""))
    .sort((a, b) => b.at.localeCompare(a.at));
  if (!before.length) return "new";
  return before[0].direction === "in" ? "reply" : "followup";
}

const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th"];
/** "2nd follow-up · Autopilot" / "Follow-up scheduled in Gmail" / "Reply scheduled in Gmail". */
export function trimLabel(t: { source: string; role: string; round?: number | null }): string {
  if (t.source === "autopilot") return `${t.round ? `${ORDINAL[t.round] || `${t.round}th`} follow-up` : "Follow-up"} · Autopilot`;
  return `${t.role === "reply" ? "Reply" : t.role === "new" ? "New email" : "Follow-up"} scheduled in Gmail`;
}
