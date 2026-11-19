// Run: cd web && node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/mailboxGuard.test.ts
import { planTrims, readGuard, roleOf, trimLabel, type Waiting } from "./mailboxGuard.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};

const NOW = Date.UTC(2026, 10, 19, 12, 0);
const H = 3600_000;
const w = (id: string, source: Waiting["source"], role: Waiting["role"], hoursLater: number, mailbox = "b@x.com"): Waiting =>
  ({ id, source, role, mailbox, at: NOW + hoursLater * H, entityType: "creator", entityId: `c-${id}` });
const on = readGuard(undefined);

eq("defaults: on, Gmail too", on, { on: true, gmail: true });
eq("switches respected", readGuard({ on: false, gmail: false }), { on: false, gmail: false });

// The owner's example: 15 sent + 2 Autopilot + 3 Gmail-scheduled = 20; three replies → 23. Autopilot goes first, then a Gmail follow-up.
const waiting = [w("ap1", "autopilot", "followup", 2), w("ap2", "autopilot", "followup", 5), w("g-new", "gmail", "new", 6), w("g-fu", "gmail", "followup", 3), w("g-re", "gmail", "reply", 7)];
const r = planTrims([{ mailbox: "b@x.com", limit: 20, used: 23 }], waiting, on, NOW);
eq("23/20: both Autopilot ones, then the Gmail follow-up", r.trims.map((t) => t.id), ["ap2", "ap1", "g-fu"]);
eq("…and the mailbox is back at 20", r.stillOver, []);
eq("one over: the latest Autopilot one only", planTrims([{ mailbox: "b@x.com", limit: 20, used: 21 }], waiting, on, NOW).trims.map((t) => t.id), ["ap2"]);
eq("no follow-ups left: a new email before a reply", planTrims([{ mailbox: "b@x.com", limit: 20, used: 21 }], [w("g-re", "gmail", "reply", 7), w("g-new", "gmail", "new", 1)], on, NOW).trims.map((t) => t.id), ["g-new"]);
eq("Gmail switched off: only Autopilot, rest reported", (() => { const x = planTrims([{ mailbox: "b@x.com", limit: 20, used: 23 }], waiting, { on: true, gmail: false }, NOW); return [x.trims.map((t) => t.id), x.stillOver]; })(), [["ap2", "ap1"], [{ mailbox: "b@x.com", limit: 20, used: 21 }]]);
eq("never one due in the next 2 minutes", planTrims([{ mailbox: "b@x.com", limit: 20, used: 21 }], [{ ...w("soon", "autopilot", "followup", 0), at: NOW + 60_000 }], on, NOW).trims, []);
eq("all sent already: nothing to take back, reported", planTrims([{ mailbox: "b@x.com", limit: 20, used: 21 }], [], on, NOW).stillOver, [{ mailbox: "b@x.com", limit: 20, used: 21 }]);
eq("only the mailbox that's over", planTrims([{ mailbox: "a@x.com", limit: 20, used: 19 }, { mailbox: "b@x.com", limit: 20, used: 21 }], [w("a1", "autopilot", "followup", 2, "a@x.com"), w("b1", "autopilot", "followup", 2)], on, NOW).trims.map((t) => t.id), ["b1"]);
eq("guard off: nothing", planTrims([{ mailbox: "b@x.com", limit: 20, used: 25 }], waiting, { on: false, gmail: true }, NOW).trims, []);
eq("each trim carries the day's numbers", planTrims([{ mailbox: "b@x.com", limit: 20, used: 21 }], waiting, on, NOW).trims[0].used, 21);

// What a scheduled email is
const t = (gmail_id: string, direction: "in" | "out", at: string, reply_kind = "") => ({ gmail_id, thread_id: "t", direction, at, reply_kind });
const s = { gmail_id: "s", thread_id: "t", at: "2026-11-19T18:00:00Z" };
eq("first email of a thread = new", roleOf(s, [t("s", "out", s.at)]), "new");
eq("after your own email = follow-up", roleOf(s, [t("a", "out", "2026-11-12T10:00:00Z")]), "followup");
eq("after their reply = reply", roleOf(s, [t("a", "out", "2026-11-12T10:00:00Z"), t("b", "in", "2026-11-18T10:00:00Z")]), "reply");
eq("an out-of-office isn't a reply", roleOf(s, [t("a", "out", "2026-11-12T10:00:00Z"), t("b", "in", "2026-11-13T10:00:00Z", "auto")]), "followup");

eq("labels", [trimLabel({ source: "autopilot", role: "followup", round: 2 }), trimLabel({ source: "gmail", role: "followup" }), trimLabel({ source: "gmail", role: "new" }), trimLabel({ source: "gmail", role: "reply" })],
  ["2nd follow-up · Autopilot", "Follow-up scheduled in Gmail", "New email scheduled in Gmail", "Reply scheduled in Gmail"]);

if (fail) { console.error(`\n${fail} failed`); process.exit(1); }
console.log("\nall mailbox guard tests passed");
