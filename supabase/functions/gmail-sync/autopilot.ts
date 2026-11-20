// Autopilot on the server: plan, queue, send and cancel follow-ups the CRM
// writes for you (rules in web/src/lib/autopilot.ts + smartTime.ts, shared
// with the app so both agree on who, which words and when).
//
// Safety, in order, right before every single send:
//   1. still the same day for you (never tomorrow), and still their day if the
//      send is late;
//   2. they never answered — by email (anyone on their side, any reply but an
//      out-of-office), by hand, or in Gmail right now (the thread is read
//      fresh: a reply the sync hasn't seen yet still cancels it);
//   3. you didn't follow up yourself meanwhile, nothing of yours waits in
//      Gmail's Scheduled folder for them, they're still Contacted / No reply;
//   4. a night-fill follow-up only goes while your goal still needs it.
// Every sync also cancels waiting follow-ups the moment a reply is tracked
// (`cancelOnReply`). Nothing here logs email text, addresses or names.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { answerKind, lastQuestion, pairFit, questionKind, type QuestionKind } from "../../../web/src/lib/followupPairing.ts";
import { assignTemplates, autopilotPool, dayCap, fillNeed, fillTemplate, minutesOf, pickWithin, readAutopilot, readTemplates, roomMap, ruleFit, shiftToZone, type BoxDay, type Fit, type Ready, type Round, type TemplateBook } from "../../../web/src/lib/autopilot.ts";
import { rampPlan, readRamp } from "../../../web/src/lib/goalRamp.ts";
import { readGuard } from "../../../web/src/lib/mailboxGuard.ts";
import { followupState, rulesFrom, type FollowupState } from "../../../web/src/lib/followupEngine.ts";
import { openBounces } from "../../../web/src/lib/bounces.ts";
import { followupsPaused, modeOn, normalizeWeekend } from "../../../web/src/lib/dayMode.ts";
import { awakeAt, hash, planTimes, type PlanItem } from "../../../web/src/lib/smartTime.ts";
import { dayEndIn, dayKeyIn, dayStartIn, localMinute, offsetMin, validZone } from "../../../web/src/lib/zones.ts";
import { rankFollowups, QuotaExhausted } from "../_shared/ai.ts";
import { bodyOf, headerOf, htmlToText, isMine, pickSendAs, pickTarget, quoteAttr, quoteBlock, replyRaw, replyRecipients, replySubject, sentHtml, sentText, type Msg, type SendAs } from "../_shared/replyDraft.ts";
import type { Creator, EmailEvent, Followup, FollowupRules } from "../../../web/src/lib/autopilot.ts";

type Admin = SupabaseClient;
export type Row = { id: string; user_id: string; email: string | null; scopes: string; send_day?: string | null; send_count?: number };
export type Kit = {
  token: (row: Row) => Promise<string>;
  call: <T>(token: string, path: string, init?: RequestInit) => Promise<T>;
  /** Track a message the CRM just sent (email_events + statuses), like a sync would. */
  record: (row: Row, rows: Row[], gmailId: string) => Promise<void>;
  /** Gmail trouble as data: status, reconnect?, retry later? (null = not a Gmail error). */
  gmailError: (e: unknown) => { status: number; reconnect: boolean; retryable: boolean } | null;
  b64url: (bytes: Uint8Array) => string;
};
export type QueueRow = { id: string; user_id: string; creator_id: string; mailbox: string; thread_id: string; round: number; template_id: string; template_name: string; body: string; send_at: string; day: string; origin: "manual" | "batch" | "fill"; batch_id: string | null; status: string; reason: string; attempts: number; gmail_id: string; their_zone: string; created_at: string; updated_at: string };

const SEND_LIMIT = 400; // per mailbox per day, like gmail-sync's own sends
const DAY_MAX = 300; // follow-ups the CRM sends for one member in a day, whatever is asked
const MIN = 60_000;
const mailboxOf = (r: Row) => (r.email || "").toLowerCase();
const canSend = (r: Row) => /gmail\.(send|modify|compose)|mail\.google\.com/.test(r.scopes || "");
const iso = (ms: number) => new Date(ms).toISOString();
const chunk = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
const text = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

// ----- the member's world ---------------------------------------------------------------------

type Prefs = { timezone?: string; daily_email_goal?: number; followup_rules?: Record<string, unknown>; followup_templates?: unknown; autopilot?: unknown; weekend?: unknown; agency_name?: string };
export type World = {
  userId: string; name: string; prefs: Prefs; tz: string; goal: number; rules: FollowupRules; templates: TemplateBook; auto: ReturnType<typeof readAutopilot>;
  creators: Creator[]; events: EmailEvent[]; followups: Followup[];
  /** Creators whose address bounced and wasn't fixed ("Wrong email") — never written to. */
  bounced: Set<string>;
};

const CREATOR_COLS = "id, name, country, youtube, pipeline_status, archived_at, contact_channel, email_followups, followup_snooze_until, primary_thread, primary_thread_at, new_thread_gap, date_contacted, status_source, status_updated_at, lost_at, lost_reason, created_at, contact_email, team";
const EVENT_COLS = "gmail_id, thread_id, direction, entity_type, entity_id, at, mailbox, scheduled, reply_kind, message_key, in_reply_to, subject, counterpart, gone";

/** The member's follow-up rules, read the same way as the app (`rulesFrom`). */
export function rulesOf(prefs: Prefs): FollowupRules {
  return rulesFrom(prefs.followup_rules);
}

