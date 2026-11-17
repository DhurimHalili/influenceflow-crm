// Autopilot: follow-ups the CRM sends for you — only to influencers who never
// answered at all, with your own words (Settings → Follow-up templates), at
// human times (smartTime.ts), never past your midnight.
//
// Who it may write to (`autopilotPool`):
//   • an influencer whose follow-up is due today, follow-up 1–4 of the thread
//     reminders follow, and the last word was your own email from a mailbox
//     that's connected and may send;
//   • who NEVER replied — not by email, not logged by hand, not their team, not
//     even an emoji. Anyone who ever answered is "by hand": that conversation
//     is special and a template would read wrong. Only an out-of-office doesn't
//     count as an answer.
// Which words (`assignTemplates`): your templates for that follow-up number,
// spread as evenly as possible (10 emails, 5 templates → each twice; 7 → two
// of them twice), each one the best fit for the email it follows:
//   • follow-up 1 never repeats your first email's question ("Are you
//     interested?" → a template asking "Would you be interested…");
//   • a later one follows on from the last ("Is this a bad time?" → "Looks
//     like it might — I'll come back another time").
// `ruleFit` judges that from the words; the server adds an AI's opinion when
// it has one and the rules decide when it doesn't. Pure — the server uses it.

import type { Creator, EmailEvent, Followup } from "../types";
// For the server (it reads the app's types through here, like followupEngine).
export type { Creator, EmailEvent, Followup, FollowupRules } from "../types";
import type { FollowupState } from "./followupEngine.ts";
import { zonesOf } from "./zones.ts";

export const ROUNDS = [1, 2, 3, 4] as const;
export type Round = (typeof ROUNDS)[number];
export const TEMPLATE_MAX = 2000;
export const TEMPLATES_PER_ROUND = 12;
export const NAME_MAX = 40;
export type FollowupTemplate = { id: string; name: string; text: string };
export type TemplateBook = Record<Round, FollowupTemplate[]>;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").slice(0, max) : "");

/** Whatever is stored → four clean lists (bad entries dropped, ids kept unique). */
export function readTemplates(value: unknown): TemplateBook {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const out = { 1: [], 2: [], 3: [], 4: [] } as TemplateBook;
  const seen = new Set<string>();
  for (const r of ROUNDS) {
    const list = Array.isArray(v[r]) ? (v[r] as unknown[]) : Array.isArray(v[String(r)]) ? (v[String(r)] as unknown[]) : [];
    for (const raw of list) {
      if (!raw || typeof raw !== "object") continue;
      const t = raw as Record<string, unknown>;
      const id = typeof t.id === "string" && /^[\w-]{4,40}$/.test(t.id) ? t.id : "";
      const text = str(t.text, TEMPLATE_MAX).trimEnd();
      if (!id || seen.has(id) || !text.trim()) continue;
      seen.add(id);
      out[r].push({ id, name: str(t.name, NAME_MAX).replace(/\n/g, " ").trim() || `Template ${out[r].length + 1}`, text });
      if (out[r].length >= TEMPLATES_PER_ROUND) break;
    }
  }
  return out;
}

export const templateCount = (book: TemplateBook) => ROUNDS.reduce((n, r) => n + book[r].length, 0);

/** Fill your own words for a creator: {first_name}/{name} → "there" when unknown. */
export function fillTemplate(text: string, vars: { name?: string; my_name?: string; agency?: string }): string {
  const name = (vars.name || "").trim();
  const first = name.split(/\s+/)[0] || "";
  const values: Record<string, string> = { first_name: first || "there", name: name || "there", my_name: (vars.my_name || "").trim(), agency: (vars.agency || "").trim() };
  return text.replace(/\{(first_name|name|my_name|agency)\}/g, (_, k: string) => values[k]).replace(/[ \t]+\n/g, "\n").replace(/\r\n?/g, "\n").trimEnd();
}

// ----- settings -------------------------------------------------------------------------

/** fill: top up your daily goal with follow-ups from `start` to midnight. cap: most follow-ups the CRM sends a day (0 = as many as the goal needs). */
export type AutopilotPrefs = { fill: boolean; start: string; cap: number };
export const DEFAULT_AUTOPILOT: AutopilotPrefs = { fill: false, start: "21:00", cap: 0 };

