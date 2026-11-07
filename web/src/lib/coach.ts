import type { Sent } from "./outreach";

// The coach: one honest read of how today is going — emails sent against the
// daily goal, follow-ups that slipped past your own rules, people waiting on a
// reply — turned into one clear challenge. Plain, upbeat language; the tougher
// the day, the more specific the push.

export type CoachStats = {
  goal: number;
  sentToday: number;
  /** Waiting in Gmail's Scheduled folder (they count once they go out). */
  scheduled: number;
  yesterday: number;
  weekAvg: number;
  /** Consecutive days (before today) the goal was hit. */
  streak: number;
  overdue: number;
  oldestOverdueDays: number;
  replyNeeded: number;
  hour: number;
  weekday: number;
  /** Today's kind (lib/dayMode): a scout day swaps the email goal for finding influencers. */
  mode: "normal" | "light" | "scout";
  /** Influencers added today, and the scouting goal. */
  found: number;
  scoutGoal: number;
  /** What the ring counts today: emails, or influencers found on a scout day. */
  unit: "emails" | "found";
  value: number;
  target: number;
};

export type Nudge = {
  id: string;
  tone: "push" | "focus" | "cheer" | "win";
  title: string;
  body: string;
  challenge?: { label: string; target: number; current: number };
  cta?: { label: string; to: string };
};

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** Outreach per local day — every email and follow-up you sent (see lib/outreach), scheduled ones not yet. */
export function outreachByDay(log: Sent[], days = 15, now = new Date()) {
  const counts = new Map<string, number>();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)).getTime();
  for (const s of log) {
    const t = new Date(s.at);
    if (s.scheduled || t.getTime() < start) continue;
    const key = dayKey(t);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

export function coachStats(input: { log: Sent[]; goal: number; overdue: number; oldestOverdueDays: number; replyNeeded: number; now?: Date; mode?: CoachStats["mode"]; found?: number; scoutGoal?: number }): CoachStats {
  const now = input.now || new Date();
  const counts = outreachByDay(input.log, 15, now);
  const back = (i: number) => counts.get(dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i))) || 0;
  let streak = 0;
  for (let i = 1; i <= 14; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue; // weekends don't break a streak
    if (back(i) >= input.goal) streak++;
    else break;
  }
  const week = [1, 2, 3, 4, 5, 6, 7].map(back);
  const mode = input.mode || "normal";
  const found = input.found || 0;
  const scoutGoal = input.scoutGoal || 10;
  const sentToday = back(0);
  const scout = mode === "scout";
  return { goal: input.goal, sentToday, scheduled: input.log.filter((s) => s.scheduled).length, yesterday: back(1), weekAvg: Math.round(week.reduce((a, b) => a + b, 0) / 7), streak, overdue: input.overdue, oldestOverdueDays: input.oldestOverdueDays, replyNeeded: input.replyNeeded, hour: now.getHours(), weekday: now.getDay(), mode, found, scoutGoal, unit: scout ? "found" : "emails", value: scout ? found : sentToday, target: scout ? scoutGoal : input.goal };
}

const pick = <T,>(list: T[], seed: number) => list[Math.abs(seed) % list.length];

/** Scout day: no emails — the goal is finding influencers for the week. */
function scoutNudge(s: CoachStats, seed: number): Nudge {
  const left = Math.max(0, s.scoutGoal - s.found);
  if (s.found >= s.scoutGoal) return { id: "scout-won", tone: "win", title: pick([`Scouting done: ${s.found} found`, `${s.found} new names. Monday is loaded.`, "Shortlist: full. Nicely done."], seed), body: pick(["Rate them while they're fresh — the stars decide who gets the first email.", "Anything extra today is pure bonus for next week.", "Monday-you just got a head start."], seed), cta: { label: "See today's finds", to: "/app/influencers" } };
  if (s.found === 0) return { id: "scout-zero", tone: "push", title: pick([`Scout day: find ${s.scoutGoal} new influencers`, `Radar on. ${s.scoutGoal} to find today.`, `Today's mission: ${s.scoutGoal} fresh names`], seed), body: "No emails today. Look for channels like your best roster creators and add them here — quick fill does the numbers.", challenge: { label: "Found", target: s.scoutGoal, current: 0 }, cta: { label: "Add an influencer", to: "/app/influencers?new=1" } };
  return { id: "scout-go", tone: left <= 3 ? "cheer" : "focus", title: pick([`${s.found} found, ${left} to go`, left <= 3 ? `Only ${left} left — finish the list` : "Good hunting — keep the radar on", `${s.found}/${s.scoutGoal} on the shortlist`], seed), body: "Every name you add today is a first email on Monday.", challenge: { label: "Found", target: s.scoutGoal, current: s.found }, cta: { label: "Add the next one", to: "/app/influencers?new=1" } };
}

