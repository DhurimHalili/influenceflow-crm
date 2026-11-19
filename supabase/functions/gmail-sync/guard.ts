// Mailbox guard: no mailbox ends the day past its daily limit. Runs after a sync that saved new mail (that's
// when your own replies / emails push a mailbox over) and takes back what hasn't gone out yet — Autopilot's
// follow-ups first (latest first), then emails you scheduled in Gmail: follow-ups, then new emails, replies last
// (rules: web/src/lib/mailboxGuard.ts). Every one is logged on the person's timeline and in `mailbox_trims`
// (the app lists them: "See who"), so you know whom to write by hand or DM.
// Cost: two small reads (today's outgoing mail + today's Autopilot rows) per sync that saved mail; more only
// when a mailbox is actually over.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { mailboxDays, type Row, type World } from "./autopilot.ts";
import { planTrims, readGuard, roleOf, trimLabel, type Trim, type Waiting } from "../../../web/src/lib/mailboxGuard.ts";
import { dayEndIn, dayKeyIn, validZone } from "../../../web/src/lib/zones.ts";

// deno-lint-ignore no-explicit-any
type Admin = SupabaseClient<any, "public", any>;
/** Cancels one Gmail-scheduled email (moves it to Gmail's Trash, removes the row, puts back a status only it moved, logs `note`). */
export type CancelGmail = (gmailId: string, note: string) => Promise<{ ok: true } | { error: string; status: number; code?: string }>;

const clock = (tz: string, ms: number) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(ms));

export async function guardMailboxes(admin: Admin, userId: string, rows: Row[], cancelGmail: CancelGmail, now = Date.now()): Promise<number> {
  if (!rows.length) return 0;
  const { data: profile } = await admin.from("profiles").select("preferences").eq("id", userId).maybeSingle();
  const prefs = ((profile as { preferences?: Record<string, unknown> } | null)?.preferences || {}) as Record<string, unknown>;
  const guard = readGuard(prefs.mailbox_guard);
  if (!guard.on) return 0;
  const tz = validZone(prefs.timezone as string) ? (prefs.timezone as string) : "UTC";
  const w = { userId, tz, prefs } as unknown as World;
  const boxes = await mailboxDays(admin, w, rows, now);
  const over = boxes.filter((b) => b.used > b.limit);
  if (!over.length) return 0;
  const overSet = over.map((b) => b.mailbox);
  const day = dayKeyIn(tz, now);
  const end = dayEndIn(tz, now);
  const waiting: Waiting[] = [];

  const { data: queued } = await admin.from("autosend_queue").select("id, creator_id, mailbox, send_at, round").eq("user_id", userId).eq("day", day).eq("status", "pending").limit(500);
  for (const q of (queued || []) as { id: string; creator_id: string; mailbox: string; send_at: string; round: number }[]) {
    if (!overSet.includes(String(q.mailbox || "").toLowerCase())) continue;
    waiting.push({ source: "autopilot", id: q.id, mailbox: q.mailbox, at: new Date(q.send_at).getTime(), role: "followup", entityType: "creator", entityId: q.creator_id, round: q.round });
  }
  if (guard.gmail) {
    const { data: sched } = await admin.from("email_events").select("gmail_id, thread_id, at, mailbox, entity_type, entity_id, subject")
      .eq("user_id", userId).eq("direction", "out").eq("scheduled", true).gt("at", new Date(now).toISOString()).lt("at", new Date(end).toISOString()).limit(500);
    const mine = ((sched || []) as { gmail_id: string; thread_id: string; at: string; mailbox: string; entity_type: string; entity_id: string; subject: string }[])
      .filter((e) => overSet.includes(String(e.mailbox || "").toLowerCase()));
    const threads = [...new Set(mine.map((e) => e.thread_id).filter(Boolean))];
    const byThread = new Map<string, { gmail_id: string; thread_id: string; direction: "in" | "out"; at: string; reply_kind: string | null }[]>();
    if (threads.length) {
      const { data: hist } = await admin.from("email_events").select("gmail_id, thread_id, direction, at, reply_kind").eq("user_id", userId).in("thread_id", threads).is("bounced_at", null).limit(3000);
      for (const h of (hist || []) as { gmail_id: string; thread_id: string; direction: "in" | "out"; at: string; reply_kind: string | null }[]) byThread.set(h.thread_id, [...(byThread.get(h.thread_id) || []), h]);
    }
    for (const e of mine) {
      waiting.push({ source: "gmail", id: e.gmail_id, mailbox: e.mailbox, at: new Date(e.at).getTime(), role: roleOf(e, byThread.get(e.thread_id) || []), entityType: (e.entity_type === "brand" ? "brand" : e.entity_type === "creator" ? "creator" : ""), entityId: e.entity_id });
    }
  }

  // Each email is tried once a day: one we already took back (or couldn't) never counts as waiting again.
  const { data: tried } = await admin.from("mailbox_trims").select("ref").eq("user_id", userId).eq("day", day).limit(1000);
  const triedRefs = new Set(((tried || []) as { ref: string }[]).map((r) => r.ref));
  const { trims } = planTrims(over, waiting.filter((x) => !triedRefs.has(x.id)), guard, now);
  const noModify = new Set<string>();
  let done = 0;
  for (const t of trims) {
    if (t.source === "gmail" && noModify.has(t.mailbox.toLowerCase())) continue;
    const why = `${t.mailbox} was at ${t.used} of its ${t.limit} for today`;
    const what = trimLabel(t).toLowerCase().replace(" · autopilot", " Autopilot was going to send");
    const at = clock(tz, t.at);
    let status: "cancelled" | "blocked" = "cancelled";
    let note = "";
    if (t.source === "autopilot") {
      const { data: hit } = await admin.from("autosend_queue").update({ status: "cancelled", reason: "mailbox_full", updated_at: new Date().toISOString() }).eq("id", t.id).eq("status", "pending").select("id");
      if (!(hit || []).length) continue; // already sent / cancelled meanwhile
      await admin.from("activities").insert({ user_id: userId, text: `Mailbox limit: ${why}, so the ${what} at ${at} was cancelled — write to them tomorrow, or DM them.`, at: new Date().toISOString(), entity_type: "creator", entity_id: t.entityId });
    } else {
      const res = await cancelGmail(t.id, `Mailbox limit: ${why}, so your ${trimLabel(t).toLowerCase()} for ${at} was cancelled (it's in Gmail's Trash for 30 days) — write to them tomorrow, or DM them.`);
      if ("error" in res) {
        if (res.status === 409 && /gone out/i.test(res.error)) continue; // it went out in the meantime: nothing to take back
        status = "blocked";
        note = res.code === "needs_modify" ? "needs_modify" : res.error.slice(0, 160);
        if (res.code === "needs_modify") noModify.add(t.mailbox.toLowerCase()); // one note per mailbox, not one per email
      }
    }
    const { error } = await admin.from("mailbox_trims").insert({ user_id: userId, day, mailbox: t.mailbox.toLowerCase(), source: t.source, role: t.role, round: t.round ?? null, entity_type: t.entityType, entity_id: t.entityId || null, ref: t.id, send_at: new Date(t.at).toISOString(), used: t.used, cap: t.limit, status, note });
    if (!error && status === "cancelled") done++;
  }
  return done;
}

export type { Trim };