export function readAutopilot(value: unknown): AutopilotPrefs {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const start = typeof v.start === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.start) ? v.start : DEFAULT_AUTOPILOT.start;
  const cap = Number.isFinite(Number(v.cap)) ? Math.max(0, Math.min(500, Math.round(Number(v.cap)))) : 0;
  return { fill: v.fill === true, start, cap };
}

/** "21:00" → minutes after midnight. */
export const minutesOf = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return (h || 0) * 60 + (m || 0); };

/**
 * Today's ceiling for follow-ups the CRM sends: your setting, raised by a batch
 * you started today (you chose that number), lifted entirely once you tap
 * "Fill the rest too". Infinity = as many as your goal needs.
 */
export function dayCap(prefsCap: number, batchToday: number, extraOk: boolean): number {
  if (extraOk) return Infinity;
  if (prefsCap > 0) return Math.max(prefsCap, batchToday);
  return batchToday > 0 ? batchToday : Infinity;
}

/**
 * How many follow-ups the night fill would add now, and how many it holds back
 * because of the day's ceiling ("short" → the "Fill the last N too?" button).
 */
export function fillNeed(o: { goal: number; doneToday: number; pendingToday: number; autoToday: number; cap: number; available: number }) {
  const need = Math.max(0, o.goal - o.doneToday - o.pendingToday);
  const capLeft = Math.max(0, o.cap - o.autoToday);
  const allowed = Math.min(need, capLeft, o.available);
  const short = Math.max(0, Math.min(need, o.available) - allowed);
  return { need, allowed, short };
}

// ----- who ------------------------------------------------------------------------------

export type HoldWhy = "new-thread" | "past-4" | "other-channel" | "no-thread" | "mailbox" | "no-template" | "paused" | "bounced";
export type Ready = {
  id: string; name: string; round: Round; threadId: string; mailbox: string; subject: string;
  /** Your email in that thread they'd be answering: the latest one (theirs never exists). */
  lastGmailId: string; firstAt: number; lastAt: number; overdueDays: number; zones: string[]; country: string;
};
export type ByHand = { id: string; name: string; round: number; why: "replied" | "conversation" };
export type Held = { id: string; name: string; round: number; why: HoldWhy; mailbox?: string };
export type Pool = { ready: Ready[]; byHand: ByHand[]; held: Held[]; queued: string[] };

const LIVE = new Set(["contacted", "no_reply"]);

/** Did this person ever answer you — email (anyone on their side, any kind but an out-of-office) or logged by hand? */
export function everReplied(id: string, events: EmailEvent[], followups: Followup[]): boolean {
  return events.some((e) => e.entity_id === id && e.direction === "in" && (e.reply_kind || "") !== "auto")
    || followups.some((f) => f.creator_id === id && f.kind === "reply");
}

type PoolInput = {
  creators: Pick<Creator, "id" | "name" | "country" | "pipeline_status" | "archived_at" | "contact_channel" | "email_followups" | "youtube">[];
  followups: Followup[];
  events: EmailEvent[];
  states: Map<string, FollowupState>;
  /** Connected mailboxes that may send (lowercase). */
  mailboxes: string[];
  templates: TemplateBook;
  /** Creators with a follow-up already waiting in the CRM's queue. */
  queued?: Set<string>;
  /** Follow-ups are parked today (a light / scout weekend day). */
  paused?: boolean;
  /** Their address bounced ("Wrong email") — nothing goes out until it's fixed. */
  bounced?: Set<string>;
};