/** The one thing to do next, worded for how the day is actually going. */
export function pickNudge(s: CoachStats, seed = new Date().getDate()): Nudge {
  if (s.mode === "scout") return scoutNudge(s, seed);
  if (s.mode === "light" && s.sentToday === 0 && s.sentToday < s.goal) return { id: "light-zero", tone: "push", title: pick(["New names only today", "Light day: first emails and replies", `${s.goal} new hellos — no follow-ups needed`], seed), body: `Follow-ups wait for the next working day. Write to people who've never heard from you${s.replyNeeded ? `, and answer the ${s.replyNeeded} who wrote` : ""}.`, challenge: { label: "Emails", target: Math.min(10, s.goal), current: 0 }, cta: { label: "Pick someone new", to: "/app/influencers?status=new" } };
  const left = Math.max(0, s.goal - s.sentToday);
  const pct = s.goal ? s.sentToday / s.goal : 1;
  const sprint = Math.min(left, s.hour >= 15 ? 25 : 20);

  if (s.sentToday >= s.goal) {
    return { id: "won", tone: "win", title: pick([`Goal smashed — ${s.sentToday} today`, `${s.goal} done. You're on fire.`, "Daily goal: complete"], seed), body: s.overdue ? `Want a clean sheet too? ${s.overdue} follow-up${s.overdue === 1 ? "" : "s"} still waiting.` : pick(["Every email from here is pure bonus.", "Tomorrow-you will thank today-you.", "This is how rosters get built."], seed), cta: s.overdue ? { label: "Clear follow-ups", to: "/app/influencers?follow=due" } : undefined };
  }
  if (s.replyNeeded > 0) {
    return { id: "reply", tone: "focus", title: `${s.replyNeeded} ${s.replyNeeded === 1 ? "person is" : "people are"} waiting on you`, body: "They wrote back — that's the hardest part done. Reply while they're warm, then get back to outreach.", cta: { label: "Answer them", to: "/app/influencers?follow=reply" } };
  }
  if (s.overdue >= 5) {
    const target = Math.min(s.overdue, 20);
    return { id: "overdue", tone: "push", title: pick([`Can we clear ${target} follow-ups right now?`, `${s.overdue} follow-ups slipped past your schedule`, `Follow-up blitz: ${target} in a row`], seed), body: `Your rules say follow up — ${s.oldestOverdueDays > 1 ? `the oldest has been waiting ${s.oldestOverdueDays} business days` : "they're due"}. Most replies come from the follow-up, not the first email. Start with the oldest and don't stop until the list is clear.`, cta: { label: "Start the blitz", to: "/app/influencers?follow=due" } };
  }
  if (s.sentToday === 0) {
    if (s.hour < 12) return { id: "fresh", tone: "push", title: pick(["Fresh day. First 10 before lunch?", "Challenge: 10 emails before noon", "Start strong — 10 quick ones"], seed), body: `The goal is ${s.goal} today.${s.yesterday < s.goal * 0.5 ? ` Yesterday ended at ${s.yesterday} — let's beat that by lunchtime.` : ""} The first ten are the hardest; after that it rolls.`, challenge: { label: "Emails", target: Math.min(10, s.goal), current: 0 }, cta: { label: "Pick influencers", to: "/app/influencers?status=new" } };
    return { id: "zero", tone: "push", title: pick([`0 of ${s.goal} — let's change that now`, "Nothing sent yet today. Let's go.", `Challenge: ${sprint} emails, no stopping`], seed), body: `Block the next hour. ${sprint} emails without checking anything else. You've got this — and the coach is counting.`, challenge: { label: "Emails", target: sprint, current: 0 }, cta: { label: "Start now", to: "/app/influencers?status=new" } };
  }
  if (pct < 0.3 && s.hour >= 14) {
    return { id: "behind", tone: "push", title: pick([`Challenge: ${sprint} emails in the next hour`, `You're at ${s.sentToday}/${s.goal} — sprint time`, `${left} to go. Let's do ${sprint} without stopping`], seed), body: `The afternoon is where days are won. ${sprint} back-to-back emails puts you at ${s.sentToday + sprint}.${s.weekAvg ? ` Your weekly average is ${s.weekAvg}.` : ""}`, challenge: { label: "Emails", target: s.sentToday + sprint, current: s.sentToday }, cta: { label: "Sprint", to: "/app/influencers?status=new" } };
  }
  if (s.overdue > 0) {
    return { id: "few-overdue", tone: "focus", title: `${s.overdue} follow-up${s.overdue === 1 ? "" : "s"} due — knock ${s.overdue === 1 ? "it" : "them"} out`, body: `Then back to new outreach: ${s.sentToday}/${s.goal} so far.`, cta: { label: "Follow up", to: "/app/influencers?follow=due" } };
  }
  if (pct >= 0.7) {
    return { id: "close", tone: "cheer", title: pick([`Only ${left} left — finish it!`, `${s.sentToday}/${s.goal}. The finish line is right there`, `${left} more and the day is yours`], seed), body: s.streak ? `Hit it and that's ${s.streak + 1} days in a row.` : "Close it out and start a streak.", challenge: { label: "Emails", target: s.goal, current: s.sentToday }, cta: { label: "Keep going", to: "/app/influencers?status=new" } };
  }
  return { id: "rhythm", tone: "cheer", title: pick([`${s.sentToday} down, ${left} to go`, "Good rhythm — keep it rolling", `Halfway mark is ${Math.ceil(s.goal / 2)}. Next stop?`], seed), body: `Challenge: ${Math.min(left, 15)} more before your next break.${s.streak ? ` ${s.streak}-day streak on the line.` : ""}`, challenge: { label: "Emails", target: s.goal, current: s.sentToday }, cta: { label: "Next influencer", to: "/app/influencers?status=new" } };
}
