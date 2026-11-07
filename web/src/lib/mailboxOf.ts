// Which of your mailboxes each influencer / brand is being emailed from.
//   now — the mailbox of your latest email in the thread reminders follow:
//         where the conversation runs, so where the next follow-up goes from.
//   all — every mailbox that ever emailed them, latest first.
// Pure — no React, no DOM. Read from the follow-up timeline (Gmail touches),
// so it agrees with the profile's "Follow-ups & replies".

import type { Touch } from "./followupEngine.ts";

export type BoxOf = { now: string; all: string[] };

export function mailboxOf(touches: Touch[]): BoxOf | null {
  const out = touches.filter((t) => t.dir === "out" && t.source === "gmail" && t.mailbox && !(t.crossed && t.scheduled));
  if (!out.length) return null;
  const all: string[] = [];
  for (let i = out.length - 1; i >= 0; i--) {
    const m = out[i].mailbox!.toLowerCase();
    if (!all.includes(m)) all.push(m);
  }
  const current = [...out].reverse().find((t) => !t.otherThread);
  return { now: (current?.mailbox || all[0]).toLowerCase(), all };
}

export function mailboxesByRecord(list: { id: string; state: { touches: Touch[] } }[]) {
  const byId = new Map<string, BoxOf>();
  for (const c of list) {
    const b = mailboxOf(c.state.touches);
    if (b) byId.set(c.id, b);
  }
  return byId;
}

/** Does a record match the mailbox filter? "all", "none" (never emailed from Gmail) or one address (where it runs now). */
export function matchesMailbox(pick: string, box: BoxOf | undefined) {
  if (!pick || pick === "all") return true;
  if (pick === "none") return !box;
  return box?.now === pick.toLowerCase();
}

/** Counts for the chips: records per mailbox (where it runs now) and never emailed. */
export function mailboxCounts(ids: string[], boxes: Map<string, BoxOf>) {
  const counts = new Map<string, number>();
  let none = 0;
  for (const id of ids) {
    const b = boxes.get(id);
    if (!b) none++;
    else counts.set(b.now, (counts.get(b.now) || 0) + 1);
  }
  return { counts, none };
}
