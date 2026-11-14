// Run (from web/): node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/emailAction.test.ts
import type { EmailEvent } from "../types";
import { ago, cleanSubject, emailPlan, when } from "./emailAction";
import { followupState } from "./followupEngine";
import { DEFAULT_FOLLOWUP_RULES } from "./prefs";

let fail = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `→ got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
let n = 0;
const BOX = "dhurimi@agency.com";
const ev = (at: string, extra: Partial<EmailEvent> = {}): EmailEvent => ({ id: `e${++n}`, gmail_id: `g${n}`, thread_id: "t1", direction: "out", entity_type: "creator", entity_id: "c1", counterpart: "sam@creator.com", subject: "Collab with Monitors", snippet: "", at, mailbox: BOX, ...extra });
const NOW = new Date("2026-11-14T12:00:00"); // a Saturday
const record = (status: "contacted" | "replied" | "new" = "contacted") => ({ type: "creator" as const, record: { id: "c1", pipeline_status: status, date_contacted: "2026-10-01", archived_at: null } });
const plan = (events: EmailEvent[], mailboxes = [BOX], status: "contacted" | "replied" | "new" = "contacted") =>
  emailPlan({ events, state: followupState(record(status), [], events, DEFAULT_FOLLOWUP_RULES, NOW), mailboxes, now: NOW });

// Nothing sent yet → write.
const none = plan([], [BOX], "new");
check("new person → write a first email", [none.mode, none.status.tone, none.mailbox], ["write", "first", BOX]);

// You wrote, they never answered, follow-ups sent → reply in that thread (like Gmail's Reply on your last email).
const chased = plan([ev("2026-11-02T10:00:00"), ev("2026-11-05T10:00:00", { subject: "Re: Collab with Monitors" }), ev("2026-11-10T10:00:00", { subject: "Re: Collab with Monitors" })]);
check("due words match the rest of the app", chased.status.tone === "due" || chased.status.tone === "wait", true);
check("contacted, no reply → reply in the thread", [chased.mode, chased.thread?.id, chased.thread?.lastDir, chased.thread?.mine], ["reply", "t1", "out", 3]);
check("thread subject without Re:", chased.thread?.subject, "Collab with Monitors");

// They answered → reply, their turn shown.
const answered = plan([ev("2026-11-02T10:00:00"), ev("2026-11-12T09:00:00", { direction: "in" })], [BOX], "replied");
check("they replied → reply, your turn", [answered.mode, answered.status.tone, answered.thread?.lastDir], ["reply", "theirs", "in"]);
check("status says when", answered.status.text, "They replied 2 days ago — your turn");

// 4 follow-ups in the thread and the gap passed → a new email (new thread).
const capped = plan([
  ev("2026-08-03T10:00:00"), ev("2026-08-06T10:00:00"), ev("2026-08-11T10:00:00"), ev("2026-08-18T10:00:00"), ev("2026-08-27T10:00:00"),
]);
check("thread full and due → fresh email", [capped.mode, capped.status.tone, capped.thread?.mine], ["fresh", "fresh", 5]);

// The thread lives in a mailbox you disconnected → can't reply from here: write from the one you have.
const gone = plan([ev("2026-11-10T10:00:00", { mailbox: "old@agency.com" })], [BOX]);
check("thread in a mailbox not connected → write, says why", [gone.mode, gone.offline, gone.mailbox], ["write", "old@agency.com", BOX]);

// Replies from another mailbox: the button uses the thread's mailbox, not the first one connected.
const other = plan([ev("2026-11-10T10:00:00", { mailbox: "deals@agency.com" })], [BOX, "deals@agency.com"]);
check("reply from the mailbox that holds the thread", other.mailbox, "deals@agency.com");

// Scheduled email waiting in Gmail.
const sched = plan([ev("2026-11-02T10:00:00"), ev("2026-11-17T09:00:00", { scheduled: true, subject: "Re: Collab with Monitors" })]);
check("scheduled follow-up listed", sched.upcoming.map((u) => [u.kind, u.inThread, u.crossed]), [["follow-up", true, false]]);
check("status points at it", sched.status.text, "Your next email is scheduled");
check("still a reply (the thread exists)", sched.mode, "reply");

// Scheduled AFTER they replied = crossed (it would land after their answer).
const crossed = plan([ev("2026-11-02T10:00:00", { message_key: "m1" }), ev("2026-11-12T10:00:00", { direction: "in" }), ev("2026-11-17T09:00:00", { scheduled: true, in_reply_to: "m1" })], [BOX], "replied");
check("crossed scheduled flagged, still called a follow-up", [crossed.upcoming[0]?.crossed, crossed.upcoming[0]?.kind], [true, "follow-up"]);
check("their turn still shown over a crossed one", crossed.status.tone, "theirs");

// First email itself scheduled.
const firstSched = plan([ev("2026-11-17T09:00:00", { scheduled: true })], [BOX], "new");
check("only a scheduled first email → write, listed as first", [firstSched.mode, firstSched.upcoming[0]?.kind, firstSched.status.text], ["write", "first", "First email scheduled"]);

// A deleted or binned scheduled email isn't shown.
check("binned scheduled email not listed", plan([ev("2026-11-02T10:00:00"), ev("2026-11-17T09:00:00", { scheduled: true, gone: "trash" })]).upcoming.length, 0);

// Two threads: the one reminders follow wins.
const two = emailPlan({
  events: [ev("2026-06-01T10:00:00", { thread_id: "old" }), ev("2026-11-03T10:00:00", { thread_id: "new", subject: "Fresh idea" }), ev("2026-11-04T10:00:00", { thread_id: "old", direction: "in" })],
  state: { kind: "idle", reason: "closed", touches: [], thread: { active: "new", count: 2, newest: "new", ask: false, activeStarted: "2026-11-03T10:00:00", fresh: false } },
  mailboxes: [BOX], now: NOW,
});
check("followed thread wins over a newer message elsewhere", [two.thread?.id, two.thread?.subject], ["new", "Fresh idea"]);

// An autoresponder isn't "the latest" to aim at.
const auto = plan([ev("2026-11-02T10:00:00", { thread_id: "real" }), ev("2026-11-03T10:00:00", { thread_id: "ooo", direction: "in", reply_kind: "auto" })]);
check("autoresponder thread isn't picked", auto.thread?.id, "real");

// Words.
check("ago", [ago("2026-11-14T08:00:00", NOW), ago("2026-11-13T23:00:00", NOW), ago("2026-11-04T08:00:00", NOW), ago("2026-10-20T08:00:00", NOW)], ["today", "yesterday", "10 days ago", "3 weeks ago"]);
check("when", [when("2026-11-14T15:30:00", NOW), when("2026-11-15T09:00:00", NOW), when("2026-11-17T09:00:00", NOW)], ["today 15:30", "tomorrow 09:00", "Tue 09:00"]);
check("clean subject", [cleanSubject("Re: RE: Fwd: Hello"), cleanSubject("AW: Hi")], ["Hello", "Hi"]);

console.log(fail ? `${fail} failed` : "all passed");
if (fail) throw new Error(`${fail} failed`);