/** Only what autopilot needs: live influencers (Contacted / No reply) and their mail — never whole tables. */
export async function loadWorld(admin: Admin, userId: string, only?: string[]): Promise<World> {
  const { data: profile } = await admin.from("profiles").select("display_name, preferences").eq("id", userId).maybeSingle();
  const prefs = (profile?.preferences || {}) as Prefs;
  const tz = validZone(prefs.timezone) ? prefs.timezone! : "UTC";
  const goal = Number(prefs.daily_email_goal) >= 5 && Number(prefs.daily_email_goal) <= 500 ? Math.round(Number(prefs.daily_email_goal)) : 50;
  let q = admin.from("creators").select(CREATOR_COLS).eq("user_id", userId).is("archived_at", null).in("pipeline_status", ["contacted", "no_reply"]);
  if (only?.length) q = q.in("id", only);
  const { data: cs } = await q.limit(5000);
  const creators = ((cs || []) as Record<string, unknown>[]).map((c) => ({ ...c, name: text(c.name), contact_channel: text(c.contact_channel) || "email", email_followups: c.email_followups !== false })) as unknown as Creator[];
  const ids = creators.map((c) => c.id);
  const events: EmailEvent[] = [];
  const followups: Followup[] = [];
  const bounces: EmailEvent[] = [];
  for (const part of chunk(ids, 120)) {
    const { data: bs } = await admin.from("email_events").select("gmail_id, entity_id, counterpart, at, bounced_at, bounce_to, bounce_reason, subject, mailbox, direction").eq("user_id", userId).in("entity_id", part).not("bounced_at", "is", null).limit(2000);
    for (const b of (bs || []) as Record<string, unknown>[]) bounces.push({ id: text(b.gmail_id), gmail_id: text(b.gmail_id), thread_id: "", direction: "out", entity_type: "creator", entity_id: text(b.entity_id), counterpart: text(b.counterpart).toLowerCase(), subject: text(b.subject), snippet: "", at: text(b.at), mailbox: text(b.mailbox), bounced_at: text(b.bounced_at), bounce_to: text(b.bounce_to).toLowerCase(), bounce_reason: text(b.bounce_reason) });
    const [{ data: ev }, { data: fu }] = await Promise.all([
      admin.from("email_events").select(EVENT_COLS).eq("user_id", userId).in("entity_id", part).is("bounced_at", null).order("at").limit(8000),
      admin.from("followups").select("id, creator_id, brand_id, kind, channel, at").eq("user_id", userId).in("creator_id", part).limit(5000),
    ]);
    for (const e of (ev || []) as Record<string, unknown>[]) events.push({ id: text(e.gmail_id), gmail_id: text(e.gmail_id), thread_id: text(e.thread_id), direction: e.direction === "in" ? "in" : "out", entity_type: e.entity_type === "brand" ? "brand" : "creator", entity_id: text(e.entity_id), counterpart: text(e.counterpart), subject: text(e.subject), snippet: "", at: text(e.at), mailbox: text(e.mailbox).toLowerCase(), scheduled: e.scheduled === true, reply_kind: (text(e.reply_kind) || "") as EmailEvent["reply_kind"], message_key: text(e.message_key), in_reply_to: text(e.in_reply_to), gone: (text(e.gone) || "") as EmailEvent["gone"] });
    for (const f of (fu || []) as Record<string, unknown>[]) followups.push({ id: text(f.id), user_id: userId, creator_id: text(f.creator_id) || null, brand_id: null, kind: f.kind === "reply" ? "reply" : "followup", channel: text(f.channel), note: "", at: text(f.at) } as Followup);
  }
  events.sort((a, b) => a.at.localeCompare(b.at));
  followups.sort((a, b) => b.at.localeCompare(a.at));
  const addressesOf = (c: Creator) => [c.contact_email || "", ...((Array.isArray(c.team) ? c.team : []) as { email?: string; removed?: boolean }[]).filter((m) => !m.removed).map((m) => m.email || "")];
  const bounced = new Set(openBounces(creators.map((c) => ({ id: c.id, kind: "creator" as const, addresses: addressesOf(c) })), bounces, events).keys());
  return { userId, name: text(profile?.display_name), prefs, tz, goal, rules: rulesOf(prefs), templates: readTemplates(prefs.followup_templates), auto: readAutopilot(prefs.autopilot), creators, events, followups, bounced };
}

/** The follow-up engine read on YOUR calendar (the server runs in UTC). */
export function statesOf(w: World, now: number): Map<string, FollowupState> {
  const { shift, iso: at } = shiftToZone(w.tz, offsetMin);
  const sNow = new Date(shift(now));
  const byId = new Map<string, EmailEvent[]>();
  for (const e of w.events) byId.set(e.entity_id, [...(byId.get(e.entity_id) || []), { ...e, at: at(e.at) || e.at }]);
  const fu = new Map<string, Followup[]>();
  for (const f of w.followups) if (f.creator_id) fu.set(f.creator_id, [...(fu.get(f.creator_id) || []), { ...f, at: at(f.at) || f.at }]);
  const out = new Map<string, FollowupState>();
  for (const c of w.creators) {
    const record = { ...c, status_updated_at: at(c.status_updated_at) || c.status_updated_at, lost_at: at(c.lost_at) ?? c.lost_at, primary_thread_at: at(c.primary_thread_at) ?? c.primary_thread_at } as Creator;
    out.set(c.id, followupState({ type: "creator", record }, fu.get(c.id) || [], byId.get(c.id) || [], w.rules, sNow));
  }
  return out;
}

export const pausedToday = (w: World, now: number) => {
  const { shift } = shiftToZone(w.tz, offsetMin);
  return followupsPaused(modeOn(new Date(shift(now)), normalizeWeekend(w.prefs.weekend as never)));
};

async function pendingOf(admin: Admin, userId: string) {
  const { data } = await admin.from("autosend_queue").select("id, creator_id, mailbox, send_at, status, origin, day").eq("user_id", userId).in("status", ["pending", "sending"]).limit(2000);
  return (data || []) as { id: string; creator_id: string; mailbox: string; send_at: string; status: string; origin: string; day: string }[];
}

/** Who may get a follow-up now. `anyWords`: one you write yourself (a profile) needs no saved template. */
/**
 * People Autopilot leaves alone for the rest of today: one it already sent to, one that failed (no retry
 * storms), or one it stopped for a reason that still holds (they replied, you wrote yourself…). A follow-up
 * cancelled only because your goal was met can come back. One YOU cancelled stays out of the night fill
 * (`fill`: you meant "not tonight"), but you can plan it again yourself — cancelling by mistake never hides
 * people from "Send for me".
 */
export async function doneWithToday(admin: Admin, userId: string, day: string, opts: { fill?: boolean } = {}): Promise<Set<string>> {
  const { data } = await admin.from("autosend_queue").select("creator_id, status, reason").eq("user_id", userId).eq("day", day).in("status", ["sent", "failed", "cancelled"]).limit(3000);
  const back = new Set(["goal_met", "fill_off", "day_over", ...(opts.fill ? [] : ["by_you"])]);
  return new Set(((data || []) as { creator_id: string; status: string; reason: string }[]).filter((r) => r.status !== "cancelled" || !back.has(r.reason)).map((r) => r.creator_id));
}

export function poolOf(w: World, rows: Row[], queued: Set<string>, now: number, anyWords = false) {
  const placeholder = { id: "yours", name: "", text: "x" };
  const templates = anyWords ? ({ 1: [placeholder], 2: [placeholder], 3: [placeholder], 4: [placeholder] } as TemplateBook) : w.templates;
  return autopilotPool({ creators: w.creators, followups: w.followups, events: w.events, states: statesOf(w, now), mailboxes: rows.filter(canSend).map(mailboxOf), templates, queued, paused: pausedToday(w, now), bounced: w.bounced });
}

// ----- which words fit ------------------------------------------------------------------------------

type Prev = { text: string; latest: Msg | null };

