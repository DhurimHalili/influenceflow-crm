// Run: cd web && node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/dashboardStats.test.ts
import { build } from "./outreach.ts";
import { mailboxesOf, makeStats, rangeOf, statusOfActivity } from "./dashboardStats.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};

const now = new Date("2026-11-05T20:00:00");
const H = 3600e3, D = 86400e3;
const iso = (ms: number) => new Date(ms).toISOString();
const t = now.getTime();
const rec = (id: string, extra = {}) => ({ id, name: id, pipeline_status: "contacted", date_contacted: null, archived_at: null, created_at: iso(t - 30 * D), lost_at: null, lost_reason: "", contact_channel: "email", email_followups: true, ...extra }) as never;
let n = 0;
const ev = (entity: string, type: "creator" | "brand", dir: "in" | "out", at: number, extra = {}) => ({ id: `e${++n}`, gmail_id: `g${n}`, thread_id: `t-${entity}`, direction: dir, entity_type: type, entity_id: entity, at: iso(at), mailbox: "me@agency.com", scheduled: false, reply_kind: "", subject: "", snippet: "", counterpart: "", message_key: "", in_reply_to: "", ...extra }) as never;

const creators = [rec("c1"), rec("c2"), rec("c3", { lost_at: iso(t - 2 * H), pipeline_status: "denied" })];
const brands = [rec("b1"), rec("b2", { lost_at: iso(t - 3 * H), pipeline_status: "denied" })];
const events = [
  ev("c1", "creator", "out", t - 3 * D), ev("c1", "creator", "out", t - 2 * H), // follow-up today
  ev("c2", "creator", "out", t - 4 * H), // first email today
  ev("c2", "creator", "in", t - 1 * H), // reply today
  ev("c2", "creator", "in", t - 50 * 60e3, { reply_kind: "auto" }), // out-of-office: not a reply
  ev("b1", "brand", "out", t - 5 * D), ev("b1", "brand", "in", t - 4 * D), ev("b1", "brand", "out", t - 3 * H), // answer today
  ev("c1", "creator", "out", t + 2 * H, { scheduled: true }), // scheduled tonight
  ev("b1", "brand", "out", t - 10 * 60e3, { scheduled: true }), // send time passed: counts as sent
];
const followups = [{ id: "f1", creator_id: "c1", brand_id: null, kind: "followup", channel: "whatsapp", note: "", at: iso(t - 1 * H) }] as never[];
const { sent, received } = build({ creators, brands, contacts: [], followups, events, leads: [], now });
const activities = [
  { id: "a1", text: "Gmail: b1 moved to Negotiating — they emailed", at: iso(t - 2 * H), entity_type: "brand", entity_id: "b1" },
  { id: "a2", text: "c2 updated to negotiating", at: iso(t - 30 * 60e3), entity_type: "creator", entity_id: "c2" },
] as never[];
const st = makeStats({ sent, received, creators, brands, contacts: [], campaigns: [], activities, leads: [] });
const r = rangeOf("today", now);
const c = (m: Parameters<typeof st.count>[0], v: Parameters<typeof st.count>[1] = "all") => st.count(m, v, r.start, r.end);

eq("emails today: every email, scheduled ones only once their time passed", c("emails"), 4);
eq("follow-ups on any channel", c("followups"), 3);
eq("follow-ups split", st.followupChannels("all", r.start, r.end), { email: 2, other: 1 });
eq("new conversations", c("first"), 1);
eq("answers", c("answers"), 1);
eq("replies: auto-replies never count", c("replies"), 1);
eq("still scheduled", st.scheduled("all").length, 1);
eq("scheduled ahead says what it is and who it goes to", st.scheduledAhead("all", t).map((x) => [x.role, x.name !== "", x.to]), [["followup", true, "/app/influencers/c1"]]);
eq("nothing ahead after its send time", st.scheduledAhead("all", t + 3 * H).length, 0);
eq("influencers only: emails", c("emails", "creator"), 2);
eq("brands only: emails", c("emails", "brand"), 2);
eq("negotiations from Gmail moves and manual moves", [c("negotiations", "creator"), c("negotiations", "brand")], [1, 1]);
eq("lost split: negotiations lost vs deals lost", [c("lost", "creator"), c("lost", "brand")], [1, 1]);
eq("lists match the counts", st.rows("emails", "all", r.start, r.end).length, 4);
eq("status words", [statusOfActivity("Gmail: X moved to Negotiating — y"), statusOfActivity("X updated to no_reply"), statusOfActivity("Gmail: X moved to No reply — z")], ["negotiating", "no_reply", "no_reply"]);
eq("all time has no comparison", rangeOf("all", now).compare, false);
eq("today compares with the whole of yesterday", [new Date(rangeOf("today", now).prevStart).getDate(), rangeOf("today", now).prevEnd === rangeOf("today", now).start], [4, true]);
eq("reply rate: first contacts in range who answered", st.replyRate("all", r.start, r.end), { contacted: 1, replied: 1, declined: 0, pct: 100 });

