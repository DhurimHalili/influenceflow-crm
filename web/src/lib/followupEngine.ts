import type { Brand, Creator, EmailEvent, EntityStatus, Followup, FollowupRules } from "../types";
import { dayKey, parseDay } from "./days.ts";
import { quotedOwnDate } from "./replyReader.ts";

// The follow-up engine: who is waiting on whom, and when to follow up.
//
// Every record has a timeline of touches: emails synced from Gmail and
// touches you log by hand (an Instagram DM, a call, a reply on WhatsApp).
// From the last touch:
//   • the last word was theirs  → "Reply needed" (your turn)
//   • the last word was yours   → waiting on them; once the business-day gap
//                                 for that round has passed → "Follow up"
// A flag stays up until something changes the timeline — a follow-up from
// you or a reply from them. Ignoring it doesn't clear it.
//
// Records are only chased while the conversation is live: Denied, Signed and
// Roster are never chased, nor archived or snoozed records. Someone who said
// no gets one "reach back" reminder a month later (Settings → Follow-up rules).
//
// Not everything in the timeline moves the clock:
//   • an out-of-office / autoresponder isn't a reply
//   • their management (or an autoresponder) declining isn't a no from them —
//     the conversation becomes "managed": reach them on another channel
//   • a scheduled follow-up that bumps your old email after they already
//     answered ("crossed") is flagged so you can cancel it in Gmail
//   • with email reminders off (you talk on WhatsApp now), your emails are
//     shown and counted but only the other channel's follow-ups set the clock

export type TouchSource = "gmail" | "manual" | "legacy";
export type Touch = { id: string; at: string; dir: "out" | "in"; source: TouchSource; label: string; detail: string; channel: string; threadId?: string; removable: boolean; mailbox?: string;
  /** Waiting in Gmail's Scheduled folder: it counts as your touch, but hasn't gone out yet. */
  scheduled?: boolean;
  /** What a message from their side was (see EmailEvent.reply_kind). */
  kind?: EmailEvent["reply_kind"];
  /** The address it came from / went to, when it isn't their main one. */
  counterpart?: string;
  /** A follow-up bumping your earlier email that went (or will go) out after they had already answered. */
  crossed?: boolean;
  /** Shown and counted, but doesn't move the follow-up clock. */
  quiet?: boolean;
  /** An email in another thread than the one reminders follow (history, never part of this round's count). */
  otherThread?: boolean };

/**
 * Several email threads with one person (after 4 follow-ups you start a fresh
 * one). Reminders follow ONE thread: the one you chose, else the one with the
 * latest activity; the others are shown and counted but stay quiet.
 */
export type ThreadInfo = {
  /** The thread reminders follow. */
  active: string;
  /** How many threads you started with them. */
  count: number;
  /** The thread you started last. */
  newest: string;
  /** Ask which thread to continue in: the conversation moved back to an older one, or you have two going. */
  ask: boolean;
  /** They answered in another thread than the one you chose. */
  otherReply?: Touch;
  /** When the thread reminders follow began (your first email in it). */
  activeStarted: string;
  /** You started a new thread and haven't confirmed it yet: the app says so once ("reminders follow it now"). */
  fresh: boolean;
};

/** What happens when the clock runs out: another follow-up, or (after the cap) a fresh thread. */
export type NextStep = "followup" | "new-thread";

export type FollowupState = ({ thread?: ThreadInfo }) & (
  | { kind: "idle"; reason: "no-contact" | "paused" | "closed" | "snoozed"; touches: Touch[]; until?: string; cancel?: Touch }
  | { kind: "reply-needed"; since: string; days: number; touches: Touch[]; last: Touch; cancel?: Touch }
  /** round = the cadence step (what sets the clock); sent = every message you sent since their last reply, on any channel (what the words say). */
  | { kind: "waiting"; round: number; sent?: number; due: string; last: Touch; touches: Touch[]; cancel?: Touch; next?: NextStep }
  | { kind: "due"; round: number; sent?: number; due: string; overdueDays: number; last: Touch; touches: Touch[]; cancel?: Touch; next?: NextStep }
  | { kind: "exhausted"; round: number; sent?: number; last: Touch; touches: Touch[]; cancel?: Touch }
  /** Their management / an autoresponder declined by email: reach them on another channel. */
  | { kind: "managed"; since: string; last: Touch; touches: Touch[]; cancel?: Touch }
  /** They said no a while ago (Denied): time to try again. */
  | { kind: "reach-back"; since: string; due: string; touches: Touch[]; reason: string; cancel?: Touch });