/** Your last email in each thread (what the follow-up answers) — read from Gmail, never stored. */
async function previousOf(kit: Kit, rows: Row[], ready: Ready[]): Promise<Map<string, Prev>> {
  const out = new Map<string, Prev>();
  const byBox = new Map<string, Ready[]>();
  for (const r of ready) byBox.set(r.mailbox, [...(byBox.get(r.mailbox) || []), r]);
  await Promise.all([...byBox.entries()].map(async ([box, list]) => {
    const row = rows.find((x) => mailboxOf(x) === box);
    if (!row) return;
    const token = await kit.token(row).catch(() => "");
    if (!token) return;
    for (const r of list) {
      const m = await kit.call<Msg>(token, `/messages/${r.lastGmailId}?format=full`).catch(() => null);
      const b = m ? bodyOf(m.payload) : { html: "", text: "" };
      out.set(r.id, { text: (b.text || htmlToText(b.html)).slice(0, 20000), latest: m });
    }
  }));
  return out;
}

export type Scored = Record<string, Fit & { by: "ai" | "rules" }>;

/** Each template's fit for each email: the rules always, an AI's opinion on top when it answers. */
async function fitsOf(ready: Ready[], prev: Map<string, Prev>, book: TemplateBook): Promise<{ fits: Map<string, Scored>; ai: boolean }> {
  const fits = new Map<string, Scored>();
  for (const r of ready) {
    const p = prev.get(r.id)?.text || "";
    const s: Scored = {};
    for (const t of book[r.round]) s[t.id] = { ...ruleFit(p, t.text, r.round), by: "rules" };
    fits.set(r.id, s);
  }
  let ai = false;
  const ask = ready.filter((r) => book[r.round].length > 1 && (prev.get(r.id)?.text || "").trim());
  for (const part of chunk(ask, 20)) {
    let picks: Awaited<ReturnType<typeof rankFollowups>> = null;
    try {
      picks = await rankFollowups(part.map((r) => ({ id: r.id, round: r.round, previous: prev.get(r.id)!.text, templates: book[r.round].map((t) => ({ id: t.id, text: t.text })) })));
    } catch (e) {
      if (e instanceof QuotaExhausted) break; // every AI is out for now: the rules decide
      picks = null;
    }
    for (const p of picks || []) {
      const s = fits.get(p.id);
      if (!s) continue;
      for (const [tid, a] of Object.entries(p.fits)) {
        const rule = s[tid];
        if (!rule) continue;
        // A template that answers a different question is out, whatever an AI thinks of it.
        if (rule.clash) continue;
        // The rules' "asks the same question again" stands; otherwise the AI weighs most.
        const echo = rule.echo || (a.repeats && a.fit < 0.35);
        s[tid] = { score: echo ? Math.min(rule.score, a.fit, 0.1) : 0.6 * a.fit + 0.4 * rule.score, echo, why: a.why || rule.why, by: "ai" };
        ai = true;
      }
    }
  }
  return { fits, ai };
}

/** How often each template went out in the last week (the less used wins a tie — same words to many people is what spam filters notice). */
async function recentUse(admin: Admin, userId: string) {
  const { data } = await admin.from("autosend_queue").select("template_id").eq("user_id", userId).eq("status", "sent").gte("sent_at", iso(Date.now() - 7 * 86400000)).limit(3000);
  const out: Record<string, number> = {};
  for (const r of (data || []) as { template_id: string }[]) out[r.template_id] = (out[r.template_id] || 0) + 1;
  return out;
}

// ----- planning ---------------------------------------------------------------------------------------

export type PlanRow = { creatorId: string; name: string; round: Round; mailbox: string; threadId: string; templateId: string; templateName: string; text: string; at: number; theirClock: string; zone: string; zones: string[]; offBy: number; fit: { score: number; why: string; by: "ai" | "rules"; echo: boolean } | null; asked: string };
/** People no template can answer: your last email asked `asked` and none of that follow-up's templates fit after it. */
export type Blocked = { creatorId: string; name: string; round: Round; asked: string; kind: QuestionKind };
export type PlanOut = { rows: PlanRow[]; blocked: Blocked[]; can: number; asleep: { creatorId: string; name: string; zone: string; theirClock: string; opensAt: number | null }[]; full: number; from: number; until: number; ai: boolean; seed: number };

const priority = (a: Ready, b: Ready) => b.overdueDays - a.overdueDays || a.round - b.round || a.id.localeCompare(b.id);

/**
 * A plan for some of the ready people: times (smart, today only), then the
 * template for each (even spread × best fit), with your words filled for them.
 */
export async function planFor(admin: Admin, kit: Kit, w: World, rows: Row[], ready: Ready[], o: { now: number; count: number; from?: number; seed?: number; taken: { mailbox: string; at: number }[]; room?: Map<string, number> | null; perBox?: Record<string, number> | null }): Promise<PlanOut> {
  const seed = o.seed ?? (hash(`${w.userId}|${o.now}`) % 100000);
  const items = (list: Ready[]): PlanItem[] => list.map((r) => ({ id: r.id, mailbox: r.mailbox, zones: r.zones, firstAt: r.firstAt, lastAt: r.lastAt, weight: r.overdueDays }));
  // Who can go at all today (their day overlaps the rest of yours) — the count is capped at that.
  const all = planTimes(items(ready), { now: o.now, userZone: w.tz, from: o.from, taken: o.taken, seed });
  const fits = new Set(all.placed.map((p) => p.id));
  // Each mailbox only up to its room for today (its daily limit minus what it sent or has waiting), mixed at random.
  const chosen = pickWithin(ready.filter((r) => fits.has(r.id)).sort(priority), Math.max(0, Math.min(o.count, DAY_MAX)), o.room ?? null, o.perBox ?? null, seed);
  const plan = planTimes(items(chosen), { now: o.now, userZone: w.tz, from: o.from, taken: o.taken, seed });
  const placed = new Map(plan.placed.map((p) => [p.id, p]));
  const going = chosen.filter((r) => placed.has(r.id));
  const prev = await previousOf(kit, rows, going);
  const { fits: scored, ai } = await fitsOf(going, prev, w.templates);
  const pick = assignTemplates(going.map((r) => ({ id: r.id, round: r.round, fits: scored.get(r.id) })), w.templates, await recentUse(admin, w.userId), seed);
  const byName = new Map(w.creators.map((c) => [c.id, c.name]));
  const out: PlanRow[] = [];
  const blocked: Blocked[] = [];
  for (const r of going) {
    const p = placed.get(r.id)!;
    const tid = pick.get(r.id);
    const t = w.templates[r.round].find((x) => x.id === tid);
    if (!t) {
      const text = prev.get(r.id)?.text || "";
      blocked.push({ creatorId: r.id, name: byName.get(r.id) || r.name, round: r.round, asked: lastQuestion(text), kind: questionKind(text) });
      continue;
    }
    const f = scored.get(r.id)?.[t.id];
    out.push({ creatorId: r.id, name: byName.get(r.id) || r.name, round: r.round, mailbox: r.mailbox, threadId: r.threadId, templateId: t.id, templateName: t.name, text: fillTemplate(t.text, { name: byName.get(r.id) || r.name, my_name: w.name, agency: w.prefs.agency_name }), at: p.at, theirClock: p.theirClock, zone: p.zone, zones: r.zones, offBy: p.offBy, fit: f ? { score: Math.round(f.score * 100) / 100, why: f.why, by: f.by, echo: f.echo } : null, asked: askedOf(prev.get(r.id)?.text || "") });
  }
  out.sort((a, b) => a.at - b.at);
  const asleep = all.unplaced.filter((u) => u.why === "asleep").map((u) => ({ creatorId: u.id, name: byName.get(u.id) || "", zone: u.zone, theirClock: u.theirClock, opensAt: u.opensAt }));
  return { rows: out, blocked, can: all.placed.length, asleep, full: all.unplaced.filter((u) => u.why === "full").length, from: plan.from || all.from, until: plan.until || all.until, ai, seed };
}

