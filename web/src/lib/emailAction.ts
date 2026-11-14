// The email button on a profile: what it should do right now.
//   write — nothing sent yet (or the thread lives in a mailbox that isn't connected): Gmail's composer.
//   reply — a conversation is running: a reply draft in that Gmail thread, like Gmail's own Reply.
//   fresh — the thread has had its follow-ups and the next step is a new thread: a new email.
// Plus every email already waiting in Gmail's Scheduled folder for them, so a
// reply never goes out on top of one without you knowing.
// Pure — no React, no DOM.

import type { EmailEvent } from "../types";
import { nextFollowupLabel, type FollowupState } from "./followupEngine.ts";
import { dateFmt } from "./days.ts";

export type Tone = "first" | "theirs" | "due" | "fresh" | "wait" | "calm";
export type Upcoming = { gmailId: string; at: string; mailbox: string; kind: "first" | "follow-up" | "reply" | "new thread"; crossed: boolean; inThread: boolean; subject: string };
export type EmailPlan = {
  mode: "write" | "reply" | "fresh";
  /** The mailbox the button uses. */
  mailbox: string;
  /** The conversation reminders follow (also for `fresh`: the old thread, for "reply there instead"). */
  thread?: { id: string; subject: string; mailbox: string; mine: number; lastAt: string; lastDir: "in" | "out" };
  status: { tone: Tone; text: string };
  /** Emails to them still waiting in Gmail's Scheduled folder, soonest first. */
  upcoming: Upcoming[];
  /** The conversation is in a mailbox that isn't connected now. */
  offline?: string;
};

const DAY = 86_400_000;
const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
export const cleanSubject = (s: string) => s.replace(/^\s*((re|fwd?|aw|wg)\s*:\s*)+/i, "").trim();

/** "today" · "yesterday" · "3 days ago" · "2 weeks ago" · "12 Oct". */
export function ago(at: string, now: Date): string {
  const d = new Date(at);
  const days = Math.round((startOf(now) - startOf(d)) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return dateFmt({ day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) }).format(d);
}

/** "today 09:00" · "tomorrow 09:00" · "Tue 09:00" (this week) · "Tue 24 Nov, 09:00". */
export function when(at: string, now: Date): string {
  const d = new Date(at);
  const days = Math.round((startOf(d) - startOf(now)) / DAY);
  const time = dateFmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  if (days === 0) return `today ${time}`;
  if (days === 1) return `tomorrow ${time}`;
  if (days > 1 && days < 7) return `${dateFmt({ weekday: "short" }).format(d)} ${time}`;
  return `${dateFmt({ weekday: "short", day: "numeric", month: "short" }).format(d)}, ${time}`;
}

const dayOf = (at: string, now: Date) => {
  const days = Math.round((startOf(new Date(at)) - startOf(now)) / DAY);
  return days <= 0 ? "today" : days === 1 ? "tomorrow" : days < 7 ? dateFmt({ weekday: "long" }).format(new Date(at)) : dateFmt({ day: "numeric", month: "short" }).format(new Date(at));
};

