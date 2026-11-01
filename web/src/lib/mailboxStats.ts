import type { EmailEvent, InboundLead } from "../types";

// Per-mailbox numbers: which of your addresses sends the most, and which one
// gets answered. Counted from synced Gmail activity (one message = one send,
// even when it went to several people in the CRM).

export type MailboxStats = {
  mailbox: string;
  sent: number;
  received: number;
  reached: number;
  replied: number;
  replyRate: number;
  leads: number;
  lastSentAt: string | null;
  /** Emails sent per day over the window, oldest first (for the sparkline). */
  daily: number[];
};

export function mailboxStats(events: EmailEvent[], leads: InboundLead[], mailboxes: string[], days: number | null): MailboxStats[] {
  const since = days === null ? 0 : Date.now() - days * 86400000;
  const span = Math.min(days ?? 30, 60);
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const first = dayStart.getTime() - (span - 1) * 86400000;
  const names = Array.from(new Set([...mailboxes.map((m) => m.toLowerCase()), ...events.map((e) => (e.mailbox || "").toLowerCase()).filter(Boolean)]));
  return names.map((mailbox) => {
    const mine = events.filter((e) => (e.mailbox || "").toLowerCase() === mailbox && new Date(e.at).getTime() >= since);
    const out = mine.filter((e) => e.direction === "out");
    const sentIds = new Set(out.map((e) => e.gmail_id));
    const reachedAt = new Map<string, number>();
    for (const e of out) {
      const t = new Date(e.at).getTime();
      if (!reachedAt.has(e.entity_id) || t < reachedAt.get(e.entity_id)!) reachedAt.set(e.entity_id, t);
    }
    // A reply counts for this mailbox when it came back to it after it wrote first.
    const replied = new Set(mine.filter((e) => e.direction === "in" && reachedAt.has(e.entity_id) && new Date(e.at).getTime() > reachedAt.get(e.entity_id)!).map((e) => e.entity_id));
    const daily = Array.from({ length: span }, () => 0);
    const counted = new Set<string>();
    for (const e of out) {
      if (counted.has(e.gmail_id)) continue;
      counted.add(e.gmail_id);
      const i = Math.floor((new Date(e.at).getTime() - first) / 86400000);
      if (i >= 0 && i < span) daily[i]++;
    }
    const last = out.map((e) => e.at).sort().pop() || null;
    return {
      mailbox,
      sent: sentIds.size,
      received: new Set(mine.filter((e) => e.direction === "in").map((e) => e.gmail_id)).size,
      reached: reachedAt.size,
      replied: replied.size,
      replyRate: reachedAt.size ? Math.round((replied.size / reachedAt.size) * 100) : 0,
      leads: leads.filter((l) => l.mailbox.toLowerCase() === mailbox && new Date(l.first_at).getTime() >= since).length,
      lastSentAt: last,
      daily,
    };
  }).sort((a, b) => b.sent - a.sent);
}