/** The question your last email ended on, shortened ("Are you interested?"). */
function askedOf(prev: string) {
  const lines = prev.split("\n").map((l) => l.trim()).filter(Boolean);
  const cut = lines.findIndex((l) => /^>|^On .{4,120}wrote:$/i.test(l) || l === "--");
  const fresh = (cut >= 0 ? lines.slice(0, cut) : lines).join(" ");
  const q = fresh.match(/[^.!?]*\?/g);
  return (q ? q[q.length - 1] : "").trim().slice(0, 160);
}

// ----- queueing ----------------------------------------------------------------------------------------

export async function insertQueue(admin: Admin, userId: string, tz: string, rows: PlanRow[], origin: "manual" | "batch" | "fill", batchId: string | null) {
  let made = 0;
  const skipped: string[] = [];
  for (const r of rows) {
    const { error } = await admin.from("autosend_queue").insert({
      user_id: userId, creator_id: r.creatorId, mailbox: r.mailbox, thread_id: r.threadId, round: r.round, template_id: r.templateId, template_name: r.templateName.slice(0, 40), body: r.text.slice(0, 2000),
      send_at: iso(r.at), day: dayKeyIn(tz, r.at), origin, batch_id: batchId, fit: r.fit, their_zone: r.zones.join(","),
    });
    if (error) skipped.push(r.creatorId); else made++;
  }
  return { made, skipped };
}

// ----- how much you did today (the goal's number, read lightly) ------------------------------------

/**
 * Today's outreach on your clock, the way the coach counts it: every email you
 * sent (one per message), follow-ups you logged by hand, first contacts stamped today — plus what Gmail still holds to send
 * before midnight. Only today's rows are read.
 */
export async function doneToday(admin: Admin, userId: string, tz: string, now: number) {
  const start = dayStartIn(tz, now), end = dayEndIn(tz, now);
  const { data: out } = await admin.from("email_events").select("gmail_id, entity_id, at, scheduled").eq("user_id", userId).eq("direction", "out").is("bounced_at", null).gte("at", iso(start)).lt("at", iso(end)).limit(5000);
  const sent = new Set<string>(), later = new Set<string>();
  const mailAt = new Map<string, number[]>();
  for (const e of (out || []) as { gmail_id: string; entity_id: string; at: string; scheduled: boolean }[]) {
    const t = new Date(e.at).getTime();
    if (e.scheduled && t > now) later.add(e.gmail_id); else sent.add(e.gmail_id);
    mailAt.set(e.entity_id, [...(mailAt.get(e.entity_id) || []), t]);
  }
  const { data: fu } = await admin.from("followups").select("creator_id, brand_id, kind, channel, at").eq("user_id", userId).eq("kind", "followup").gte("at", iso(start)).lt("at", iso(now + 1)).limit(2000);
  let manual = 0;
  for (const f of (fu || []) as { creator_id: string | null; brand_id: string | null; channel: string; at: string }[]) {
    const t = new Date(f.at).getTime();
    const same = (mailAt.get(f.creator_id || f.brand_id || "") || []).some((m) => Math.abs(m - t) < 6 * 3600_000);
    if ((f.channel && f.channel !== "email") || !same) manual++;
  }
  const day = dayKeyIn(tz, now);
  let stamps = 0;
  for (const table of ["creators", "brands"] as const) {
    const { data: rs } = await admin.from(table).select("id").eq("user_id", userId).eq("date_contacted", day).neq("pipeline_status", "new").is("archived_at", null).limit(500);
    const ids = ((rs || []) as { id: string }[]).map((r) => r.id).filter((id) => !mailAt.has(id));
    for (const part of chunk(ids, 100)) {
      const { data: any } = await admin.from("email_events").select("entity_id").eq("user_id", userId).eq("direction", "out").in("entity_id", part).limit(1000);
      const { data: logged } = await admin.from("followups").select(table === "creators" ? "creator_id" : "brand_id").eq("user_id", userId).in(table === "creators" ? "creator_id" : "brand_id", part).limit(1000);
      const touched = new Set([...((any || []) as { entity_id: string }[]).map((e) => e.entity_id), ...((logged || []) as Record<string, string>[]).map((f) => f.creator_id || f.brand_id)]);
      stamps += part.filter((id) => !touched.has(id)).length;
    }
  }
  return { done: sent.size + manual + stamps, later: later.size, ids: new Set([...sent, ...later]) };
}

/**
 * Each mailbox's day: its daily limit (the weekly ramp — 10 a day in its first week, +10 a week up to 50; Settings →
 * Daily goal), what it already used today (emails sent + waiting in Gmail's Scheduled folder for today + Autopilot's
 * waiting or sent ones the sync hasn't brought in yet) and the room left. Autopilot never plans past the room.
 */