/** Statuses where nobody needs chasing. */
export const NOT_CHASED: EntityStatus[] = ["denied", "signed", "roster"];
export const SNOOZE_OFF = "9999-12-31";
/** A manual log within this window of a Gmail email in the same direction is the same touch. */
const SAME_TOUCH_MS = 6 * 3600 * 1000;

// ----- business days ------------------------------------------------------------

const isWorkday = (d: Date, rules: FollowupRules) => rules.workdays.includes(d.getDay()) && !rules.holidays.includes(dayKey(d));

/** The `n`-th business day after `from` (from's own day never counts). */
export const addBusinessDays = (from: Date, n: number, rules: FollowupRules) => {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  if (!rules.workdays.length) return d;
  let left = n;
  let guard = 0;
  while (left > 0 && guard++ < 1000) {
    d.setDate(d.getDate() + 1);
    if (isWorkday(d, rules)) left--;
  }
  return d;
};

/** Business days strictly after `a` up to and including `b` (0 when b ≤ a). */
export const businessDaysBetween = (a: Date, b: Date, rules: FollowupRules) => {
  const start = new Date(a);
  start.setHours(0, 0, 0, 0);
  const end = new Date(b);
  end.setHours(0, 0, 0, 0);
  let count = 0;
  let guard = 0;
  while (start < end && guard++ < 4000) {
    start.setDate(start.getDate() + 1);
    if (isWorkday(start, rules)) count++;
  }
  return count;
};

/** Wait (in business days) after the touch that opened `round` (1 = your first email). */
export const gapFor = (round: number, rules: FollowupRules) => rules.gaps[round - 1] ?? rules.then;

/** Follow-up day for a message sent on `sent`: wait `gap` business days, follow up on the next one. */
export const dueDate = (sent: Date, round: number, rules: FollowupRules) => addBusinessDays(sent, gapFor(round, rules) + 1, rules);

// ----- timeline ------------------------------------------------------------------

type Target = { type: "creator" | "brand"; record: Pick<Creator, "id" | "pipeline_status" | "date_contacted" | "archived_at"> & { followup_snooze_until?: string | null; contact_channel?: string; email_followups?: boolean; lost_at?: string | null; lost_reason?: string; status_updated_at?: string; primary_thread?: string; primary_thread_at?: string | null; new_thread_gap?: number | null } };

/** Which thread reminders follow (influencers only; a brand's people each have their own threads). Marks the others quiet. */
function threadView(target: Target, touches: Touch[]): ThreadInfo | undefined {
  if (target.type !== "creator") return undefined;
  const mail = touches.filter((t) => t.source === "gmail" && t.threadId && !t.crossed);
  const started = new Map<string, string>();
  for (const t of mail) if (t.dir === "out" && !started.has(t.threadId!)) started.set(t.threadId!, t.at);
  if (started.size < 2) return undefined;
  const lastAct = new Map<string, string>();
  for (const t of mail) if (!(t.dir === "in" && t.kind === "auto")) lastAct.set(t.threadId!, t.at);
  const newest = [...started.entries()].sort((a, b) => a[1].localeCompare(b[1])).pop()![0];
  const chosen = target.record.primary_thread || "";
  const chosenAt = target.record.primary_thread_at || "";
  // Your choice holds — until you start a thread after making it.
  const keep = !!chosen && lastAct.has(chosen) && !(newest !== chosen && started.get(newest)! > chosenAt);
  const active = keep ? chosen : [...lastAct.entries()].sort((a, b) => a[1].localeCompare(b[1])).pop()![0];
  for (const t of touches) if (t.source === "gmail" && t.threadId && t.threadId !== active) { t.quiet = true; t.otherThread = true; }
  let otherReply: Touch | undefined;
  if (keep) {
    for (const t of mail) {
      if (t.threadId === active || t.dir !== "in" || t.kind === "auto" || t.at <= chosenAt) continue;
      const answered = mail.some((o) => o.threadId === t.threadId && o.dir === "out" && o.at > t.at);
      if (!answered) otherReply = t;
    }
  }
  // Ask once you've answered there (the banner says "reply there, then choose" until then).
  const lastInActive = [...mail].reverse().find((t) => t.threadId === active && !(t.dir === "in" && t.kind === "auto"));
  const ask = keep ? [...lastAct.entries()].some(([tid, at]) => tid !== active && at > chosenAt) : active !== newest && lastInActive?.dir === "out";
  return { active, count: started.size, newest, ask, otherReply, activeStarted: started.get(active) || "", fresh: !keep && !ask && active === newest };
}

