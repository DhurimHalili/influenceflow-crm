// Weekend rhythm. Each day of the week is one of three kinds:
//   normal — everything goes: new outreach, replies, follow-ups.
//   light  — new outreach and replies only; follow-ups wait for the next
//            normal day (default Saturday).
//   scout  — nothing is sent; the goal is finding new influencers (default
//            Sunday). Scheduling an email in Gmail for a later day is fine on
//            any day: it counts on the day it goes out.
// Pure (no React, no DOM) so the server can import it too.

export type DayMode = "normal" | "light" | "scout";
export type WeekendPrefs = { saturday: DayMode; sunday: DayMode; scout_goal: number; reminders: boolean };

export const DEFAULT_WEEKEND: WeekendPrefs = { saturday: "light", sunday: "scout", scout_goal: 10, reminders: true };

const MODES: DayMode[] = ["normal", "light", "scout"];
const isMode = (v: unknown): v is DayMode => MODES.includes(v as DayMode);

export const normalizeWeekend = (value: unknown): WeekendPrefs => {
  const v = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const goal = Math.round(Number(v.scout_goal));
  return {
    saturday: isMode(v.saturday) ? v.saturday : DEFAULT_WEEKEND.saturday,
    sunday: isMode(v.sunday) ? v.sunday : DEFAULT_WEEKEND.sunday,
    scout_goal: Number.isFinite(goal) && goal >= 1 && goal <= 200 ? goal : DEFAULT_WEEKEND.scout_goal,
    reminders: v.reminders !== false,
  };
};

/** The kind of day `date` is (local time). */
export const modeOn = (date: Date, w: WeekendPrefs = DEFAULT_WEEKEND): DayMode => {
  const d = date.getDay();
  return d === 6 ? w.saturday : d === 0 ? w.sunday : "normal";
};

/** Follow-ups are parked on light and scout days. */
export const followupsPaused = (mode: DayMode) => mode !== "normal";
/** Nothing is sent on a scout day — not even replies. */
export const sendingPaused = (mode: DayMode) => mode === "scout";

/** The next day (after `now`) where `allowed` is true; at most two weeks ahead. */
const nextDay = (now: Date, w: WeekendPrefs, allowed: (m: DayMode) => boolean) => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 1; i <= 14; i++) {
    d.setDate(d.getDate() + 1);
    if (allowed(modeOn(d, w))) return new Date(d);
  }
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
};

/** When parked follow-ups come back: the next normal day. */
export const followupsResume = (now: Date, w: WeekendPrefs) => nextDay(now, w, (m) => m === "normal");
/** When replies can go out again: the next day that isn't a scout day. */
export const sendingResumes = (now: Date, w: WeekendPrefs) => nextDay(now, w, (m) => m !== "scout");

/** "tomorrow" or the weekday name ("Monday") — never a date the user has to work out. */
export const dayWord = (day: Date, now = new Date()) => {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const diff = Math.round((b - a) / 86400000);
  if (diff === 1) return "tomorrow";
  return LONG_DAY.format(day);
};
// Built once: creating an Intl formatter is slow, and lists ask for these on every row.
const LONG_DAY = new Intl.DateTimeFormat("en-US", { weekday: "long" });
const SHORT_DAY = new Intl.DateTimeFormat("en-US", { weekday: "short" });
/** "Mon" style short weekday. */
export const dayShort = (day: Date) => SHORT_DAY.format(day);

export const MODE_LABEL: Record<DayMode, string> = { normal: "Normal day", light: "No follow-ups", scout: "Scout day" };

/** Influencers added on the local day of `now` (scouting progress). */
export const foundToday = (creators: { created_at: string; archived_at?: string | null }[], now = new Date()) => {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = start + 86400000;
  return creators.filter((c) => !c.archived_at && (() => { const t = new Date(c.created_at).getTime(); return t >= start && t < end; })()).length;
};

// The weekend briefing: a different line each time. Plain words, light humour —
// nothing about faces, animals or anyone's holy days. Every line is literally
// true: follow-ups are paused (not "napping"), nothing goes out on a scout day.
// {day} / {Day} = when they come back ("Monday", or "tomorrow" if Sunday is a
// normal day in Settings → Weekends).
export const BRIEF_LINES: Record<Exclude<DayMode, "normal">, { title: string; line: string }[]> = {
  light: [
    { title: "Follow-ups are off duty. You're not.", line: "First emails and replies — that's the whole menu today." },
    { title: "No chasing. Just catching.", line: "Open new doors today; knocking twice waits for {day}." },
    { title: "Hello, yes. Hello again, {day}.", line: "First emails and replies go out today. Follow-ups are parked for {day}, right where you left them." },
    { title: "Half the rules, all of the wins.", line: "Pitch someone new, answer whoever wrote. Follow-ups are on hold until {day}." },
    { title: "{Day}-you will chase. Today-you discovers.", line: "Find the next big one and say hello. Every follow-up is saved for {day}." },
    { title: "Light day, sharp aim.", line: "One great first email beats ten nudges. Make today's count." },
    { title: "Fresh names only.", line: "Follow-ups sit this one out and come back {day}. New inboxes are wide open." },
  ],
  scout: [
    { title: "Outbox closed. Radar open.", line: "No emails today — just find the people you'll pitch {day}." },
    { title: "Today you're a talent scout, not a mail carrier.", line: "Add them to the CRM now; the emails go out {day}." },
    { title: "Find them today. Wow them {day}.", line: "A full list today means a fast start {day}." },
    { title: "Send nothing. Find everything.", line: "Channels, numbers, contact info — line them up for the week." },
    { title: "Treasure-hunting day.", line: "No emails go out today. Every good channel you add is a pitch ready for {day}." },
    { title: "Pipeline's hungry. Feed it.", line: "Scout, add, rate. {Day}-you gets a head start." },
    { title: "Zero emails. Full shortlist.", line: "Hit your scouting goal and {day}'s list is already waiting." },
  ],
};

const fill = (text: string, day: string) => text.replace(/\{day\}/g, day).replace(/\{Day\}/g, day.charAt(0).toUpperCase() + day.slice(1));

/** A random line, with {day} filled in ("Monday" / "tomorrow"). */
export const pickLine = (mode: Exclude<DayMode, "normal">, seed = Math.random(), day = "Monday") => {
  const list = BRIEF_LINES[mode];
  const l = list[Math.floor(seed * list.length) % list.length];
  return { title: fill(l.title, day), line: fill(l.line, day) };
};
