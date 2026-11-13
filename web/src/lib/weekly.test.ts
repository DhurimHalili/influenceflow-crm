// Run: cd web && node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/weekly.test.ts
import { tzParts, weekStart, weeklyReport, zonedMidnight } from "./weekly.ts";
import { renderWeeklyEmail } from "./weeklyEmail.ts";
import { DEFAULT_FOLLOWUP_RULES } from "./prefs.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};

// Time zones: Monday 00:00 in Belgrade and in Los Angeles, DST included.
const BEL = "Europe/Belgrade", LA = "America/Los_Angeles";
eq("Belgrade midnight (winter, UTC+1)", new Date(zonedMidnight(2026, 11, 2, BEL)).toISOString(), "2026-11-01T23:00:00.000Z");
eq("Belgrade midnight (summer, UTC+2)", new Date(zonedMidnight(2026, 7, 6, BEL)).toISOString(), "2026-07-05T22:00:00.000Z");
eq("LA midnight on the DST switch day", new Date(zonedMidnight(2026, 11, 1, LA)).toISOString(), "2026-11-01T07:00:00.000Z");
const fri = Date.parse("2026-11-06T12:00:00Z");
eq("week of a Friday starts Monday", new Date(weekStart(fri, BEL)).toISOString(), "2026-11-01T23:00:00.000Z");
eq("last week starts the Monday before", new Date(weekStart(fri, BEL, -1)).toISOString(), "2026-10-25T23:00:00.000Z");
eq("parts", tzParts(Date.parse("2026-11-02T08:30:00Z"), BEL).wd, 1);

// A week: Monday report about Oct 26 – Nov 1 (Belgrade).
const now = new Date("2026-11-02T07:00:00Z"); // Monday 08:00 in Belgrade
const at = (day: number, hour: number) => new Date(Date.UTC(2026, 9, 26 + day, hour - 1)).toISOString(); // Belgrade = UTC+1 here
let n = 0;
const rec = (id: string, extra = {}) => ({ id, name: id === "c1" ? "Ana <script>" : id, pipeline_status: "contacted", date_contacted: null, archived_at: null, created_at: "2026-09-01T00:00:00Z", lost_at: null, lost_reason: "", contact_channel: "email", email_followups: true, socials: [], ...extra }) as never;
const ev = (entity: string, dir: "in" | "out", when: string, extra = {}) => ({ id: `e${++n}`, gmail_id: `g${n}`, thread_id: `t-${entity}`, direction: dir, entity_type: "creator", entity_id: entity, at: when, mailbox: "me@agency.com", scheduled: false, reply_kind: "", subject: "", snippet: "", counterpart: "", message_key: "", in_reply_to: "", ...extra }) as never;
const creators = Array.from({ length: 12 }, (_, i) => rec(`c${i + 1}`));
// Mon: 5 first emails; Tue: 3; Wed: 0; Thu: 2 follow-ups; Fri: 1; Sun: 1 (bonus). c1 replies Tue.
const events = [
  ...[1, 2, 3, 4, 5].map((i) => ev(`c${i}`, "out", at(0, 10 + i))),
  ...[6, 7, 8].map((i) => ev(`c${i}`, "out", at(1, 10 + i))),
  ev("c1", "in", at(1, 18)),
  ev("c2", "out", at(3, 11)), ev("c3", "out", at(3, 12)),
  ev("c9", "out", at(4, 11)),
  ev("c10", "out", at(6, 11)),
  ev("c11", "out", at(-2, 11)), // the week before: not counted
];
const base = { creators, brands: [], contacts: [], followups: [], events, leads: [], activities: [], campaigns: [], goal: 5, rules: DEFAULT_FOLLOWUP_RULES, name: "Dhurim Halili", timeZone: BEL, now, appUrl: "https://example.com/crm" };
const r = weeklyReport({ ...base, which: "last" });
eq("range", r.range, "Oct 26 – Nov 1, 2026");
eq("sent per day (Mon..Sun)", r.days.map((d) => d.sent), [5, 3, 0, 2, 1, 0, 1]);
eq("day statuses", r.days.map((d) => d.status), ["hit", "low", "zero", "low", "low", "off", "bonus"]);
eq("totals vs goal", [r.sent.now, r.goalTotal, r.daysHit, r.workdays], [12, 25, 1, 5]);
eq("previous week counted for the delta", r.sent.before, 1);
eq("new conversations + follow-ups", [r.newConversations.now, r.followups.now], [10, 2]);
eq("people replied", r.repliers.now, 1);
eq("a low week reads as not productive", [r.verdict.tone, r.verdict.headline.length > 0], ["bad", true]);
eq("reply names are listed", r.replyNames, ["Ana <script>"]);

