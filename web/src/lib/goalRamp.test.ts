// Run: cd web && node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/goalRamp.test.ts
import { mondayOf, perDay, rampPlan, readRamp, shiftStart, shouldAsk, stampNew, weekOf, RAMP_ANCHOR } from "./goalRamp.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};

eq("Monday of Mon / Wed / Sun", [mondayOf("2026-11-16"), mondayOf("2026-11-18"), mondayOf("2026-11-22")], ["2026-11-16", "2026-11-16", "2026-11-16"]);
eq("Monday across a month", mondayOf("2026-12-02"), "2026-11-30");
eq("week numbers", [weekOf("2026-11-09", "2026-11-09"), weekOf("2026-11-09", "2026-11-15"), weekOf("2026-11-09", "2026-11-16"), weekOf("2026-11-11", "2026-11-23")], [1, 1, 2, 3]);
eq("10 a week up to 50", [1, 2, 3, 4, 5, 6, 12].map(perDay), [10, 20, 30, 40, 50, 50, 50]);

const two = { "a@x.com": RAMP_ANCHOR, "b@x.com": RAMP_ANCHOR };
eq("our week: 2 mailboxes in week 2 = 40", rampPlan(two, ["A@x.com", "b@x.com"], "2026-11-16").total, 40);
eq("one mailbox = 20 this week", rampPlan(two, ["a@x.com"], "2026-11-18").total, 20);
eq("next week 2 × 30 = 60", rampPlan(two, ["a@x.com", "b@x.com"], "2026-11-16").nextTotal, 60);
eq("full speed: 4 mailboxes = 200", rampPlan({ a: "2026-01-05", b: "2026-01-05", c: "2026-01-05", d: "2026-01-05" }, ["a", "b", "c", "d"], "2026-11-16").total, 200);
// Owner's example: last week one mailbox at 20 and a newer one at 10 (= 30) → this week 30 + 20 = 50.
eq("old 20 + new 10 last week → 50 this week", rampPlan({ old: "2026-11-02", new: "2026-11-09" }, ["old", "new"], "2026-11-16").total, 50);
eq("a mailbox with no start counts as this week (10)", rampPlan({}, ["c@x.com"], "2026-11-16").boxes[0], { mailbox: "c@x.com", start: "2026-11-16", week: 1, perDay: 10, next: 20, full: false });
eq("same mailbox twice counts once", rampPlan(two, ["a@x.com", "A@X.com"], "2026-11-16").total, 20);

eq("stamp: before/at the anchor week → anchor", stampNew({}, ["a@x.com"], "2026-11-12"), { "a@x.com": RAMP_ANCHOR });
eq("stamp: a new mailbox later → its own week", stampNew(two, ["a@x.com", "n@x.com"], "2026-11-26"), { ...two, "n@x.com": "2026-11-23" });
eq("stamp: tracked before launch → anchor even if found today", stampNew({}, ["a@x.com"], "2026-11-16", { "a@x.com": "2026-09-22" }), { "a@x.com": RAMP_ANCHOR });
eq("stamp: connected after launch with old history → its connection week", stampNew({}, ["n@x.com"], "2026-12-02", { "n@x.com": "2026-11-25" }), { "n@x.com": "2026-11-23" });
eq("stamp: not seen yet, today after launch → this week", stampNew({}, ["n@x.com"], "2026-11-18"), { "n@x.com": "2026-11-16" });
eq("stamp: nothing new → null", stampNew(two, ["a@x.com"], "2026-11-26"), null);

const plan = rampPlan(two, ["a@x.com", "b@x.com"], "2026-11-17");
eq("ask when goal 20 ≠ 40", shouldAsk({ goal: 20, plan }), true);
eq("no ask when goal = 40", shouldAsk({ goal: 40, plan }), false);
eq("no ask after 'keep mine' this week", shouldAsk({ goal: 20, plan, skip: { week: "2026-11-16", total: 40 } }), false);
eq("ask again next week", shouldAsk({ goal: 20, plan: rampPlan(two, ["a@x.com", "b@x.com"], "2026-11-23"), skip: { week: "2026-11-16", total: 40 } }), true);
eq("ask again when a mailbox is added this week", shouldAsk({ goal: 40, plan: rampPlan({ ...two, "n@x.com": "2026-11-16" }, ["a@x.com", "b@x.com", "n@x.com"], "2026-11-18"), skip: { week: "2026-11-16", total: 40 } }), true);
eq("no mailboxes → no ask", shouldAsk({ goal: 20, plan: rampPlan(two, [], "2026-11-17") }), false);
eq("goal above the ramp asks too (50 → 40)", shouldAsk({ goal: 50, plan }), true);

eq("shift a week earlier (+1 week in)", shiftStart("2026-11-09", 1, "2026-11-17"), "2026-11-02");
eq("shift later never past this week", shiftStart("2026-11-09", -3, "2026-11-17"), "2026-11-16");
eq("readRamp keeps good rows only", readRamp({ "A@x.com": "2026-11-11", bad: "2026-11-11", "c@x.com": "soon" }), { "a@x.com": "2026-11-09" });

if (fail) { console.log(`${fail} failed`); process.exit(1); }
console.log("all goal ramp tests passed");