export async function mailboxDays(admin: Admin, w: World, rows: Row[], now: number): Promise<BoxDay[]> {
  const boxes = rows.map((r) => String(r.email || "").toLowerCase()).filter(Boolean);
  if (!boxes.length) return [];
  const today = dayKeyIn(w.tz, now);
  const plan = rampPlan(readRamp((w.prefs as { mailbox_ramp?: unknown }).mailbox_ramp), boxes, today);
  const start = dayStartIn(w.tz, now), end = dayEndIn(w.tz, now);
  const { data: out } = await admin.from("email_events").select("gmail_id, mailbox").eq("user_id", w.userId).eq("direction", "out").is("bounced_at", null).gte("at", iso(start)).lt("at", iso(end)).limit(5000);
  const used = new Map<string, number>();
  const seen = new Set<string>();
  for (const e of (out || []) as { gmail_id: string; mailbox: string }[]) {
    if (seen.has(e.gmail_id)) continue;
    seen.add(e.gmail_id);
    const m = String(e.mailbox || "").toLowerCase();
    used.set(m, (used.get(m) || 0) + 1);
  }
  const { data: q } = await admin.from("autosend_queue").select("mailbox, status, gmail_id").eq("user_id", w.userId).eq("day", today).in("status", ["pending", "sending", "sent"]).limit(2000);
  for (const r of (q || []) as { mailbox: string; status: string; gmail_id: string }[]) {
    if (r.status === "sent" && r.gmail_id && seen.has(r.gmail_id)) continue;
    const m = String(r.mailbox || "").toLowerCase();
    used.set(m, (used.get(m) || 0) + 1);
  }
  return plan.boxes.map((b) => ({ mailbox: b.mailbox, limit: b.perDay, used: used.get(b.mailbox) || 0, room: Math.max(0, b.perDay - (used.get(b.mailbox) || 0)) }));
}

// ----- sending --------------------------------------------------------------------------------------------

const ourSends = async (admin: Admin, userId: string, creatorId: string) => {
  const { data } = await admin.from("autosend_queue").select("gmail_id").eq("user_id", userId).eq("creator_id", creatorId).eq("status", "sent").limit(50);
  return new Set(((data || []) as { gmail_id: string }[]).map((r) => r.gmail_id).filter(Boolean));
};

type Outcome = { status: "sent" | "cancelled" | "failed" | "retry"; reason: string; gmailId?: string };

/** Why this one must not go — or "" when it may. Read from the CRM's own records. */
async function reasonNotToSend(admin: Admin, q: QueueRow, w: World, now: number): Promise<string> {
  const end = dayEndIn(w.tz, now);
  if (dayKeyIn(w.tz, now) !== q.day || now >= end) return "day_over";
  // The mailbox reached its daily limit since this was planned (your own replies / emails count too): it doesn't go.
  if (readGuard((w.prefs as { mailbox_guard?: unknown }).mailbox_guard).on) {
    const [box] = await mailboxDays(admin, w, [{ id: "", user_id: w.userId, email: q.mailbox, scopes: "" }], now);
    if (box && box.used > box.limit) return "mailbox_full"; // `used` counts this one already
  }
  const sendAt = new Date(q.send_at).getTime();
  const zones = q.their_zone ? q.their_zone.split(",").filter(validZone) : [];
  // Late (the cron was down, or a retry): only while it's still their day.
  if (now - sendAt > 15 * MIN && zones.length && !awakeAt(zones, now)) return "their_night";
  const c = w.creators.find((x) => x.id === q.creator_id);
  if (!c) return "status";
  const mine = w.events.filter((e) => e.entity_id === q.creator_id);
  if (mine.some((e) => e.direction === "in" && (e.reply_kind || "") !== "auto") || w.followups.some((f) => f.creator_id === q.creator_id && f.kind === "reply")) return "replied";
  if (c.contact_channel && c.contact_channel !== "email") return "status";
  const ours = await ourSends(admin, w.userId, q.creator_id);
  const queuedAt = new Date(q.created_at).getTime() - 60_000;
  if (mine.some((e) => e.direction === "out" && !ours.has(e.gmail_id) && new Date(e.at).getTime() > queuedAt && !e.scheduled)) return "you_followed_up";
  if (mine.some((e) => e.direction === "out" && e.scheduled && new Date(e.at).getTime() > now)) return "scheduled_in_gmail";
  if (w.followups.some((f) => f.creator_id === q.creator_id && f.kind === "followup" && new Date(f.at).getTime() > queuedAt)) return "you_followed_up";
  if (q.origin === "fill") {
    if (!w.auto.fill) return "fill_off";
    const { done, later } = await doneToday(admin, w.userId, w.tz, now);
    const { data: before } = await admin.from("autosend_queue").select("id").eq("user_id", w.userId).in("status", ["pending", "sending"]).lt("send_at", q.send_at).neq("id", q.id).limit(500);
    if (done + later + (before || []).length >= w.goal) return "goal_met";
  }
  return "";
}

/**
 * Send one queued follow-up — after a fresh look at the Gmail thread. Their
 * reply (that the sync hasn't seen yet) cancels it; your words go out as a
 * reply to your last email, with your signature and the quote, like Gmail's
 * own Reply would.
 */
