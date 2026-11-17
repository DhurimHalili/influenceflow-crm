// Run (from web/): node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/autopilot.test.ts
import { assignTemplates, autopilotPool, ctaOf, dayCap, everReplied, fillNeed, fillTemplate, hungarian, pickWithin, readAutopilot, readTemplates, ruleFit, shiftToZone, type TemplateBook } from "./autopilot";
import { planTimes } from "./smartTime";
import { countryCode, dayEndIn, dayKeyIn, dayStartIn, localMinute, offsetMin, zonesOf } from "./zones";
import { followupState, type FollowupState } from "./followupEngine";
import type { Creator, EmailEvent, Followup, FollowupRules } from "../types";

let fail = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `→ got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
const truthy = (name: string, v: boolean) => check(name, v, true);

// ----- zones --------------------------------------------------------------------------------
check("country names → codes", [countryCode("United States"), countryCode("usa"), countryCode("UK"), countryCode("Kosovo"), countryCode("Narnia"), countryCode("")], ["US", "US", "GB", "XK", "", ""]);
check("US = New York + Los Angeles", zonesOf("US"), ["America/New_York", "America/Los_Angeles"]);
check("unknown country → no zones", zonesOf("Atlantis"), []);
const nov16 = Date.UTC(2026, 10, 16, 17, 0); // 18:00 in Kosovo
check("offsets in November", [offsetMin("Europe/Belgrade", nov16), offsetMin("America/Los_Angeles", nov16), offsetMin("Asia/Kolkata", nov16)], [60, -480, 330]);
check("Kosovo day starts at 23:00 UTC the day before", new Date(dayStartIn("Europe/Belgrade", nov16)).toISOString(), "2026-11-15T23:00:00.000Z");
check("…and ends at 23:00 UTC", new Date(dayEndIn("Europe/Belgrade", nov16)).toISOString(), "2026-11-16T23:00:00.000Z");
check("day key in a zone", [dayKeyIn("Europe/Belgrade", Date.UTC(2026, 10, 16, 23, 30)), dayKeyIn("America/New_York", Date.UTC(2026, 10, 16, 23, 30))], ["2026-11-17", "2026-11-16"]);
check("DST day: New York's 8 Mar 2026 starts at 05:00Z", new Date(dayStartIn("America/New_York", Date.UTC(2026, 2, 8, 18))).toISOString(), "2026-03-08T05:00:00.000Z");

// ----- smart time ------------------------------------------------------------------------------
const user = "Europe/Belgrade";
const at = (iso: string) => new Date(iso).getTime();
const one = planTimes([{ id: "us", mailbox: "a@x.com", zones: zonesOf("US"), firstAt: at("2026-11-10T19:41:00Z") /* 14:41 NY */ }], { now: nov16, userZone: user, seed: 1 });
truthy("US: placed today", one.placed.length === 1);
const usAt = one.placed[0].at;
truthy("US: within ±1 h of 14:41 New York", Math.abs(localMinute("America/New_York", usAt) - (14 * 60 + 41)) <= 60);
truthy("US: awake in Los Angeles too", localMinute("America/Los_Angeles", usAt) >= 8 * 60);
truthy("US: not on a round minute", localMinute("America/New_York", usAt) % 15 !== 0);
const au = planTimes([{ id: "au", mailbox: "a@x.com", zones: zonesOf("Australia"), firstAt: at("2026-11-10T00:30:00Z") }], { now: nov16, userZone: user });
check("Australia at 18:00 Kosovo: asleep until after your midnight", au.unplaced.map((u) => u.why), ["asleep"]);
truthy("…and says when their day opens (tomorrow)", (au.unplaced[0].opensAt || 0) > dayEndIn(user, nov16));
const noCountry = planTimes([{ id: "x", mailbox: "a@x.com", zones: [], firstAt: at("2026-11-12T19:20:00Z") /* 20:20 Kosovo */ }], { now: nov16, userZone: user, seed: 3 });
truthy("no country: near 20:20 your time", Math.abs(localMinute(user, noCountry.placed[0].at) - (20 * 60 + 20)) <= 60);

// 20 follow-ups, one mailbox, 3 hours left (21:00 Kosovo), all first sent ~9:30 in London.
const late = at("2026-11-16T20:00:00Z");
const twenty = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, mailbox: "a@x.com", zones: i < 10 ? zonesOf("US") : [], firstAt: at("2026-11-09T15:30:00Z") + i * 60_000 }));
const p20 = planTimes(twenty, { now: late, userZone: user, seed: 9 });
check("20 in 3 h: all placed", p20.placed.length, 20);
const mins = p20.placed.map((p) => Math.floor(p.at / 60_000)).sort((a, b) => a - b);
truthy("20 in 3 h: never the same minute", new Set(mins).size === 20);
truthy(`20 in 3 h: ≥ 3 minutes apart (gap ${p20.gap})`, mins.every((m, i) => !i || m - mins[i - 1] >= 3));
truthy("20 in 3 h: all before your midnight", p20.placed.every((p) => p.at < dayEndIn(user, late)));
truthy("20 in 3 h: none sooner than 2 minutes from now", p20.placed.every((p) => p.at >= late + 120_000));
truthy("20 in 3 h: US ones inside their day", p20.placed.filter((p) => p.id < "p10" || p.id.length === 2).every((p) => !zonesOf("US").length || p.zone === "" || localMinute("America/Los_Angeles", p.at) >= 480));
const roundish = p20.placed.filter((p) => localMinute(p.zone || user, p.at) % 15 === 0).length;
truthy(`20 in 3 h: few round minutes (${roundish})`, roundish <= 2);
check("same seed → same plan", planTimes(twenty, { now: late, userZone: user, seed: 9 }).placed.map((p) => p.at), p20.placed.map((p) => p.at));
const taken = planTimes([{ id: "n", mailbox: "a@x.com", zones: [], firstAt: at("2026-11-12T20:30:00Z") }], { now: late, userZone: user, seed: 2, taken: [{ mailbox: "a@x.com", at: at("2026-11-16T20:31:10Z") }] });
truthy("keeps clear of a send already queued", Math.abs(taken.placed[0].at - at("2026-11-16T20:31:10Z")) >= 3 * 60_000);
// India at 23:30 Kosovo = 04:00 there: asleep; a no-country person still fits before midnight.
const tight = planTimes([{ id: "in", mailbox: "a@x.com", zones: zonesOf("India"), firstAt: at("2026-11-10T06:00:00Z") }, { id: "nc", mailbox: "a@x.com", zones: [], firstAt: at("2026-11-10T09:00:00Z") }], { now: at("2026-11-16T22:30:00Z"), userZone: user });
check("23:30: India asleep, the no-country one goes", [tight.unplaced.map((u) => u.id), tight.placed.map((p) => p.id)], [["in"], ["nc"]]);

// ----- templates ---------------------------------------------------------------------------------
const book = (n: Record<number, string[]>): TemplateBook => readTemplates(Object.fromEntries(Object.entries(n).map(([r, list]) => [r, list.map((text, i) => ({ id: `r${r}t${i}`, name: `T${i}`, text }))])));
check("bad template entries dropped", readTemplates({ 1: [{ id: "ok-1", name: "A", text: "Hi" }, { id: "ok-1", text: "dup" }, { id: "x", text: "too short id" }, { id: "ok-2", text: "  " }, "junk"] })[1].map((t) => t.id), ["ok-1"]);
check("autopilot prefs defaults", readAutopilot(null), { fill: false, start: "21:00", cap: 0 });
check("fill tokens", fillTemplate("Hi {first_name},\nfrom {my_name} at {agency}", { name: "Sam Rivera", my_name: "Dhurim", agency: "" }), "Hi Sam,\nfrom Dhurim at");
const counts = (m: Map<string, string>) => { const c: Record<string, number> = {}; for (const v of m.values()) c[v] = (c[v] || 0) + 1; return Object.values(c).sort((a, b) => b - a); };
const five = book({ 1: ["a", "b", "c", "d", "f"] });
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, round: 1 as const }));
check("10 emails, 5 templates → each twice", counts(assignTemplates(rows(10), five)), [2, 2, 2, 2, 2]);
check("7 emails, 5 templates → 2,2,1,1,1", counts(assignTemplates(rows(7), five)), [2, 2, 1, 1, 1]);
check("3 emails, 5 templates → all different", counts(assignTemplates(rows(3), five)), [1, 1, 1]);
check("11 emails, 5 templates → 3,2,2,2,2 (never 3+1)", counts(assignTemplates(rows(11), five)), [3, 2, 2, 2, 2]);
const echoBook = book({ 1: ["Are you interested?", "Would you be interested in this?"] });
const echoFit = { r1t0: { score: 0.05, echo: true, why: "" }, r1t1: { score: 0.7, echo: false, why: "" } };
check("an echo is avoided even if it means repeating", [...assignTemplates([{ id: "a", round: 1, fits: echoFit }, { id: "b", round: 1, fits: echoFit }], echoBook).values()], ["r1t1", "r1t1"]);
const bestFits = { a: { r1t0: { score: 0.9, echo: false, why: "" }, r1t1: { score: 0.4, echo: false, why: "" } }, b: { r1t0: { score: 0.5, echo: false, why: "" }, r1t1: { score: 0.6, echo: false, why: "" } } } as const;
const pick2 = assignTemplates([{ id: "a", round: 1, fits: bestFits.a }, { id: "b", round: 1, fits: bestFits.b }], echoBook);
check("each email gets the one that fits it", [pick2.get("a"), pick2.get("b")], ["r1t0", "r1t1"]);
check("hungarian on a known matrix", hungarian([[4, 1, 3], [2, 0, 5], [3, 2, 2]]), [1, 0, 2]);

// The words.
const first = "Hi Sam,\n\nWe're working with a gaming brand on a winter campaign and your channel fits it perfectly.\n\nAre you interested?\n\nBest,\nDhurim";
check("the call to action", ctaOf(first), ["Are you interested?"]);
const would = ruleFit(first, "Hi {first_name},\n\nIt seems you missed our email — would you be interested in this opportunity?", 1);
const same = ruleFit(first, "Hi {first_name},\n\nJust bumping this up. Are you interested?", 1);
truthy("follow-up 1: 'would you be interested' after 'are you interested'", !would.echo && would.score > 0.6);
truthy("follow-up 1: 'are you interested' again is an echo", same.echo && same.score < would.score);
const third = "Hi Sam,\n\nIs this a bad time?\n\nDhurim";
const looks = ruleFit(third, "Looks like it might — I'll come back another time.", 4);
const mirror = ruleFit(third, "It might be, I'll come back another time.", 4);
const again = ruleFit(third, "Is this a bad time? Let me know.", 4);
truthy("follow-up 4: 'Looks like it might' beats 'It might be'", looks.score > mirror.score);
truthy("follow-up 4: asking 'bad time' again is worst", again.score < mirror.score && again.echo);
check("no question: the last line before the sign-off", ctaOf("Hey,\n\nWe have a deal for you.\nLet me know if you're up for it\n\nCheers,\nD"), ["Let me know if you're up for it"]);
check("quoted thread ignored", ctaOf("Any thoughts?\n\nOn Mon, 9 Nov 2026 at 10:00, Dhurim <d@x.com> wrote:\n> Are you interested?"), ["Any thoughts?"]);

// ----- who ---------------------------------------------------------------------------------------------
const rules: FollowupRules = { gaps: [1, 1, 1], then: 2, stop_after: 0, workdays: [1, 2, 3, 4, 5], holidays: [], reach_back_days: 30, thread_cap: 4, new_thread_gap: 1 } as FollowupRules;
const now = new Date("2026-11-16T10:00:00");
const c = (id: string, extra: Partial<Creator> = {}) => ({ id, name: `Creator ${id}`, country: "US", pipeline_status: "contacted", archived_at: null, contact_channel: "email", email_followups: true, date_contacted: "", ...extra }) as unknown as Creator;
let seq = 0;
const ev = (id: string, dir: "out" | "in", iso: string, extra: Partial<EmailEvent> = {}): EmailEvent => ({ id: `ev${++seq}`, gmail_id: `g${seq}`, thread_id: `t-${id}`, direction: dir, entity_type: "creator", entity_id: id, counterpart: "", subject: "Collab", snippet: "", at: iso, mailbox: "me@agency.com", ...extra });
const creators = [c("A"), c("B"), c("C"), c("D"), c("E"), c("F"), c("G", { pipeline_status: "negotiating" })];
const events: EmailEvent[] = [
  ev("A", "out", "2026-11-09T09:12:00"),
  ev("B", "out", "2026-11-02T09:00:00"), ev("B", "in", "2026-11-03T09:00:00"), ev("B", "out", "2026-11-04T09:00:00"),
  ev("C", "out", "2026-11-09T09:00:00"), ev("C", "in", "2026-11-09T09:01:00", { reply_kind: "auto" }),
  ev("D", "out", "2026-11-09T09:00:00"), ev("D", "in", "2026-11-09T12:00:00", { reply_kind: "reaction" }), ev("D", "out", "2026-11-10T09:00:00"),
  ev("E", "out", "2026-11-05T09:00:00"), ev("E", "out", "2026-11-09T09:00:00"),
  ev("F", "out", "2026-11-09T09:00:00", { mailbox: "old@agency.com" }),
  ev("G", "out", "2026-11-09T09:00:00"),
];
const followups: Followup[] = [];
const states = new Map<string, FollowupState>(creators.map((x) => [x.id, followupState({ type: "creator", record: x }, followups, events.filter((e) => e.entity_id === x.id), rules, now)]));
const pool = autopilotPool({ creators, followups, events, states, mailboxes: ["me@agency.com"], templates: book({ 1: ["It seems you missed our email — would you be interested?"] }) });
check("ready: never answered (an out-of-office doesn't count)", pool.ready.map((r) => r.id), ["A", "C"]);
check("by hand: they answered once, or reacted, or it's a negotiation", pool.byHand.map((r) => [r.id, r.why]), [["B", "replied"], ["D", "replied"], ["G", "conversation"]]);
check("held: no template for follow-up 2, mailbox not connected", pool.held.map((r) => [r.id, r.why]), [["E", "no-template"], ["F", "mailbox"]]);
check("ready rows carry the thread, mailbox and zones", [pool.ready[0].threadId, pool.ready[0].mailbox, pool.ready[0].round, pool.ready[0].zones.length], ["t-A", "me@agency.com", 1, 2]);
check("someone who replied stays 'by hand' even with a cancelled follow-up today", autopilotPool({ creators, followups, events, states, mailboxes: ["me@agency.com"], templates: book({ 1: ["x"] }), queued: new Set(["B"]) }).byHand.map((r) => r.id).includes("B"), true);
check("queued people aren't offered twice", autopilotPool({ creators, followups, events, states, mailboxes: ["me@agency.com"], templates: book({ 1: ["x"] }), queued: new Set(["A"]) }).queued, ["A"]);
check("weekend light day: everyone held, nobody sent", autopilotPool({ creators, followups, events, states, mailboxes: ["me@agency.com"], templates: book({ 1: ["x"] }), paused: true }).ready.length, 0);
check("everReplied: logged by hand counts", everReplied("A", [], [{ id: "f", user_id: "u", creator_id: "A", brand_id: null, kind: "reply", channel: "dm", note: "", at: "2026-11-10T10:00:00Z" } as Followup]), true);

// ----- fill + cap ------------------------------------------------------------------------------------------
check("cap: setting 15", dayCap(15, 0, false), 15);
check("cap: a batch of 15 today sets it when there's no setting", dayCap(0, 15, false), 15);
check("cap: none → as many as the goal needs", dayCap(0, 0, false), Infinity);
check("cap: 'fill the rest' lifts it", dayCap(15, 15, true), Infinity);
check("fill: 15 automated, goal 20, nothing else → holds 5 back, asks", fillNeed({ goal: 20, doneToday: 15, pendingToday: 0, autoToday: 15, cap: 15, available: 9 }), { need: 5, allowed: 0, short: 5 });
check("fill: 12 sent by you, cap 15 → fills 8", fillNeed({ goal: 20, doneToday: 12, pendingToday: 0, autoToday: 0, cap: 15, available: 30 }), { need: 8, allowed: 8, short: 0 });
check("fill: only 3 available → 3", fillNeed({ goal: 20, doneToday: 12, pendingToday: 0, autoToday: 0, cap: Infinity, available: 3 }), { need: 8, allowed: 3, short: 0 });
check("fill: goal already met → 0", fillNeed({ goal: 20, doneToday: 18, pendingToday: 4, autoToday: 4, cap: Infinity, available: 9 }), { need: 0, allowed: 0, short: 0 });

// The server reads days in UTC: shifting puts your wall clock there.
const sh = shiftToZone("Europe/Belgrade", offsetMin);
const shifted = new Date(sh.shift(Date.UTC(2026, 10, 16, 23, 30)));
check("shift: 23:30Z on the 16th reads as 00:30 on the 17th (Kosovo wall clock)", [shifted.getDate(), shifted.getHours(), shifted.getMinutes()], [17, 0, 30]);

if (fail) { console.log(`\n${fail} failed`); process.exit(1); }
// Each mailbox stays within its limit: 18/20 and 16/20 used → 2 and 4 at most, never 6 from one.
{
  const list = [...Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, mailbox: "dhurim@x.com" })), ...Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, mailbox: "dhurimi@x.com" }))];
  const room = new Map([["dhurim@x.com", 2], ["dhurimi@x.com", 4]]);
  const got = pickWithin(list, 16, room, null, 7);
  const per = (m: string) => got.filter((g) => g.mailbox === m).length;
  check("limits: 2 from the one at 18/20, 4 from the one at 16/20", [got.length, per("dhurim@x.com"), per("dhurimi@x.com")], [6, 2, 4]);
  const few = pickWithin(list, 3, new Map([["dhurim@x.com", 10], ["dhurimi@x.com", 10]]), null, 3);
  check("limits: a smaller ask stays within and uses what's there", few.length, 3);
  const both = new Set(Array.from({ length: 20 }, (_, s) => pickWithin(list, 1, new Map([["dhurim@x.com", 10], ["dhurimi@x.com", 10]]), null, s + 1)[0].mailbox));
  check("limits: by default either mailbox can be picked (random mix)", both.size, 2);
  const exact = pickWithin(list, 99, room, { "dhurimi@x.com": 3 }, 5);
  check("limits: an exact number from one mailbox", [exact.length, exact.every((g) => g.mailbox === "dhurimi@x.com")], [3, true]);
  const over = pickWithin(list, 99, room, { "dhurim@x.com": 5 }, 5);
  check("limits: asking for more than the room still stops at the limit", over.length, 2);
  check("limits: a mailbox missing from the room map sends nothing", pickWithin(list, 5, new Map([["dhurimi@x.com", 1]]), null, 1).map((g) => g.mailbox), ["dhurimi@x.com"]);
  check("limits: priority order kept inside a mailbox", pickWithin(list, 2, new Map([["dhurim@x.com", 2]]), null, 1).map((g) => g.id), ["a0", "a1"]);
}

// Marked "Replied" by hand but no reply on file anywhere → still yours, flagged as "marked" (not "they answered").
{
  const st = new Map([["m1", { kind: "due", round: 2, sent: 2, due: "2026-11-17", overdueDays: 0, last: { id: "x", at: "2026-11-11T19:58:00Z", dir: "out", source: "gmail", channel: "email", threadId: "t1" }, touches: [] } as unknown as FollowupState]]);
  const p = autopilotPool({ creators: [{ id: "m1", name: "Iowa", country: "", pipeline_status: "replied", archived_at: null, contact_channel: "email", email_followups: true } as never], followups: [], events: [], states: st, mailboxes: ["g@x.com"], templates: { 1: [], 2: [], 3: [], 4: [] } });
  check("marked Replied with no reply on file = by hand, why 'marked'", p.byHand.map((b) => b.why), ["marked"]);
}

console.log("\nall autopilot tests passed");