export const CHANNEL_LABELS: Record<string, string> = { email: "Email", dm: "Instagram DM", tiktok: "TikTok DM", whatsapp: "WhatsApp", call: "Call", linkedin: "LinkedIn", other: "Other" };

export function timeline(target: Target, followups: Followup[], events: EmailEvent[]): Touch[] {
  const id = target.record.id;
  const mine = events.filter((e) => e.entity_id === id);
  const mail = mine.map<Touch>((e) => ({
    id: `g-${e.gmail_id}`,
    at: e.at,
    dir: e.direction,
    source: "gmail",
    label: e.direction === "in" ? IN_LABEL[e.reply_kind || ""] : e.scheduled ? "Email scheduled" : "You emailed",
    detail: [e.subject || "(no subject)", e.snippet].filter(Boolean).join(" — "),
    channel: "email",
    threadId: e.thread_id,
    removable: false,
    mailbox: e.mailbox || undefined,
    scheduled: e.direction === "out" && !!e.scheduled,
    kind: e.direction === "in" ? e.reply_kind || "" : "",
    counterpart: e.counterpart || undefined,
    quiet: e.direction === "in" && e.reply_kind === "auto",
  }));
  markCrossed(mail, mine, events);
  // Stored newest-first; reversed so touches logged in the same second keep their order.
  const manual = followups
    .filter((f) => (target.type === "creator" ? f.creator_id === id : f.brand_id === id))
    .reverse()
    .map<Touch>((f) => {
      const dir = f.kind === "reply" ? "in" : "out";
      const channel = f.channel || (dir === "out" ? "" : "");
      return { id: f.id, at: f.at, dir, source: "manual", label: dir === "out" ? `Follow-up${channel ? ` · ${CHANNEL_LABELS[channel] || channel}` : ""}` : `They replied${channel ? ` · ${CHANNEL_LABELS[channel] || channel}` : ""}`, detail: f.note, channel, removable: true };
    })
    // The same email logged by hand and synced from Gmail counts once (a DM or WhatsApp next to an email is its own touch).
    .filter((t) => (t.channel && t.channel !== "email") || !mail.some((m) => m.dir === t.dir && Math.abs(new Date(m.at).getTime() - new Date(t.at).getTime()) < SAME_TOUCH_MS));
  const touches = [...mail, ...manual].sort((a, b) => a.at.localeCompare(b.at));
  // Records contacted before anything was logged: the contact date is the first email.
  if (!touches.some((t) => t.dir === "out") && target.record.date_contacted && target.record.pipeline_status !== "inbound") {
    const day = parseDay(target.record.date_contacted);
    const via = target.record.contact_channel && target.record.contact_channel !== "email" ? target.record.contact_channel : "";
    if (day && (!touches.length || day.toISOString() <= touches[0].at)) touches.unshift({ id: `legacy-${id}`, at: day.toISOString(), dir: "out", source: "legacy", label: via ? `First contact · ${CHANNEL_LABELS[via] || via}` : "First contact", detail: "", channel: via, removable: false });
  }
  // On another channel with email reminders off: your emails still show, but don't set the clock.
  if (target.record.email_followups === false) for (const t of touches) if (t.dir === "out" && t.source === "gmail") t.quiet = true;
  return touches;
}