export async function sendOne(admin: Admin, kit: Kit, q: QueueRow, rows: Row[], w: World, now = Date.now()): Promise<Outcome> {
  const why = await reasonNotToSend(admin, q, w, now);
  if (why) return { status: "cancelled", reason: why };
  const row = rows.find((r) => mailboxOf(r) === q.mailbox);
  if (!row || !canSend(row)) return { status: "failed", reason: "mailbox" };
  const today = new Date().toISOString().slice(0, 10);
  const sentToday = row.send_day === today ? row.send_count || 0 : 0;
  if (sentToday >= SEND_LIMIT) return { status: "failed", reason: "mailbox_limit" };
  try {
    const token = await kit.token(row);
    const H = ["From", "To", "Cc", "Reply-To", "Subject", "Date", "Message-ID", "References", "Auto-Submitted", "X-Autoreply", "X-Autorespond"];
    const thread = await kit.call<{ messages?: Msg[] }>(token, `/threads/${q.thread_id}?format=metadata&${H.map((h) => `metadataHeaders=${h}`).join("&")}`).catch((e) => (kit.gmailError(e)?.status === 404 ? null : Promise.reject(e)));
    if (!thread?.messages?.length) return { status: "cancelled", reason: "gone" };
    const sendAs = (await kit.call<{ sendAs?: SendAs[] }>(token, "/settings/sendAs").catch(() => null))?.sendAs || [];
    const own = new Set([...rows.map(mailboxOf), ...sendAs.map((s) => (s.sendAsEmail || "").toLowerCase())].filter(Boolean));
    const real = thread.messages.filter((m) => { const l = m.labelIds || []; return !l.includes("DRAFT") && !l.includes("TRASH"); });
    // Anything from their side in the thread — except an out-of-office — is an answer.
    const auto = (m: Msg) => { const a = headerOf(m, "Auto-Submitted").toLowerCase(); return (!!a && a !== "no") || !!headerOf(m, "X-Autoreply") || !!headerOf(m, "X-Autorespond"); };
    if (real.some((m) => !isMine(m, own) && !auto(m))) return { status: "cancelled", reason: "replied" };
    const { latest } = pickTarget(real, now);
    if (!latest || !isMine(latest, own)) return { status: "cancelled", reason: "gone" };
    // A newer email of yours than the one planned on = you followed up yourself (Gmail shows it before the sync does).
    const ours = await ourSends(admin, w.userId, q.creator_id);
    const lastKnown = w.events.filter((e) => e.thread_id === q.thread_id && e.direction === "out" && !e.scheduled).map((e) => e.gmail_id);
    if (!lastKnown.includes(latest.id) && !ours.has(latest.id) && Number(latest.internalDate || 0) > new Date(q.created_at).getTime() - 60_000) return { status: "cancelled", reason: "you_followed_up" };
    const sorted = [...real].sort((a, b) => Number(a.internalDate || 0) - Number(b.internalDate || 0));
    const to = replyRecipients(latest, own, sorted);
    if (!to.length) return { status: "failed", reason: "no_recipient" };
    const from = pickSendAs(latest, own, sendAs, mailboxOf(row));
    const full = await kit.call<Msg>(token, `/messages/${latest.id}?format=full`).catch(() => null);
    const body = full ? bodyOf(full.payload) : { html: "", text: "" };
    // Last check on the words: they must make sense after the email they answer (queued before a template changed,
    // or before this rule existed) — "Should I check back later?" is never followed by "Seems like it might be.".
    const prevText = body.text || htmlToText(body.html);
    if (prevText.trim() && !canFollow(prevText, q.body)) return { status: "cancelled", reason: "no_answer" };
    const quote = full ? quoteBlock(latest, body) : "";
    const quotedText = full ? { attr: quoteAttr(latest), text: body.text || htmlToText(body.html) } : null;
    const raw = replyRaw({ from: from.email, fromName: from.name, to, subject: replySubject(headerOf(latest, "Subject")), messageId: headerOf(latest, "Message-ID"), references: headerOf(latest, "References"), html: sentHtml(q.body, from.signature, quote), text: sentText(q.body, from.signature, quotedText) });
    // Claimed once more right before Gmail gets it: a cancel that landed this second still wins.
    const { data: still } = await admin.from("autosend_queue").select("status").eq("id", q.id).maybeSingle();
    if (still?.status !== "sending") return { status: "cancelled", reason: "by_you" };
    const sent = await kit.call<{ id: string; threadId: string }>(token, "/messages/send", { method: "POST", body: JSON.stringify({ raw: kit.b64url(new TextEncoder().encode(raw)), threadId: q.thread_id }) });
    await admin.from("gmail_tokens").update({ send_day: today, send_count: sentToday + 1 }).eq("id", row.id);
    row.send_day = today; row.send_count = sentToday + 1;
    return { status: "sent", reason: "", gmailId: sent.id };
  } catch (e) {
    const g = kit.gmailError(e);
    if (g?.reconnect) return { status: "failed", reason: "mailbox" };
    if (g?.retryable || !g) return { status: "retry", reason: "gmail_busy" };
    return { status: "failed", reason: `gmail_${g.status}` };
  }
}

const ORDINAL = ["", "1st", "2nd", "3rd", "4th"];
const REASON_TEXT: Record<string, string> = {
  no_answer: "its words didn't answer the question in your last email (add an answer in Settings → Follow-up templates)",
  replied: "they replied", you_followed_up: "you followed up yourself", scheduled_in_gmail: "you scheduled one in Gmail", goal_met: "your goal was already met",
  day_over: "the day ended before it could go", mailbox_full: "the mailbox reached its daily limit", their_night: "it was too late in their day", status: "they're no longer Contacted / No reply", gone: "the conversation is gone from Gmail", fill_off: "the night fill was switched off",
};

/** Apply what happened to a queued row (and log it on the influencer's timeline). */
export async function settle(admin: Admin, kit: Kit, q: QueueRow, out: Outcome, rows: Row[]) {
  const now = new Date().toISOString();
  if (out.status === "retry") {
    const attempts = (q.attempts || 0) + 1;
    if (attempts < 3) { await admin.from("autosend_queue").update({ status: "pending", attempts, send_at: iso(Date.now() + 3 * MIN), updated_at: now, reason: out.reason }).eq("id", q.id); return; }
    out = { status: "failed", reason: out.reason };
  }
  await admin.from("autosend_queue").update({ status: out.status, reason: out.reason, gmail_id: out.gmailId || "", sent_at: out.status === "sent" ? now : null, updated_at: now }).eq("id", q.id);
  if (out.status === "sent" && out.gmailId) {
    const row = rows.find((r) => mailboxOf(r) === q.mailbox);
    if (row) await kit.record(row, rows, out.gmailId).catch(() => undefined);
    await admin.from("activities").insert({ user_id: q.user_id, text: `Autopilot sent your ${ORDINAL[q.round] || ""} follow-up (template “${q.template_name}”)`, at: now, entity_type: "creator", entity_id: q.creator_id });
  } else if (out.status === "cancelled" && REASON_TEXT[out.reason] && out.reason !== "by_you") {
    await admin.from("activities").insert({ user_id: q.user_id, text: `Autopilot didn't send your ${ORDINAL[q.round] || ""} follow-up: ${REASON_TEXT[out.reason]}`, at: now, entity_type: "creator", entity_id: q.creator_id });
  }
}

/** Claim one row for sending (two runs never send the same follow-up). */
async function claim(admin: Admin, id: string): Promise<QueueRow | null> {
  const { data } = await admin.from("autosend_queue").update({ status: "sending", updated_at: new Date().toISOString() }).eq("id", id).eq("status", "pending").select("*");
  return ((data || []) as QueueRow[])[0] || null;
}

/** Send one of yours now (after the few seconds' undo) — the same checks as the minute cron. */
export async function flushOne(admin: Admin, kit: Kit, userId: string, id: string, rows: Row[]) {
  const { data: own } = await admin.from("autosend_queue").select("id").eq("id", id).eq("user_id", userId).eq("status", "pending").maybeSingle();
  const q = own ? await claim(admin, id) : null;
  if (!q) return { status: "gone" as const, reason: "" };
  const w = await loadWorld(admin, userId, [q.creator_id]);
  const out = await sendOne(admin, kit, q, rows, w);
  await settle(admin, kit, q, out, rows);
  return out;
}

// ----- the minute cron ------------------------------------------------------------------------------------

