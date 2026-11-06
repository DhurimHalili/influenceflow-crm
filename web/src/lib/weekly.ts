import type { Activity, Brand, BrandContact, Campaign, Creator, EmailEvent, Followup, FollowupRules, InboundLead } from "../types";
import { makeStats } from "./dashboardStats.ts";
import { chaseList } from "./followupEngine.ts";
import { build, type Sent } from "./outreach.ts";

// The weekly report: one week of your CRM, in your time zone, counted exactly
// like the dashboard (same logs, same rules). Pure — the app renders it as a
// preview, the server (weekly-report function) renders and emails it.
//
// Effort = what you sent (emails + follow-ups on any channel, the coach's
// daily goal) against your goal on your workdays. Results = replies,
// negotiations, wins. The verdict reads both: a lazy week with great results
// is "not productive — but still good results", a busy week with no replies
// yet is "the work is in, the replies are coming".

export type WeeklyInput = {
  creators: Creator[]; brands: Brand[]; contacts: BrandContact[]; followups: Followup[]; events: EmailEvent[];
  leads: InboundLead[]; activities: Activity[]; campaigns: Campaign[];
  goal: number; rules: FollowupRules; name: string; timeZone: string;
  /** "last" = the full week before the one `now` is in (Monday report); "this" = the week `now` is in (Sunday report). */
  which: "last" | "this";
  now?: Date;
  appUrl?: string;
};

export type DayLine = { label: string; date: string; sent: number; emails: number; replies: number; workday: boolean; status: "hit" | "close" | "low" | "zero" | "off" | "bonus" | "future" };
export type Tone = "great" | "good" | "mixed" | "lucky" | "bad";
export type Delta = { now: number; before: number };

export type WeeklyReport = {
  name: string; timeZone: string; appUrl: string;
  title: string; range: string; startMs: number; endMs: number; partial: boolean;
  goal: number; workdays: number; goalTotal: number; sent: Delta; effort: number; daysHit: number;
  days: DayLine[];
  emails: { total: Delta; first: number; followups: number; answers: number; newthreads: number; scheduled: number; otherFollowups: number };
  followups: Delta; newConversations: Delta;
  repliers: Delta; replies: number; replyRate: { contacted: number; replied: number; pct: number | null };
  negotiations: Delta; wins: Delta; lost: Delta; added: Delta;
  leads: { received: number; answered: number };
  segments: { creator: number; brand: number };
  winNames: string[]; replyNames: string[]; lostNames: string[];
  best: DayLine | null;
  next: { due: number; newThreads: number; replyNeeded: number; scheduledNext: number; reachBack: number };
  verdict: { tone: Tone; emoji: string; headline: string; line: string; effortWord: string; resultWord: string };
};

const DAY = 86400000;

/** Calendar parts of an instant in a time zone. */
export function tzParts(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23", weekday: "short" }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { y: Number(get("year")), m: Number(get("month")), d: Number(get("day")), h: Number(get("hour")) % 24, min: Number(get("minute")), wd };
}

/** The instant a local calendar day starts in a time zone (DST-safe). */
export function zonedMidnight(y: number, m: number, d: number, timeZone: string) {
  const target = Date.UTC(y, m - 1, d);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = tzParts(guess, timeZone);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    const next = target - (asUtc - guess);
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

/** A valid IANA zone, or UTC. */
export const safeZone = (tz: string | undefined) => {
  try { if (tz) { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } } catch { /* fall through */ }
  return "UTC";
};

/** Monday 00:00 of the week `ms` is in, and of the weeks around it, in a time zone. */
export function weekStart(ms: number, timeZone: string, offsetWeeks = 0) {
  const p = tzParts(ms, timeZone);
  const back = (p.wd + 6) % 7;
  const base = new Date(Date.UTC(p.y, p.m - 1, p.d - back + offsetWeeks * 7));
  return zonedMidnight(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), timeZone);
}

/** Pick by a seed so the same week always reads the same, but weeks differ. */
const pick = <T,>(items: T[], seed: number) => items[Math.abs(seed) % items.length];