const IN_LABEL: Record<string, string> = { "": "They emailed", no: "They said no", maybe_no: "Reads like a no", team: "Their team replied", auto: "Auto-reply", managed_no: "Declined for them" };

/**
 * A follow-up that bumps your own earlier email ("you might have missed my
 * email…") but goes out after they had already answered — usually one you
 * scheduled before their reply came in. Found by the email it answers
 * (In-Reply-To) or, for older rows, the "On <date> <you> wrote:" quote.
 */
function markCrossed(mail: Touch[], mine: EmailEvent[], all: EmailEvent[]) {
  const own = Array.from(new Set(all.map((e) => e.mailbox || "").filter(Boolean)));
  const byKey = new Map(mine.filter((e) => e.message_key).map((e) => [e.message_key as string, e]));
  const replies = mail.filter((t) => t.dir === "in" && t.kind !== "auto");
  if (!replies.length) return;
  mine.forEach((e, i) => {
    if (e.direction !== "out") return;
    const bumped = e.in_reply_to ? byKey.get(e.in_reply_to) : undefined;
    let since: number | null = null;
    if (bumped) since = bumped.direction === "out" ? new Date(bumped.at).getTime() : null;
    else since = quotedOwnDate(e.snippet, own)?.getTime() ?? null;
    if (since === null) return;
    const at = new Date(e.at).getTime();
    if (replies.some((r) => { const t = new Date(r.at).getTime(); return t > since! && t < at; })) {
      mail[i].crossed = true;
      mail[i].quiet = true;
      mail[i].label = mail[i].scheduled ? "Scheduled follow-up — they already replied" : "Follow-up sent after they replied";
    }
  });
}

