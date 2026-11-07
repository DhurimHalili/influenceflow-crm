// Run (from web/): node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/mailboxOf.test.ts
import type { EmailEvent } from "../types";
import { followupState } from "./followupEngine";
import { mailboxOf, matchesMailbox } from "./mailboxOf";
import { DEFAULT_FOLLOWUP_RULES } from "./prefs";

let fail = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `→ got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
let n = 0;
const ev = (at: string, mailbox: string, extra: Partial<EmailEvent> = {}): EmailEvent => ({ id: `e${++n}`, gmail_id: `g${n}`, thread_id: "t1", direction: "out", entity_type: "creator", entity_id: "c1", counterpart: "x@y.com", subject: "Hi", snippet: "", at, mailbox, ...extra });
const record = { type: "creator" as const, record: { id: "c1", pipeline_status: "contacted" as const, date_contacted: "2026-06-02", archived_at: null } };
const touches = (events: EmailEvent[]) => followupState(record, [], events, DEFAULT_FOLLOWUP_RULES, new Date("2026-11-07T12:00:00")).touches;

check("one mailbox", mailboxOf(touches([ev("2026-10-01T10:00:00", "Dhurim@mimibridge.com")])), { now: "dhurim@mimibridge.com", all: ["dhurim@mimibridge.com"] });
// Old thread from one mailbox, the new thread from the other: it runs from the new one now.
const two = touches([ev("2026-06-02T10:00:00", "dhurimi@mimibridge.com", { thread_id: "A" }), ev("2026-10-16T22:00:00", "dhurim@mimibridge.com", { thread_id: "B" })]);
check("thread moved to another mailbox", mailboxOf(two), { now: "dhurim@mimibridge.com", all: ["dhurim@mimibridge.com", "dhurimi@mimibridge.com"] });
check("filter matches where it runs now", [matchesMailbox("dhurim@mimibridge.com", mailboxOf(two)!), matchesMailbox("dhurimi@mimibridge.com", mailboxOf(two)!)], [true, false]);
check("never emailed from Gmail", [mailboxOf(touches([])), matchesMailbox("none", undefined), matchesMailbox("all", undefined)], [null, true, true]);

console.log(fail ? `${fail} failed` : "all passed");
if (fail) throw new Error(`${fail} failed`);
