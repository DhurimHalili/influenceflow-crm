// Did they say no? Read from the Gmail reply rules (`_shared/replyReader.ts`):
//   "no"    — a clear no ("Not at the moment.", "Not interested", "No, thanks").
//             Gmail moves them to Denied by itself (live stages only).
//   "maybe" — reads like a no but a person could still mean "later"
//             ("Probably not", "Maybe next year", "Too busy right now").
//             Nothing moves: the record is flagged until you decide.
// Pure — no React, no DOM.

import type { EmailEvent, EntityStatus } from "../types";

export type NoLevel = "no" | "maybe";
export type NoVerdict = {
  level: NoLevel;
  /** The reply that said it. */
  event: EmailEvent;
  /** You already answered the question: the status was set by hand after it. */
  settled: boolean;
};

type Rec = { id: string; pipeline_status: EntityStatus; status_updated_at?: string | null; status_source?: "manual" | "gmail" };

/** Their latest real reply (not an auto-reply, not a management decline), per record id. */
export function latestReplies(events: EmailEvent[]) {
  const map = new Map<string, EmailEvent>();
  for (const e of events) {
    if (e.direction !== "in" || e.reply_kind === "auto" || e.reply_kind === "managed_no") continue;
    const prev = map.get(e.entity_id);
    if (!prev || e.at > prev.at) map.set(e.entity_id, e);
  }
  return map;
}

export function noVerdict(record: Rec, last: EmailEvent | undefined): NoVerdict | null {
  if (!last || (last.reply_kind !== "no" && last.reply_kind !== "maybe_no")) return null;
  const level: NoLevel = last.reply_kind === "no" ? "no" : "maybe";
  const handSetAfter = record.status_source !== "gmail" && !!record.status_updated_at && new Date(record.status_updated_at).getTime() > new Date(last.at).getTime();
  return { level, event: last, settled: handSetAfter };
}

/**
 * Who belongs under "Not interested": a clear no, a maybe-no you haven't
 * decided on yet, and anyone you marked Denied. A maybe you settled by moving
 * them on (say, to Negotiating) is not listed.
 */
export function notInterested(record: Rec, verdict: NoVerdict | null): NoLevel | "denied" | null {
  if (verdict?.level === "maybe" && !verdict.settled && record.pipeline_status !== "denied") return "maybe";
  if (verdict?.level === "no" && record.pipeline_status !== "denied" && !verdict.settled) return "no";
  if (record.pipeline_status === "denied") return verdict?.level === "no" || verdict?.level === "maybe" ? "no" : "denied";
  return null;
}

/** "maybe" first (needs your call), then clear no's, then other Denied. */
export const NOT_INTERESTED_ORDER: Record<NoLevel | "denied", number> = { maybe: 0, no: 1, denied: 2 };

/** The words they wrote, trimmed to the answer (no quoted thread, no signature padding). */
export function replyQuote(e: EmailEvent, max = 140) {
  const text = String(e.snippet || "")
    .replace(/[‘’]/g, "'")
    .replace(/\bOn (?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s[^]*$/, "")
    .replace(/\bOn [^?!]{4,200}? wrote:[^]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