export async function tick(admin: Admin, kit: Kit, deadline: number) {
  const now = Date.now();
  let sent = 0, cancelled = 0, failed = 0, filled = 0;
  // A run that died mid-send: if Gmail has it, it went; otherwise it's marked failed (never sent twice).
  const { data: stale } = await admin.from("autosend_queue").select("*").eq("status", "sending").lt("updated_at", iso(now - 10 * MIN)).limit(50);
  for (const q of (stale || []) as QueueRow[]) {
    const { data: ev } = await admin.from("email_events").select("gmail_id").eq("user_id", q.user_id).eq("thread_id", q.thread_id).eq("direction", "out").gte("at", q.updated_at).limit(1).maybeSingle();
    await admin.from("autosend_queue").update(ev ? { status: "sent", gmail_id: ev.gmail_id, sent_at: q.updated_at, updated_at: iso(now) } : { status: "failed", reason: "interrupted", updated_at: iso(now) }).eq("id", q.id);
  }
  const { data: due } = await admin.from("autosend_queue").select("id, user_id").eq("status", "pending").lte("send_at", iso(now + 20_000)).order("send_at").limit(60);
  const byUser = new Map<string, string[]>();
  for (const d of (due || []) as { id: string; user_id: string }[]) byUser.set(d.user_id, [...(byUser.get(d.user_id) || []), d.id]);
  for (const [userId, ids] of byUser) {
    if (Date.now() > deadline) break;
    const { data: member } = await admin.from("profiles").select("access").eq("id", userId).maybeSingle();
    if (member?.access && member.access !== "approved") { await admin.from("autosend_queue").update({ status: "cancelled", reason: "access" }).in("id", ids); continue; }
    const rows = await rowsOf(admin, userId);
    const claimed: QueueRow[] = [];
    for (const id of ids) { const q = await claim(admin, id); if (q) claimed.push(q); }
    if (!claimed.length) continue;
    const w = await loadWorld(admin, userId, Array.from(new Set(claimed.map((q) => q.creator_id))));
    for (const q of claimed) {
      if (Date.now() > deadline) { await admin.from("autosend_queue").update({ status: "pending" }).eq("id", q.id); continue; }
      const out = await sendOne(admin, kit, q, rows, w);
      await settle(admin, kit, q, out, rows);
      if (out.status === "sent") sent++; else if (out.status === "cancelled") cancelled++; else if (out.status === "failed") failed++;
    }
  }
  // The night fill, for members who turned it on (each checked every 15 minutes while it's their fill time).
  const { data: fillers } = await admin.from("profiles").select("id, access, preferences").eq("preferences->autopilot->>fill", "true").limit(500);
  for (const m of (fillers || []) as { id: string; access: string; preferences: Prefs }[]) {
    if (Date.now() > deadline - 20_000) break;
    if (m.access && m.access !== "approved") continue;
    filled += await fillFor(admin, kit, m.id, m.preferences, false).catch(() => 0);
  }
  return { sent, cancelled, failed, filled };
}

export async function rowsOf(admin: Admin, userId: string): Promise<Row[]> {
  const { data } = await admin.from("gmail_tokens").select("*").eq("user_id", userId).limit(5);
  return (data || []) as Row[];
}

/**
 * Night fill: from your start time to midnight, when today's outreach is short
 * of your goal, queue follow-ups to close the gap — up to the day's ceiling.
 * What the ceiling holds back is saved as `short` ("Fill the last N too?").
 */
export async function fillFor(admin: Admin, kit: Kit, userId: string, prefs: Prefs, force: boolean): Promise<number> {
  const auto = readAutopilot(prefs.autopilot);
  if (!auto.fill) return 0;
  const tz = validZone(prefs.timezone) ? prefs.timezone! : "UTC";
  const now = Date.now();
  const day = dayKeyIn(tz, now);
  const startMs = dayStartIn(tz, now) + minutesOf(auto.start) * MIN;
  const end = dayEndIn(tz, now);
  if (now < startMs - MIN || now > end - 6 * MIN) return 0;
  const { data: dayRow } = await admin.from("autosend_days").select("*").eq("user_id", userId).eq("day", day).maybeSingle();
  if (!force && dayRow?.checked_at && now - new Date(dayRow.checked_at).getTime() < 15 * MIN) return 0;
  const save = (patch: Record<string, unknown>) => admin.from("autosend_days").upsert({ user_id: userId, day, extra_ok: dayRow?.extra_ok === true, declined: dayRow?.declined === true, ...patch, checked_at: iso(now) });
  const rows = (await rowsOf(admin, userId)).filter(canSend);
  if (!rows.length) { await save({ note: "no_mailbox", need: 0, short: 0, available: 0 }); return 0; }
  const w = await loadWorld(admin, userId);
  if (pausedToday(w, now)) { await save({ note: "weekend", need: 0, short: 0, available: 0 }); return 0; }
  const { done, later, ids } = await doneToday(admin, userId, tz, now);
  const { data: today } = await admin.from("autosend_queue").select("creator_id, mailbox, send_at, status, origin, gmail_id").eq("user_id", userId).eq("day", day).limit(2000);
  const list = (today || []) as { creator_id: string; mailbox: string; send_at: string; status: string; origin: string; gmail_id: string }[];
  // Sent by Autopilot a moment ago, before the sync brought the email in: it counts already (never fill twice).
  const unsynced = list.filter((x) => x.status === "sent" && !!x.gmail_id && !ids.has(x.gmail_id)).length;
  const pending = list.filter((x) => x.status === "pending" || x.status === "sending");
  const autoToday = list.filter((x) => ["pending", "sending", "sent"].includes(x.status)).length;
  const batchToday = list.filter((x) => x.origin === "batch").length;
  const cap = Math.min(DAY_MAX, dayCap(auto.cap, batchToday, dayRow?.extra_ok === true));
  const queued = new Set([...(await pendingOf(admin, userId)).map((p) => p.creator_id), ...(await doneWithToday(admin, userId, day, { fill: true }))]);
  const pool = poolOf(w, rows, queued, now);
  const taken = pending.map((p) => ({ mailbox: p.mailbox, at: new Date(p.send_at).getTime() }));
  const from = Math.max(now, startMs);
  // Who fits tonight AND inside each mailbox's room for today — so "short" never asks for more than the limits allow.
  const room = roomMap(await mailboxDays(admin, w, rows, now));
  const placed = new Set(planTimes(pool.ready.map((r) => ({ id: r.id, mailbox: r.mailbox, zones: r.zones, firstAt: r.firstAt, lastAt: r.lastAt })), { now, userZone: tz, from, taken }).placed.map((p) => p.id));
  const can = pickWithin(pool.ready.filter((r) => placed.has(r.id)), DAY_MAX, room).length;
  const n = fillNeed({ goal: w.goal, doneToday: done + later + unsynced, pendingToday: pending.length, autoToday, cap, available: can });
  let made = 0;
  if (n.allowed > 0) {
    const plan = await planFor(admin, kit, w, rows, pool.ready, { now, count: n.allowed, from, taken, room });
    made = (await insertQueue(admin, userId, tz, plan.rows, "fill", null)).made;
  }
  await save({ need: n.need, short: n.short, available: can, note: "" });
  return made;
}

// ----- the moment they reply ---------------------------------------------------------------------------