export function emailPlan(o: { events: EmailEvent[]; state?: FollowupState; mailboxes: string[]; now?: Date }): EmailPlan {
  const now = o.now || new Date();
  const boxes = o.mailboxes.map((m) => m.toLowerCase());
  const mail = [...o.events].filter((e) => e.thread_id).sort((a, b) => a.at.localeCompare(b.at));
  const live = mail.filter((e) => !e.scheduled);
  const cancelId = o.state?.cancel?.id || "";

  // Your usual mailbox: the one you last wrote from (if it's still connected).
  const lastOut = [...live].reverse().find((e) => e.direction === "out" && e.mailbox && boxes.includes(e.mailbox.toLowerCase()));
  const usual = lastOut?.mailbox?.toLowerCase() || boxes[0] || "";

  // The conversation: the one reminders follow, else where the latest real message is.
  const followed = o.state?.thread?.active;
  const latest = [...live].reverse().find((e) => e.reply_kind !== "auto" && e.reply_kind !== "reaction" && e.gone !== "deleted") || live[live.length - 1];
  const threadId = followed && live.some((e) => e.thread_id === followed) ? followed : latest?.thread_id || "";
  const inThread = live.filter((e) => e.thread_id === threadId);
  const threadBox = ([...inThread].reverse().find((e) => e.mailbox)?.mailbox || "").toLowerCase();
  const last = [...inThread].reverse().find((e) => e.reply_kind !== "auto" && e.reply_kind !== "reaction") || inThread[inThread.length - 1];
  const thread = threadId ? {
    id: threadId,
    subject: cleanSubject(inThread.find((e) => e.subject)?.subject || ""),
    mailbox: threadBox,
    mine: inThread.filter((e) => e.direction === "out").length,
    lastAt: last?.at || "",
    lastDir: (last?.direction || "out") as "in" | "out",
  } : undefined;

  // Already scheduled for them.
  const upcoming: Upcoming[] = mail.filter((e) => e.scheduled && e.direction === "out" && !e.gone).map((e) => {
    const before = mail.filter((x) => x.at < e.at && !x.scheduled);
    const here = before.filter((x) => x.thread_id === e.thread_id);
    const crossed = cancelId === `g-${e.gmail_id}`;
    // A crossed one was written as a follow-up (before their reply came in).
    const kind: Upcoming["kind"] = !before.length ? "first" : !here.length ? "new thread" : crossed ? "follow-up" : here[here.length - 1].direction === "in" ? "reply" : "follow-up";
    return { gmailId: e.gmail_id, at: e.at, mailbox: (e.mailbox || "").toLowerCase(), kind, crossed, inThread: e.thread_id === threadId, subject: cleanSubject(e.subject || "") };
  });

  const s = o.state;
  const offline = thread && threadBox && !boxes.includes(threadBox) ? threadBox : undefined;
  if (!thread || offline) {
    return {
      mode: "write", mailbox: usual, thread, upcoming, offline,
      status: offline ? { tone: "calm", text: `The conversation is in ${threadBox} — not connected now` } : upcoming.length ? { tone: "calm", text: "First email scheduled" } : { tone: "first", text: "No email yet" },
    };
  }

  const mailbox = threadBox || usual;
  if (s?.kind === "due" && s.next === "new-thread") {
    return { mode: "fresh", mailbox, thread, upcoming, status: { tone: "fresh", text: `${thread.mine} emails in this thread — time for a new one` } };
  }
  const status = ((): EmailPlan["status"] => {
    if (!s) return { tone: "calm", text: `Last email ${ago(thread.lastAt, now)}` };
    switch (s.kind) {
      case "reply-needed": return { tone: "theirs", text: s.won ? `They wrote ${ago(s.since, now)} — answer them` : `They replied ${ago(s.since, now)} — your turn` };
      case "due": { const what = nextFollowupLabel(s.sent ?? s.round); return { tone: "due", text: `${what[0].toUpperCase()}${what.slice(1)} is due${s.overdueDays > 0 ? ` · ${s.overdueDays}d late` : " today"}` }; }
      case "waiting": return s.last.scheduled
        ? { tone: "wait", text: "Your next email is scheduled" }
        : { tone: "wait", text: `You wrote ${ago(s.last.at, now)} · ${s.next === "new-thread" ? "new thread" : "follow-up"} ${dayOf(s.due, now)}` };
      case "exhausted": return { tone: "calm", text: `Every follow-up sent · last ${ago(s.last.at, now)}` };
      case "managed": return { tone: "calm", text: "Their team declined by email — try a DM" };
      case "reach-back": return { tone: "due", text: `Said no ${ago(s.since, now)} — time to try again` };
      default: return { tone: "calm", text: `Last email ${ago(thread.lastAt, now)}` };
    }
  })();
  return { mode: "reply", mailbox, thread, upcoming, status };
}
