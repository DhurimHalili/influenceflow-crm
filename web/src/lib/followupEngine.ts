import type { Brand, Creator, EmailEvent, EntityStatus, Followup, FollowupRules } from "../types";
import { dayKey, parseDay } from "./utils";

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
// Roster are never chased, nor archived or snoozed records.

export type TouchSource = "gmail" | "manual" | "legacy";
export type Touch = { id: string; at: string; dir: "out" | "in"; source: TouchSource; label: string; detail: string; channel: string; threadId?: string; removable: boolean; mailbox?: string;
  /** Waiting in Gmail's Scheduled folder: it counts as your touch, but hasn't gone out yet. */
  scheduled?: boolean };

export type FollowupState =
  | { kind: "idle"; reason: "no-contact" | "paused" | "closed" | "snoozed"; touches: Touch[]; until?: string }
  | { kind: "reply-needed"; since: string; days: number; touches: Touch[]; last: Touch }
  | { kind: "waiting"; round: number; due: string; last: Touch; touches: Touch[] }
  | { kind: "due"; round: number; due: string; overdueDays: number; last: Touch; touches: Touch[] }
  | { kind: "exhausted"; round: number; last: Touch; touches: Touch[] };

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

type Target = { type: "creator" | "brand"; record: Pick<Creator, "id" | "pipeline_status" | "date_contacted" | "archived_at"> & { followup_snooze_until?: string | null } };

export const CHANNEL_LABELS: Record<string, string> = { email: "Email", dm: "Instagram DM", tiktok: "TikTok DM", whatsapp: "WhatsApp", call: "Call", linkedin: "LinkedIn", other: "Other" };

export function timeline(target: Target, followups: Followup[], events: EmailEvent[]): Touch[] {
  const id = target.record.id;
  const mail = events.filter((e) => e.entity_id === id).map<Touch>((e) => ({
    id: `g-${e.gmail_id}`,
    at: e.at,
    dir: e.direction,
    source: "gmail",
    label: e.direction === "in" ? "They emailed" : e.scheduled ? "Email scheduled" : "You emailed",
    detail: [e.subject || "(no subject)", e.snippet].filter(Boolean).join(" — "),
    channel: "email",
    threadId: e.thread_id,
    removable: false,
    mailbox: e.mailbox || undefined,
    scheduled: e.direction === "out" && !!e.scheduled,
  }));
  // Stored newest-first; reversed so touches logged in the same second keep their order.
  const manual = followups
    .filter((f) => (target.type === "creator" ? f.creator_id === id : f.brand_id === id))
    .reverse()
    .map<Touch>((f) => {
      const dir = f.kind === "reply" ? "in" : "out";
      const channel = f.channel || (dir === "out" ? "" : "");
      return { id: f.id, at: f.at, dir, source: "manual", label: dir === "out" ? `Follow-up${channel ? ` · ${CHANNEL_LABELS[channel] || channel}` : ""}` : `They replied${channel ? ` · ${CHANNEL_LABELS[channel] || channel}` : ""}`, detail: f.note, channel, removable: true };
    })
    // The same email logged by hand and synced from Gmail counts once.
    .filter((t) => !mail.some((m) => m.dir === t.dir && Math.abs(new Date(m.at).getTime() - new Date(t.at).getTime()) < SAME_TOUCH_MS));
  const touches = [...mail, ...manual].sort((a, b) => a.at.localeCompare(b.at));
  // Records contacted before anything was logged: the contact date is the first email.
  if (!touches.some((t) => t.dir === "out") && target.record.date_contacted && target.record.pipeline_status !== "inbound") {
    const day = parseDay(target.record.date_contacted);
    if (day && (!touches.length || day.toISOString() <= touches[0].at)) touches.unshift({ id: `legacy-${id}`, at: day.toISOString(), dir: "out", source: "legacy", label: "First contact", detail: "", channel: "", removable: false });
  }
  return touches;
}