/**
 * Called by every sync once new mail is saved: a waiting follow-up to someone
 * who has now answered (or whom you just followed up yourself) is cancelled at
 * once. The send itself checks again, so this is the fast path, not the only one.
 */
export async function cancelOnReply(admin: Admin, userId: string): Promise<number> {
  const { data } = await admin.from("autosend_queue").select("id, creator_id, thread_id, created_at, round").eq("user_id", userId).eq("status", "pending").limit(500);
  const waiting = (data || []) as { id: string; creator_id: string; thread_id: string; created_at: string; round: number }[];
  if (!waiting.length) return 0;
  const ids = Array.from(new Set(waiting.map((w) => w.creator_id)));
  const answered = new Set<string>(), manual = new Map<string, string>();
  for (const part of chunk(ids, 150)) {
    const { data: ins } = await admin.from("email_events").select("entity_id, reply_kind").eq("user_id", userId).eq("direction", "in").in("entity_id", part).limit(2000);
    for (const e of (ins || []) as { entity_id: string; reply_kind: string | null }[]) if ((e.reply_kind || "") !== "auto") answered.add(e.entity_id);
    const { data: fu } = await admin.from("followups").select("creator_id, kind, at").eq("user_id", userId).in("creator_id", part).limit(2000);
    for (const f of (fu || []) as { creator_id: string; kind: string; at: string }[]) if (f.kind === "reply") answered.add(f.creator_id); else manual.set(f.creator_id, f.at > (manual.get(f.creator_id) || "") ? f.at : manual.get(f.creator_id) || "");
    const { data: cs } = await admin.from("creators").select("id, pipeline_status, archived_at").eq("user_id", userId).in("id", part);
    for (const c of (cs || []) as { id: string; pipeline_status: string; archived_at: string | null }[]) if (c.archived_at || !["contacted", "no_reply"].includes(c.pipeline_status)) answered.add(c.id);
  }
  let n = 0;
  for (const q of waiting) {
    let reason = answered.has(q.creator_id) ? "replied" : "";
    if (!reason && (manual.get(q.creator_id) || "") > q.created_at) reason = "you_followed_up";
    if (!reason) {
      // An email you wrote them yourself — sent, or waiting in Gmail's Scheduled folder — since this was queued.
      const { data: mineNow } = await admin.from("email_events").select("gmail_id, scheduled").eq("user_id", userId).eq("entity_id", q.creator_id).eq("direction", "out").or(`at.gt."${q.created_at}",created_at.gt."${q.created_at}"`).limit(5);
      if ((mineNow || []).length) {
        const ours = await ourSends(admin, userId, q.creator_id);
        const yours = ((mineNow || []) as { gmail_id: string; scheduled: boolean }[]).filter((e) => !ours.has(e.gmail_id));
        if (yours.some((e) => !e.scheduled)) reason = "you_followed_up";
        else if (yours.length) reason = "scheduled_in_gmail";
      }
    }
    if (!reason) continue;
    const { data: done } = await admin.from("autosend_queue").update({ status: "cancelled", reason, updated_at: new Date().toISOString() }).eq("id", q.id).eq("status", "pending").select("id");
    if ((done || []).length) {
      n++;
      await admin.from("activities").insert({ user_id: userId, text: `Autopilot didn't send your ${ORDINAL[q.round] || ""} follow-up: ${REASON_TEXT[reason]}`, at: new Date().toISOString(), entity_type: "creator", entity_id: q.creator_id });
    }
  }
  return n;
}

// ----- one influencer, from their profile -----------------------------------------------------------------

/** Everything the profile's "Send follow-up" sheet shows: each template ranked for THIS email, and the smart time. */
/** Can this template follow that email? (the same rule as the plan, for Start / a profile's send) */
export function canFollow(previous: string, template: string): boolean {
  return pairFit(questionKind(previous), answerKind(template)) > 0;
}

export async function prepareOne(admin: Admin, kit: Kit, userId: string, creatorId: string, rows: Row[]) {
  const now = Date.now();
  const w = await loadWorld(admin, userId, [creatorId]);
  const pending = await pendingOf(admin, userId);
  const mine = pending.find((p) => p.creator_id === creatorId);
  const pool = poolOf(w, rows, new Set(), now, true);
  if (mine) return { ok: false as const, code: "queued", id: mine.id };
  const r = pool.ready.find((x) => x.id === creatorId);
  if (!r) {
    const hand = pool.byHand.find((x) => x.id === creatorId);
    const held = pool.held.find((x) => x.id === creatorId);
    return { ok: false as const, code: hand ? hand.why : held ? held.why : "not_due", round: hand?.round ?? held?.round };
  }
  const prev = await previousOf(kit, rows, [r]);
  const { fits, ai } = await fitsOf([r], prev, w.templates);
  const s = fits.get(r.id) || {};
  const name = w.creators.find((c) => c.id === creatorId)?.name || r.name;
  const ranked = w.templates[r.round].map((t) => ({ id: t.id, name: t.name, text: fillTemplate(t.text, { name, my_name: w.name, agency: w.prefs.agency_name }), score: Math.round((s[t.id]?.score ?? 0.6) * 100) / 100, echo: !!s[t.id]?.echo, clash: !!s[t.id]?.clash, why: s[t.id]?.why || "", by: s[t.id]?.by || "rules" })).sort((a, b) => Number(a.clash) - Number(b.clash) || Number(a.echo) - Number(b.echo) || b.score - a.score);
  const prevText = prev.get(r.id)?.text || "";
  const taken = pending.map((p) => ({ mailbox: p.mailbox, at: new Date(p.send_at).getTime() }));
  const smart = planTimes([{ id: r.id, mailbox: r.mailbox, zones: r.zones, firstAt: r.firstAt, lastAt: r.lastAt }], { now, userZone: w.tz, taken, seed: hash(r.id) % 1000 });
  const placed = smart.placed[0];
  const asleep = smart.unplaced[0];
  return {
    ok: true as const, round: r.round, mailbox: r.mailbox, threadId: r.threadId, subject: r.subject, zones: r.zones, country: r.country, asked: askedOf(prevText), ai,
    question: { text: lastQuestion(prevText), kind: questionKind(prevText) }, noAnswer: ranked.length > 0 && ranked.every((t) => t.clash),
    templates: ranked, smart: placed ? { at: placed.at, theirClock: placed.theirClock, offBy: placed.offBy } : null,
    asleep: asleep ? { theirClock: asleep.theirClock, opensAt: asleep.opensAt } : null, firstAt: r.firstAt, lastAt: r.lastAt, window: { from: smart.from, until: smart.until },
    theirNow: r.zones[0] ? `${Math.floor(localMinute(r.zones[0], now) / 60)}:${String(localMinute(r.zones[0], now) % 60).padStart(2, "0")}` : "",
  };
}
