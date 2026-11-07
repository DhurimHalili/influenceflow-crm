// Run: node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/saidNo.test.ts
import { latestReplies, notInterested, noVerdict, replyQuote } from "./saidNo.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `→ got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
let n = 0;
const ev = (entity: string, dir: "in" | "out", at: string, extra = {}) => ({ id: `e${++n}`, gmail_id: `g${n}`, thread_id: "t", direction: dir, entity_type: "creator", entity_id: entity, at, mailbox: "me@x.com", scheduled: false, reply_kind: "", subject: "", snippet: "", counterpart: "", message_key: "", in_reply_to: "", ...extra }) as never;

const han = ev("c1", "in", "2026-11-05T12:55:00.000Z", { reply_kind: "no", snippet: "Hi, Not at the moment. Thanks, Han On Wed, Nov 4, 2026 at 11:00 PM Dhurim Halili <dhurimi@mimibridge.com> wrote: It seems" });
const events = [ev("c1", "out", "2026-11-02T21:01:00.000Z"), ev("c1", "out", "2026-11-04T22:00:00.000Z"), han, ev("c1", "in", "2026-11-06T09:00:00.000Z", { reply_kind: "auto" })];
const last = latestReplies(events);
eq("auto-reply after a no doesn't hide the no", (last.get("c1") as { id: string }).id, (han as { id: string }).id);

const gmailDenied = { id: "c1", pipeline_status: "denied" as const, status_source: "gmail" as const, status_updated_at: "2026-11-05T12:55:00.000Z" };
const v = noVerdict(gmailDenied, last.get("c1"));
eq("clear no", v?.level, "no");
eq("Gmail-denied is listed as said no", notInterested(gmailDenied, v), "no");

const stillReplied = { id: "c1", pipeline_status: "replied" as const, status_source: "gmail" as const, status_updated_at: "2026-11-05T12:55:00.000Z" };
eq("a no not yet applied is listed", notInterested(stillReplied, noVerdict(stillReplied, last.get("c1"))), "no");

const maybe = ev("c2", "in", "2026-11-05T10:00:00.000Z", { reply_kind: "maybe_no" });
const r2 = { id: "c2", pipeline_status: "replied" as const, status_source: "gmail" as const, status_updated_at: "2026-11-05T10:00:00.000Z" };
eq("maybe is listed as maybe", notInterested(r2, noVerdict(r2, maybe)), "maybe");
const r2moved = { ...r2, pipeline_status: "negotiating" as const, status_source: "manual" as const, status_updated_at: "2026-11-06T10:00:00.000Z" };
eq("a maybe you settled by moving them on is not listed", notInterested(r2moved, noVerdict(r2moved, maybe)), null);

const later = ev("c3", "in", "2026-11-06T10:00:00.000Z");
eq("a later normal reply wins over an older no", noVerdict({ id: "c3", pipeline_status: "replied" }, latestReplies([ev("c3", "in", "2026-11-05T10:00:00.000Z", { reply_kind: "no" }), later]).get("c3")), null);
eq("hand-set Denied with no email no = denied", notInterested({ id: "c4", pipeline_status: "denied" }, null), "denied");
eq("nothing to say", notInterested({ id: "c5", pipeline_status: "contacted" }, null), null);
eq("quote keeps only their words", replyQuote(han), "Hi, Not at the moment. Thanks, Han");

if (fail) { console.log(`${fail} failed`); (globalThis as { process?: { exit(n: number): void } }).process?.exit(1); } else console.log("all said-no tests pass");