export function followupState(target: Target, followups: Followup[], events: EmailEvent[], rules: FollowupRules, now = new Date()): FollowupState {
  const touches = timeline(target, followups, events);
  const status = target.record.pipeline_status;
  if (target.record.archived_at) return { kind: "idle", reason: "closed", touches };
  if (NOT_CHASED.includes(status)) return { kind: "idle", reason: status === "denied" ? "closed" : "paused", touches };
  const snooze = target.record.followup_snooze_until;
  if (snooze && snooze >= dayKey(now)) return { kind: "idle", reason: "snoozed", touches, until: snooze };
  const last = touches[touches.length - 1];
  if (!last) return { kind: "idle", reason: "no-contact", touches };
  if (last.dir === "in") {
    return { kind: "reply-needed", since: last.at, days: businessDaysBetween(new Date(last.at), now, rules), touches, last };
  }
  // Round = how many messages you've sent since their last reply (1 = first email).
  let round = 0;
  for (let i = touches.length - 1; i >= 0 && touches[i].dir === "out"; i--) round++;
  const followupsSent = round - 1;
  if (rules.stop_after > 0 && followupsSent >= rules.stop_after) return { kind: "exhausted", round, last, touches };
  // A scheduled email hasn't gone out yet: the clock starts once it does.
  const from = last.scheduled && new Date(last.at) < now ? now : new Date(last.at);
  const due = dueDate(from, round, rules);
  if (last.scheduled) return { kind: "waiting", round, due: dayKey(due), last, touches };
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (today >= due) return { kind: "due", round, due: dayKey(due), overdueDays: businessDaysBetween(due, today, rules), last, touches };
  return { kind: "waiting", round, due: dayKey(due), last, touches };
}

// ----- words ---------------------------------------------------------------------

export const ordinal = (n: number) => {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] || "th";
  return `${n}${tail}`;
};

/** "your first email" / "your 1st follow-up" / "your 2nd follow-up" … */
export const roundLabel = (round: number) => (round <= 1 ? "your first email" : `your ${ordinal(round - 1)} follow-up`);

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

export type Flag = { tone: "due" | "reply" | "wait" | "sched" | "muted"; short: string; long: string };

export function flagFor(state: FollowupState): Flag | null {
  switch (state.kind) {
    case "due":
      return { tone: "due", short: state.overdueDays > 0 ? `Follow up · ${state.overdueDays}d late` : "Follow up today", long: `No reply to ${roundLabel(state.round)} — send your ${nextFollowupLabel(state.round)}${state.overdueDays > 0 ? ` (due ${state.overdueDays} business day${state.overdueDays === 1 ? "" : "s"} ago)` : " today"}` };
    case "reply-needed":
      return { tone: "reply", short: state.days > 0 ? `Reply · ${state.days}d` : "Reply needed", long: `They wrote ${state.days > 0 ? `${state.days} business day${state.days === 1 ? "" : "s"} ago` : "today"} — your turn to answer` };
    case "waiting": {
      if (state.last.scheduled) {
        const when = sendsAt(state.last.at);
        return { tone: "sched", short: when ? `Scheduled · ${when}` : "Scheduled", long: `${roundLabel(state.round).replace(/^your/, "Your")} is scheduled in Gmail${when ? ` — it sends ${when}` : ""}. It counts as done; cancel it in Gmail and the reminder comes back.` };
      }
      return { tone: "wait", short: `Follow up ${weekday(state.due)}`, long: `Waiting for a reply to ${roundLabel(state.round)} — follow up ${weekday(state.due)} if they stay quiet` };
    }
    case "exhausted":
      return { tone: "muted", short: "No reply", long: `No reply after ${state.round - 1} follow-ups — consider marking them No reply` };
    default:
      return null;
  }
}

/** Example cadence for the settings preview: "Mon → Wed → Fri → Tue…". */
export const cadencePreview = (rules: FollowupRules, start = nextWorkday(new Date(), rules), steps = 5) => {
  const out: { label: string; date: Date }[] = [{ label: "First email", date: start }];
  let sent = start;
  for (let round = 1; round <= steps; round++) {
    if (rules.stop_after > 0 && round > rules.stop_after) break;
    sent = dueDate(sent, round, rules);
    out.push({ label: `${ordinal(round)} follow-up`, date: sent });
  }
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
