// Run (from web/): node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/followupEngine.test.ts
import type { EmailEvent, Followup } from "../types";
import { DEFAULT_FOLLOWUP_RULES } from "./prefs";
import { flagFor, followupState } from "./followupEngine";
import { outreachLog, emailsIn, sentIn } from "./outreach";

let fail = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `→ got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
const rules = DEFAULT_FOLLOWUP_RULES;
let n = 0;
const ev = (dir: "in" | "out", at: string, extra: Partial<EmailEvent> = {}): EmailEvent => ({ id: `e${++n}`, gmail_id: `g${n}`, thread_id: "t1", direction: dir, entity_type: "creator", entity_id: "c1", counterpart: "weenie@x.com", subject: "A real clash?", snippet: "", at, mailbox: "dhurimi@mimibridge.com", ...extra });
const record = (extra: Record<string, unknown> = {}) => ({ type: "creator" as const, record: { id: "c1", pipeline_status: "contacted" as const, date_contacted: "2026-10-29", archived_at: null, ...extra } });

// 1. Image 1: a follow-up scheduled before they replied, still waiting → cancel it.
{
  const first = ev("out", "2026-10-29T21:28:00", { message_key: "m1@mail" });
  const reply = ev("in", "2026-11-02T15:52:00", { in_reply_to: "m1@mail" });
  const answer = ev("out", "2026-11-02T16:16:00", { in_reply_to: "m2@mail" });
  const bump = ev("out", "2026-11-02T23:00:00", { scheduled: true, in_reply_to: "m1@mail" });
  const now = new Date("2026-11-02T18:00:00");
  const s = followupState(record(), [], [first, reply, answer, bump], rules, now);
  check("pending crossed bump is flagged to cancel", flagFor(s)?.short, "Cancel scheduled email");
  check("…and the clock follows your real answer", s.kind === "waiting" ? s.last.at : s.kind, answer.at);
  // Sent anyway (old row, no In-Reply-To): recognised from the quote, not counted as a 1st follow-up.
  const sent = ev("out", "2026-11-02T23:00:00", { snippet: "Hi Weenie, You might have missed my email On Thu, Oct 29, 2026 at 9:28 PM Dhurim Halili <dhurimi@mimibridge.com> wrote: Hey" });
  const s2 = followupState(record(), [], [first, reply, answer, sent], rules, new Date("2026-11-03T10:00:00"));
  check("sent crossed bump doesn't open a follow-up round", s2.kind === "waiting" || s2.kind === "due" ? s2.round : s2.kind, 1);
  check("sent crossed bump is labelled", s2.touches.find((t) => t.at === sent.at)?.label, "Follow-up sent after they replied");
}

// 2. Image 4/5: their management auto-declines from another address → managed, not replied/denied.
{
  const first = ev("out", "2026-10-23T21:39:00");
  const declined = ev("in", "2026-10-23T21:40:00", { counterpart: "creatorcollabs@toptechtubers.com", reply_kind: "managed_no" });
  const s = followupState(record(), [], [first, declined], rules, new Date("2026-11-03T10:00:00"));
  check("management decline → managed", s.kind, "managed");
  check("managed flag", flagFor(s)?.short, "Managed · DM them");
  const dm: Followup = { id: "f1", user_id: "u", creator_id: "c1", brand_id: null, kind: "followup", channel: "dm", note: "", at: "2026-11-03T12:00:00" };
  const s2 = followupState(record(), [dm], [first, declined], rules, new Date("2026-11-04T10:00:00"));
  check("an Instagram DM after it restarts the follow-ups", s2.kind === "waiting" ? s2.last.channel : s2.kind, "dm");
}

// 3. Out-of-office isn't a reply.
{
  const first = ev("out", "2026-11-02T10:00:00");
  const ooo = ev("in", "2026-11-02T10:01:00", { reply_kind: "auto" });
  const s = followupState(record(), [], [first, ooo], rules, new Date("2026-11-05T10:00:00"));
  check("auto-reply keeps the follow-up due", s.kind, "due");
}

// 4. WhatsApp with email reminders off: emails don't set the clock, WhatsApp does.
{
  const first = ev("out", "2026-11-02T10:00:00");
  const wa: Followup = { id: "f2", user_id: "u", creator_id: "c1", brand_id: null, kind: "followup", channel: "whatsapp", note: "", at: "2026-11-03T09:00:00" };
  const later = ev("out", "2026-11-04T10:00:00");
  const s = followupState(record({ contact_channel: "whatsapp", email_followups: false }), [wa], [first, later], rules, new Date("2026-11-04T12:00:00"));
  check("email off: WhatsApp follow-up drives the clock", s.kind === "waiting" || s.kind === "due" ? s.last.channel : s.kind, "whatsapp");
  const reply = ev("in", "2026-11-04T13:00:00");
  const s2 = followupState(record({ contact_channel: "whatsapp", email_followups: false }), [wa], [first, later, reply], rules, new Date("2026-11-04T14:00:00"));
  check("email off: their email reply still counts", s2.kind, "reply-needed");
}

// 5. Denied: quiet for a month, then reach back.
{
  const rec = record({ pipeline_status: "denied", lost_at: "2026-10-01T10:00:00", lost_reason: "Price too high" });
  check("denied recently → closed", followupState(rec, [], [], rules, new Date("2026-10-20T10:00:00")).kind, "idle");
  const s = followupState(rec, [], [], rules, new Date("2026-11-02T10:00:00"));
  check("denied a month ago → reach back", s.kind, "reach-back");
}

// 6. Counting: emails = every email, follow-ups = only chasers; DMs aren't emails.
{
  const events = [ev("out", "2026-11-04T09:00:00"), ev("out", "2026-11-04T10:00:00"), ev("in", "2026-11-04T11:00:00"), ev("out", "2026-11-04T12:00:00")];
  const dm: Followup = { id: "f3", user_id: "u", creator_id: "c1", brand_id: null, kind: "followup", channel: "dm", note: "", at: "2026-11-04T13:00:00" };
  const creator = { id: "c1", name: "W", pipeline_status: "replied", date_contacted: "2026-11-04", archived_at: null } as never;
  const lead = { id: "l1", mailbox: "a@b.com", my_replies: [{ id: "x1", at: "2026-11-04T14:00:00" }] } as never;
  const log = outreachLog({ creators: [creator], brands: [], followups: [dm], events, leads: [lead] });
  const s = new Date("2026-11-04T00:00:00").getTime();
  const e = s + 86400000;
  check("emails sent counts every email incl. follow-ups and lead answers", emailsIn(log, s, e), 4);
  check("follow-ups counts only chasers (email + DM)", sentIn(log, s, e, "followup"), 2);
}

// 7. Four follow-ups in one thread → no 5th follow-up: a new thread after the gap.
{
  const t = (d: string, extra: Partial<EmailEvent> = {}) => ev("out", d, { thread_id: "A", ...extra });
  const events = [t("2026-10-19T10:00:00"), t("2026-10-21T10:00:00"), t("2026-10-23T10:00:00"), t("2026-10-27T10:00:00"), t("2026-10-30T10:00:00")];
  const s1 = followupState(record(), [], events, rules, new Date("2026-11-02T09:00:00"));
  check("after 4 follow-ups the next step is a new thread", s1.kind === "waiting" || s1.kind === "due" ? s1.next : s1.kind, "new-thread");
  const s2 = followupState(record(), [], events, rules, new Date("2026-11-03T09:00:00"));
  check("…due after 1 business day of waiting", [s2.kind, flagFor(s2)?.short], ["due", "Start a new thread"]);
  const s3 = followupState(record({ new_thread_gap: 3 }), [], events, rules, new Date("2026-11-03T09:00:00"));
  check("per-influencer wait for the new thread", s3.kind, "waiting");
  // New thread started → follow-ups start over there; the old thread goes quiet.
  const fresh = ev("out", "2026-11-03T10:00:00", { thread_id: "B" });
  const s4 = followupState(record(), [], [...events, fresh], rules, new Date("2026-11-03T12:00:00"));
  check("new thread starts round 1", s4.kind === "waiting" ? [s4.round, s4.thread?.active] : s4.kind, [1, "B"]);
  // They reply in the OLD thread → reply needed, flagged, and you're asked which thread continues.
  const oldReply = ev("in", "2026-11-04T09:00:00", { thread_id: "A" });
  const s5 = followupState(record(), [], [...events, fresh, oldReply], rules, new Date("2026-11-04T10:00:00"));
  check("reply in the old thread", [s5.kind, flagFor(s5)?.short, s5.thread?.ask], ["reply-needed", "Replied in old thread", false]);
  const answer = ev("out", "2026-11-04T11:00:00", { thread_id: "A" });
  const s5b = followupState(record(), [], [...events, fresh, oldReply, answer], rules, new Date("2026-11-04T12:00:00"));
  check("after you answer there, you're asked which thread continues", [s5b.kind, s5b.thread?.active, s5b.thread?.ask], ["waiting", "A", true]);
  // You choose the new thread: reminders follow it, an unanswered old-thread reply still needs you.
  const s6 = followupState(record({ primary_thread: "B", primary_thread_at: "2026-11-04T08:00:00" }), [], [...events, fresh, oldReply], rules, new Date("2026-11-04T10:00:00"));
  check("chosen thread + their reply elsewhere = reply needed", [s6.kind, s6.thread?.active], ["reply-needed", "B"]);
  const log = outreachLog({ creators: [{ id: "c1", name: "W", pipeline_status: "contacted", date_contacted: "2026-10-19", archived_at: null } as never], brands: [], followups: [], events: [...events, fresh] });
  check("a new thread's first email is an email, not a follow-up", [log.filter((x) => x.kind === "email").length, log.filter((x) => x.kind === "followup").length], [2, 4]);
}

// 8. Daniel Owen: an old thread from June (another mailbox era), a new thread in
//    October, no reply. The new thread's email is the first of its round — the
//    next one is the 1st follow-up in it, due 1 business day after the wait.
{
  const old = ev("out", "2026-06-02T03:52:00", { thread_id: "J", subject: "Brand Partnership Opportunity" });
  const fresh = ev("out", "2026-10-16T22:23:00", { thread_id: "O", subject: "Is it over?" });
  const s = followupState(record(), [], [old, fresh], rules, new Date("2026-11-07T17:15:00"));
  check("new thread after an old one: 1st follow-up next", s.kind === "due" ? [s.round, s.sent, s.thread?.active, s.thread?.fresh] : s.kind, [1, 1, "O", true]);
  check("…the words name the new thread", flagFor(s)?.long.startsWith("No reply to the first email of your new thread “Is it over?” — send your 1st follow-up"), true);
  const w = followupState(record(), [], [old, fresh], rules, new Date("2026-10-19T09:00:00"));
  check("…Friday email: Monday is the wait day, Tuesday the follow-up", w.kind === "waiting" ? w.due : w.kind, "2026-10-20");
  // A DM logged before the new thread doesn't count toward it either.
  const dm = { id: "f1", creator_id: "c1", brand_id: null, kind: "followup", channel: "dm", note: "", at: "2026-09-01T10:00:00" } as unknown as Followup;
  const s2 = followupState(record(), [dm], [old, fresh], rules, new Date("2026-11-07T17:15:00"));
  check("…nor a DM sent before the new thread", s2.kind === "due" ? [s2.round, s2.sent] : s2.kind, [1, 1]);
  // Confirmed: no more "new thread" notice.
  const s3 = followupState(record({ primary_thread: "O", primary_thread_at: "2026-11-07T17:20:00" }), [], [old, fresh], rules, new Date("2026-11-07T17:25:00"));
  check("…confirmed thread is no longer fresh", s3.thread?.fresh, false);
  // Second follow-up in the new thread is numbered within it.
  const fu = ev("out", "2026-11-09T09:00:00", { thread_id: "O" });
  const s4 = followupState(record(), [], [old, fresh, fu], rules, new Date("2026-11-09T10:00:00"));
  check("…follow-ups numbered inside the thread", s4.kind === "waiting" ? [s4.round, s4.sent, flagFor(s4)?.long.includes("1st follow-up in this thread")] : s4.kind, [2, 2, true]);
}

console.log(fail ? `${fail} failed` : "all passed");
if (fail) throw new Error(`${fail} failed`);
