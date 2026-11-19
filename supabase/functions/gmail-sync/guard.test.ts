// deno run --sloppy-imports --allow-env --allow-read supabase/functions/gmail-sync/guard.test.ts
// The mailbox guard against a recording fake database: what it takes back, in what order, and what it logs.
import { guardMailboxes } from "./guard.ts";

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failed++; console.error(`✗ ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); } else console.log(`✓ ${name}`);
};

type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] };
// Answers every read with that table's rows (filters ignored); records writes.
// deno-lint-ignore no-explicit-any
const recorder = (tables: Record<string, unknown[]>, calls: Call[]): any => ({
  from: (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    // deno-lint-ignore no-explicit-any
    const p: any = new Proxy(() => {}, {
      get(_t, k: string) {
        if (k === "then") { calls.push(call); return (res: (v: unknown) => void) => res({ data: call.op === "select" ? tables[table] || [] : [{ id: "x" }], error: null }); }
        if (k === "maybeSingle") return () => { calls.push(call); return Promise.resolve({ data: (tables[table] || [])[0] ?? null, error: null }); };
        return (...args: unknown[]) => {
          if (k === "update" || k === "insert" || k === "delete") { call.op = k; call.payload = args[0]; }
          if (k === "eq" || k === "in") call.filters.push([String(args[0]), args[1]]);
          return p;
        };
      },
    });
    return p;
  },
});

const NOW = Date.UTC(2026, 10, 19, 12, 0); // 13:00 in Belgrade
const iso = (ms: number) => new Date(ms).toISOString();
const H = 3600_000;
const BOX = "b@x.com";
const prefs = { timezone: "Europe/Belgrade", mailbox_ramp: { [BOX]: "2026-11-09" } }; // week 2 → 20 a day
const rows = [{ id: "r1", user_id: "u1", email: BOX, scopes: "gmail.modify" }];

// 19 sent today + one Gmail follow-up and one Gmail new email scheduled for later, + 2 Autopilot rows = 23 of 20.
const sent = Array.from({ length: 19 }, (_, i) => ({ gmail_id: `s${i}`, mailbox: BOX, thread_id: `ts${i}`, direction: "out", at: iso(NOW - (i + 1) * 10 * 60_000), scheduled: false }));
const sched = [
  { gmail_id: "g-fu", mailbox: BOX, thread_id: "t1", direction: "out", at: iso(NOW + 3 * H), scheduled: true, entity_type: "creator", entity_id: "c-fu", subject: "Re: Collab" },
  { gmail_id: "g-new", mailbox: BOX, thread_id: "t2", direction: "out", at: iso(NOW + 5 * H), scheduled: true, entity_type: "creator", entity_id: "c-new", subject: "Collab" },
];
const history = [{ gmail_id: "old1", thread_id: "t1", direction: "out", at: iso(NOW - 5 * 24 * H), reply_kind: null }];
const queue = [
  { id: "ap-early", creator_id: "c-a", mailbox: BOX, send_at: iso(NOW + 1 * H), round: 1, status: "pending", gmail_id: "" },
  { id: "ap-late", creator_id: "c-b", mailbox: BOX, send_at: iso(NOW + 4 * H), round: 2, status: "pending", gmail_id: "" },
];

{
  const calls: Call[] = [];
  const cancelled: string[] = [];
  const db = recorder({ profiles: [{ preferences: prefs }], email_events: [...sent, ...sched, ...history], autosend_queue: queue, mailbox_trims: [] }, calls);
  const n = await guardMailboxes(db, "u1", rows, (id) => { cancelled.push(id); return Promise.resolve({ ok: true }); }, NOW);
  const apCancels = calls.filter((c) => c.table === "autosend_queue" && c.op === "update").map((c) => c.filters.find((f) => f[0] === "id")?.[1]);
  eq("23 of 20: three taken back", n, 3);
  eq("Autopilot first, latest first", apCancels, ["ap-late", "ap-early"]);
  eq("then the Gmail follow-up — never the new email", cancelled, ["g-fu"]);
  const logged = calls.filter((c) => c.table === "mailbox_trims" && c.op === "insert").map((c) => c.payload as { ref: string; source: string; role: string; used: number; cap: number });
  eq("each one logged with the numbers", logged.map((l) => [l.ref, l.source, l.role, l.used, l.cap]), [["ap-late", "autopilot", "followup", 23, 20], ["ap-early", "autopilot", "followup", 23, 20], ["g-fu", "gmail", "followup", 23, 20]]);
  const timeline = calls.filter((c) => c.table === "activities" && c.op === "insert").map((c) => (c.payload as { text: string }).text);
  eq("…and on the timeline, saying why", timeline.every((t) => t.startsWith(`Mailbox limit: ${BOX} was at 23 of its 20 for today`)), true);
}
{
  const calls: Call[] = [];
  const db = recorder({ profiles: [{ preferences: { ...prefs, mailbox_guard: { on: false } } }], email_events: [...sent, ...sched], autosend_queue: queue, mailbox_trims: [] }, calls);
  eq("guard off → nothing touched", await guardMailboxes(db, "u1", rows, () => Promise.resolve({ ok: true }), NOW), 0);
}
{
  const calls: Call[] = [];
  const cancelled: string[] = [];
  const db = recorder({ profiles: [{ preferences: { ...prefs, mailbox_guard: { on: true, gmail: false } } }], email_events: [...sent, ...sched, ...history], autosend_queue: queue, mailbox_trims: [] }, calls);
  await guardMailboxes(db, "u1", rows, (id) => { cancelled.push(id); return Promise.resolve({ ok: true }); }, NOW);
  eq("Gmail switched off → your scheduled emails are left alone", cancelled, []);
}
{
  const calls: Call[] = [];
  const db = recorder({ profiles: [{ preferences: prefs }], email_events: sent.slice(0, 15), autosend_queue: [], mailbox_trims: [] }, calls);
  eq("under the limit → nothing read beyond the count", [await guardMailboxes(db, "u1", rows, () => Promise.resolve({ ok: true }), NOW), calls.filter((c) => c.op !== "select").length], [0, 0]);
}
{
  const calls: Call[] = [];
  const db = recorder({ profiles: [{ preferences: prefs }], email_events: [...sent, ...sched, ...history], autosend_queue: [], mailbox_trims: [] }, calls);
  const tries: string[] = [];
  await guardMailboxes(db, "u1", rows, (id) => { tries.push(id); return Promise.resolve({ error: "Reconnect", status: 403, code: "needs_modify" }); }, NOW);
  const logged = calls.filter((c) => c.table === "mailbox_trims" && c.op === "insert").map((c) => (c.payload as { status: string; note: string }));
  eq("no permission to cancel in Gmail: tried once, logged once as blocked", [tries.length, logged.map((l) => [l.status, l.note])], [1, [["blocked", "needs_modify"]]]);
}

if (failed) { console.error(`\n${failed} failed`); Deno.exit(1); }
console.log("\nall mailbox guard server tests passed");