export function weeklyReport(input: WeeklyInput): WeeklyReport {
  const now = input.now || new Date();
  const tz = safeZone(input.timeZone);
  const offset = input.which === "last" ? -1 : 0;
  const s = weekStart(now.getTime(), tz, offset);
  const e = weekStart(now.getTime(), tz, offset + 1);
  const ps = weekStart(now.getTime(), tz, offset - 1);
  const partial = now.getTime() < e;
  // A finished week counts up to its end; a week in progress up to now (scheduled emails up to Sunday night).
  const end = Math.min(e, now.getTime());
  const { sent, received } = build({ creators: input.creators, brands: input.brands, contacts: input.contacts, followups: input.followups, events: input.events, leads: input.leads, now });
  const stats = makeStats({ sent, received, creators: input.creators, brands: input.brands, contacts: input.contacts, campaigns: input.campaigns, activities: input.activities, leads: input.leads });
  const within = (x: Sent, a: number, b: number) => { const t = new Date(x.at).getTime(); return t >= a && t < b; };
  const sentIn = (a: number, b: number) => sent.filter((x) => !x.scheduled && within(x, a, b)).length;
  const d = (now_: number, before: number): Delta => ({ now: now_, before });

  const workdaySet = new Set(input.rules.workdays?.length ? input.rules.workdays : [1, 2, 3, 4, 5]);
  const holidays = new Set(input.rules.holidays || []);
  const goal = Math.max(1, input.goal || 50);
  const days: DayLine[] = [];
  for (let i = 0; i < 7; i++) {
    const sp = tzParts(s + i * DAY + 12 * 3600000, tz);
    const ds = zonedMidnight(sp.y, sp.m, sp.d, tz);
    const np = tzParts(ds + 36 * 3600000, tz);
    const de = zonedMidnight(np.y, np.m, np.d, tz);
    const iso = `${sp.y}-${String(sp.m).padStart(2, "0")}-${String(sp.d).padStart(2, "0")}`;
    const workday = workdaySet.has(sp.wd) && !holidays.has(iso);
    const count = sentIn(ds, Math.min(de, end));
    const emails = sent.filter((x) => !x.scheduled && x.channel === "email" && within(x, ds, Math.min(de, end))).length;
    const replies = new Set(received.filter((r) => { const t = new Date(r.at).getTime(); return t >= ds && t < Math.min(de, end); }).map((r) => r.entityId)).size;
    const future = ds >= now.getTime();
    const status: DayLine["status"] = future ? "future" : !workday ? (count > 0 ? "bonus" : "off") : count >= goal ? "hit" : count >= goal * 0.7 ? "close" : count > 0 ? "low" : "zero";
    days.push({ label: new Date(ds).toLocaleDateString("en-US", { timeZone: tz, weekday: "short" }), date: new Date(ds).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" }), sent: count, emails, replies, workday, status });
  }
  const workdays = days.filter((x) => x.workday && x.status !== "future").length || days.filter((x) => x.workday).length;
  const goalTotal = goal * workdays;
  const total = sentIn(s, end);
  const effort = goalTotal ? total / goalTotal : 0;
  const daysHit = days.filter((x) => x.status === "hit").length;

  const horizon = input.which === "this" ? e : end;
  const mix = stats.emailMix("all", s, end, horizon);
  const prevMix = stats.emailMix("all", ps, s, s);
  const count = (m: Parameters<typeof stats.count>[0], a: number, b: number) => stats.count(m, "all", a, b);
  const names = (m: Parameters<typeof stats.rows>[0]) => Array.from(new Set(stats.rows(m, "all", s, end).map((r) => r.name))).slice(0, 6);

  const repliers = d(stats.repliers("all", s, end), stats.repliers("all", ps, s));
  const wins = d(count("wins", s, end), count("wins", ps, s));
  const negotiations = d(count("negotiations", s, end), count("negotiations", ps, s));
  const lost = d(count("lost", s, end), count("lost", ps, s));
  const leadsIn = input.leads.filter((l) => { const t = new Date(l.first_at).getTime(); return t >= s && t < end; });

  const segCount = (seg: "creator" | "brand") => sent.filter((x) => !x.scheduled && x.segment === seg && within(x, s, end)).length;

  const chase = chaseList(input.creators, input.brands, input.followups, input.events, input.rules, now);
  const isThread = (c: (typeof chase)[number]) => c.state.kind === "due" && (c.state as { next?: string }).next === "new-thread";

  const best = [...days].filter((x) => x.sent > 0).sort((a, b) => b.sent - a.sent)[0] || null;

  // The verdict: effort × results.
  const resultsGood = wins.now > 0 || negotiations.now >= 2 || repliers.now >= Math.max(3, Math.round(total * 0.08));
  const effortWord = effort >= 1 ? "crushed" : effort >= 0.8 ? "solid" : effort >= 0.5 ? "half" : "low";
  const seed = Math.floor(s / DAY);
  let tone: Tone, emoji: string, headline: string, line: string;
  if (effort >= 1 && resultsGood) { tone = "great"; emoji = "🔥"; headline = pick(["Monster week", "Absolute machine of a week", "This is how rosters get built"], seed); line = pick([`${total} sent against a ${goalTotal} goal — and it paid off. Frame this one.`, "Goal beaten, replies in, deals moving. Take the weekend seriously, you earned it.", "Effort and results in the same week. Rare. Do it again."], seed); }
  else if (effort >= 0.8 && resultsGood) { tone = "good"; emoji = "💪"; headline = pick(["Solid week", "Strong week", "Good week, good results"], seed); line = pick(["Close to your goal and the results are there. A few more a day and it's a monster week.", "The work showed up and so did the replies. Keep the rhythm."], seed); }
  else if (effort >= 0.8) { tone = "mixed"; emoji = "📬"; headline = pick(["The work is in — the replies are coming", "Great effort, quiet inboxes", "You did your part"], seed); line = pick(["You hit the volume; replies lag a few days behind. Next week's follow-ups are where this pays off.", "Busy week, slow replies. That's outreach — keep the follow-ups going and it turns."], seed); }
  else if (resultsGood) { tone = "lucky"; emoji = "🍀"; headline = pick(["Not a productive week… but still good results", "Low effort, good luck", "The results carried you this week"], seed); line = pick([`Only ${Math.round(effort * 100)}% of your goal — yet the replies kept coming. Imagine a full week.`, "Earlier work paid off this week. Don't let the pipeline dry up — next week needs volume.", "Good results on a light week. That's a hint of what a full one could do."], seed); }
  else { tone = "bad"; emoji = effort < 0.3 ? "🐢" : "😬"; headline = pick(effort < 0.3 ? ["Not a productive week", "The inbox missed you", "Did your keyboard go on holiday?"] : ["Not a productive week", "A slow one", "Room to grow"], seed); line = pick(effort < 0.3 ? [`${total} sent against a ${goalTotal} goal. The influencers won't email themselves 😅`, "Even the snail is asking if you're okay. New week, clean slate — let's go.", `About ${Math.round(total / Math.max(1, workdays))} a day on a ${goal}-a-day goal. Monday is a great day to fix that.`] : [`${Math.round(effort * 100)}% of your goal and few replies — more volume is the fastest fix.`, "Not terrible, not great. Pick a time block each day for outreach and protect it."], seed); }
  const resultWord = resultsGood ? "good" : "quiet";

  const fmt = (ms: number, o: Intl.DateTimeFormatOptions) => new Date(ms).toLocaleDateString("en-US", { timeZone: tz, ...o });
  return {
    name: input.name, timeZone: tz, appUrl: input.appUrl || "",
    title: input.which === "this" ? "Your week so far" : "Your week",
    range: `${fmt(s, { month: "short", day: "numeric" })} – ${fmt(e - DAY / 2, { month: "short", day: "numeric", year: "numeric" })}`,
    startMs: s, endMs: e, partial,
    goal, workdays, goalTotal, sent: d(total, sentIn(ps, s)), effort, daysHit, days,
    emails: { total: d(mix.total, prevMix.total), first: mix.first, followups: mix.followups, answers: mix.answers, newthreads: mix.newthreads, scheduled: mix.scheduled, otherFollowups: mix.otherFollowups },
    followups: d(count("followups", s, end), count("followups", ps, s)),
    newConversations: d(count("first", s, end), count("first", ps, s)),
    repliers, replies: count("replies", s, end), replyRate: stats.replyRate("all", s, end),
    negotiations, wins, lost, added: d(count("added", s, end), count("added", ps, s)),
    leads: { received: leadsIn.length, answered: leadsIn.filter((l) => (l.my_replies || []).length > 0 || !!l.replied_at).length },
    segments: { creator: segCount("creator"), brand: segCount("brand") },
    winNames: names("wins"), replyNames: names("replies"), lostNames: names("lost"),
    best,
    next: {
      due: chase.filter((c) => c.state.kind === "due" && !isThread(c)).length,
      newThreads: chase.filter(isThread).length,
      replyNeeded: chase.filter((c) => c.state.kind === "reply-needed").length,
      reachBack: chase.filter((c) => c.state.kind === "reach-back").length,
      scheduledNext: sent.filter((x) => x.scheduled && new Date(x.at).getTime() >= Math.max(e, now.getTime())).length,
    },
    verdict: { tone, emoji, headline, line, effortWord, resultWord },
  };
}