export function followupState(target: Target, followups: Followup[], events: EmailEvent[], rules: FollowupRules, now = new Date()): FollowupState {
  const touches = timeline(target, followups, events);
  const status = target.record.pipeline_status;
  // A crossed follow-up still waiting in Gmail: the one thing worth doing right away.
  const cancel = touches.find((t) => t.crossed && t.scheduled && new Date(t.at) > now);
  if (target.record.archived_at) return { kind: "idle", reason: "closed", touches };
  const snooze = target.record.followup_snooze_until;
  const snoozed = !!snooze && snooze >= dayKey(now);
  if (status === "denied") {
    // They said no: one reminder to try again once the reach-back time has passed.
    const since = target.record.lost_at || target.record.status_updated_at || touches[touches.length - 1]?.at || "";
    const days = rules.reach_back_days ?? 30;
    const sinceDay = since ? new Date(since) : null;
    if (!days || !sinceDay || Number.isNaN(sinceDay.getTime())) return { kind: "idle", reason: "closed", touches };
    const due = new Date(sinceDay);
    due.setHours(0, 0, 0, 0);
    due.setDate(due.getDate() + days);
    if (snoozed) return { kind: "idle", reason: "snoozed", touches, until: snooze! };
    if (now < due) return { kind: "idle", reason: "closed", touches, until: dayKey(due) };
    return { kind: "reach-back", since, due: dayKey(due), touches, reason: target.record.lost_reason || "" };
  }
  const thread = threadView(target, touches);
  if (NOT_CHASED.includes(status)) return { kind: "idle", reason: "paused", touches, thread };
  if (snoozed) return { kind: "idle", reason: "snoozed", touches, until: snooze!, cancel, thread };
  // They answered in another thread than the one you chose: your turn there.
  if (thread?.otherReply) return { kind: "reply-needed", since: thread.otherReply.at, days: businessDaysBetween(new Date(thread.otherReply.at), now, rules), touches, last: thread.otherReply, cancel, thread };
  let live = touches.filter((t) => !t.quiet);
  // Their management (or an autoresponder) declined: email is a dead end until
  // something happens on another channel — or a real reply comes in.
  const managedAt = live.map((t) => t.kind).lastIndexOf("managed_no");
  if (managedAt >= 0) {
    const after = live.slice(managedAt + 1).filter((t) => !(t.dir === "out" && t.channel === "email"));
    if (!after.length) return { kind: "managed", since: live[managedAt].at, last: live[managedAt], touches, cancel, thread };
    live = after;
  }
  const last = live[live.length - 1];
  if (!last) return { kind: "idle", reason: "no-contact", touches, cancel, thread };
  if (last.dir === "in") {
    return { kind: "reply-needed", since: last.at, days: businessDaysBetween(new Date(last.at), now, rules), touches, last, cancel, thread };
  }
  // Round = how many messages you've sent since their last reply (1 = first email).
  // A new thread is a fresh start: nothing from before it counts toward its round.
  const threadFrom = thread?.activeStarted || "";
  let round = 0;
  for (let i = live.length - 1; i >= 0 && live[i].dir === "out" && live[i].at >= threadFrom; i--) round++;
  const followupsSent = round - 1;
  // What to call it: every message since their last real reply, on any channel —
  // so turning email reminders off (or switching to WhatsApp) never renumbers your follow-ups.
  // A new thread starts the count over: emails in your other threads (and
  // anything before this thread began) are history, not follow-ups in it.
  const lastReal = touches.map((t) => t.dir === "in" && t.kind !== "auto" && t.kind !== "managed_no").lastIndexOf(true);
  const sent = Math.max(round, touches.slice(lastReal + 1).filter((t) => t.dir === "out" && !t.crossed && !t.otherThread && t.at >= threadFrom).length);
  // After the cap (4 by default) of email follow-ups in one thread, the next
  // step is a fresh thread, not another follow-up — after its own wait.
  const cap = rules.thread_cap ?? 4;
  const byEmail = last.channel === "email" || last.source === "legacy";
  const next: NextStep = cap > 0 && byEmail && followupsSent >= cap ? "new-thread" : "followup";
  if (next === "followup" && rules.stop_after > 0 && followupsSent >= rules.stop_after) return { kind: "exhausted", round, sent, last, touches, cancel, thread };
  // A scheduled email hasn't gone out yet: the clock starts once it does.
  const from = last.scheduled && new Date(last.at) < now ? now : new Date(last.at);
  const gap = target.record.new_thread_gap ?? rules.new_thread_gap ?? 1;
  const due = next === "new-thread" ? addBusinessDays(from, gap + 1, rules) : dueDate(from, round, rules);
  if (last.scheduled) return { kind: "waiting", round, sent, due: dayKey(due), last, touches, cancel, next, thread };
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (today >= due) return { kind: "due", round, sent, due: dayKey(due), overdueDays: businessDaysBetween(due, today, rules), last, touches, cancel, next, thread };
  return { kind: "waiting", round, sent, due: dayKey(due), last, touches, cancel, next, thread };
}

// ----- words ---------------------------------------------------------------------

export const ordinal = (n: number) => {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] || "th";
  return `${n}${tail}`;
};

/** "your first email" / "your 1st follow-up" / "your 2nd follow-up" … */
export const roundLabel = (round: number, channel = "") => (round <= 1 ? (channel && channel !== "email" ? `your first ${CHANNEL_LABELS[channel] || channel} message` : "your first email") : `your ${ordinal(round - 1)} follow-up`);

/** "your first email" — or, with several threads, "the first email of your new thread “Subject”". */
export const lastLabel = (state: { round: number; sent?: number; last: Touch; thread?: ThreadInfo }) => {
  const n = state.sent ?? state.round;
  const t = state.thread;
  if (t && t.count > 1 && n <= 1 && state.last.threadId === t.active && state.last.source === "gmail") {
    const subject = (state.last.detail || "").split(" — ")[0];
    return `the first email of your ${t.active === t.newest ? "new" : "older"} thread${subject ? ` “${subject}”` : ""}`;
  }
  if (t && t.count > 1 && n > 1 && state.last.channel === "email") return `${roundLabel(n, state.last.channel)} in this thread`;
  return roundLabel(n, state.last.channel);
};

/** What sending now would be: "1st follow-up", "2nd follow-up"… */
export const nextFollowupLabel = (round: number) => `${ordinal(round)} follow-up`;