/** Everyone due a follow-up today, split into: the CRM can send it / you write it / why neither. */
export function autopilotPool(input: PoolInput): Pool {
  const byId = new Map<string, EmailEvent[]>();
  for (const e of input.events) if (e.entity_type === "creator") byId.set(e.entity_id, [...(byId.get(e.entity_id) || []), e]);
  const answered = new Set<string>();
  for (const e of input.events) if (e.entity_type === "creator" && e.direction === "in" && (e.reply_kind || "") !== "auto") answered.add(e.entity_id);
  for (const f of input.followups) if (f.creator_id && f.kind === "reply") answered.add(f.creator_id);
  const boxes = new Set(input.mailboxes.map((m) => m.toLowerCase()));
  const out: Pool = { ready: [], byHand: [], held: [], queued: [] };
  for (const c of input.creators) {
    if (c.archived_at) continue;
    const s = input.states.get(c.id);
    if (!s || s.kind !== "due") continue;
    const round = s.sent ?? s.round;
    // Anyone who ever answered — or whose conversation went past outreach — is yours to write.
    if (answered.has(c.id)) { out.byHand.push({ id: c.id, name: c.name, round, why: "replied" }); continue; }
    if (!LIVE.has(c.pipeline_status)) { out.byHand.push({ id: c.id, name: c.name, round, why: "conversation" }); continue; }
    if (input.queued?.has(c.id)) { out.queued.push(c.id); continue; }
    const hold = (why: HoldWhy, mailbox?: string) => out.held.push({ id: c.id, name: c.name, round, why, ...(mailbox ? { mailbox } : {}) });
    if (input.paused) { hold("paused"); continue; }
    if (s.next === "new-thread") { hold("new-thread"); continue; }
    if (round < 1 || round > 4) { hold("past-4"); continue; }
    if (c.contact_channel && c.contact_channel !== "email") { hold("other-channel"); continue; }
    if (c.email_followups === false || s.last.source !== "gmail" || s.last.channel !== "email" || s.last.dir !== "out") { hold("other-channel"); continue; }
    const thread = s.thread?.active || s.last.threadId || "";
    const mail = (byId.get(c.id) || []).filter((e) => e.direction === "out" && e.thread_id === thread && !e.scheduled && e.mailbox).sort((a, b) => a.at.localeCompare(b.at));
    if (!thread || !mail.length) { hold("no-thread"); continue; }
    if (input.bounced?.has(c.id)) { hold("bounced"); continue; }
    const last = mail[mail.length - 1];
    const mailbox = (last.mailbox || "").toLowerCase();
    if (!boxes.has(mailbox)) { hold("mailbox", mailbox); continue; }
    if (!input.templates[round as Round].length) { hold("no-template"); continue; }
    out.ready.push({
      id: c.id, name: c.name, round: round as Round, threadId: thread, mailbox, subject: (mail[0].subject || "").replace(/^\s*(re|fwd?)\s*:\s*/gi, ""),
      lastGmailId: last.gmail_id, firstAt: new Date(mail[0].at).getTime(), lastAt: new Date(last.at).getTime(),
      overdueDays: s.overdueDays, zones: zonesOf(c.country || c.youtube?.country), country: c.country || c.youtube?.country || "",
    });
  }
  return out;
}

/**
 * The follow-up engine's days in another time zone. followupState reads days
 * in the process's own zone (the browser's = yours); the server runs in UTC,
 * so every instant is shifted to read as your wall clock there.
 */
export function shiftToZone(zone: string, offsetOf: (zone: string, ms: number) => number) {
  const shift = (ms: number) => ms + offsetOf(zone, ms) * 60_000 + new Date(ms).getTimezoneOffset() * 60_000;
  const iso = (v: string | null | undefined) => { if (!v) return v; const t = new Date(v).getTime(); return Number.isNaN(t) ? v : new Date(shift(t)).toISOString(); };
  return { shift, iso };
}

// ----- which words ------------------------------------------------------------------------

export type Fit = { score: number; echo: boolean; why: string };

