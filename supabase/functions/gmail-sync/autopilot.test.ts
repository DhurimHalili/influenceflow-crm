// deno run --allow-env --allow-read supabase/functions/gmail-sync/autopilot.test.ts
// The send path's safety checks against a fake Gmail and a fake database: nothing goes to someone who
// answered (even a reply the sync hasn't seen), nothing after you followed up yourself, nothing on another day.
import { mailboxDays, sendOne, statesOf, poolOf, type Kit, type QueueRow, type World } from "./autopilot.ts";
import { pickWithin, roomMap } from "../../../web/src/lib/autopilot.ts";
import { dayKeyIn } from "../../../web/src/lib/zones.ts";
import type { Msg } from "../_shared/replyDraft.ts";

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failed++; console.error(`✗ ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); } else console.log(`✓ ${name}`);
};

// A database that answers every query with the rows of its table (filters aren't needed here).
// deno-lint-ignore no-explicit-any
const fakeDb = (tables: Record<string, unknown[]>): any => {
  const chain = (rows: unknown[]) => {
    // deno-lint-ignore no-explicit-any
    const p: any = new Proxy(() => {}, {
      get(_t, k) {
        if (k === "then") return (res: (v: unknown) => void) => res({ data: rows, error: null });
        if (k === "maybeSingle" || k === "single") return () => Promise.resolve({ data: rows[0] ?? null, error: null });
        return () => p;
      },
    });
    return p;
  };
  return { from: (t: string) => chain(tables[t] || []) };
};

const NOW = Date.UTC(2026, 10, 16, 17, 30); // 18:30 in Kosovo, 12:30 in New York
const H = (n: string, v: string) => ({ name: n, value: v });
const mine = (id: string, at: number, extra: Partial<Msg> = {}): Msg => ({ id, internalDate: String(at), labelIds: ["SENT"], payload: { headers: [H("From", "Dhurim <me@agency.com>"), H("To", "Sam <sam@creator.com>"), H("Subject", id === "g1" ? "Collab" : "Re: Collab"), H("Message-ID", `<${id}@mail.gmail.com>`), H("Date", "Mon, 9 Nov 2026 15:12:00 +0000")] }, ...extra });
const theirs = (id: string, at: number, headers: { name: string; value: string }[] = []): Msg => ({ id, internalDate: String(at), labelIds: ["INBOX"], payload: { headers: [H("From", "Sam <sam@creator.com>"), H("To", "me@agency.com"), H("Subject", "Re: Collab"), ...headers] } });

function kitWith(thread: Msg[], sent: string[]): Kit {
  return {
    token: () => Promise.resolve("tok"),
    // deno-lint-ignore no-explicit-any
    call: (<T,>(_tok: string, path: string, init?: RequestInit): Promise<T> => {
      if (path.startsWith("/threads/")) return Promise.resolve({ messages: thread } as T);
      if (path === "/settings/sendAs") return Promise.resolve({ sendAs: [{ sendAsEmail: "me@agency.com", displayName: "Dhurim", signature: "<b>Dhurim</b>", isPrimary: true }] } as T);
      if (path.includes("format=full")) return Promise.resolve({ ...thread[thread.length - 1], payload: { ...thread[thread.length - 1].payload, mimeType: "text/plain", body: { data: btoa("Hi Sam,\n\nAre you interested?").replace(/\+/g, "-").replace(/\//g, "_") } } } as T);
      if (path === "/messages/send") { sent.push(String(init?.body || "")); return Promise.resolve({ id: "new1", threadId: "t1" } as T); }
      return Promise.reject(new Error(`unexpected ${path}`));
    }) as Kit["call"],
    record: () => Promise.resolve(),
    gmailError: () => null,
    b64url: (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  };
}

const tz = "Europe/Belgrade";
const world = (events: World["events"], extra: Partial<World> = {}): World => ({
  userId: "u1", name: "Dhurim", prefs: { timezone: tz }, tz, goal: 20, rules: { gaps: [1, 1, 1], then: 2, stop_after: 0, workdays: [1, 2, 3, 4, 5], holidays: [], reach_back_days: 30, thread_cap: 4, new_thread_gap: 1 } as World["rules"],
  templates: { 1: [{ id: "t1aa", name: "Missed it?", text: "Hi {first_name},\n\nWould you be interested?" }], 2: [], 3: [], 4: [] }, auto: { fill: false, start: "21:00", cap: 0 },
  creators: [{ id: "c1", name: "Sam Rivera", country: "United States", pipeline_status: "contacted", archived_at: null, contact_channel: "email", email_followups: true } as World["creators"][number]],
  events, followups: [], bounced: new Set(), ...extra,
});
const out = (gmailId: string, at: number, extra = {}) => ({ id: gmailId, gmail_id: gmailId, thread_id: "t1", direction: "out" as const, entity_type: "creator" as const, entity_id: "c1", counterpart: "sam@creator.com", subject: "Collab", snippet: "", at: new Date(at).toISOString(), mailbox: "me@agency.com", scheduled: false, reply_kind: "" as const, ...extra });
const q: QueueRow = { id: "q1", user_id: "u1", creator_id: "c1", mailbox: "me@agency.com", thread_id: "t1", round: 1, template_id: "t1aa", template_name: "Missed it?", body: "Hi Sam,\n\nWould you be interested?", send_at: new Date(NOW - 60_000).toISOString(), day: dayKeyIn(tz, NOW), origin: "batch", batch_id: null, status: "sending", reason: "", attempts: 0, gmail_id: "", their_zone: "America/New_York,America/Los_Angeles", created_at: new Date(NOW - 3600_000).toISOString(), updated_at: new Date(NOW).toISOString() };
const rows = [{ id: "r1", user_id: "u1", email: "me@agency.com", scopes: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify" }];
const db = () => fakeDb({ autosend_queue: [{ status: "sending", gmail_id: "" }], gmail_tokens: [] });
const firstAt = NOW - 7 * 86400_000;

// 1. Never answered: it goes, as a reply in the thread, to them, with the quote.
{
  const sent: string[] = [];
  const res = await sendOne(db(), kitWith([mine("g1", firstAt)], sent), q, rows, world([out("g1", firstAt)]), NOW);
  eq("never answered → sent", res.status, "sent");
  const raw = sent.length ? atob(JSON.parse(sent[0]).raw.replace(/-/g, "+").replace(/_/g, "/")) : "";
  eq("…in the thread, to them, threaded on your email", [JSON.parse(sent[0] || "{}").threadId, /\r\nTo: sam@creator\.com/.test(raw), raw.includes("In-Reply-To: <g1@mail.gmail.com>")], ["t1", true, true]);
  eq("…plain text + html, subject Re:", [raw.includes("multipart/alternative"), raw.includes("Subject: =?UTF-8?B?" + btoa("Re: Collab") + "?=")], [true, true]);
}
// 2. They replied in Gmail a minute ago (the sync hasn't seen it yet): cancelled.
{
  const sent: string[] = [];
  const res = await sendOne(db(), kitWith([mine("g1", firstAt), theirs("r1", NOW - 60_000)], sent), q, rows, world([out("g1", firstAt)]), NOW);
  eq("their reply in Gmail (not synced yet) → cancelled, nothing sent", [res.status, res.reason, sent.length], ["cancelled", "replied", 0]);
}
// 3. An out-of-office isn't an answer: it still goes.
{
  const sent: string[] = [];
  const res = await sendOne(db(), kitWith([mine("g1", firstAt), theirs("o1", firstAt + 60_000, [H("Auto-Submitted", "auto-replied")])], sent), q, rows, world([out("g1", firstAt)]), NOW);
  eq("out-of-office only → still sent", [res.status, sent.length], ["sent", 1]);
}
// 4. The CRM already knows they replied (any thread): cancelled before Gmail is even asked.
{
  const sent: string[] = [];
  const res = await sendOne(db(), kitWith([mine("g1", firstAt)], sent), q, rows, world([out("g1", firstAt), { ...out("x9", NOW - 86400_000), direction: "in", thread_id: "t0" }]), NOW);
  eq("a reply on file (old thread) → cancelled", [res.status, res.reason, sent.length], ["cancelled", "replied", 0]);
}
// 5. You followed up yourself in Gmail after it was queued: cancelled.
{
  const sent: string[] = [];
  const res = await sendOne(db(), kitWith([mine("g1", firstAt), mine("g2", NOW - 10 * 60_000)], sent), q, rows, world([out("g1", firstAt)]), NOW);
  eq("your own newer email in the thread → cancelled", [res.status, res.reason, sent.length], ["cancelled", "you_followed_up", 0]);
}
// 6. A scheduled email of yours waits in Gmail for them: cancelled.
{
  const sent: string[] = [];
  const res = await sendOne(db(), kitWith([mine("g1", firstAt)], sent), q, rows, world([out("g1", firstAt), out("s1", NOW + 3600_000, { scheduled: true })]), NOW);
  eq("scheduled in Gmail → cancelled", [res.status, res.reason], ["cancelled", "scheduled_in_gmail"]);
}
// 7. Another day: never sent (the cron was down past midnight).
{
  const sent: string[] = [];
  const res = await sendOne(db(), kitWith([mine("g1", firstAt)], sent), { ...q, day: "2026-11-15" }, rows, world([out("g1", firstAt)]), NOW);
  eq("yesterday's follow-up → never sent today", [res.status, res.reason, sent.length], ["cancelled", "day_over", 0]);
}
// 8. Late, and it's night where they are now: cancelled.
{
  const sent: string[] = [];
  const late = Date.UTC(2026, 10, 16, 22, 50); // 23:50 Kosovo, 14:50 LA, 17:50 NY — awake
  const resAwake = await sendOne(db(), kitWith([mine("g1", firstAt)], sent), { ...q, send_at: new Date(late - 3600_000).toISOString() }, rows, world([out("g1", firstAt)]), late);
  const sent2: string[] = [];
  const resAsleep = await sendOne(db(), kitWith([mine("g1", firstAt)], sent2), { ...q, send_at: new Date(late - 3600_000).toISOString(), their_zone: "Australia/Perth" }, rows, world([out("g1", firstAt)]), late);
  eq("late but still their day → sent; late and their night → cancelled", [resAwake.status, resAsleep.status, resAsleep.reason], ["sent", "cancelled", "their_night"]);
}
// 9. The pool on the server reads YOUR calendar: due today in Kosovo even at 00:30 (UTC still says yesterday).
{
  const w = world([out("g1", Date.UTC(2026, 10, 12, 9))]);
  const at = Date.UTC(2026, 10, 15, 23, 30); // Mon 16 Nov 00:30 in Kosovo, still Sun 15 in UTC
  const s = statesOf(w, at).get("c1");
  eq("server: Monday 00:30 in Kosovo counts as Monday (due)", s?.kind, "due");
  const pool = poolOf(w, rows, new Set(), at);
  eq("…and the pool offers them", pool.ready.map((r) => r.id), ["c1"]);
}

// 10. Two mailboxes: every follow-up goes from the mailbox that holds ITS thread — never mixed.
{
  const at = Date.UTC(2026, 10, 15, 23, 30);
  const two = [...rows, { id: "r2", user_id: "u1", email: "second@agency.com", scopes: rows[0].scopes }];
  const creators = [world([]).creators[0], { ...world([]).creators[0], id: "c2", name: "Kim Lee" }];
  const w = world([out("g1", Date.UTC(2026, 10, 12, 9)), out("h1", Date.UTC(2026, 10, 12, 10), { entity_id: "c2", thread_id: "t2", mailbox: "second@agency.com", gmail_id: "h1", id: "h1" })], { creators });
  const pool = poolOf(w, two, new Set(), at);
  eq("each one keeps the mailbox of its own thread", pool.ready.map((r) => [r.id, r.mailbox, r.threadId]).sort(), [["c1", "me@agency.com", "t1"], ["c2", "second@agency.com", "t2"]]);
  const used: string[] = [];
  const kit = kitWith([mine("h1", firstAt)], []);
  const tracked: Kit = { ...kit, token: (row) => { used.push((row as { email: string }).email); return Promise.resolve("tok"); } };
  await sendOne(db(), tracked, { ...q, creator_id: "c2", mailbox: "second@agency.com", thread_id: "t2" }, two, w, NOW);
  eq("…and is sent with that mailbox's own login", used, ["second@agency.com"]);
  const gone = await sendOne(db(), tracked, { ...q, creator_id: "c2", mailbox: "second@agency.com", thread_id: "t2" }, rows, w, NOW);
  eq("its mailbox disconnected → not sent from another one", [gone.status, gone.reason], ["failed", "mailbox"]);
  const wb = world([out("g1", Date.UTC(2026, 10, 12, 9))], { bounced: new Set(["c1"]) });
  eq("a bounced address is never followed up", poolOf(wb, rows, new Set(), at).held.map((h) => h.why), ["bounced"]);
}

// 11. Each mailbox's limit for today: 18 of 20 used → 2 left; 16 sent + 1 waiting of 20 → 3 left. Never more.
{
  const two = [...rows, { id: "r2", user_id: "u1", email: "second@agency.com", scopes: rows[0].scopes }];
  const events = [...Array.from({ length: 18 }, (_, i) => ({ gmail_id: `m${i}`, mailbox: "me@agency.com" })), ...Array.from({ length: 16 }, (_, i) => ({ gmail_id: `s${i}`, mailbox: "second@agency.com" }))];
  const queue = [{ mailbox: "second@agency.com", status: "pending", gmail_id: "" }, { mailbox: "me@agency.com", status: "sent", gmail_id: "m3" }];
  const w = world([], { prefs: { timezone: tz, mailbox_ramp: { "me@agency.com": "2026-11-09", "second@agency.com": "2026-11-09" } } as World["prefs"] });
  const days = await mailboxDays(fakeDb({ email_events: events, autosend_queue: queue }), w, two, NOW);
  eq("room per mailbox (a sent Autopilot email the sync already has counts once)", days.map((d) => [d.mailbox, d.limit, d.used, d.room]), [["me@agency.com", 20, 18, 2], ["second@agency.com", 20, 17, 3]]);
  const ready = [...Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, mailbox: "me@agency.com" })), ...Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, mailbox: "second@agency.com" }))];
  const picked = pickWithin(ready, 6, roomMap(days), null, 11);
  eq("planning 6 stays inside both limits (2 + 3 = 5 at most)", [picked.length, picked.filter((p) => p.mailbox === "me@agency.com").length], [5, 2]);
}

if (failed) { console.error(`\n${failed} failed`); Deno.exit(1); }
console.log("\nall autopilot server tests passed");