// One mailbox's share: two mailboxes, the parts add up to the whole.
{
  const two = [
    ev("m1", "creator", "out", t - 3 * H, { mailbox: "a@agency.com" }), ev("m1", "creator", "in", t - 2 * H, { mailbox: "a@agency.com" }),
    ev("m2", "creator", "out", t - 3 * H, { mailbox: "B@agency.com" }), ev("m2", "creator", "out", t - 1 * H, { mailbox: "B@agency.com" }),
    ev("m3", "creator", "out", t - 2 * H, { mailbox: "b@agency.com" }),
  ];
  const people = [rec("m1"), rec("m2"), rec("m3")];
  const logs = build({ creators: people, brands: [], contacts: [], followups: [], events: two, leads: [], now });
  const acts = [{ id: "x1", text: "m1 updated to negotiating", at: iso(t - 1 * H), entity_type: "creator", entity_id: "m1" }] as never[];
  const base = { ...logs, creators: people, brands: [], contacts: [], campaigns: [], activities: acts, leads: [] };
  const whole = makeStats(base), A = makeStats({ ...base, mailbox: "a@agency.com" }), B = makeStats({ ...base, mailbox: "b@agency.com" });
  const total = (x: typeof whole) => x.emailMix("all", r.start, r.end, r.horizon).total;
  eq("mailboxes, busiest first, case folded", mailboxesOf(logs.sent, logs.received), ["b@agency.com", "a@agency.com"]);
  eq("each mailbox's emails add up to all", [total(A), total(B), total(whole)], [1, 3, 4]);
  eq("a reply counts for the mailbox it came into", [A.count("replies", "all", r.start, r.end), B.count("replies", "all", r.start, r.end)], [1, 0]);
  eq("a negotiation belongs to the mailbox that first emailed them", [A.count("negotiations", "all", r.start, r.end), B.count("negotiations", "all", r.start, r.end)], [1, 0]);
  eq("names still resolve in a mailbox view", B.rows("emails", "all", r.start, r.end, r.horizon).every((x) => x.name.startsWith("m")), true);
}

// A reply is a person answering your outreach — once. The rest is conversation.
{
  const who = [rec("p1"), rec("p2"), rec("p3"), rec("p4", { pipeline_status: "inbound" }), rec("p5"), rec("p6")];
  const mail = [
    // p1: cold email → reply → you answer → they answer → they go quiet → follow-up → "sorry, missed this".
    ev("p1", "creator", "out", t - 9 * D), ev("p1", "creator", "in", t - 8 * D), ev("p1", "creator", "out", t - 8 * D + H), ev("p1", "creator", "in", t - 7 * D),
    ev("p1", "creator", "out", t - 7 * D + H), ev("p1", "creator", "out", t - 3 * D), ev("p1", "creator", "in", t - 2 * D), ev("p1", "creator", "in", t - 2 * H),
    // p2: only an emoji reaction came back — not a reply.
    ev("p2", "creator", "out", t - 5 * D), ev("p2", "creator", "in", t - 4 * D, { reply_kind: "reaction", snippet: "👍 P2 reacted via Gmail" }),
    // p3: said no — a reply, and a declined one.
    ev("p3", "creator", "out", t - 5 * D), ev("p3", "creator", "in", t - 4 * D, { reply_kind: "no" }),
    // p4: wrote to you first — nobody "replied" to outreach.
    ev("p4", "creator", "in", t - 6 * D), ev("p4", "creator", "out", t - 5 * D), ev("p4", "creator", "in", t - 4 * D),
    // p5: no answer at all. p6: out-of-office, then a real answer.
    ev("p5", "creator", "out", t - 5 * D),
    ev("p6", "creator", "out", t - 5 * D), ev("p6", "creator", "in", t - 5 * D + H, { reply_kind: "auto" }), ev("p6", "creator", "in", t - 1 * D),
  ];
  const logs = build({ creators: who, brands: [], contacts: [], followups: [], events: mail, leads: [], now });
  const S = makeStats({ ...logs, creators: who, brands: [], contacts: [], campaigns: [], activities: [], leads: [] });
  const from = t - 30 * D, to = t + H;
  eq("a long conversation is ONE reply; reactions and auto-replies are none", S.rows("replies", "all", from, to).map((x) => x.name).sort(), ["p1", "p3", "p6"]);
  eq("replies = people who replied", [S.count("replies", "all", from, to), S.repliers("all", from, to)], [3, 3]);
  eq("the back-and-forth is reported apart", S.conversation("all", from, to), 5);
  eq("a reply is dated by the first answer, not the latest message", S.count("replies", "all", t - 3 * D, to), 1);
  eq("…so yesterday's 'sorry, missed this' adds nothing", S.rows("replies", "all", t - 3 * D, to).map((x) => x.name), ["p6"]);
  eq("someone who wrote to you first never 'replied' to outreach", logs.received.filter((x) => x.entityId === "p4").map((x) => x.first), [false, false]);
  eq("…and answering them is an answer, not a new conversation", logs.sent.filter((x) => x.entityId === "p4").map((x) => x.role), ["answer"]);
  eq("reply rate: people, with the no's shown", S.replyRate("all", from, to), { contacted: 5, replied: 3, declined: 1, pct: 60 });
}

if (fail) { console.log(`${fail} failed`); (globalThis as { process?: { exit(n: number): void } }).process?.exit(1); } else console.log("all passed");