const STOP = new Set("a an the and or but so to of in on for with at by from this that these those it its is are was were be been am i you we they he she my your our their me us them just still any some do does did would could should will can may might there here what which who how about if then than as".split(" "));
const words = (s: string) => s.toLowerCase().replace(/[’']/g, "").match(/[a-z0-9]+/g) || [];
const content = (s: string) => new Set(words(s).filter((w) => w.length > 2 && !STOP.has(w)));
const jaccard = (a: Set<string>, b: Set<string>) => { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); };
const SIGN_OFF = /^(best|cheers|thanks|thank you|kind regards|regards|warm regards|all the best|talk soon|speak soon|sincerely|--)\b[\s,!.]*$/i;

/** What you wrote, minus the quoted thread and your signature. */
export function freshPart(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (const l of lines) {
    if (/^\s*>/.test(l) || /^\s*On .{4,120}wrote:\s*$/i.test(l) || /^-{2,}\s*(original|forwarded) message/i.test(l)) break;
    if (/^--\s*$/.test(l)) break;
    out.push(l);
  }
  return out.join("\n").trim();
}

/** The question(s) your email ends on — its call to action. */
export function ctaOf(text: string): string[] {
  const body = freshPart(text);
  const sentences = body.replace(/\n+/g, " \n ").split(/(?<=[?!.])\s+|\n/).map((s) => s.trim()).filter(Boolean);
  const questions = sentences.filter((s) => /\?\s*$/.test(s));
  if (questions.length) return questions.slice(-2);
  // No question mark: the last line before the sign-off ("Let me know if you're up for it").
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  while (lines.length && (SIGN_OFF.test(lines[lines.length - 1]) || lines[lines.length - 1].split(/\s+/).length <= 2)) lines.pop();
  return lines.length ? [lines[lines.length - 1]] : [];
}

const lead = (q: string) => words(q).slice(0, 3).join(" ");
const opening = (text: string) => (freshPart(text).split("\n").map((l) => l.trim()).find((l) => l && !/^(hi|hey|hello|dear|good (morning|afternoon|evening))\b[^.!?]{0,40}[,!.]?$/i.test(l)) || "").toLowerCase();
/** A yes/no question about timing or interest ("Is this a bad time?") — the next one should answer it. */
const ASKS_TIMING = /\b(bad|good|wrong|right|better|busy) time\b|\btoo busy\b|\bstill interested\b|\bnot (for|a fit)\b|\bwrong person\b|\bany interest\b|\bnot interested\b/i;
const OBSERVES = /^(looks like|seems like|it seems|i guess|guess it is|maybe it is|i take it|i'll take (that|it) as|sounds like|fair enough|no worries)/i;
const MIRRORS = /^(it might be|it may be|it could be|it is|it isn't|maybe not)\b/i;

/**
 * How well one of your templates follows the email it answers (your last one).
 * echo = it asks the same question again in the same words — avoided whenever
 * another template can go.
 */
export function ruleFit(previous: string, template: string, round: number): Fit {
  const prevQ = ctaOf(previous);
  const tplQ = ctaOf(template);
  const tplText = freshPart(template).toLowerCase();
  let score = 0.6;
  const why: string[] = [];
  let echo = false;
  for (const p of prevQ) {
    const pl = lead(p), pc = content(p);
    const flat = p.toLowerCase().replace(/[^a-z0-9 ]+/g, "").trim();
    if (flat.length > 12 && tplText.replace(/[^a-z0-9 ]+/g, "").includes(flat)) echo = true;
    for (const q of tplQ) if ((pl && lead(q) === pl && pl.split(" ").length >= 2) || jaccard(pc, content(q)) >= 0.6) echo = true;
  }
  if (echo) { score = 0.05; why.push("asks your last question again"); }
  else if (prevQ.length && tplQ.length) {
    const prevLeads = new Set(prevQ.map((q) => words(q).slice(0, 2).join(" ")));
    if (tplQ.every((q) => !prevLeads.has(words(q).slice(0, 2).join(" ")))) { score += 0.12; why.push("asks it differently"); }
  }
  // Following on from a yes/no question about timing: answer it like a person would.
  if (round >= 2 && prevQ.some((q) => ASKS_TIMING.test(q))) {
    const open = opening(template);
    if (OBSERVES.test(open)) { score += 0.3; why.push("answers your last question"); }
    else if (MIRRORS.test(open)) { score += 0.12; why.push("answers your last question"); }
    else if (tplQ.some((q) => ASKS_TIMING.test(q))) { score -= 0.25; why.push("asks about timing again"); }
  }
  // Whole phrases copied from the email it follows read like a bot.
  const prevWords = words(freshPart(previous));
  const grams = new Set<string>();
  for (let i = 0; i + 6 <= prevWords.length; i++) grams.add(prevWords.slice(i, i + 6).join(" "));
  const tw = words(tplText);
  let copied = false;
  for (let i = 0; i + 6 <= tw.length && !copied; i++) if (grams.has(tw.slice(i, i + 6).join(" "))) copied = true;
  if (copied && !echo) { score -= 0.15; why.push("repeats a line of your last email"); }
  return { score: Math.max(0, Math.min(1, score)), echo, why: why[0] || "" };
}

// ----- spreading the templates -------------------------------------------------------------

/** Minimum-cost assignment (Hungarian / Kuhn–Munkres), rows ≤ cols. Returns the column of each row. */
export function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  if (!n) return [];
  const m = cost[0].length;
  const INF = Number.MAX_SAFE_INTEGER;
  const u = new Array(n + 1).fill(0), v = new Array(m + 1).fill(0), p = new Array(m + 1).fill(0), way = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(m + 1).fill(INF);
    const used = new Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF, j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const out = new Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) out[p[j] - 1] = j - 1;
  return out;
}

export type ToAssign = { id: string; round: Round; fits?: Record<string, Fit> };

/**
 * One template per email, per follow-up number: every template before any
 * repeats, repeats spread evenly (never 3× one while another sits at 1×), and
 * inside that, each email gets the template that fits it best. A template
 * that would ask the same question again is only used when nothing else is
 * left. `recent` = how often each template went out lately (spam filters
 * notice the same words) — the less used wins a tie.
 */
export function assignTemplates(rows: ToAssign[], book: TemplateBook, recent: Record<string, number> = {}, seed = 0): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of ROUNDS) {
    const list = rows.filter((x) => x.round === r);
    const tpls = book[r];
    if (!list.length || !tpls.length) continue;
    const m = list.length, k = tpls.length;
    const base = Math.floor(m / k), top = Math.ceil(m / k);
    // Each template offered as `top + 1` seats; seats past the even share cost more and more.
    const seats: { tpl: number; q: number }[] = [];
    for (let j = 0; j < k; j++) for (let q = 0; q <= top; q++) seats.push({ tpl: j, q });
    const seatCost = (q: number) => (q < base ? 0 : q < top ? 0.02 : 2.5 + (q - top) * 2);
    const cost = list.map((row, i) => seats.map((s) => {
      const t = tpls[s.tpl];
      const fit = row.fits?.[t.id];
      const jitter = ((Math.imul(seed + i * 7919 + s.tpl * 104729, 2654435761) >>> 0) % 1000) / 200000;
      return seatCost(s.q) + (1 - (fit ? fit.score : 0.6)) + (fit?.echo ? 5 : 0) + (recent[t.id] || 0) * 0.004 + jitter;
    }));
    const pick = hungarian(cost);
    list.forEach((row, i) => out.set(row.id, tpls[seats[pick[i]].tpl].id));
  }
  return out;
}