const weekday = (key: string) => {
  const d = parseDay(key);
  if (!d) return key;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return new Intl.DateTimeFormat("en-US", diff > 0 && diff < 7 ? { weekday: "long" } : { weekday: "short", month: "short", day: "numeric" }).format(d);
};

/** "today 9:00", "tomorrow 14:30", "Tue 9:00" — or "" once the time has passed (Gmail's date may be when it was written). */
export const sendsAt = (iso: string, now = new Date()) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d <= now) return "";
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86400000);
  const date = diff === 0 ? "today" : diff === 1 ? "tomorrow" : new Intl.DateTimeFormat("en-US", diff < 7 ? { weekday: "short" } : { month: "short", day: "numeric" }).format(d);
  return `${date} ${time}`;
};

export type Flag = { tone: "due" | "reply" | "wait" | "sched" | "muted" | "managed" | "reach" | "thread" | "parked"; short: string; long: string };

const agoWords = (iso: string) => {
  const days = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000));
  return days === 0 ? "today" : days === 1 ? "yesterday" : days < 14 ? `${days} days ago` : days < 60 ? `${Math.round(days / 7)} weeks ago` : `${Math.round(days / 30)} months ago`;
};

export function flagFor(state: FollowupState): Flag | null {
  if (state.cancel) {
    const when = sendsAt(state.cancel.at);
    const reply = [...state.touches].reverse().find((t) => t.dir === "in" && t.kind !== "auto");
    return { tone: "due", short: "Cancel scheduled email", long: `They replied ${reply ? agoWords(reply.at) : "already"} — your scheduled follow-up${when ? ` (sends ${when})` : ""} would land after their answer. Cancel it in Gmail's Scheduled folder.` };
  }
  switch (state.kind) {
    case "managed":
      return { tone: "managed", short: "Managed · DM them", long: `Their management turned this down by email ${agoWords(state.since)}${state.last.counterpart ? ` (${state.last.counterpart})` : ""} — it looks automatic, so they may never have seen it. Reach them on Instagram, TikTok or WhatsApp instead.` };
    case "reach-back":
      return { tone: "reach", short: "Reach back", long: `They passed ${agoWords(state.since)}${state.reason ? ` — ${state.reason.toLowerCase()}` : ""}. Their calendar may have room again: try them at the same price or better.` };
    case "due":
      if (state.next === "new-thread") return { tone: "thread", short: state.overdueDays > 0 ? `New thread · ${state.overdueDays}d late` : "Start a new thread", long: `${state.round - 1} follow-ups and no reply in this thread — start a fresh email with a new subject instead of another follow-up` };
      return { tone: "due", short: state.overdueDays > 0 ? `Follow up · ${state.overdueDays}d late` : "Follow up today", long: `No reply to ${lastLabel(state)} — send your ${nextFollowupLabel(state.sent ?? state.round)}${state.overdueDays > 0 ? ` (due ${state.overdueDays} business day${state.overdueDays === 1 ? "" : "s"} ago)` : " today"}` };
    case "reply-needed":
      if (state.thread && (state.thread.otherReply || state.last.threadId !== state.thread.newest) && state.last.source === "gmail") return { tone: "reply", short: state.days > 0 ? `Old thread reply · ${state.days}d` : "Replied in old thread", long: `They answered in an older email thread${state.days > 0 ? ` ${state.days} business day${state.days === 1 ? "" : "s"} ago` : " today"}, not in your newest one — reply there, then choose which thread to continue in` };
      if (state.last.kind === "no") return { tone: "reply", short: state.days > 0 ? `Reply · ${state.days}d` : "Reply needed", long: `They said no ${state.days > 0 ? `${state.days} business day${state.days === 1 ? "" : "s"} ago` : "today"} while the deal was open — thank them and mark them Denied; you'll get a reminder to reach back in a month` };
      if (state.last.kind === "maybe_no") return { tone: "reply", short: state.days > 0 ? `Reply · ${state.days}d` : "Reply needed", long: `Their reply ${state.days > 0 ? `${state.days} business day${state.days === 1 ? "" : "s"} ago` : "today"} reads like a no, but it isn't certain — answer them, or open the profile and decide` };
      return { tone: "reply", short: state.days > 0 ? `Reply · ${state.days}d` : "Reply needed", long: `${state.last.kind === "team" ? "Their team" : "They"} wrote ${state.days > 0 ? `${state.days} business day${state.days === 1 ? "" : "s"} ago` : "today"} — your turn to answer` };
    case "waiting": {
      if (state.last.scheduled) {
        const when = sendsAt(state.last.at);
        return { tone: "sched", short: when ? `Scheduled · ${when}` : "Scheduled", long: `${roundLabel(state.sent ?? state.round, state.last.channel).replace(/^your/, "Your")} is scheduled in Gmail${when ? ` — it sends ${when}` : ""}. It counts as done; cancel it in Gmail and the reminder comes back.` };
      }
      if (state.next === "new-thread") return { tone: "wait", short: `New thread ${weekday(state.due)}`, long: `That was your ${ordinal(state.round - 1)} follow-up in this thread — no more follow-ups here. If they stay quiet, start a new thread ${weekday(state.due)}` };
      return { tone: "wait", short: `Follow up ${weekday(state.due)}`, long: `Waiting for a reply to ${lastLabel(state)} — follow up ${weekday(state.due)} if they stay quiet` };
    }
    case "exhausted":
      return { tone: "muted", short: "No reply", long: `No reply after ${(state.sent ?? state.round) - 1} follow-ups — consider marking them No reply` };
    default:
      return null;
  }
}