// Same effort, but a win this week: "not productive — still good results".
const lucky = weeklyReport({ ...base, which: "last", activities: [{ id: "a1", text: "c1 updated to roster", at: at(2, 12), entity_type: "creator", entity_id: "c1" }] as never[] });
eq("lucky week", [lucky.verdict.tone, lucky.wins.now], ["lucky", 1]);
// Lots of effort, no replies: "the work is in".
const busyEvents = [...events, ...Array.from({ length: 30 }, (_, i) => ev(`c${(i % 12) + 1}`, "out", at(i % 5, 9)))];
const busy = weeklyReport({ ...base, events: busyEvents, which: "last" });
eq("busy week counts", busy.sent.now >= busy.goalTotal, true);

const mail = renderWeeklyEmail(r);
eq("subject carries the verdict", mail.subject.includes(r.verdict.headline), true);
eq("names are escaped", [mail.html.includes("Ana <script>"), mail.html.includes("Ana &lt;script&gt;")], [false, true]);
eq("links point into the app", mail.html.includes("https://example.com/crm/#/app/influencers?follow=due"), true);
eq("plain-text part", mail.text.includes("Sent 12 / 25 goal (48%)"), true);
eq("greets by first name", mail.html.includes("Dhurim, here's your week"), true);
// The weekly backup: listed only when files are attached, names escaped, in the text part too.
eq("no backup section without files", mail.html.includes("Your backup"), false);
const withBackup = renderWeeklyEmail(r, { backup: { files: [{ name: "influencers-<x>.xlsx", rows: 321, noun: "influencers", bytes: 230000 }, { name: "brands-2026-11-15.xlsx", rows: 408, noun: "brands", bytes: 2_400_000 }] } });
eq("backup listed with rows and size", [withBackup.html.includes("Your backup"), withBackup.html.includes("321 influencers · 225 KB"), withBackup.html.includes("408 brands · 2.3 MB")], [true, true, true]);
eq("backup file names escaped", withBackup.html.includes("influencers-&lt;x&gt;.xlsx"), true);
eq("backup in the plain-text part", withBackup.text.includes("To restore: Influencers or Brands → Import"), true);

// "This week so far" on Sunday evening: future days are not judged.
const sunday = weeklyReport({ ...base, which: "this", now: new Date("2026-10-28T17:00:00Z") });
eq("so far: later days are still to come", sunday.days.slice(3).every((d) => d.status === "future"), true);

// Which mailbox did what: two mailboxes, each with its own share.
{
  const second = [ev("c2", "out", at(1, 10), { mailbox: "second@agency.com", thread_id: "t-x1" }), ev("c3", "out", at(1, 11), { mailbox: "second@agency.com", thread_id: "t-x2" })];
  const two = weeklyReport({ ...base, events: [...(events as never[]), ...second], which: "last" });
  const me = two.mailboxes.find((m) => m.email === "me@agency.com"), sec = two.mailboxes.find((m) => m.email === "second@agency.com");
  eq("one line per mailbox", [two.mailboxes.length, !!me, !!sec], [2, true, true]);
  eq("each mailbox counts its own emails", [sec?.emails.now, (me?.emails.now || 0) + (sec?.emails.now || 0) === two.emails.total.now], [2, true]);
  const html = renderWeeklyEmail(two);
  eq("the email shows which mailbox did what", [html.html.includes("Which mailbox did what"), html.html.includes("second"), html.text.includes("second@agency.com: 2 emails")], [true, true, true]);
  eq("one mailbox: a single card, no comparison", weeklyReport({ ...base, which: "last" }).mailboxes.length, 1);
}

if (fail) { console.log(`${fail} failed`); (globalThis as { process?: { exit(n: number): void } }).process?.exit(1); } else console.log("all weekly tests pass");