/** Pick a fresh id for a new template. */
export const newTemplateId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// ----- each mailbox's limit ------------------------------------------------------------------------------

/**
 * Who goes, within each mailbox's room for today (its daily limit minus what it already sent or has waiting).
 * `list` comes in priority order. A follow-up always goes from its own thread's mailbox, so the room decides how
 * many people of each mailbox can go. Default: mailboxes take turns at random, weighted by the room they have left,
 * so both fill up evenly and none goes over. `perBox` (optional) asks for an exact number from a mailbox.
 */
export function pickWithin<T extends { mailbox: string }>(list: T[], count: number, room: Map<string, number> | null, perBox: Record<string, number> | null = null, seed = 1): T[] {
  const queues = new Map<string, T[]>();
  for (const r of list) { const m = r.mailbox.toLowerCase(); queues.set(m, [...(queues.get(m) || []), r]); }
  const left = new Map<string, number>();
  for (const m of queues.keys()) {
    let cap = room ? Math.max(0, room.get(m) ?? 0) : Number.POSITIVE_INFINITY;
    if (perBox) cap = Math.min(cap, Math.max(0, Math.round(perBox[m] ?? 0)));
    left.set(m, cap);
  }
  let state = ((Math.imul(Math.abs(Math.round(seed)) + 1, 2654435761) >>> 0) % 2147483646) + 1;
  const rand = () => (state = (state * 48271) % 2147483647) / 2147483647;
  rand(); rand();
  const out: T[] = [];
  const want = perBox ? Math.min(count, Object.values(perBox).reduce((s, n) => s + Math.max(0, Math.round(n) || 0), 0)) : count;
  while (out.length < want) {
    const open = [...queues.keys()].filter((m) => queues.get(m)!.length && left.get(m)! > 0);
    if (!open.length) break;
    const weight = (m: string) => Math.min(left.get(m)!, queues.get(m)!.length);
    let r = rand() * open.reduce((s, m) => s + (Number.isFinite(weight(m)) ? weight(m) : queues.get(m)!.length), 0);
    let pick = open[open.length - 1];
    for (const m of open) { r -= Number.isFinite(weight(m)) ? weight(m) : queues.get(m)!.length; if (r <= 0) { pick = m; break; } }
    out.push(queues.get(pick)!.shift()!);
    left.set(pick, left.get(pick)! - 1);
  }
  return out;
}

/** A mailbox's day: its limit (the weekly ramp), what it used (sent + Gmail-scheduled + Autopilot waiting) and the room left. */
export type BoxDay = { mailbox: string; limit: number; used: number; room: number };
export const roomMap = (days: BoxDay[]) => new Map(days.map((d) => [d.mailbox.toLowerCase(), d.room]));