/** Example cadence for the settings preview: "Mon → Wed → Fri → Tue…". */
export const cadencePreview = (rules: FollowupRules, start = nextWorkday(new Date(), rules), steps = 5) => {
  const out: { label: string; date: Date }[] = [{ label: "First email", date: start }];
  let sent = start;
  const cap = rules.thread_cap ?? 4;
  const last = cap > 0 ? cap : steps;
  for (let round = 1; round <= last; round++) {
    if (rules.stop_after > 0 && round > rules.stop_after) break;
    sent = dueDate(sent, round, rules);
    out.push({ label: `${ordinal(round)} follow-up`, date: sent });
  }
  if (cap > 0 && out.length === cap + 1) out.push({ label: "Start a new thread", date: addBusinessDays(sent, (rules.new_thread_gap ?? 1) + 1, rules) });
  return out;
};

function nextWorkday(from: Date, rules: FollowupRules) {
  // Previews start on a Monday-like first workday so the pattern reads naturally.
  const d = new Date(from);
  d.setHours(9, 0, 0, 0);
  for (let i = 0; i < 14; i++) {
    if (isWorkday(d, rules) && d.getDay() === rules.workdays[0]) return d;
    d.setDate(d.getDate() + 1);
  }
  return d;
}

// ----- whole workspace ------------------------------------------------------------

export type Chase = { type: "creator" | "brand"; id: string; name: string; state: FollowupState; flag: Flag | null };

export function chaseList(creators: Creator[], brands: Brand[], followups: Followup[], events: EmailEvent[], rules: FollowupRules, now = new Date()): Chase[] {
  const byEntity = new Map<string, EmailEvent[]>();
  for (const e of events) byEntity.set(e.entity_id, [...(byEntity.get(e.entity_id) || []), e]);
  const fuByEntity = new Map<string, Followup[]>();
  for (const f of followups) {
    const key = f.creator_id || f.brand_id || "";
    if (key) fuByEntity.set(key, [...(fuByEntity.get(key) || []), f]);
  }
  const make = (type: "creator" | "brand", record: Creator | Brand): Chase => {
    const state = followupState({ type, record: record as Creator }, fuByEntity.get(record.id) || [], byEntity.get(record.id) || [], rules, now);
    return { type, id: record.id, name: record.name, state, flag: flagFor(state) };
  };
  return [...creators.filter((c) => !c.archived_at).map((c) => make("creator", c)), ...brands.filter((b) => !b.archived_at).map((b) => make("brand", b))];
}
