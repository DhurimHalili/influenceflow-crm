import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { isSealed, openToken, sealToken } from "../_shared/googleTokens.ts";
import { aiChain, aiEnabled, aiKeyCount, aiModel, aiProvider, aiReadyAt, classifyLead, planImport, QuotaExhausted, readReply, testAi, useKeyStore } from "../_shared/ai.ts";
import { decodeEntities, isWarmup, precheck, scanForLead, type Lead, type ScanInput } from "../_shared/leadScanner.ts";
import { classifyIncoming, isReaction, mergeReading, myReplyIntent, notAReply, READER_VERSION, referralOf, stripQuoted, type IncomingKind, type TeamRole } from "../_shared/replyReader.ts";
import { analyzeStoredFile, bodyOf, drainQueue, gmailAttachment, processCreatorMail, processMyMail, repairAnchors, repairKitLists, sniff, type Fetcher, type FullMessage } from "./intel.ts";

// Gmail ⇄ CRM sync, for every mailbox a user connected (an agency often runs
// two or three).
//
// Actions (POST JSON, user JWT unless noted):
//   status      — the connected mailboxes: address, scopes, last sync, last error
//   sync        — pull new mail for all of this user's mailboxes now (rate-limited)
//   send        — send an email from one mailbox (optionally as a reply in a thread)
//   disconnect  — revoke Google access for one mailbox and forget its tokens
//   analyze_file  — read one saved file with AI now
//   download_file — a big attachment kept in Gmail (not in storage), streamed to you
//   rescan_creator — go through one influencer's emails again for kits and prices
//   cancel_scheduled — cancel one of your scheduled sends (moves it to Gmail's Trash; needs gmail.modify)
//   cron        — background sync for everyone (x-cron-secret header only)
//   health      — no auth; only says whether the server is configured
//
// What is stored, per message to/from someone in your CRM: direction, date,
// subject, Gmail's ~100-character preview and which mailbox it went through.
// For people NOT in your CRM, only messages that pass the inbound-lead scanner
// (_shared/leadScanner.ts) are kept, as a suggestion you can add or dismiss.
// Bodies, attachments and the rest of your inbox are never stored.
//
// Status automation ("the email moves the pipeline, you keep the last word"):
//   New        + you email them        → Contacted
//   New        + they email you        → Inbound
//   Contacted / No reply + they reply  → Replied
//   Inbound    + you answer            → Replied
//   Contacted / No reply / Replied / Inbound + they clearly say no → Denied
//     (a reply that only reads like a no is flagged "Maybe not interested"
//      in the app instead; a later normal reply from them undoes a Gmail Denied)
// A message waiting in Gmail's "Scheduled" folder counts as your touch but is
// stored as scheduled (not sent) and re-checked every run: once it goes out it
// counts as sent; cancel it (it goes back to Drafts) or delete it and it is
// removed again — along with a status that only that email had moved.
// Only emails newer than the record's last status change count, so any status
// you set by hand stays until a newer email arrives — and Negotiating, Roster,
// Signed and Denied are never changed automatically.

const APP_URL = (Deno.env.get("APP_URL") || "https://dhurimhalili.github.io/influenceflow-crm").replace(/\/$/, "");
const ALLOWED_ORIGINS = new Set([new URL(APP_URL).origin, "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"]);
const corsFor = (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : new URL(APP_URL).origin, "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
};

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const EMAIL_RE = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const VALID_EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
const BACKFILL_DAYS = 180;
const LEAD_LOOKBACK_DAYS = 30;
const USER_MIN_INTERVAL_MS = 30_000;
const SENDS_PER_DAY = 400; // per mailbox, well under Gmail's own limits
const MAX_MAILBOXES = 5;

type Admin = SupabaseClient;
type TokenRow = { id: string; user_id: string; access_token: string | null; refresh_token: string; expiry: string | null; email: string | null; scopes: string; history_id: string | null; last_sync_at: string | null; backfilled: string[] | null; sync_error?: string; connected_at?: string | null; updated_at?: string | null; send_day?: string | null; send_count?: number; leads_scanned_at?: string | null; coverage?: unknown; lead_queue?: string[] | null; read_at?: string | null; watch_expires_at?: string | null };
/** A CRM record an address belongs to; `via: "team"` = the address is on its team list (a manager / agency), not its own. */
type Entity = { type: "creator" | "brand"; id: string; name?: string; via?: "team" };
type TeamMember = { email: string; role?: string; removed?: boolean };
type Meta = { id: string; threadId: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: { headers?: { name: string; value: string }[] } };
type EventRow = { user_id: string; gmail_id: string; thread_id: string; direction: "out" | "in"; entity_type: "creator" | "brand"; entity_id: string; counterpart: string; subject: string; snippet: string; at: string; mailbox: string; message_key: string; scheduled: boolean; reply_kind: IncomingKind; in_reply_to: string; kind_v: number };
/** Gmail thread → the CRM records already in it (per mailbox: thread ids belong to one). */
type ThreadBook = Map<string, Entity[]>;
// Columns added by later migrations: a database without them still gets the mail.
const LATE_COLUMNS = ["kind_v", "reply_kind", "in_reply_to", "scheduled"] as const;

class GmailError extends Error {
  constructor(message: string, public status = 0, public reconnect = false, public retryable = false) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const timingSafeEqual = (a: string, b: string) => {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};
const addresses = (value: string | undefined) => Array.from(new Set((value || "").match(EMAIL_RE)?.map((e) => e.toLowerCase()) || []));
const header = (meta: Meta, name: string) => meta.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
const mailboxOf = (row: TokenRow) => (row.email || "").toLowerCase();
const normKey = (value: string) => value.trim().replace(/^<|>$/g, "").toLowerCase().slice(0, 300);
const messageKey = (meta: Meta) => normKey(header(meta, "Message-ID"));
/** The Message-ID this email answers (the first one when several are listed). */
const replyToKey = (meta: Meta) => normKey((header(meta, "In-Reply-To").match(/<[^>]+>/) || [header(meta, "In-Reply-To")])[0] || "");
const headersOf = (meta: Meta) => {
  const out: Record<string, string> = {};
  for (const h of meta.payload?.headers || []) out[h.name.toLowerCase()] = h.value;
  return out;
};
// Free-mail domains are shared by strangers; a company domain you send from is your team.
const PUBLIC_MAIL = /^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|aol|proton|protonmail|gmx|mail|yandex)\./i;
const ownDomains = (own: Set<string>) => new Set(Array.from(own).map((e) => e.split("@")[1] || "").filter((d) => d && !PUBLIC_MAIL.test(d)));
const chunk = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

// ----- tokens ----------------------------------------------------------------

async function accessToken(admin: Admin, row: TokenRow): Promise<string> {
  const current = await openToken(admin, row.access_token);
  // Rows saved before encryption existed are sealed the first time they're used.
  if (row.refresh_token && !isSealed(row.refresh_token)) {
    const sealed = { refresh_token: await sealToken(admin, row.refresh_token), access_token: await sealToken(admin, current) };
    await admin.from("gmail_tokens").update(sealed).eq("id", row.id);
    row.refresh_token = sealed.refresh_token!;
    row.access_token = sealed.access_token;
  }
  if (current && row.expiry && new Date(row.expiry).getTime() - Date.now() > 90_000) return current;
  const refresh = await openToken(admin, row.refresh_token);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: Deno.env.get("GOOGLE_CLIENT_ID")!, client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!, refresh_token: refresh || "", grant_type: "refresh_token" }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    const reconnect = body.error === "invalid_grant" || body.error === "unauthorized_client";
    throw new GmailError(reconnect ? "Google access expired or was removed — reconnect this mailbox in Settings." : "Couldn't refresh Gmail access.", res.status, reconnect);
  }
  row.expiry = new Date(Date.now() + Number(body.expires_in || 3600) * 1000).toISOString();
  const patch: Record<string, unknown> = { access_token: await sealToken(admin, body.access_token), expiry: row.expiry };
  if (body.scope) { patch.scopes = body.scope; row.scopes = body.scope; }
  // Rows from before encryption get sealed the first time they're used.
  if (!isSealed(row.refresh_token) && refresh) patch.refresh_token = await sealToken(admin, refresh);
  await admin.from("gmail_tokens").update(patch).eq("id", row.id);
  row.access_token = patch.access_token as string;
  if (patch.refresh_token) row.refresh_token = patch.refresh_token as string;
  return body.access_token as string;
}

// Gmail allows each mailbox 250 quota units a second and a handful of requests
// at once. Every call is paced per mailbox to ~200 units/s (a message read is 5,
// a thread 10, a send 100) — as fast as Gmail allows with a safety margin, so
// a sync never trips the limit instead of tripping it and backing off.
const pacing = new Map<string, number>();
const unitsFor = (path: string, init?: RequestInit) => (init?.method === "POST" ? (path.includes("/send") ? 100 : 5) : path.startsWith("/threads/") ? 10 : path.startsWith("/history") ? 2 : 5);
async function pace(token: string, units: number) {
  const now = Date.now();
  const at = Math.max(now, pacing.get(token) || 0);
  pacing.set(token, at + units * 5);
  if (pacing.size > 50) for (const [k, v] of pacing) if (v < now) pacing.delete(k);
  if (at > now) await sleep(at - now);
}

async function gmail<T>(token: string, path: string, init?: RequestInit, attempt = 0): Promise<T> {
  await pace(token, unitsFor(path, init));
  const res = await fetch(`${GMAIL}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) } });

  // Gmail is temporarily busy: back off and retry. A 403 below is different —
  // it can be a per-minute quota, so it gets its own, shorter retry path.
  if (res.status === 429 || res.status >= 500) {
    if (attempt < 4) {
      const wait = Number(res.headers.get("retry-after")) * 1000 || 500 * 2 ** attempt;
      await sleep(Math.min(8_000, wait) + Math.random() * 250);
      return gmail(token, path, init, attempt + 1);
    }
    throw new GmailError("Gmail is temporarily unavailable — it will retry automatically.", res.status, false, true);
  }

  if (res.status === 403) {
    const text = await res.text().catch(() => "");
    const rate = /(rateLimitExceeded|userRateLimitExceeded|quotaExceeded)/i.test(text);
    const daily = /dailyLimitExceeded/i.test(text);
    if (rate && !daily && attempt < 3) {
      // Slow this mailbox down for the rest of the run, then try again.
      pacing.set(token, Math.max(pacing.get(token) || 0, Date.now()) + 1_000);
      await sleep(1_500 * 2 ** attempt + Math.random() * 300);
      return gmail(token, path, init, attempt + 1);
    }
    const reconnect = /insufficientPermissions|invalid_grant/i.test(text);
    const message = daily
      ? "Gmail's daily limit for this mailbox is reached — it will resume tomorrow."
      : rate
        ? "Gmail is rate-limiting this mailbox right now — it will retry automatically."
        : reconnect
          ? "Gmail access is missing a permission — reconnect this mailbox in Settings."
          : "Gmail couldn't complete this request (403).";
    throw new GmailError(message, 403, reconnect, rate || daily);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const message = res.status === 401
      ? "Gmail access expired — reconnect this mailbox in Settings."
      : `Gmail ${res.status}: ${text.replace(/\s+/g, " ").slice(0, 180)}`;
    throw new GmailError(message, res.status, res.status === 401);
  }
  return res.json() as Promise<T>;
}

// ----- matching --------------------------------------------------------------

async function addressBook(admin: Admin, userId: string, own: Set<string>) {
  const [creators, brands, contacts] = await Promise.all([
    admin.from("creators").select("id, name, contact_email, secondary_email, team").eq("user_id", userId).is("archived_at", null),
    admin.from("brands").select("id, name, contact_email, secondary_email").eq("user_id", userId).is("archived_at", null),
    admin.from("brand_contacts").select("brand_id, email").eq("user_id", userId),
  ]);
  const map = new Map<string, Entity[]>();
  const add = (email: string | null | undefined, entity: Entity) => {
    for (const e of addresses(email || "")) {
      if (own.has(e)) continue;
      const list = map.get(e) || [];
      if (!list.some((x) => x.id === entity.id)) list.push(entity);
      map.set(e, list);
    }
  };
  for (const c of creators.data || []) {
    const me: Entity = { type: "creator", id: c.id, name: c.name || "" };
    add(c.contact_email, me);
    add(c.secondary_email, me);
    // Their manager / agent / team: mail with them counts for this creator.
    for (const t of (Array.isArray(c.team) ? c.team : []) as TeamMember[]) if (t && typeof t.email === "string" && !t.removed) add(t.email, { ...me, via: "team" });
  }
  for (const b of brands.data || []) { add(b.contact_email, { type: "brand", id: b.id, name: b.name || "" }); add(b.secondary_email, { type: "brand", id: b.id, name: b.name || "" }); }
  for (const p of contacts.data || []) if (p.brand_id) add(p.email, { type: "brand", id: p.brand_id });
  return map;
}

const DRIVE_SHARE = /drive-shares-(dm-)?noreply@google\.com/i;
const DRIVE_SHARES_DONE = "__drive_shares_v1";
const isOutgoing = (meta: Meta, own: Set<string>) => (meta.labelIds || []).includes("SENT") || addresses(header(meta, "From")).some((e) => own.has(e));
const sentAt = (meta: Meta) => (meta.internalDate ? new Date(Number(meta.internalDate)) : new Date(header(meta, "Date") || Date.now())).toISOString();
/** Dated more than a minute ahead: a scheduled send that hasn't gone out. */
const isFuture = (meta: Meta) => Number(meta.internalDate || 0) > Date.now() + 60_000;

function eventsFor(meta: Meta, userId: string, book: Map<string, Entity[]>, own: Set<string>, mailbox: string, threads?: ThreadBook, directOnly = false): EventRow[] {
  const labels = meta.labelIds || [];
  if (labels.some((l) => l === "DRAFT" || l === "TRASH" || l === "CHAT")) return [];
  const out = isOutgoing(meta, own);
  // A reply from someone you know that Gmail put in spam is still their reply.
  if (labels.includes("SPAM") && (out || !counterpartsKnown(meta, book, own))) return [];
  // Waiting in Gmail's Scheduled folder: your touch, but not sent yet. Gmail
  // dates a scheduled email at its send time, so a date in the future means
  // scheduled even when the label hasn't caught up yet.
  const scheduled = out && (isFuture(meta) || (labels.includes("SCHEDULED") && !labels.includes("SENT")));
  // "X shared a file with you" comes from Google; the person who shared it is in Reply-To.
  const sender = DRIVE_SHARE.test(header(meta, "From")) ? addresses(header(meta, "Reply-To")) : addresses(header(meta, "From"));
  const counterparts = (out ? [...addresses(header(meta, "To")), ...addresses(header(meta, "Cc"))] : sender).filter((e) => !own.has(e));
  const at = sentAt(meta);
  const subject = decodeEntities(header(meta, "Subject")).slice(0, 300);
  const snippet = decodeEntities(meta.snippet || "").slice(0, 240);
  const rows: EventRow[] = [];
  const seen = new Set<string>();
  const push = (entity: Entity, email: string, fromOther: boolean) => {
    if (seen.has(entity.id)) return;
    seen.add(entity.id);
    const reply_kind: IncomingKind = out ? "" : classifyIncoming({ headers: headersOf(meta), subject, text: snippet, fromOther, from: email });
    rows.push({ user_id: userId, gmail_id: meta.id, thread_id: meta.threadId || "", direction: out ? "out" : "in", entity_type: entity.type, entity_id: entity.id, counterpart: email, subject, snippet, at, mailbox, message_key: messageKey(meta), scheduled, reply_kind, in_reply_to: replyToKey(meta), kind_v: READER_VERSION });
  };
  for (const email of counterparts) for (const entity of narrow(book.get(email) || [], meta, threads)) push(entity, email, false);
  // Nobody known on it, but it belongs to a conversation you're tracking: their
  // manager, agency or team answered from another address (or you wrote to them).
  // Your own colleagues (same company domain) are never "their side".
  if (!directOnly && !rows.length && meta.threadId && threads?.has(meta.threadId)) {
    const team = ownDomains(own);
    const other = counterparts.find((e) => !team.has(e.split("@")[1] || "") && !/(^|[.@])(mailer-daemon|postmaster)/i.test(e));
    if (other) for (const entity of threads.get(meta.threadId) || []) push(entity, other, true);
  }
  return rows;
}

function counterpartsKnown(meta: Meta, book: Map<string, Entity[]>, own: Set<string>) {
  return addresses(header(meta, "From")).some((e) => !own.has(e) && book.has(e));
}

/**
 * One address can belong to several records (an agency manager for three of
 * your creators). Count the email only for the one(s) it is about: the
 * records already in this Gmail thread, else the ones named in the subject or
 * preview, else all of them.
 */
const NAME_STOP = new Set(["the", "and", "official", "channel", "tv", "studio", "studios", "media", "with", "for"]);

function narrow(list: Entity[], meta: Meta, threads?: ThreadBook): Entity[] {
  const inThread = (threads?.get(meta.threadId || "") || []).map((e) => e.id);
  if (inThread.length) {
    const byThread = list.filter((e) => inThread.includes(e.id));
    if (byThread.length) return byThread;
    // A manager shared by several creators, writing in ANOTHER creator's
    // thread: the email is about that creator (the thread decides — picked up
    // by the thread pass), not about the one whose team list she's on.
    const own = list.filter((e) => e.via !== "team");
    if (own.length < list.length) return own;
  }
  if (list.length < 2) return list;
  const text = ` ${decodeEntities(`${header(meta, "Subject")} ${meta.snippet || ""}`).toLowerCase()} `;
  const word = (w: string) => new RegExp(`[^\\p{L}\\p{N}]${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\p{L}\\p{N}]`, "u").test(text);
  const named = list.filter((e) => {
    const name = (e.name || "").toLowerCase().trim();
    if (name.length < 3) return false;
    const first = name.split(/\s+/)[0];
    return text.includes(name) || (first.length >= 4 && word(first));
  });
  if (named.length) return named;
  // Two channels sharing one inbox ("Out of Spec Reviews" / "Out of Spec BITS"):
  // the word only one of them has decides which one the email is about.
  const words = (e: Entity) => new Set((e.name || "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !NAME_STOP.has(w)));
  const sets = list.map(words);
  const own = list.filter((_, i) => [...sets[i]].some((w) => sets.every((s, j) => j === i || !s.has(w)) && word(w)));
  return own.length ? own : list;
}

/** Records already tracked in these threads of this mailbox. */
async function threadBook(admin: Admin, userId: string, mailbox: string, threadIds: string[]): Promise<ThreadBook> {
  const map: ThreadBook = new Map();
  for (const part of chunk(Array.from(new Set(threadIds.filter(Boolean))), 200)) {
    const { data } = await admin.from("email_events").select("thread_id, entity_type, entity_id").eq("user_id", userId).eq("mailbox", mailbox).in("thread_id", part).limit(2000);
    for (const r of data || []) {
      const list = map.get(r.thread_id) || [];
      if (!list.some((e) => e.id === r.entity_id)) list.push({ type: r.entity_type, id: r.entity_id });
      map.set(r.thread_id, list);
    }
  }
  return map;
}

/** Match a batch: people you know first, then the rest of their threads (a manager answering for a creator). */
async function matchAll(admin: Admin, userId: string, metas: Meta[], book: Map<string, Entity[]>, own: Set<string>, mailbox: string) {
  const threads = await threadBook(admin, userId, mailbox, metas.map((m) => m.threadId));
  const direct = metas.flatMap((m) => eventsFor(m, userId, book, own, mailbox, threads, true));
  for (const r of direct) {
    const list = threads.get(r.thread_id) || [];
    if (!list.some((e) => e.id === r.entity_id)) list.push({ type: r.entity_type, id: r.entity_id });
    if (r.thread_id) threads.set(r.thread_id, list);
  }
  const hit = new Set(direct.map((r) => r.gmail_id));
  const viaThread = metas.filter((m) => !hit.has(m.id)).flatMap((m) => eventsFor({ ...m }, userId, new Map(), own, mailbox, threads));
  return [...direct, ...viaThread];
}

async function storeEvents(admin: Admin, rows: EventRow[]) {
  for (const part of chunk(rows, 200)) {
    let payload: Record<string, unknown>[] = part;
    let { error } = await admin.from("email_events").upsert(payload, { onConflict: "user_id,gmail_id,entity_id", ignoreDuplicates: true });
    // A database that hasn't run a later migration yet still gets the mail.
    for (const col of LATE_COLUMNS) {
      if (!error || !new RegExp(col).test(error.message)) continue;
      payload = payload.map(({ [col]: _drop, ...r }) => r);
      ({ error } = await admin.from("email_events").upsert(payload, { onConflict: "user_id,gmail_id,entity_id", ignoreDuplicates: true }));
    }
    if (error) throw new GmailError(`Couldn't store email activity: ${error.message}`);
  }
}

async function listIds(token: string, q: string, maxPages: number) {
  const ids: string[] = [];
  let pageToken = "";
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({ q, maxResults: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await gmail<{ messages?: { id: string }[]; nextPageToken?: string }>(token, `/messages?${params}`);
    ids.push(...(res.messages || []).map((m) => m.id));
    if (!res.nextPageToken) break;
    pageToken = res.nextPageToken;
  }
  return ids;
}

const META_HEADERS = ["From", "To", "Cc", "Subject", "Date", "Message-ID", "Reply-To", "List-Unsubscribe", "List-Id", "Precedence", "Auto-Submitted", "X-Autoreply", "X-Autorespond", "In-Reply-To", "References"];
const META_PATH = (id: string) => `/messages/${id}?format=metadata&${META_HEADERS.map((h) => `metadataHeaders=${h}`).join("&")}`;

async function fetchMetas(token: string, ids: string[], deadline: number, tried?: Set<string>) {
  const metas: Meta[] = [];
  for (let i = 0; i < ids.length; i += 5) {
    if (Date.now() > deadline) break;
    try {
      const slice = ids.slice(i, i + 5);
      const batch = await Promise.all(slice.map((id) => gmail<Meta>(token, META_PATH(id)).catch((e) => (e instanceof GmailError && e.status === 404 ? null : Promise.reject(e)))));
      slice.forEach((id) => tried?.add(id));
      metas.push(...(batch.filter(Boolean) as Meta[]));
    } catch (e) {
      // Still limited after the retries: keep what was read; the rest comes next run.
      if (e instanceof GmailError && e.retryable) break;
      throw e;
    }
  }
  return metas;
}

const searchFor = (emails: string[], days: number) => `{${emails.map((e) => `from:${e} to:${e} cc:${e}`).join(" ")}} newer_than:${days}d`;

// A message that reached two of your mailboxes (cc'd, forwarded) counts once.
async function dropCrossMailboxDuplicates(admin: Admin, userId: string, rows: EventRow[]) {
  const keys = Array.from(new Set(rows.map((r) => r.message_key).filter(Boolean)));
  const taken = new Map<string, string>(); // message+record → the Gmail id already stored
  for (const part of chunk(keys, 200)) {
    const { data } = await admin.from("email_events").select("message_key, entity_id, gmail_id").eq("user_id", userId).in("message_key", part);
    for (const r of data || []) taken.set(`${r.message_key}|${r.entity_id}`, r.gmail_id);
  }
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (!r.message_key) return true;
    const key = `${r.message_key}|${r.entity_id}`;
    const stored = taken.get(key);
    if ((stored && stored !== r.gmail_id) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ----- inbound leads -------------------------------------------------------------

const scanInput = (meta: Meta, own: Set<string>): ScanInput => {
  const headers: Record<string, string> = {};
  for (const h of meta.payload?.headers || []) headers[h.name.toLowerCase()] = h.value;
  return { from: header(meta, "From"), replyTo: header(meta, "Reply-To"), to: header(meta, "To"), subject: header(meta, "Subject"), snippet: meta.snippet || "", labels: meta.labelIds || [], headers, own: Array.from(own) };
};

/** Strict scan: headers first, then the full body (in memory), then — when AI is on — Claude must agree. */
async function findLeads(admin: Admin, userId: string, token: string, metas: Meta[], own: Set<string>, book: Map<string, Entity[]>, deadline: number) {
  const found: { lead: Lead; meta: Meta }[] = [];
  const candidates = metas.filter((m) => !isOutgoing(m, own)).map((meta) => ({ meta, input: scanInput(meta, own) })).filter((c) => precheck(c.input).ok).slice(0, 40);
  for (const { meta, input } of candidates) {
    if (Date.now() > deadline) break;
    const full = await gmail<FullMessage>(token, `/messages/${meta.id}?format=full`).catch(() => null);
    const body = full ? bodyOf(full).text : "";
    const lead = scanForLead({ ...input, body });
    if (!lead || book.has(lead.email)) continue;
    // Second opinion only with Claude; on Gemini's free quota every call goes to media kits.
    if (aiProvider() === "claude") {
      const { data: allowed } = await admin.rpc("ai_take", { p_user: userId, p_limit: 150 });
      if (allowed === true) {
        const verdict = await classifyLead({ from: input.from, subject: input.subject, body: body || input.snippet }).catch(() => null);
        if (verdict && (verdict.category === "not_a_lead" || verdict.automated || verdict.pitch || verdict.confidence < 0.7)) continue;
        if (verdict?.why) lead.reasons = [...lead.reasons.slice(0, 5), `Double-checked: ${verdict.why}`];
      }
    }
    found.push({ lead, meta });
  }
  return found;
}

async function storeLeads(admin: Admin, userId: string, mailbox: string, found: { lead: Lead; meta: Meta }[]) {
  if (!found.length) return 0;
  const latest = new Map<string, { lead: Lead; meta: Meta; count: number }>();
  for (const f of found) {
    const prev = latest.get(f.lead.email);
    if (!prev || Number(f.meta.internalDate || 0) > Number(prev.meta.internalDate || 0)) latest.set(f.lead.email, { ...f, count: (prev?.count || 0) + 1 });
    else prev.count++;
  }
  const emails = Array.from(latest.keys());
  const { data: existing } = await admin.from("inbound_leads").select("id, email, status, gmail_id, score, messages, last_at, first_at").eq("user_id", userId).in("email", emails);
  const byEmail = new Map((existing || []).map((r) => [r.email as string, r]));
  let added = 0;
  for (const [email, { lead, meta, count }] of latest) {
    const at = sentAt(meta);
    const row = byEmail.get(email);
    const fields = { name: lead.name, company: lead.company, mailbox, kind: lead.kind, category: lead.category, reasons: lead.reasons, subject: decodeEntities(header(meta, "Subject")).slice(0, 300), snippet: decodeEntities(meta.snippet || "").slice(0, 240), gmail_id: meta.id, thread_id: meta.threadId || "", via_form: lead.viaForm };
    if (!row) {
      const { error } = await admin.from("inbound_leads").insert({ user_id: userId, email, ...fields, score: lead.score, messages: count, first_at: at, last_at: at });
      if (!error) added++;
    } else if (row.status === "new" && row.gmail_id !== meta.id) {
      const newer = new Date(at).getTime() > new Date(row.last_at).getTime();
      await admin.from("inbound_leads").update({ ...(newer ? { ...fields, last_at: at } : {}), score: Math.max(row.score, lead.score), messages: (row.messages || 1) + count, first_at: new Date(at) < new Date(row.first_at) ? at : row.first_at, updated_at: new Date().toISOString() }).eq("id", row.id);
    }
  }
  return added;
}

// ----- status automation ------------------------------------------------------

const NEXT: Record<string, { out?: string; in?: string }> = {
  new: { out: "contacted", in: "inbound" },
  contacted: { in: "replied" },
  no_reply: { in: "replied" },
  inbound: { out: "replied" },
};
const LABEL: Record<string, string> = { contacted: "Contacted", inbound: "Inbound", replied: "Replied", denied: "Denied" };
/** Stages a clear "no" from them closes. Negotiating / Roster / Signed are yours to decide. */
const DENIABLE = new Set(["contacted", "no_reply", "replied", "inbound"]);
/** A new email this long after you marked them Denied reopens the conversation. */
const REOPEN_AFTER_MS = 14 * 86400000;

/**
 * `forceFrom` (per record): re-read from just before this time, even past a status
 * you set by hand — used once, when a reply's meaning changed (new rules or
 * the AI), so "Please lose my email" read as a no now really counts.
 */
async function applyStatuses(admin: Admin, userId: string, entityIds: string[], forceFrom?: Map<string, number>) {
  if (!entityIds.length) return 0;
  let changed = 0;
  const nowIso = new Date().toISOString();
  for (const ids of chunk(entityIds, 100)) {
    const since = new Date(Date.now() - BACKFILL_DAYS * 86400000).toISOString();
    const [{ data: events }, { data: creators }, { data: brands }] = await Promise.all([
      admin.from("email_events").select("*").eq("user_id", userId).in("entity_id", ids).gte("at", since).order("at", { ascending: true }),
      admin.from("creators").select("id, name, pipeline_status, status_updated_at, status_source, date_contacted, archived_at, lost_reason").eq("user_id", userId).in("id", ids),
      admin.from("brands").select("id, name, pipeline_status, status_updated_at, status_source, date_contacted, archived_at, lost_reason").eq("user_id", userId).in("id", ids),
    ]);
    const records = [...(creators || []).map((r) => ({ ...r, table: "creators" as const, kind: "creator" as const })), ...(brands || []).map((r) => ({ ...r, table: "brands" as const, kind: "brand" as const }))];
    for (const record of records) {
      if (record.archived_at) continue;
      const forced = forceFrom?.get(record.id);
      const changedAt = forced ?? (record.status_updated_at ? new Date(record.status_updated_at).getTime() : 0);
      // A status Gmail set may be re-read against the email that set it (a reply
      // first read as a plain answer and now known to be a "no"); one you set by
      // hand is only ever moved by newer mail.
      const byGmail = forced !== undefined || record.status_source === "gmail";
      let sinceT = changedAt;
      let status = record.pipeline_status as string;
      let at: string | null = null;
      let why = "";
      let first: string | null = null;
      for (const ev of (events || []).filter((e) => e.entity_id === record.id)) {
        first = first || ev.at;
        const t = new Date(ev.at).getTime();
        // Only mail newer than your last status change can move it.
        if (byGmail ? t < changedAt : t <= changedAt) continue;
        // An out-of-office, an emoji reaction, or their management turning it down for them, is not a reply.
        if (ev.direction === "in" && (notAReply(ev.reply_kind) || ev.reply_kind === "managed_no")) continue;
        // Writing again to someone who passed, weeks later (not a quick "thanks
        // anyway"), reopens the conversation: the follow-ups start over.
        const reopen = status === "denied" && ev.direction === "out" && !ev.scheduled && t - sinceT >= REOPEN_AFTER_MS ? "contacted" : "";
        // They clearly said no → Denied. A Denied that Gmail set from their "no"
        // goes back to Replied when they write again without saying no.
        const saidNo = ev.direction === "in" && ev.reply_kind === "no" && DENIABLE.has(status) ? "denied" : "";
        const unsaid = !saidNo && status === "denied" && (byGmail || at) && ev.direction === "in" && ev.reply_kind !== "no" && ev.reply_kind !== "maybe_no" ? "replied" : "";
        const next = reopen || saidNo || unsaid || NEXT[status]?.[ev.direction as "out" | "in"];
        if (next && next !== status) {
          status = next;
          sinceT = t;
          // A scheduled email carries its future send time; a status change is never dated ahead.
          at = ev.at > nowIso ? nowIso : ev.at;
          const via = ev.mailbox ? ` (${ev.mailbox})` : "";
          const subj = `“${ev.subject || "(no subject)"}”${via}`;
          why = reopen ? `you emailed again after they passed — ${subj}` : saidNo ? `they said no in ${subj}` : unsaid ? `they wrote again — ${subj}` : ev.direction === "out" ? `you emailed ${subj}` : `they emailed ${subj}`;
        }
      }
      if (!at || status === record.pipeline_status) continue;
      const patch: Record<string, unknown> = { pipeline_status: status, status_updated_at: at, status_source: "gmail" };
      if (status === "denied") { patch.lost_at = at; if (!record.lost_reason) patch.lost_reason = SAID_NO; }
      if (record.pipeline_status === "denied" && status !== "denied" && record.lost_reason === SAID_NO) { patch.lost_reason = ""; patch.lost_at = null; }
      if (!record.date_contacted) patch.date_contacted = (first || at).slice(0, 10);
      const { error } = await admin.from(record.table).update(patch).eq("id", record.id).eq("user_id", userId).eq("pipeline_status", record.pipeline_status);
      if (error) continue;
      changed++;
      await admin.from("activities").insert({ user_id: userId, text: `Gmail: ${record.name} moved to ${LABEL[status] || status} — ${why}`.slice(0, 500), at: new Date().toISOString(), entity_type: record.kind, entity_id: record.id });
    }
  }
  return changed;
}

// ----- replies read again with newer rules ------------------------------------------

/**
 * Replies stored before the current reply rules are read again (subject +
 * preview, no Gmail call), so a rule fix reaches mail that already arrived —
 * "Not at the moment." stored as a plain answer becomes a "no" and the
 * record moves to Denied. Your own verdicts (kind_v 32767) are never touched.
 */
type KindChange = { entityId: string; at: string; from: string; to: string };

async function rereadReplies(admin: Admin, userId: string) {
  const { data, error } = await admin.from("email_events").select("id, entity_id, counterpart, subject, snippet, reply_kind, at, reply_ai_at").eq("user_id", userId).eq("direction", "in").lt("kind_v", READER_VERSION).limit(400);
  if (error || !data?.length) return 0;
  const groups = new Map<string, string[]>();
  const changes: KindChange[] = [];
  for (const r of data) {
    let kind = String(r.reply_kind || "");
    // An emoji reaction is never a reply, whatever it was read as before.
    if (kind !== "reaction" && isReaction(r.snippet || "")) { changes.push({ entityId: r.entity_id, at: r.at, from: kind, to: "reaction" }); kind = "reaction"; }
    // Header-based 'auto', management declines, your 'ok' and an AI verdict stay as they are.
    else if (["", "no", "maybe_no", "team"].includes(kind) && !r.reply_ai_at) {
      const next = classifyIncoming({ subject: r.subject || "", text: r.snippet || "", fromOther: kind === "team", from: r.counterpart || "" });
      if (next !== kind) { changes.push({ entityId: r.entity_id, at: r.at, from: kind, to: next }); kind = next; }
    }
    groups.set(kind, [...(groups.get(kind) || []), r.id]);
  }
  for (const [kind, ids] of groups) {
    for (const part of chunk(ids, 200)) await admin.from("email_events").update({ reply_kind: kind, kind_v: READER_VERSION }).eq("user_id", userId).in("id", part).lt("kind_v", READER_VERSION);
  }
  await afterKindChange(admin, userId, changes);
  return changes.length;
}

const SAID_NO = "Said no by email";

/**
 * When an AI has quota: a second opinion on each person's latest reply in an
 * early stage (and on every Denied Gmail set from a "no") — did they turn it
 * down, and did THEY write it or their team / an autoresponder. Reads the
 * full message (signature included), one Gmail call + one small AI call per
 * reply, once (`email_events.reply_ai_at`). Your own verdicts are never read.
 */
async function aiReadReplies(admin: Admin, userId: string, token: string, mailbox: string, budget: { ai: number }, deadline: number) {
  if (!aiEnabled() || budget.ai <= 0 || Date.now() > deadline - 8_000) return 0;
  if ((await aiReadyAt("text").catch(() => 0)) > Date.now()) return 0;
  const { data } = await admin.from("email_events").select("id, gmail_id, entity_id, counterpart, subject, reply_kind, at").eq("user_id", userId).eq("mailbox", mailbox).eq("direction", "in").is("reply_ai_at", null).in("reply_kind", ["", "no", "maybe_no", "team"]).lt("kind_v", 32767).gte("at", new Date(Date.now() - 60 * 86400000).toISOString()).order("at", { ascending: false }).limit(40);
  if (!data?.length) return 0;
  const ids = Array.from(new Set(data.map((r) => r.entity_id)));
  const [{ data: creators }, { data: brands }] = await Promise.all([
    admin.from("creators").select("id, name, pipeline_status, status_source, lost_reason").eq("user_id", userId).in("id", ids),
    admin.from("brands").select("id, name, pipeline_status, status_source, lost_reason").eq("user_id", userId).in("id", ids),
  ]);
  const recs = new Map([...(creators || []), ...(brands || [])].map((r) => [r.id, r]));
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const skip: string[] = [];
  const changes: KindChange[] = [];
  for (const ev of data) {
    const rec = recs.get(ev.entity_id);
    // Only the latest reply per person, and only where the answer can move or undo something.
    const live = rec && (DENIABLE.has(rec.pipeline_status) || (rec.pipeline_status === "denied" && rec.status_source === "gmail" && rec.lost_reason === SAID_NO));
    if (!live || seen.has(ev.entity_id)) { skip.push(ev.id); continue; }
    seen.add(ev.entity_id);
    if (budget.ai <= 0 || Date.now() > deadline - 6_000) break;
    const full = await gmail<FullMessage>(token, `/messages/${ev.gmail_id}?format=full`).catch(() => null);
    if (!full) continue;
    const from = full.payload?.headers?.find((h) => h.name.toLowerCase() === "from")?.value || ev.counterpart || "";
    let reading;
    try {
      reading = await readReply({ creator: rec!.name, from, subject: ev.subject || "", body: stripQuoted(bodyOf(full).text) });
    } catch (e) {
      if (e instanceof QuotaExhausted) break;
      continue;
    }
    budget.ai--;
    const rule = String(ev.reply_kind || "") as IncomingKind;
    const next = mergeReading(rule, reading);
    await admin.from("email_events").update({ reply_kind: next, reply_ai_at: now }).eq("user_id", userId).eq("id", ev.id).lt("kind_v", 32767);
    if (next !== rule) changes.push({ entityId: ev.entity_id, at: ev.at, from: rule, to: next });
  }
  for (const part of chunk(skip, 200)) await admin.from("email_events").update({ reply_ai_at: now }).eq("user_id", userId).in("id", part);
  await afterKindChange(admin, userId, changes);
  return changes.length;
}

/**
 * A reply's meaning changed after it arrived (better rules, or the AI):
 *  - it is now a clear no → read the record again from that reply, even past a
 *    status you set by hand (Replied, Contacted…) — but only while it is still
 *    their latest real message. Negotiating / Roster / Signed never move.
 *  - it was the no that made Gmail mark them Denied and isn't a no any more
 *    (it came from their team, or it wasn't a no) → that Denied is undone and
 *    the record is read again from just before the reply.
 */
async function afterKindChange(admin: Admin, userId: string, changes: KindChange[]) {
  if (!changes.length) return 0;
  const ids = Array.from(new Set(changes.map((c) => c.entityId)));
  const since = new Map<string, number>();
  const [{ data: creators }, { data: brands }, { data: mail }] = await Promise.all([
    admin.from("creators").select("id, name, pipeline_status, status_source, lost_reason").eq("user_id", userId).in("id", ids),
    admin.from("brands").select("id, name, pipeline_status, status_source, lost_reason").eq("user_id", userId).in("id", ids),
    admin.from("email_events").select("entity_id, direction, at, reply_kind, scheduled").eq("user_id", userId).in("entity_id", ids),
  ]);
  const records = [...(creators || []).map((r) => ({ ...r, table: "creators" as const, kind: "creator" as const })), ...(brands || []).map((r) => ({ ...r, table: "brands" as const, kind: "brand" as const }))];
  for (const rec of records) {
    const mine = changes.filter((c) => c.entityId === rec.id);
    const events = (mail || []).filter((e) => e.entity_id === rec.id);
    const lastIn = events.filter((e) => e.direction === "in" && !notAReply(e.reply_kind)).sort((a, b) => b.at.localeCompare(a.at))[0];
    const newNo = mine.filter((c) => c.to === "no" && c.from !== "no").sort((a, b) => b.at.localeCompare(a.at))[0];
    const gone = mine.filter((c) => c.from === "no" && c.to !== "no").sort((a, b) => a.at.localeCompare(b.at))[0];
    if (newNo && lastIn && lastIn.at === newNo.at && DENIABLE.has(rec.pipeline_status)) {
      since.set(rec.id, new Date(newNo.at).getTime() - 1);
    } else if (gone && rec.pipeline_status === "denied" && rec.status_source === "gmail" && rec.lost_reason === SAID_NO && !events.some((e) => e.direction === "in" && e.reply_kind === "no")) {
      const at = new Date(new Date(gone.at).getTime() - 1).toISOString();
      const { error } = await admin.from(rec.table).update({ pipeline_status: "contacted", status_updated_at: at, status_source: "gmail", lost_reason: "", lost_at: null }).eq("id", rec.id).eq("user_id", userId).eq("pipeline_status", "denied");
      if (error) continue;
      await admin.from("activities").insert({ user_id: userId, text: `Gmail: ${rec.name} is no longer Denied — ${gone.to === "managed_no" ? "the no came from their team, not them: reach them on another channel" : "their reply wasn't a no"}`.slice(0, 500), at: new Date().toISOString(), entity_type: rec.kind, entity_id: rec.id });
      since.set(rec.id, new Date(at).getTime());
    }
  }
  return since.size ? applyStatuses(admin, userId, [...since.keys()], since) : 0;
}

// ----- creators' older mail --------------------------------------------------------

// Claim one email for checking, so two syncs at once (a cron run and "Sync now")
// never read it twice. A claim is stamped 100 years in the past; finishing writes
// the real time. A claim older than 30 minutes (the run crashed) is picked up again.
const CLAIM_MS = 100 * 365 * 86400000;
const claimStamp = () => new Date(Date.now() - CLAIM_MS).toISOString();
const staleClaim = () => new Date(Date.now() - CLAIM_MS - 30 * 60_000).toISOString();
async function claim(admin: Admin, userId: string, gmailId: string) {
  const { data } = await admin.from("email_events").update({ intel_at: claimStamp() }).eq("user_id", userId).eq("gmail_id", gmailId).or(`intel_at.is.null,intel_at.lt.${staleClaim()}`).select("id");
  return (data || []).length > 0;
}
const unclaim = (admin: Admin, userId: string, gmailId: string) => admin.from("email_events").update({ intel_at: null }).eq("user_id", userId).eq("gmail_id", gmailId);

const STATUS_RANK: Record<string, number> = { roster: 0, signed: 0, negotiating: 1, replied: 2, inbound: 3 };

async function backfillCreatorMail(ctx: { admin: Admin; userId: string; mailbox: string; currency: string; get: Fetcher; budget: { files: number; ai: number; bytes?: number }; deadline: number; checked: string[]; creatorId?: string; max?: number }) {
  if (Date.now() > ctx.deadline) return 0;
  // Both ways: their mail (kits, prices) and yours (offers, a yes to their price).
  let q = ctx.admin.from("email_events").select("gmail_id, entity_id, at, direction").eq("user_id", ctx.userId).eq("mailbox", ctx.mailbox).eq("entity_type", "creator").eq("scheduled", false).or(`intel_at.is.null,intel_at.lt.${staleClaim()}`);
  if (ctx.creatorId) q = q.eq("entity_id", ctx.creatorId);
  const { data: todo } = await q.order("at", { ascending: true }).limit(400);
  const events = (todo || []).filter((e) => !ctx.checked.includes(e.gmail_id));
  if (!events.length) return 0;
  const rank = new Map<string, number>();
  for (const ids of chunk(Array.from(new Set(events.map((e) => e.entity_id))), 100)) {
    const { data } = await ctx.admin.from("creators").select("id, pipeline_status, archived_at").eq("user_id", ctx.userId).in("id", ids);
    for (const c of data || []) rank.set(c.id, c.archived_at ? 9 : STATUS_RANK[c.pipeline_status] ?? 4);
  }
  const ordered = events.filter((e) => rank.has(e.entity_id)).sort((a, b) => rank.get(a.entity_id)! - rank.get(b.entity_id)! || a.entity_id.localeCompare(b.entity_id) || a.at.localeCompare(b.at));
  let files = 0;
  const seen = new Set<string>();
  for (const ev of ordered) {
    if (Date.now() > ctx.deadline || seen.size >= (ctx.max ?? 12)) break;
    if (seen.has(ev.gmail_id)) continue;
    seen.add(ev.gmail_id);
    if (!(await claim(ctx.admin, ctx.userId, ev.gmail_id))) continue; // another sync has it
    const message = await ctx.get<FullMessage>(`/messages/${ev.gmail_id}?format=full`).catch((e) => (e instanceof GmailError && e.status === 404 ? "gone" : null));
    if (message === null) { await unclaim(ctx.admin, ctx.userId, ev.gmail_id); continue; } // temporary trouble: try again next run
    if (message !== "gone") {
      // A message that fails to process is still marked done, so it can't block the queue forever.
      const read = ev.direction === "out" ? processMyMail : processCreatorMail;
      const res = await read({ admin: ctx.admin, userId: ctx.userId, mailbox: ctx.mailbox, currency: ctx.currency, message, creatorId: ev.entity_id, get: ctx.get, budget: ctx.budget, historical: true }).catch(() => null);
      files += res?.files || 0;
      if (res?.deferred) { await unclaim(ctx.admin, ctx.userId, ev.gmail_id); continue; } // attachments left for the next run
    }
    ctx.checked.push(ev.gmail_id);
  }
  return files;
}

// ----- scheduled sends -------------------------------------------------------------

// Every run looks again at the emails still waiting in this mailbox's Scheduled
// folder. Sent → it counts as sent from now on (dated when it went out).
// Cancelled (Gmail turns it back into a draft), trashed or deleted → the row
// goes, and a status that only that email had moved is put back.
// ----- mail that left Gmail ------------------------------------------------------

// Tracked mail can vanish from the mailbox after the CRM saw it: moved to Trash
// or deleted for good by someone — or something — with access to the mailbox
// (a warm-up or sending tool, a Workspace retention rule). The CRM never does
// this to sent mail: the only email it ever trashes is a scheduled one you
// cancel, and that row is removed at the same moment. Gone mail still counts
// (the other person got it); it is marked so the app can say where it went.
// Two ways in: Gmail's change history (live) and a slow sweep of older mail.
type Gone = "" | "trash" | "deleted";
const GONE_RECHECK_DAYS = 7;
const GONE_SWEEP_DAYS = 120;

async function markGone(admin: Admin, userId: string, mailbox: string, changes: Map<string, Gone>, checked: string[] = []) {
  const ids = Array.from(new Set([...changes.keys(), ...checked]));
  if (!ids.length) return 0;
  const nowIso = new Date().toISOString();
  let moved = 0;
  for (const part of chunk(ids, 200)) {
    const { data, error } = await admin.from("email_events").select("id, gmail_id, entity_id, entity_type, direction, subject, gone, gone_at, scheduled").eq("user_id", userId).eq("mailbox", mailbox).in("gmail_id", part);
    if (error) return moved; // columns not there yet: nothing to mark
    const news: { entityId: string; type: "creator" | "brand"; text: string }[] = [];
    for (const r of data || []) {
      if (r.scheduled || !changes.has(r.gmail_id)) continue; // scheduled sends are rechecked on their own
      const next = changes.get(r.gmail_id)!;
      if ((r.gone || "") === next) continue;
      const { error: upd } = await admin.from("email_events").update({ gone: next, gone_at: next ? r.gone_at || nowIso : null, gone_checked_at: nowIso }).eq("id", r.id).eq("user_id", userId);
      if (upd) continue;
      moved++;
      const subject = `“${(r.subject || "(no subject)").slice(0, 80)}”`;
      const mine = r.direction === "out" ? `your email ${subject}` : `their email ${subject}`;
      const text = next === "trash" ? `Gmail: ${mine} was put in Trash in ${mailbox} — not by the CRM. It still counts; restore it from Trash within 30 days if you need it.`
        : next === "deleted" ? `Gmail: ${mine} was deleted for good from ${mailbox} — not by the CRM. It still counts${r.direction === "out" ? " as sent: they received it" : ""}.`
        : `Gmail: ${mine} is back in ${mailbox} (restored from Trash).`;
      if (!news.some((x) => x.entityId === r.entity_id && x.text === text)) news.push({ entityId: r.entity_id, type: r.entity_type === "brand" ? "brand" : "creator", text });
    }
    if (news.length) await admin.from("activities").insert(news.slice(0, 50).map((x) => ({ user_id: userId, text: x.text.slice(0, 500), at: nowIso, entity_type: x.type, entity_id: x.entityId })));
  }
  if (checked.length) for (const part of chunk(checked, 200)) await admin.from("email_events").update({ gone_checked_at: nowIso }).eq("user_id", userId).eq("mailbox", mailbox).in("gmail_id", part);
  return moved;
}

/**
 * The slow sweep: looks again at tracked mail of the last 120 days that was
 * never checked (or not for a week; Trash daily, since it can be restored or
 * emptied). Newest first, a few dozen per read run — 5 quota units each.
 */
async function sweepGone(admin: Admin, userId: string, token: string, mailbox: string, deadline: number, max = 60) {
  if (Date.now() > deadline) return 0;
  const week = new Date(Date.now() - GONE_RECHECK_DAYS * 86400000).toISOString();
  const day = new Date(Date.now() - 86400000).toISOString();
  const { data, error } = await admin.from("email_events").select("gmail_id").eq("user_id", userId).eq("mailbox", mailbox).eq("scheduled", false)
    .gte("at", new Date(Date.now() - GONE_SWEEP_DAYS * 86400000).toISOString())
    .or(`gone_checked_at.is.null,gone_checked_at.lt.${week},and(gone.eq.trash,gone_checked_at.lt.${day})`)
    .order("gone_checked_at", { ascending: true, nullsFirst: true }).order("at", { ascending: false }).limit(max * 2);
  if (error || !data?.length) return 0;
  const ids = Array.from(new Set(data.map((r) => r.gmail_id as string))).slice(0, max);
  const changes = new Map<string, Gone>();
  const checked: string[] = [];
  for (const part of chunk(ids, 10)) {
    if (Date.now() > deadline) break;
    await Promise.all(part.map(async (id) => {
      const meta = await gmail<{ labelIds?: string[] }>(token, `/messages/${id}?format=minimal`).catch((e) => (e instanceof GmailError && e.status === 404 ? null : undefined));
      if (meta === undefined) return; // Gmail hiccup: look again next run
      changes.set(id, meta === null ? "deleted" : (meta.labelIds || []).includes("TRASH") ? "trash" : "");
      checked.push(id);
    }));
  }
  return markGone(admin, userId, mailbox, changes, checked);
}

async function recheckScheduled(admin: Admin, userId: string, token: string, mailbox: string, deadline: number) {
  // What Gmail says is waiting right now — also catches rows stored as sent
  // before scheduled sends were told apart.
  const listed = await listIds(token, "in:scheduled", 3).then((ids) => ids, () => null);
  const waiting = listed || [];
  const waitingSet = new Set(waiting);
  for (const part of chunk(waiting, 200)) await admin.from("email_events").update({ scheduled: true }).eq("user_id", userId).eq("mailbox", mailbox).eq("direction", "out").eq("scheduled", false).in("gmail_id", part);
  const { data, error } = await admin.from("email_events").select("gmail_id, entity_id, entity_type, direction, at").eq("user_id", userId).eq("mailbox", mailbox).eq("scheduled", true).limit(300);
  if (error || !data?.length) return { sent: 0, cancelled: 0, waiting };
  let sent = 0;
  const gone: string[] = [];
  const nowIso = new Date().toISOString();
  // Still listed under Scheduled with its send time ahead: nothing to re-read.
  const check = Array.from(new Set(data.filter((r) => listed === null || !waitingSet.has(r.gmail_id) || r.at <= nowIso).map((r) => r.gmail_id as string)));
  for (const ids of chunk(check, 10)) {
    if (Date.now() > deadline) break;
    await Promise.all(ids.map(async (id) => {
      const meta = await gmail<Meta>(token, META_PATH(id)).catch((e) => (e instanceof GmailError && e.status === 404 ? null : undefined));
      if (meta === undefined) return; // Gmail hiccup: look again next run
      const labels = meta?.labelIds || [];
      if (!meta || labels.some((l) => l === "DRAFT" || l === "TRASH" || l === "SPAM")) { gone.push(id); return; }
      // Still waiting: Gmail lists it under Scheduled, or its send time is ahead.
      const stillScheduled = (listed !== null && waitingSet.has(id)) || isFuture(meta) || (labels.includes("SCHEDULED") && !labels.includes("SENT"));
      let { error: upd } = await admin.from("email_events").update({ scheduled: stillScheduled, at: sentAt(meta), in_reply_to: replyToKey(meta) }).eq("user_id", userId).eq("gmail_id", id);
      if (upd && /in_reply_to/.test(upd.message)) ({ error: upd } = await admin.from("email_events").update({ scheduled: stillScheduled, at: sentAt(meta) }).eq("user_id", userId).eq("gmail_id", id));
      if (!upd && !stillScheduled) sent++;
    }));
  }
  if (!gone.length) return { sent, cancelled: 0, waiting };
  await admin.from("email_events").delete().eq("user_id", userId).in("gmail_id", gone);
  const records = Array.from(new Map(data.filter((r) => gone.includes(r.gmail_id) && r.direction === "out").map((r) => [r.entity_id as string, r.entity_type as "creator" | "brand"])).entries());
  for (const [id, type] of records) await undoScheduledStatus(admin, userId, type, id);
  return { sent, cancelled: gone.length, waiting };
}

// Gmail moved New → Contacted (or Inbound → Replied) because of an email that
// never went out: put it back, but only while nothing else you sent counts.
async function undoScheduledStatus(admin: Admin, userId: string, type: "creator" | "brand", id: string) {
  const table = type === "creator" ? "creators" : "brands";
  const { data: record } = await admin.from(table).select("id, name, pipeline_status, status_source, archived_at").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!record || record.archived_at || record.status_source !== "gmail") return;
  const [{ data: mail }, { data: logged }] = await Promise.all([
    admin.from("email_events").select("*").eq("user_id", userId).eq("entity_id", id).limit(200),
    admin.from("followups").select("kind").eq("user_id", userId).eq(type === "creator" ? "creator_id" : "brand_id", id).limit(200),
  ]);
  const outs = (mail || []).filter((m) => m.direction === "out").length + (logged || []).filter((f) => f.kind !== "reply").length;
  const ins = (mail || []).filter((m) => m.direction === "in" && !notAReply(m.reply_kind) && m.reply_kind !== "managed_no").length + (logged || []).filter((f) => f.kind === "reply").length;
  if (outs > 0) return;
  const back = record.pipeline_status === "contacted" && ins === 0 ? "new" : record.pipeline_status === "replied" && ins > 0 ? "inbound" : "";
  if (!back) return;
  const patch: Record<string, unknown> = { pipeline_status: back, status_updated_at: new Date().toISOString(), status_source: "gmail" };
  if (back === "new") patch.date_contacted = null;
  const { error } = await admin.from(table).update(patch).eq("id", id).eq("user_id", userId).eq("pipeline_status", record.pipeline_status);
  if (error) return;
  await admin.from("activities").insert({ user_id: userId, text: `Gmail: the scheduled email to ${record.name} was cancelled — moved back to ${back === "new" ? "New" : "Inbound"}`.slice(0, 500), at: new Date().toISOString(), entity_type: type, entity_id: id });
}

// ----- cancelling scheduled sends ----------------------------------------------

// Cancel one of the user's scheduled sends: Gmail cancels a scheduled message
// when it is trashed (it stays in Trash for 30 days; nothing is deleted
// forever). Only a row of theirs that is still scheduled, in a mailbox of
// theirs that granted gmail.modify, and only while Gmail still holds it unsent.
async function cancelScheduledSend(admin: Admin, userId: string, rows: TokenRow[], gmailId: string, why: "manual" | "replied"): Promise<{ ok: true } | { error: string; status: number; code?: string }> {
  const { data: ev } = await admin.from("email_events").select("gmail_id, mailbox, scheduled, direction, entity_id, entity_type").eq("user_id", userId).eq("gmail_id", gmailId).eq("direction", "out").limit(1).maybeSingle();
  if (!ev) return { error: "That email isn't in your CRM.", status: 404 };
  if (!ev.scheduled) return { error: "That email has already gone out.", status: 409 };
  const row = rows.find((r) => mailboxOf(r) === ev.mailbox);
  if (!row) return { error: `Reconnect ${ev.mailbox} to cancel it from here.`, status: 409 };
  if (!(row.scopes || "").includes("gmail.modify")) return { error: `Reconnect ${ev.mailbox} and allow “Manage drafts and send” to cancel from the CRM.`, code: "needs_modify", status: 403 };
  try {
    const token = await accessToken(admin, row);
    // Not found = already gone in Gmail; any other trouble stops here so nothing is forgotten that would still send.
    const meta = await gmail<Meta>(token, META_PATH(gmailId)).catch((e) => (e instanceof GmailError && e.status === 404 ? null : Promise.reject(e)));
    const labels = meta?.labelIds || [];
    if (meta && !(isFuture(meta) || (labels.includes("SCHEDULED") && !labels.includes("SENT")))) return { error: "That email has already gone out.", status: 409 };
    if (meta) await gmail(token, `/messages/${gmailId}/trash`, { method: "POST" });
    await admin.from("email_events").delete().eq("user_id", userId).eq("gmail_id", gmailId);
    await undoScheduledStatus(admin, userId, ev.entity_type, ev.entity_id);
    const text = why === "replied" ? "Gmail: they replied before your scheduled follow-up went out, so it was cancelled (it's in Gmail's Trash for 30 days)" : "Cancelled a scheduled email (it's in Gmail's Trash for 30 days)";
    await admin.from("activities").insert({ user_id: userId, text, at: new Date().toISOString(), entity_type: ev.entity_type, entity_id: ev.entity_id });
    return { ok: true };
  } catch (e) {
    const status = e instanceof GmailError && e.status >= 400 && e.status < 500 ? e.status : 502;
    return { error: e instanceof Error ? e.message : "Couldn't cancel it", status };
  }
}

// A scheduled follow-up that bumps your own earlier email (its In-Reply-To is
// an email you sent) and they answered after you scheduled it: it would land
// after their reply ("crossed"). Cancelled for you unless the member turned
// followup_rules.auto_cancel_crossed off. Auto-replies don't count as answers.
// Same rule as markCrossed in web/src/lib/followupEngine.ts.
/**
 * Self-heal for managers shared by several creators. Before the thread rule in
 * `narrow()`, an email to / from a manager on creator A's team list was filed
 * under A even when it was in creator B's thread (B's own address started that
 * thread). Such an email moves to B — and the manager joins B's team, so the
 * next one matches by itself. Recent threads only; your own picks are never touched.
 */
async function rehomeTeamMail(admin: Admin, userId: string, book: Map<string, Entity[]>, own: Set<string>) {
  const teamAddrs = [...book.entries()].filter(([, list]) => list.some((e) => e.via === "team")).map(([addr]) => addr);
  if (!teamAddrs.length) return 0;
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const suspects: { id: string; gmail_id: string; thread_id: string; mailbox: string; entity_id: string; entity_type: string; counterpart: string; subject: string }[] = [];
  for (const part of chunk(teamAddrs, 100)) {
    const { data } = await admin.from("email_events").select("id, gmail_id, thread_id, mailbox, entity_id, entity_type, counterpart, subject").eq("user_id", userId).eq("entity_type", "creator").in("counterpart", part).gte("at", since).neq("thread_id", "").limit(1000);
    for (const r of data || []) if ((book.get(r.counterpart) || []).some((e) => e.id === r.entity_id && e.via === "team")) suspects.push(r);
  }
  if (!suspects.length) return 0;
  const threadIds = Array.from(new Set(suspects.map((r) => r.thread_id)));
  const rows: { gmail_id: string; thread_id: string; mailbox: string; entity_id: string; entity_type: string; counterpart: string }[] = [];
  for (const part of chunk(threadIds, 150)) {
    const { data } = await admin.from("email_events").select("gmail_id, thread_id, mailbox, entity_id, entity_type, counterpart").eq("user_id", userId).in("thread_id", part).limit(5000);
    rows.push(...(data || []));
  }
  // Who a thread belongs to: the records whose OWN address is on it.
  const ownIn = (thread: string, mailbox: string) => Array.from(new Set(rows.filter((r) => r.thread_id === thread && r.mailbox === mailbox && r.entity_type === "creator" && (book.get(r.counterpart) || []).some((e) => e.id === r.entity_id && e.via !== "team")).map((r) => r.entity_id)));
  const moved = new Map<string, { from: string; to: string; counterpart: string; subject: string; n: number }>();
  for (const s of suspects) {
    const owners = ownIn(s.thread_id, s.mailbox);
    if (!owners.length || owners.includes(s.entity_id)) continue; // their own thread (or nobody's): leave it
    const to = owners[0];
    const already = rows.some((r) => r.gmail_id === s.gmail_id && r.entity_id === to);
    const { error } = already
      ? await admin.from("email_events").delete().eq("id", s.id).eq("user_id", userId)
      : await admin.from("email_events").update({ entity_id: to }).eq("id", s.id).eq("user_id", userId);
    if (error) continue;
    const key = `${s.entity_id}>${to}`;
    const m = moved.get(key) || { from: s.entity_id, to, counterpart: s.counterpart, subject: s.subject, n: 0 };
    m.n++;
    moved.set(key, m);
  }
  if (!moved.size) return 0;
  const ids = Array.from(new Set([...moved.values()].flatMap((m) => [m.from, m.to])));
  const { data: names } = await admin.from("creators").select("id, name").eq("user_id", userId).in("id", ids);
  const nameOf = (id: string) => names?.find((c) => c.id === id)?.name || "another creator";
  for (const m of moved.values()) {
    await linkTeam(admin, userId, m.to, m.counterpart, "team", `writes in your thread “${m.subject || "(no subject)"}”`, own).catch(() => false);
    await admin.from("activities").insert({ user_id: userId, text: `Gmail: ${m.n === 1 ? "an email" : `${m.n} emails`} with ${m.counterpart} in “${m.subject || "(no subject)"}” belonged to ${nameOf(m.to)}, not ${nameOf(m.from)} — moved (that manager works with both).`.slice(0, 500), at: new Date().toISOString(), entity_type: "creator", entity_id: m.from });
  }
  await applyStatuses(admin, userId, ids).catch(() => 0);
  return [...moved.values()].reduce((a, m) => a + m.n, 0);
}

async function autoCancelCrossed(admin: Admin, userId: string, rows: TokenRow[]) {
  const { data: pending } = await admin.from("email_events").select("gmail_id, entity_id, in_reply_to, at, created_at").eq("user_id", userId).eq("direction", "out").eq("scheduled", true).gt("at", new Date().toISOString()).neq("in_reply_to", "").limit(200);
  if (!pending?.length) return 0;
  const { data: prof } = await admin.from("profiles").select("preferences").eq("id", userId).maybeSingle();
  const rules = ((prof?.preferences || {}) as { followup_rules?: { auto_cancel_crossed?: boolean } }).followup_rules;
  if (rules?.auto_cancel_crossed === false) return 0;
  const ids = Array.from(new Set(pending.map((p) => p.entity_id as string)));
  const { data: mail } = await admin.from("email_events").select("entity_id, direction, at, reply_kind, message_key").eq("user_id", userId).in("entity_id", ids).limit(5000);
  const ms = (v: string) => new Date(v).getTime();
  const done = new Set<string>();
  let cancelled = 0;
  for (const p of pending) {
    if (done.has(p.gmail_id)) continue;
    const mine = (mail || []).filter((m) => m.entity_id === p.entity_id);
    const bumped = mine.find((m) => m.message_key && m.message_key === p.in_reply_to);
    if (!bumped || bumped.direction !== "out") continue;
    // Only when the reply came in after the CRM already saw the scheduled email,
    // i.e. you scheduled it before they answered. One you wrote after reading
    // their reply stays: the app flags it and you decide.
    const crossed = mine.some((m) => m.direction === "in" && !notAReply(m.reply_kind) && ms(m.at) > ms(bumped.at) && ms(m.at) < ms(p.at) && ms(m.at) > ms(p.created_at));
    if (!crossed) continue;
    done.add(p.gmail_id);
    const res = await cancelScheduledSend(admin, userId, rows, p.gmail_id, "replied");
    if ("ok" in res) cancelled++;
  }
  return cancelled;
}

// ----- replies from another address (older mail) -----------------------------------

// Before threads were matched, a manager's or agency's answer from an address
// that isn't the creator's was dropped (it wasn't in the CRM). Once per
// mailbox, walk the threads you started in the last 60 days, newest first, a
// slice per run; the cursor (epoch ms) is kept in `backfilled`.
const THREAD_SCAN_DONE = "__thread_scan_v1";
const THREAD_SCAN_AT = "__thread_scan_v1@";
const THREAD_SCAN_DAYS = 60;
const THREADS_PER_RUN = 60;

async function scanOldThreads(admin: Admin, row: TokenRow, token: string, own: Set<string>, mailbox: string, done: Set<string>, deadline: number) {
  const none = { rows: [] as EventRow[], marker: [] as string[] };
  if (done.has(THREAD_SCAN_DONE) || Date.now() > deadline) return none;
  const cursor = Number(Array.from(done).find((b) => b.startsWith(THREAD_SCAN_AT))?.slice(THREAD_SCAN_AT.length)) || Date.now() + 86400000;
  const since = new Date(Date.now() - THREAD_SCAN_DAYS * 86400000).toISOString();
  const { data, error } = await admin.from("email_events").select("thread_id, at").eq("user_id", row.user_id).eq("mailbox", mailbox).eq("direction", "out").neq("thread_id", "").gte("at", since).lt("at", new Date(cursor).toISOString()).order("at", { ascending: false }).limit(1500);
  if (error) return none;
  const newest = new Map<string, string>();
  for (const r of data || []) if (!newest.has(r.thread_id)) newest.set(r.thread_id, r.at);
  const slice = Array.from(newest.entries()).slice(0, THREADS_PER_RUN);
  if (!slice.length) return { rows: [], marker: [THREAD_SCAN_DONE] };
  const threads = await threadBook(admin, row.user_id, mailbox, slice.map(([id]) => id));
  const metas: Meta[] = [];
  let reached = cursor;
  for (const group of chunk(slice, 5)) {
    if (Date.now() > deadline) break;
    const got = await Promise.all(group.map(([id]) => gmail<{ messages?: Meta[] }>(token, `/threads/${id}?format=metadata&${META_HEADERS.map((h) => `metadataHeaders=${h}`).join("&")}`).catch(() => null)));
    for (const t of got) metas.push(...(t?.messages || []));
    reached = Math.min(reached, ...group.map(([, at]) => new Date(at).getTime()));
  }
  // Only messages nobody stored yet, and only what the thread itself explains.
  const known = new Set<string>();
  for (const part of chunk(metas.map((m) => m.id), 300)) {
    const { data: stored } = await admin.from("email_events").select("gmail_id").eq("user_id", row.user_id).in("gmail_id", part);
    (stored || []).forEach((r) => known.add(r.gmail_id));
  }
  const fresh = metas.filter((m) => !known.has(m.id)).flatMap((m) => eventsFor(m, row.user_id, new Map(), own, mailbox, threads));
  const rows = await dropCrossMailboxDuplicates(admin, row.user_id, fresh);
  await storeEvents(admin, rows);
  const finished = slice.length < THREADS_PER_RUN && reached <= Math.min(...slice.map(([, at]) => new Date(at).getTime()));
  return { rows, marker: finished ? [THREAD_SCAN_DONE] : [`${THREAD_SCAN_AT}${reached}`] };
}

// ----- your replies to inbound leads -------------------------------------------------

// People who emailed you first aren't in the CRM, so your answers to them were
// invisible. Every answer is kept on the lead (it counts as an email sent), and
// what it says decides the lead: a clear yes ("sure", "send your media kit")
// is added to the CRM by the app, a clear no dismisses it, anything else waits
// for you. Once per mailbox, the last 60 days of answers are looked up too.
const LEAD_REPLIES_DONE = "__lead_replies_v1";
const REREAD_DONE = "__reread_prices_v3";
type LeadRow = { id: string; email: string; thread_id: string; mailbox: string; status: string; my_replies: { id: string; at: string; scheduled?: boolean; intent?: string }[] | null; my_intent: string | null };

async function trackLeadReplies(admin: Admin, userId: string, token: string, metas: Meta[], own: Set<string>, mailbox: string, backfilledAlready: boolean, deadline: number) {
  const { data, error } = await admin.from("inbound_leads").select("id, email, thread_id, mailbox, status, my_replies, my_intent").eq("user_id", userId).limit(500);
  if (error || !data?.length) return { updated: 0, backfilled: !error };
  const leads = data as LeadRow[];
  let candidates = metas.filter((m) => isOutgoing(m, own));
  let backfilled = false;
  if (!backfilledAlready && Date.now() < deadline) {
    const recent = leads.filter((l) => l.status !== "added").map((l) => l.email);
    const ids = new Set<string>();
    for (const group of chunk(recent, 15)) {
      if (Date.now() > deadline) break;
      (await listIds(token, `in:sent {${group.map((e) => `to:${e}`).join(" ")}} newer_than:60d`, 2)).forEach((id) => ids.add(id));
    }
    const have = new Set(candidates.map((m) => m.id));
    candidates = [...candidates, ...(await fetchMetas(token, Array.from(ids).filter((id) => !have.has(id)), deadline))];
    backfilled = Date.now() < deadline;
  }
  const byEmail = new Map(leads.map((l) => [l.email.toLowerCase(), l]));
  const byThread = new Map(leads.filter((l) => l.thread_id && (!l.mailbox || l.mailbox === mailbox)).map((l) => [l.thread_id, l]));
  const touched = new Map<string, LeadRow>();
  for (const meta of candidates) {
    const labels = meta.labelIds || [];
    if (labels.some((l) => l === "DRAFT" || l === "TRASH" || l === "SPAM")) continue;
    const to = [...addresses(header(meta, "To")), ...addresses(header(meta, "Cc"))];
    const lead = to.map((e) => byEmail.get(e)).find(Boolean) || (meta.threadId ? byThread.get(meta.threadId) : undefined);
    if (!lead) continue;
    const list = lead.my_replies || [];
    if (list.some((r) => r.id === meta.id)) continue;
    const scheduled = labels.includes("SCHEDULED") && !labels.includes("SENT");
    lead.my_replies = [...list, { id: meta.id, at: sentAt(meta), scheduled, intent: myReplyIntent(decodeEntities(meta.snippet || "")) }].sort((a, b) => a.at.localeCompare(b.at)).slice(-50);
    touched.set(lead.id, lead);
  }
  let updated = 0;
  for (const lead of touched.values()) {
    const replies = lead.my_replies || [];
    // Your latest clear answer decides; "thanks, got it" never undoes a yes.
    const intent = [...replies].reverse().find((r) => r.intent)?.intent || "";
    const patch: Record<string, unknown> = { my_replies: replies, my_intent: intent, replied_at: replies[replies.length - 1]?.at || null, updated_at: new Date().toISOString() };
    if (lead.status === "new" && intent === "no") patch.status = "dismissed";
    const { error: upd } = await admin.from("inbound_leads").update(patch).eq("id", lead.id).eq("user_id", userId);
    if (!upd) updated++;
  }
  return { updated, backfilled };
}

// ----- tracking check ------------------------------------------------------------

// How much of what you sent the CRM actually tracks, so its numbers can be
// trusted. Kept per mailbox in gmail_tokens.coverage (server-only table; the
// owner sees it through the status action). Over the last COVERAGE_DAYS days:
//   sent      — emails in Gmail's Sent folder to someone outside your team
//   tracked   — stored for someone in your CRM (or an answer to an inbound lead)
//   untracked — sent to people the CRM doesn't know; listed so you can add them
//               (adding one pulls in their whole history on the next sync)
//   pending   — not read yet (a big backlog drains over the next runs)
//   warmup    — sends by a warm-up tool (TrulyInbox and others), recognised by
//               their body in the read phase and left out of everything
const COVERAGE_DAYS = 2;
type Untracked = { id: string; to: string[]; at: string; subject: string };
type Coverage = { at: string; days: number; sent: number; tracked: number; pending: number; warmup: number; warm: string[]; quiet: string[]; untracked: Untracked[] };
const readCoverage = (value: unknown): Coverage => {
  const v = (value && typeof value === "object" ? value : {}) as Partial<Coverage>;
  const untracked = (Array.isArray(v.untracked) ? v.untracked : [])
    .filter((u): u is Untracked => !!u && typeof u.id === "string" && Array.isArray(u.to))
    .map((u) => ({ id: u.id, to: u.to.filter((e) => typeof e === "string").slice(0, 5), at: String(u.at || ""), subject: String(u.subject || "").slice(0, 120) }));
  const warm = (Array.isArray(v.warm) ? v.warm : []).filter((id): id is string => typeof id === "string").slice(-500);
  const quiet = (Array.isArray(v.quiet) ? v.quiet : []).filter((id): id is string => typeof id === "string").slice(-500);
  return { at: String(v.at || ""), days: COVERAGE_DAYS, sent: Number(v.sent) || 0, tracked: Number(v.tracked) || 0, pending: Number(v.pending) || 0, warmup: Number(v.warmup) || 0, warm, quiet, untracked };
};

async function measureCoverage(admin: Admin, userId: string, sweep: string[], metas: Meta[], prev: Coverage, own: Set<string>, book: Map<string, Entity[]>): Promise<Coverage> {
  const team = ownDomains(own);
  const outside = (e: string) => !own.has(e) && !team.has(e.split("@")[1] || "");
  const stored = new Set<string>();
  for (const part of chunk(sweep, 300)) {
    const { data } = await admin.from("email_events").select("gmail_id").eq("user_id", userId).in("gmail_id", part);
    (data || []).forEach((r) => stored.add(r.gmail_id));
  }
  const { data: leadRows } = await admin.from("inbound_leads").select("email").eq("user_id", userId).limit(1000);
  const leads = new Set((leadRows || []).map((l) => String(l.email).toLowerCase()));
  const fetched = new Map(metas.map((m) => [m.id, m]));
  const before = new Map(prev.untracked.map((u) => [u.id, u]));
  let sent = 0, tracked = 0, pending = 0, warmup = 0;
  const untracked: Untracked[] = [];
  const warm = new Set(prev.warm);
  const quiet: string[] = [];
  for (const id of sweep) {
    if (prev.quiet.includes(id)) continue;
    if (stored.has(id)) { sent++; tracked++; continue; }
    if (warm.has(id)) { warmup++; continue; }
    const meta = fetched.get(id);
    const known = meta
      ? { id, to: [...addresses(header(meta, "To")), ...addresses(header(meta, "Cc"))].filter(outside).slice(0, 5), at: sentAt(meta), subject: decodeEntities(header(meta, "Subject")).slice(0, 120) }
      : before.get(id);
    if (!known) { pending++; sent++; continue; }
    if (!known.to.length) { quiet.push(id); continue; } // only to yourself or your team: not outreach
    sent++;
    if (known.to.some((e) => leads.has(e))) { tracked++; continue; }
    // In your CRM (just added — the next sync's backfill brings it in — or the
    // same email already counted from your other mailbox).
    if (known.to.some((e) => book.has(e))) { tracked++; continue; }
    untracked.push(known);
  }
  // Only warm-up ids still inside the window are worth remembering.
  const inWindow = new Set(sweep);
  return { at: new Date().toISOString(), days: COVERAGE_DAYS, sent, tracked, pending, warmup, warm: prev.warm.filter((id) => inWindow.has(id)), quiet: [...prev.quiet.filter((id) => inWindow.has(id)), ...quiet].slice(-500), untracked: untracked.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200) };
}

// ----- one mailbox's sync -------------------------------------------------------
//
// Two phases, so tracking never waits behind heavy reading:
//   track — every minute (and on "Sync now"): new mail via Gmail's history,
//           scheduled sends, a sweep of Sent, new contacts' older mail. Headers
//           only, saved as it goes, statuses moved, position committed. Seconds.
//   read  — every few minutes, after track: full emails (prices, media kits,
//           leads, managers pointing elsewhere), AI, older backlog, self-heal.
//           If it is cut off, nothing tracked is lost.
// A short lease per mailbox and phase keeps two runs from doing the same work.

const TRACK_LEASE_MS = 90_000;
const READ_LEASE_MS = 150_000;
const READ_EVERY_MS = 4 * 60_000;
const LEAD_QUEUE_MAX = 200;

async function lease(admin: Admin, id: string, column: "track_lock_until" | "read_lock_until", ms: number) {
  const now = new Date().toISOString();
  const { data, error } = await admin.from("gmail_tokens").update({ [column]: new Date(Date.now() + ms).toISOString() }).eq("id", id).or(`${column}.is.null,${column}.lt.${now}`).select("id");
  // Before the migration the column doesn't exist: run without a lease.
  if (error) return /does not exist|schema cache/i.test(error.message);
  return (data || []).length > 0;
}
const release = (admin: Admin, id: string, column: "track_lock_until" | "read_lock_until") => admin.from("gmail_tokens").update({ [column]: null }).eq("id", id);

/** Link a manager / agent / team address to a creator, once, and say so. Never your own address, never one you removed. */
async function linkTeam(admin: Admin, userId: string, creatorId: string, email: string, role: TeamRole, why: string, own: Set<string>) {
  const e = email.toLowerCase().trim();
  if (!VALID_EMAIL.test(e) || own.has(e) || ownDomains(own).has(e.split("@")[1] || "")) return false;
  const { data: c } = await admin.from("creators").select("id, name, contact_email, secondary_email, team, archived_at").eq("id", creatorId).eq("user_id", userId).maybeSingle();
  if (!c || c.archived_at) return false;
  if ([...addresses(c.contact_email || ""), ...addresses(c.secondary_email || "")].includes(e)) return false;
  const team = (Array.isArray(c.team) ? c.team : []) as (TeamMember & Record<string, unknown>)[];
  if (team.some((t) => t && t.email === e) || team.length >= 12) return false;
  const next = [...team, { email: e, role, name: "", source: "gmail", why: why.slice(0, 160), at: new Date().toISOString() }];
  const { error } = await admin.from("creators").update({ team: next }).eq("id", creatorId).eq("user_id", userId);
  if (error) return false;
  const label = role === "team" ? "someone on their team" : `their ${role}`;
  await admin.from("activities").insert({ user_id: userId, text: `Gmail: linked ${label} (${e}) to ${c.name} — ${why}. Emails with them now count for ${c.name}.`.slice(0, 500), at: new Date().toISOString(), entity_type: "creator", entity_id: creatorId });
  return true;
}

/** Managers pointed to in a creator's words, and other addresses that answered in their thread. */
async function learnTeams(admin: Admin, userId: string, rows: EventRow[], own: Set<string>, book: Map<string, Entity[]>) {
  let linked = 0;
  for (const r of rows) {
    if (r.direction !== "in" || r.entity_type !== "creator") continue;
    const ref = referralOf(r.snippet || "", [...own, r.counterpart]);
    if (ref && !book.get(ref.email)?.some((x) => x.id === r.entity_id) && (await linkTeam(admin, userId, r.entity_id, ref.email, ref.role, `they pointed you to them in “${r.subject || "(no subject)"}”`, own))) linked++;
    // Answered from an address that isn't theirs, inside their thread: their side.
    // One manager can look after several of your creators: link her to each one whose thread she answers in.
    if ((r.reply_kind === "team" || r.reply_kind === "managed_no") && !book.get(r.counterpart)?.some((x) => x.id === r.entity_id) && (await linkTeam(admin, userId, r.entity_id, r.counterpart, "team", `answered in your thread “${r.subject || "(no subject)"}”`, own))) {
      linked++;
      book.set(r.counterpart, [...(book.get(r.counterpart) || []), { type: "creator", id: r.entity_id, via: "team" }]);
    }
  }
  return linked;
}

async function trackMailbox(admin: Admin, row: TokenRow, own: Set<string>, book: Map<string, Entity[]>, deadline: number) {
  const token = await accessToken(admin, row);
  if (!(row.scopes || "").includes("gmail.readonly")) throw new GmailError("Gmail read access wasn't granted — reconnect this mailbox and tick “Read your email”.", 403, true);
  const mailbox = mailboxOf(row);
  const done = new Set((row.backfilled || []).map((e) => e.toLowerCase()));
  // Today's mail first, older backlog after: a new contact's history never pushes today's sends out.
  const urgent = new Set<string>();
  const later: { marker: string[]; ids: string[] }[] = [];
  let complete = true;

  // 0. Scheduled sends: gone out, still waiting, or cancelled? New ones are picked up here too.
  const scheduled = await recheckScheduled(admin, row.user_id, token, mailbox, deadline - 5_000).catch(() => ({ sent: 0, cancelled: 0, waiting: [] as string[] }));
  scheduled.waiting.forEach((id) => urgent.add(id));

  // 1. Everything since the last run, via Gmail's change history. Records are
  //    kept in order: when a run can't read everything, the position still
  //    moves forward past what it did read, so a busy mailbox (warm-up
  //    traffic, newsletters) can never get stuck re-reading the same mail.
  let historyId = row.history_id;
  const records: { id: string; ids: string[] }[] = [];
  const goneNow = new Map<string, Gone>();
  if (historyId) {
    try {
      let pageToken = "";
      for (let page = 0; page < 20; page++) {
        // messageAdded = new mail (spam included); labelAdded catches mail that
        // only became "sent" later — a draft you sent, a scheduled email going out.
        const params = new URLSearchParams({ startHistoryId: historyId, maxResults: "500" });
        params.append("historyTypes", "messageAdded");
        params.append("historyTypes", "labelAdded");
        // Mail leaving Gmail (Trash, deleted for good) and coming back from Trash.
        params.append("historyTypes", "messageDeleted");
        params.append("historyTypes", "labelRemoved");
        if (pageToken) params.set("pageToken", pageToken);
        const res = await gmail<{ history?: { id: string; messagesAdded?: { message: { id: string } }[]; labelsAdded?: { message: { id: string }; labelIds?: string[] }[]; labelsRemoved?: { message: { id: string }; labelIds?: string[] }[]; messagesDeleted?: { message: { id: string } }[] }[]; nextPageToken?: string }>(token, `/history?${params}`);
        for (const h of res.history || []) {
          // In order, so the last word wins (trashed, then restored = still there).
          for (const l of h.labelsAdded || []) if ((l.labelIds || []).includes("TRASH")) goneNow.set(l.message.id, "trash");
          for (const l of h.labelsRemoved || []) if ((l.labelIds || []).includes("TRASH") && goneNow.get(l.message.id) !== "deleted") goneNow.set(l.message.id, "");
          for (const d of h.messagesDeleted || []) goneNow.set(d.message.id, "deleted");
          const ids = [...(h.messagesAdded || []).map((m) => m.message.id), ...(h.labelsAdded || []).filter((l) => (l.labelIds || []).some((x) => x === "SENT" || x === "SCHEDULED" || x === "INBOX")).map((l) => l.message.id)];
          ids.forEach((id) => urgent.add(id));
          records.push({ id: String(h.id), ids });
        }
        if (!res.nextPageToken) break;
        pageToken = res.nextPageToken;
        if (Date.now() > deadline) { complete = false; break; }
      }
    } catch (e) {
      // Limited mid-way: keep what came in; the old history id stays, so nothing is skipped.
      if (e instanceof GmailError && e.retryable) complete = false;
      else if (!(e instanceof GmailError) || e.status !== 404) throw e;
      else {
        // History too old (or reset): a short search on every address instead.
        historyId = null;
        for (const group of chunk(Array.from(book.keys()), 15)) {
          if (Date.now() > deadline) { complete = false; break; }
          (await listIds(token, searchFor(group, 10), 3)).forEach((id) => urgent.add(id));
        }
      }
    }
  }

  if (goneNow.size) await markGone(admin, row.user_id, mailbox, goneNow).catch(() => 0);

  // 2. Safety net, every run: everything you sent in the last 2 days.
  const prevCoverage = readCoverage(row.coverage);
  const checkedBefore = new Set([...prevCoverage.untracked.map((u) => u.id), ...prevCoverage.warm, ...prevCoverage.quiet]);
  const sweep = await listIds(token, `in:sent newer_than:${COVERAGE_DAYS}d`, 3).catch(() => null);
  for (const id of sweep || []) if (!checkedBefore.has(id)) urgent.add(id);

  // 3. New addresses (a record you just added, a manager just linked): their last months of mail.
  const fresh = Array.from(book.keys()).filter((e) => !done.has(e));
  for (const group of chunk(fresh, 15)) {
    if (Date.now() > deadline - 8_000) { complete = false; break; }
    later.push({ marker: group, ids: await listIds(token, searchFor(group, BACKFILL_DAYS), 5) });
  }
  if (!done.has(DRIVE_SHARES_DONE) && Date.now() < deadline - 8_000) {
    later.push({ marker: [DRIVE_SHARES_DONE], ids: await listIds(token, `from:(drive-shares-dm-noreply@google.com OR drive-shares-noreply@google.com) newer_than:${BACKFILL_DAYS}d`, 2) });
  }

  // 4. Skip what's stored; read the rest (headers only), urgent first; match and save.
  const all = Array.from(new Set([...urgent, ...later.flatMap((g) => g.ids)]));
  const known = new Set<string>();
  for (const part of chunk(all, 300)) {
    const { data } = await admin.from("email_events").select("gmail_id").eq("user_id", row.user_id).in("gmail_id", part);
    (data || []).forEach((r) => known.add(r.gmail_id));
  }
  const MAX_NEW_PER_RUN = 300;
  const todoAll = all.filter((id) => !known.has(id));
  const todo = todoAll.slice(0, MAX_NEW_PER_RUN);
  if (todoAll.length > todo.length) complete = false;
  const tried = new Set<string>();
  const metas = await fetchMetas(token, todo, deadline, tried);
  if (tried.size < todo.length) complete = false;
  const matched = await matchAll(admin, row.user_id, metas, book, own, mailbox);
  const rows = await dropCrossMailboxDuplicates(admin, row.user_id, matched);
  await storeEvents(admin, rows);
  const matchedIds = new Set(matched.map((r) => r.gmail_id));

  // 5. Your answers to people who emailed you first; their enquiries wait for the read phase.
  const leadReplies = await trackLeadReplies(admin, row.user_id, token, metas.filter((m) => !matchedIds.has(m.id)), own, mailbox, true, deadline).catch(() => ({ updated: 0, backfilled: false }));
  const candidates = metas.filter((m) => !matchedIds.has(m.id) && !isOutgoing(m, own) && precheck(scanInput(m, own)).ok).map((m) => m.id);

  // 6. Managers and teams the mail revealed, then statuses.
  const linked = await learnTeams(admin, row.user_id, rows, own, book).catch(() => 0);
  const changed = await applyStatuses(admin, row.user_id, Array.from(new Set(rows.map((r) => r.entity_id))));

  // 7. Commit. A backfill group counts as done only when every one of its emails was read.
  const seen = (id: string) => known.has(id) || tried.has(id);
  const finished = later.filter((g) => g.ids.every(seen)).flatMap((g) => g.marker);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { last_sync_at: now, updated_at: now, sync_error: "", backfilled: Array.from(new Set([...done, ...finished])).slice(-5000) };
  if (candidates.length) patch.lead_queue = Array.from(new Set([...(row.lead_queue || []), ...candidates])).slice(-LEAD_QUEUE_MAX);
  if (sweep) {
    const coverage = await measureCoverage(admin, row.user_id, sweep, metas, prevCoverage, own, book).catch(() => null);
    if (coverage) patch.coverage = coverage;
  }
  if (complete || !row.history_id) {
    const profile = await gmail<{ historyId?: string }>(token, "/profile");
    if (complete || !historyId) patch.history_id = profile.historyId || historyId;
  } else if (historyId && records.length) {
    // Not everything was read: move past the records whose mail all was.
    let upTo = "";
    for (const r of records) {
      if (!r.ids.every(seen)) break;
      upTo = r.id;
    }
    if (upTo && BigInt(upTo) > BigInt(historyId)) patch.history_id = upTo;
  }
  let { error } = await admin.from("gmail_tokens").update(patch).eq("id", row.id);
  if (error && /lead_queue/.test(error.message)) { delete patch.lead_queue; ({ error } = await admin.from("gmail_tokens").update(patch).eq("id", row.id)); }
  Object.assign(row, patch);
  return { mailbox, messages: metas.length, events: rows.length, leads: leadReplies.updated, linked, statusChanges: changed, scheduledChanges: scheduled.sent + scheduled.cancelled, complete, pending: todoAll.length - tried.size };
}

async function readMailbox(admin: Admin, row: TokenRow, own: Set<string>, book: Map<string, Entity[]>, deadline: number) {
  const token = await accessToken(admin, row);
  const mailbox = mailboxOf(row);
  const done = new Set((row.backfilled || []).map((e) => e.toLowerCase()));
  const markers: string[] = [];
  const patch: Record<string, unknown> = {};

  // a. Once per mailbox: read every creator email again with the better price rules.
  if (!done.has(REREAD_DONE)) {
    const { error: reset } = await admin.from("email_events").update({ intel_at: null }).eq("user_id", row.user_id).eq("mailbox", mailbox).eq("entity_type", "creator");
    if (!reset) markers.push(REREAD_DONE);
  }

  // b. Inbound leads: the first month (inbox AND spam) once, then whatever track queued.
  let queue = [...(row.lead_queue || [])];
  if (!row.leads_scanned_at && Date.now() < deadline - 20_000) {
    const ids = await listIds(token, `{in:inbox in:spam} newer_than:${LEAD_LOOKBACK_DAYS}d -category:promotions -category:social -category:forums -in:chats`, 2).catch(() => null);
    if (ids) { queue = Array.from(new Set([...queue, ...ids])).slice(-LEAD_QUEUE_MAX); patch.leads_scanned_at = new Date().toISOString(); }
  }
  let leads = 0;
  if (queue.length && Date.now() < deadline - 15_000) {
    const take = queue.slice(0, 12);
    const metas = await fetchMetas(token, take, deadline - 10_000);
    const found = await findLeads(admin, row.user_id, token, metas, own, book, deadline - 8_000).catch(() => []);
    leads = await storeLeads(admin, row.user_id, mailbox, found).catch(() => 0);
    queue = queue.slice(take.length);
  }
  patch.lead_queue = queue;

  // c. Once per mailbox: your older answers to leads, and replies from other addresses in your threads.
  if (!done.has(LEAD_REPLIES_DONE) && Date.now() < deadline - 20_000) {
    const r = await trackLeadReplies(admin, row.user_id, token, [], own, mailbox, false, deadline - 15_000).catch(() => ({ updated: 0, backfilled: false }));
    if (r.backfilled) markers.push(LEAD_REPLIES_DONE);
    leads += r.updated;
  }
  const threadScan = await scanOldThreads(admin, row, token, own, mailbox, done, deadline - 20_000).catch(() => ({ rows: [] as EventRow[], marker: [] as string[] }));
  markers.push(...threadScan.marker);

  // d. Creators' mail: media kits, prices, agreed rates, a manager they point you to. Newest first.
  const budget = { files: 4, ai: 8, bytes: 10 * 1024 * 1024 };
  const get: Fetcher = (path) => gmail(token, path);
  const { data: prof } = await admin.from("profiles").select("preferences").eq("id", row.user_id).maybeSingle();
  const currency = String(((prof?.preferences || {}) as { currency?: string }).currency || "USD").toUpperCase();
  const { data: recentMail } = await admin.from("email_events").select("gmail_id, entity_id, direction, at").eq("user_id", row.user_id).eq("mailbox", mailbox).eq("entity_type", "creator").eq("scheduled", false).is("intel_at", null).gte("at", new Date(Date.now() - 3 * 86400000).toISOString()).order("at", { ascending: false }).limit(10);
  let filesSaved = 0;
  const checked: string[] = [];
  for (const ev of (recentMail || []).reverse()) {
    if (Date.now() > deadline - 10_000) break;
    if (!(await claim(admin, row.user_id, ev.gmail_id))) continue;
    const message = await gmail<FullMessage>(token, `/messages/${ev.gmail_id}?format=full`).catch(() => null);
    if (!message) { await unclaim(admin, row.user_id, ev.gmail_id); continue; }
    if (ev.direction === "in") {
      const ref = referralOf(bodyOf(message).text, [...own, ...addresses(message.payload?.headers?.find((h) => h.name.toLowerCase() === "from")?.value || "")]);
      if (ref) await linkTeam(admin, row.user_id, ev.entity_id, ref.email, ref.role, "they pointed you to them in their email", own).catch(() => false);
    }
    const read = ev.direction === "out" ? processMyMail : processCreatorMail;
    const res = await read({ admin, userId: row.user_id, mailbox, currency, message, creatorId: ev.entity_id, get, budget }).catch(() => ({ files: 0, changes: 0, deferred: false }));
    filesSaved += res.files;
    if (res.deferred) await unclaim(admin, row.user_id, ev.gmail_id);
    else checked.push(ev.gmail_id);
  }
  filesSaved += await backfillCreatorMail({ admin, userId: row.user_id, mailbox, currency, get, budget, deadline: deadline - 12_000, checked, max: 8 }).catch(() => 0);
  for (const part of chunk(checked, 200)) await admin.from("email_events").update({ intel_at: new Date().toISOString() }).eq("user_id", row.user_id).in("gmail_id", part);

  // d2. AI second opinion on replies (said no? who wrote it?), when there's quota.
  await aiReadReplies(admin, row.user_id, token, mailbox, budget, deadline - 10_000).catch(() => 0);

  // d3. Deals agreed before their kit's prices were on file: give them the kit's asking price (their real %).
  if (Date.now() < deadline - 10_000) await repairKitLists(admin, row.user_id, currency).catch(() => 0);
  // d4. Deals measured from a counter instead of their first asking price: put the % right.
  if (Date.now() < deadline - 10_000) await repairAnchors(admin, row.user_id).catch(() => 0);
  // d5. Tracked mail that left Gmail since the CRM saw it (Trash / deleted for good) — older mail, a little each run.
  if (Date.now() < deadline - 10_000) await sweepGone(admin, row.user_id, token, mailbox, deadline - 8_000).catch(() => 0);

  // e. Files waiting for the AI.
  const aiRead = budget.ai > 0 && Date.now() < deadline - 10_000 ? await drainQueue({ admin, userId: row.user_id, currency, mailbox, get, max: Math.min(3, budget.ai), deadline: deadline - 8_000 }).catch(() => 0) : 0;

  // f. Tracking check: sends to people outside the CRM that are really warm-up traffic.
  const coverage = readCoverage(row.coverage);
  const unsure = coverage.untracked.filter((u) => !coverage.warm.includes(u.id)).slice(0, 15);
  const warmNow: string[] = [];
  for (const u of unsure) {
    if (Date.now() > deadline - 6_000) break;
    const full = await gmail<FullMessage>(token, `/messages/${u.id}?format=full`).catch(() => null);
    if (full && isWarmup(bodyOf(full).text)) warmNow.push(u.id);
  }
  if (warmNow.length) patch.coverage = { ...coverage, warm: [...coverage.warm, ...warmNow].slice(-500), untracked: coverage.untracked.filter((u) => !warmNow.includes(u.id)), sent: Math.max(0, coverage.sent - warmNow.length), warmup: coverage.warmup + warmNow.length };

  // g. Self-heal: statuses of anything with mail in the last 14 days.
  const { data: recent } = await admin.from("email_events").select("entity_id").eq("user_id", row.user_id).gte("at", new Date(Date.now() - 14 * 86400000).toISOString()).limit(2000);
  const changed = Date.now() < deadline - 3_000 ? await applyStatuses(admin, row.user_id, Array.from(new Set([...(recent || []).map((r) => r.entity_id), ...threadScan.rows.map((r) => r.entity_id)]))) : 0;

  if (markers.length) patch.backfilled = Array.from(new Set([...(markers.some((b) => b.startsWith(THREAD_SCAN_AT)) ? Array.from(done).filter((b) => !b.startsWith(THREAD_SCAN_AT)) : Array.from(done)), ...markers])).slice(-5000);
  patch.read_at = new Date().toISOString();
  let { error } = await admin.from("gmail_tokens").update(patch).eq("id", row.id);
  if (error && /lead_queue|read_at/.test(error.message)) { delete patch.lead_queue; delete patch.read_at; ({ error } = await admin.from("gmail_tokens").update(patch).eq("id", row.id)); }
  return { mailbox, leads, files: filesSaved, aiRead, statusChanges: changed, events: threadScan.rows.length };
}

async function recordError(admin: Admin, row: TokenRow, e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  // last_sync_at means "last successful sync" — leave it alone on failure so
  // the UI shows the truth. updated_at is the last attempt, so a mailbox that
  // failed moves to the back of the queue instead of starving the others.
  await admin.from("gmail_tokens").update({ sync_error: message.slice(0, 300), updated_at: new Date().toISOString() }).eq("id", row.id);
  return message;
}

type SyncError = { mailbox: string; error: string; reconnect: boolean; status: number; retryable: boolean };
const errorOf = async (admin: Admin, row: TokenRow, e: unknown): Promise<SyncError> => ({ mailbox: mailboxOf(row), error: await recordError(admin, row, e), reconnect: e instanceof GmailError && e.reconnect, status: e instanceof GmailError ? e.status : 0, retryable: e instanceof GmailError && e.retryable });

/** Track every mailbox of one user (each gets its own time, the least recent first), then read the ones due. */
async function syncUser(admin: Admin, rows: TokenRow[], allRows: TokenRow[], deadline: number, opts: { force: boolean; read: "now" | "due" | "later" }) {
  const own = new Set(allRows.map(mailboxOf).filter(Boolean));
  const book = await addressBook(admin, allRows[0].user_id, own);
  const results: Record<string, unknown>[] = [];
  const errors: SyncError[] = [];
  const queue = [...rows].sort((a, b) => (a.last_sync_at || "").localeCompare(b.last_sync_at || ""));
  let deferred = 0;
  for (let i = 0; i < queue.length; i++) {
    const row = queue[i];
    const left = deadline - Date.now();
    if (left < 6_000) { deferred = queue.length - i; break; }
    if (!opts.force && row.last_sync_at && Date.now() - new Date(row.last_sync_at).getTime() < USER_MIN_INTERVAL_MS - 10_000) continue;
    if (!(await lease(admin, row.id, "track_lock_until", TRACK_LEASE_MS))) continue; // another run is tracking it right now
    try {
      // A fair share of the time for each mailbox still waiting, so none starves.
      results.push(await trackMailbox(admin, row, own, book, Date.now() + Math.max(8_000, Math.floor(left / (queue.length - i)))));
    } catch (e) {
      errors.push(await errorOf(admin, row, e));
    } finally {
      await release(admin, row.id, "track_lock_until");
    }
  }
  // A shared manager's mail filed under the wrong creator: move it first, so nothing below acts on it.
  if (deadline - Date.now() > 5_000) await rehomeTeamMail(admin, allRows[0].user_id, book, own).catch(() => 0);
  // Their reply just landed before a scheduled bump of yours went out: cancel it now.
  if (deadline - Date.now() > 5_000) await autoCancelCrossed(admin, allRows[0].user_id, allRows).catch(() => 0);
  if (deadline - Date.now() > 5_000) await rereadReplies(admin, allRows[0].user_id).catch(() => 0);
  const readAll = async (until: number) => {
    const due = [...rows].filter((r) => opts.read === "now" || !r.read_at || Date.now() - new Date(r.read_at).getTime() >= READ_EVERY_MS).sort((a, b) => (a.read_at || "").localeCompare(b.read_at || ""));
    const out: Record<string, unknown>[] = [];
    for (const row of due) {
      if (until - Date.now() < 15_000) break;
      if (!(await lease(admin, row.id, "read_lock_until", READ_LEASE_MS))) continue;
      try {
        out.push(await readMailbox(admin, row, own, book, Math.min(until, Date.now() + 45_000)));
      } catch {
        // reading is best effort; tracking already saved everything that counts
      } finally {
        await release(admin, row.id, "read_lock_until");
      }
    }
    return out;
  };
  return { results, errors, deferred, readAll };
}

// ----- sending ------------------------------------------------------------------

const b64url = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64 = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
// No CR/LF can reach a header: that is how header injection works.
const clean = (value: unknown, max: number) => String(value ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
const recipients = (value: unknown) => {
  const list = (Array.isArray(value) ? value : String(value ?? "").split(/[,;]/)).map((v) => clean(v, 254)).filter(Boolean);
  if (list.length > 20 || list.some((e) => !VALID_EMAIL.test(e))) throw new GmailError("Check the recipient addresses.", 400);
  return list;
};

async function pickSender(admin: Admin, rows: TokenRow[], input: Record<string, unknown>, threadId: string) {
  if (typeof input.mailboxId === "string" && input.mailboxId) {
    const row = rows.find((r) => r.id === input.mailboxId);
    if (!row) throw new GmailError("That mailbox isn't connected to your account.", 403);
    return row;
  }
  if (threadId) {
    // Gmail thread ids belong to one mailbox: reply from the one that has it.
    const { data } = await admin.from("email_events").select("mailbox").eq("user_id", rows[0].user_id).eq("thread_id", threadId).neq("mailbox", "").limit(1).maybeSingle();
    const row = data?.mailbox ? rows.find((r) => mailboxOf(r) === data.mailbox) : undefined;
    if (row) return row;
  }
  return rows.find((r) => (r.scopes || "").includes("gmail.send")) || rows[0];
}

async function send(admin: Admin, rows: TokenRow[], input: Record<string, unknown>) {
  const threadId = typeof input.threadId === "string" && /^[0-9a-f]{6,40}$/i.test(input.threadId) ? input.threadId : "";
  const row = await pickSender(admin, rows, input, threadId);
  if (!(row.scopes || "").includes("gmail.send")) throw new GmailError(`Sending wasn't allowed when ${row.email || "this mailbox"} was connected — reconnect it and tick “Send email on your behalf”.`, 403, true);
  const today = new Date().toISOString().slice(0, 10);
  const sentToday = row.send_day === today ? row.send_count || 0 : 0;
  if (sentToday >= SENDS_PER_DAY) throw new GmailError(`Daily sending limit reached for ${row.email} (${SENDS_PER_DAY}). It resets tomorrow.`, 429);
  const token = await accessToken(admin, row);
  const to = recipients(input.to);
  const cc = input.cc ? recipients(input.cc) : [];
  if (!to.length) throw new GmailError("Add a recipient.", 400);
  let subject = clean(input.subject, 300);
  const body = String(input.body ?? "").slice(0, 100_000);
  const headers = [`To: ${to.join(", ")}`, ...(cc.length ? [`Cc: ${cc.join(", ")}`] : [])];
  if (threadId) {
    // Reply in the same thread: Gmail and the recipient's mail app keep the conversation together.
    const thread = await gmail<{ messages?: Meta[] }>(token, `/threads/${threadId}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=Subject&metadataHeaders=References`).catch(() => null);
    const last = thread?.messages?.[thread.messages.length - 1];
    const messageId = last ? clean(header(last, "Message-ID"), 500) : "";
    const refs = last ? clean(header(last, "References"), 2000) : "";
    if (messageId) headers.push(`In-Reply-To: ${messageId}`, `References: ${[refs, messageId].filter(Boolean).join(" ")}`);
    const original = last ? clean(header(last, "Subject"), 300) : "";
    if (!subject) subject = original && !/^re:/i.test(original) ? `Re: ${original}` : original;
  }
  headers.push(`Subject: =?UTF-8?B?${b64(subject)}?=`, "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64");
  const raw = `${headers.join("\r\n")}\r\n\r\n${b64(body).replace(/(.{76})/g, "$1\r\n")}`;
  const sent = await gmail<{ id: string; threadId: string }>(token, "/messages/send", { method: "POST", body: JSON.stringify({ raw: b64url(new TextEncoder().encode(raw)), ...(threadId ? { threadId } : {}) }) });
  await admin.from("gmail_tokens").update({ send_day: today, send_count: sentToday + 1 }).eq("id", row.id);
  // Record it right away so the CRM updates without waiting for the next sync.
  const own = new Set(rows.map(mailboxOf).filter(Boolean));
  const book = await addressBook(admin, row.user_id, own);
  const meta = await gmail<Meta>(token, META_PATH(sent.id)).catch(() => null);
  const events = meta ? await matchAll(admin, row.user_id, [{ ...meta, labelIds: Array.from(new Set([...(meta.labelIds || []), "SENT"])) }], book, own, mailboxOf(row)) : [];
  if (events.length) await storeEvents(admin, events).catch(() => undefined);
  const changed = await applyStatuses(admin, row.user_id, events.map((r) => r.entity_id));
  return { id: sent.id, threadId: sent.threadId, from: row.email, events: events.length, statusChanges: changed };
}

// ----- entry -----------------------------------------------------------------------

// ----- instant Gmail (Pub/Sub push) ---------------------------------------------
//
// With GMAIL_PUBSUB_TOPIC ("projects/<id>/topics/<name>") and GMAIL_PUSH_SA (the
// service account the push subscription signs with) set, every mailbox asks
// Gmail to announce changes on that topic (users.watch, renewed daily — a
// watch lasts 7 days). Pub/Sub POSTs each announcement here with a Google-
// signed token; it is verified (signature, issuer, audience, service account)
// and the mailbox's track phase runs within seconds. The every-minute cron
// stays as the safety net, so nothing depends on a push arriving.

const PUSH_TOPIC = () => (Deno.env.get("GMAIL_PUBSUB_TOPIC") || "").trim();
const PUSH_SA = () => (Deno.env.get("GMAIL_PUSH_SA") || "").trim().toLowerCase();
const pushAudience = () => (Deno.env.get("GMAIL_PUSH_AUDIENCE") || `${(Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "")}/functions/v1/gmail-sync`).trim();
let googleKeys: { at: number; keys: Map<string, CryptoKey> } | null = null;
const b64urlBytes = (text: string) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4)), (c) => c.charCodeAt(0));

/** A Google-signed OIDC token from our push subscription, or false. */
async function verifyPushToken(auth: string): Promise<boolean> {
  const sa = PUSH_SA();
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!sa || !token) return false;
  const [h, p, sig] = token.split(".");
  if (!h || !p || !sig) return false;
  let header: { kid?: string; alg?: string }, claims: { iss?: string; aud?: string; exp?: number; iat?: number; email?: string; email_verified?: boolean };
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlBytes(h)));
    claims = JSON.parse(new TextDecoder().decode(b64urlBytes(p)));
  } catch {
    return false;
  }
  if (header.alg !== "RS256" || !header.kid) return false;
  const now = Date.now() / 1000;
  if (!["https://accounts.google.com", "accounts.google.com"].includes(claims.iss || "") || claims.aud !== pushAudience() || !claims.exp || claims.exp < now - 30 || (claims.iat || 0) > now + 300) return false;
  if ((claims.email || "").toLowerCase() !== sa || claims.email_verified !== true) return false;
  if (!googleKeys || Date.now() - googleKeys.at > 3600_000 || !googleKeys.keys.has(header.kid)) {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/certs", { signal: AbortSignal.timeout(8_000) }).catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) as { keys?: (JsonWebKey & { kid?: string })[] } | null : null;
    if (!body?.keys) return false;
    const keys = new Map<string, CryptoKey>();
    for (const k of body.keys) if (k.kid) keys.set(k.kid, await crypto.subtle.importKey("jwk", k, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]));
    googleKeys = { at: Date.now(), keys };
  }
  const key = googleKeys.keys.get(header.kid);
  if (!key) return false;
  return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(sig), new TextEncoder().encode(`${h}.${p}`));
}

/** Ask Gmail to announce this mailbox's changes (renewed a day before it lapses). */
async function ensureWatch(admin: Admin, row: TokenRow) {
  const topic = PUSH_TOPIC();
  if (!topic || !/^projects\/[\w-]+\/topics\/[\w.-]+$/.test(topic)) return false;
  const until = row.watch_expires_at ? new Date(row.watch_expires_at).getTime() : 0;
  if (until - Date.now() > 24 * 3600_000) return false;
  const token = await accessToken(admin, row);
  const res = await gmail<{ historyId?: string; expiration?: string }>(token, "/watch", { method: "POST", body: JSON.stringify({ topicName: topic }) });
  await admin.from("gmail_tokens").update({ watch_expires_at: new Date(Number(res.expiration) || Date.now() + 6 * 86400000).toISOString() }).eq("id", row.id);
  return true;
}

const publicMailbox = (r: TokenRow) => ({ id: r.id, email: r.email, canRead: (r.scopes || "").includes("gmail.readonly"), canSend: (r.scopes || "").includes("gmail.send"), canModify: (r.scopes || "").includes("gmail.modify"), lastSyncAt: r.last_sync_at, error: r.sync_error || "", connectedAt: r.connected_at || null, sentToday: r.send_day === new Date().toISOString().slice(0, 10) ? r.send_count || 0 : 0, coverage: r.coverage && (r.coverage as { at?: string }).at ? readCoverage(r.coverage) : null });

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  useKeyStore(admin);
  const configured = !!(Deno.env.get("GOOGLE_CLIENT_ID") && Deno.env.get("GOOGLE_CLIENT_SECRET") && Deno.env.get("GMAIL_OAUTH_REDIRECT_URI"));
  let input: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text.length > 200_000) return json({ error: "Request too large" }, 413);
    input = text ? JSON.parse(text) : {};
    if (!input || typeof input !== "object" || Array.isArray(input)) input = {};
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const action = String(input.action || "status");

  // A Gmail change announced through Pub/Sub: verified, answered at once, tracked right after.
  if (input.message && typeof input.message === "object" && typeof input.subscription === "string") {
    if (!(await verifyPushToken(req.headers.get("Authorization") || ""))) return json({ error: "Unauthorized" }, 401);
    let address = "";
    try { address = String(JSON.parse(atob(String((input.message as { data?: string }).data || ""))).emailAddress || "").toLowerCase(); } catch { /* malformed: acknowledged, nothing to do */ }
    if (!configured || !VALID_EMAIL.test(address)) return new Response(null, { status: 204, headers: cors });
    const work = (async () => {
      const { data: hit } = await admin.from("gmail_tokens").select("*").eq("email", address).limit(5);
      for (const row of (hit || []) as TokenRow[]) {
        // A burst of announcements: one track every few seconds is plenty (the lease stops overlaps).
        if (row.last_sync_at && Date.now() - new Date(row.last_sync_at).getTime() < 5_000) continue;
        const { data: all } = await admin.from("gmail_tokens").select("*").eq("user_id", row.user_id);
        const { data: member } = await admin.from("profiles").select("access").eq("id", row.user_id).maybeSingle();
        if (member?.access && member.access !== "approved") continue;
        await syncUser(admin, [row], (all || [row]) as TokenRow[], Date.now() + 25_000, { force: true, read: "later" }).catch(() => null);
      }
    })();
    // deno-lint-ignore no-explicit-any
    const runtime = (globalThis as any).EdgeRuntime as { waitUntil?: (p: Promise<unknown>) => void } | undefined;
    if (runtime?.waitUntil) runtime.waitUntil(work);
    else await work;
    return new Response(null, { status: 204, headers: cors });
  }

  if (action === "health") return json({ configured });

  // The cron secret lives in Vault (checked by a service-role-only function);
  // an env secret also works for self-hosted setups.
  const cronAllowed = async () => {
    const given = req.headers.get("x-cron-secret") || "";
    if (timingSafeEqual(given, Deno.env.get("GMAIL_CRON_SECRET") || "")) return true;
    if (given.length < 32) return false;
    const { data } = await admin.rpc("gmail_cron_secret_ok", { p_secret: given });
    return data === true;
  };

  // Server-side health check of every AI provider (same secret as cron). Answers carry no keys.
  if (action === "ai_check") {
    if (!(await cronAllowed())) return json({ error: "Unauthorized" }, 401);
    // Which models a provider offers this account (ids only), to pick working defaults.
    if (input.list === "groq") {
      const key = (Deno.env.get("GROQ_API_KEYS") || Deno.env.get("GROQ_API_KEY") || "").split(/[\s,;]+/)[0];
      const res = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${key}` } }).catch(() => null);
      const body = res?.ok ? await res.json().catch(() => null) as { data?: { id: string; active?: boolean }[] } | null : null;
      return json({ status: res?.status || 0, models: (body?.data || []).filter((m) => m.active !== false).map((m) => m.id).sort() });
    }
    return json({ chain: await aiChain(), results: await testAi() });
  }

  if (action === "cron") {
    if (!(await cronAllowed())) return json({ error: "Unauthorized" }, 401);
    if (!configured) return json({ skipped: "not configured" });
    // Runs every minute: first TRACK every mailbox (seconds each, least
    // recently synced first), then READ the ones due with the time left.
    const started = Date.now();
    const trackUntil = started + 38_000;
    const readUntil = started + 55_000;
    const { data } = await admin.from("gmail_tokens").select("*").order("last_sync_at", { ascending: true, nullsFirst: true }).limit(500);
    const { data: members } = await admin.from("profiles").select("id, access").in("id", Array.from(new Set(((data || []) as TokenRow[]).map((r) => r.user_id))));
    const approved = new Set((members || []).filter((m) => !m.access || m.access === "approved").map((m) => m.id));
    const byUser = new Map<string, TokenRow[]>();
    for (const row of (data || []) as TokenRow[]) if (approved.has(row.user_id)) byUser.set(row.user_id, [...(byUser.get(row.user_id) || []), row]);
    // Instant Gmail: keep every mailbox's watch alive (no-op without the topic secret).
    if (PUSH_TOPIC()) for (const rows of byUser.values()) for (const row of rows) if (Date.now() < trackUntil - 20_000) await ensureWatch(admin, row).catch(() => false);
    let tracked = 0, read = 0;
    const readers: ((until: number) => Promise<Record<string, unknown>[]>)[] = [];
    const users = Array.from(byUser.values());
    for (let i = 0; i < users.length; i++) {
      const rows = users[i];
      const left = trackUntil - Date.now();
      if (left < 6_000) break;
      const due = rows.filter((r) => !r.last_sync_at || Date.now() - new Date(r.last_sync_at).getTime() >= 45_000);
      try {
        const run = await syncUser(admin, due, rows, Date.now() + Math.max(10_000, Math.floor(left / (users.length - i))), { force: true, read: "due" });
        tracked += run.results.length;
        readers.push(run.readAll);
      } catch {
        // one user's trouble never stops everyone else's sync
      }
    }
    for (const readAll of readers) {
      if (readUntil - Date.now() < 15_000) break;
      read += (await readAll(readUntil).catch(() => [])).length;
    }
    return json({ users: byUser.size, tracked, read, ms: Date.now() - started });
  }

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const { data: userData, error: userError } = await createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } }).auth.getUser();
  if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;
  // Private circle: only approved members use Gmail through the CRM.
  const { data: member } = await admin.from("profiles").select("access").eq("id", userId).maybeSingle();
  if (member && member.access && member.access !== "approved") return json({ error: "Your access is waiting for the owner's approval.", code: "not_approved" }, 403);
  const { data } = await admin.from("gmail_tokens").select("*").eq("user_id", userId).order("connected_at", { ascending: true, nullsFirst: true }).limit(MAX_MAILBOXES);
  const rows = (data || []) as TokenRow[];
  const first = rows[0];

  const fetcherFor = (mailbox: string): Fetcher | null => {
    const row = rows.find((r) => mailboxOf(r) === mailbox);
    return row ? async <T,>(path: string) => gmail<T>(await accessToken(admin, row), path) : null;
  };
  const currencyOf = async () => {
    const { data: prof } = await admin.from("profiles").select("preferences").eq("id", userId).maybeSingle();
    return String(((prof?.preferences || {}) as { currency?: string }).currency || "USD").toUpperCase();
  };
  const validId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

  if (action === "analyze_file") {
    if (!validId(input.id)) return json({ error: "Invalid file" }, 400);
    const result = await analyzeStoredFile(admin, userId, input.id, await currencyOf(), fetcherFor).catch(() => ({ error: "Couldn't check the file." }));
    return json(result, "error" in result && result.error && !("queued" in result) ? 422 : 200);
  }

  if (action === "download_file") {
    if (!validId(input.id)) return json({ error: "Invalid file" }, 400);
    const { data: file } = await admin.from("creator_files").select("filename, mime, storage, gmail_id, part_id, mailbox").eq("id", input.id).eq("user_id", userId).maybeSingle();
    if (!file || file.storage !== "gmail") return json({ error: "File not found." }, 404);
    const get = fetcherFor(file.mailbox);
    if (!get) return json({ error: `Reconnect ${file.mailbox} to download this file.` }, 409);
    const bytes = await gmailAttachment(get, file.gmail_id, file.part_id).catch(() => null);
    const mime = bytes ? sniff(bytes) : null;
    if (!bytes || mime !== file.mime) return json({ error: "The email or attachment is no longer in Gmail." }, 410);
    return new Response(bytes as Uint8Array<ArrayBuffer>, { headers: { ...cors, "Content-Type": file.mime, "Content-Disposition": `attachment; filename="${String(file.filename).replace(/[^\w.\- ()]/g, "_")}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }

  if (action === "rescan_creator") {
    if (!validId(input.id)) return json({ error: "Invalid influencer" }, 400);
    const { data: creator } = await admin.from("creators").select("id").eq("id", input.id).eq("user_id", userId).maybeSingle();
    if (!creator) return json({ error: "Influencer not found." }, 404);
    if (!rows.length) return json({ error: "Connect Gmail first.", code: "not_connected" }, 409);
    await admin.from("email_events").update({ intel_at: null }).eq("user_id", userId).eq("entity_id", input.id);
    const currency = await currencyOf();
    const budget = { files: 10, ai: 6, bytes: 30 * 1024 * 1024 };
    const deadline = Date.now() + 80_000;
    let files = 0;
    let left = 0;
    for (const row of rows) {
      const get = fetcherFor(mailboxOf(row))!;
      const checked: string[] = [];
      files += await backfillCreatorMail({ admin, userId, mailbox: mailboxOf(row), currency, get, budget, deadline, checked, creatorId: input.id, max: 15 }).catch(() => 0);
      for (const part of chunk(checked, 200)) await admin.from("email_events").update({ intel_at: new Date().toISOString() }).eq("user_id", userId).in("gmail_id", part);
    }
    const { count } = await admin.from("email_events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("entity_id", input.id).eq("direction", "in").is("intel_at", null);
    left = count || 0;
    const { count: total } = await admin.from("email_events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("entity_id", input.id).eq("direction", "in");
    return json({ ok: true, files, emails: total || 0, left });
  }

  if (action === "status") {
    const mailboxes = rows.map(publicMailbox);
    const readyAt = await aiReadyAt().catch(() => 0);
    const ai = { ai: aiEnabled(), aiProvider: aiProvider(), aiModel: aiModel(), aiKeys: aiKeyCount(), aiReadyAt: readyAt ? new Date(readyAt).toISOString() : null, aiChain: await aiChain().catch(() => []) };
    if (!first) return json({ configured, connected: false, mailboxes, ...ai });
    // Top-level fields describe the first mailbox (older app versions read them).
    return json({ configured, connected: true, ...publicMailbox(first), mailboxes, maxMailboxes: MAX_MAILBOXES, ...ai });
  }

  if (action === "import_assist") {
    // Spreadsheet import: only headers, a few masked sample values and status
    // words come in; the answer is checked against the CRM's own field list.
    if (!aiEnabled()) return json({ error: "AI isn't set up on the server.", code: "no_ai" }, 503);
    const kind = input.kind === "brand" ? "brand" : "creator";
    const text = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").slice(0, max);
    const headers = (Array.isArray(input.headers) ? input.headers : []).slice(0, 60).map((h) => text(h, 60));
    const columns = (Array.isArray(input.columns) ? input.columns : []).slice(0, 40).map((c) => (c && typeof c === "object" ? c as Record<string, unknown> : {})).filter((c) => Number.isInteger(c.index) && Number(c.index) >= 0 && Number(c.index) < 500).map((c) => ({ index: Number(c.index), header: text(c.header, 60), samples: (Array.isArray(c.samples) ? c.samples : []).slice(0, 4).map((v) => text(v, 60)) }));
    const statuses = (Array.isArray(input.statuses) ? input.statuses : []).slice(0, 40).map((v) => text(v, 60)).filter(Boolean);
    if (!columns.length && !statuses.length) return json({ ok: true, columns: [], statuses: [] });
    try {
      const plan = await planImport({ kind, headers, columns, statuses });
      return plan ? json({ ok: true, ...plan }) : json({ error: "The AI couldn't read the sheet — the rules' plan is kept." }, 502);
    } catch (e) {
      return json({ error: e instanceof QuotaExhausted ? "Every AI provider is out of quota for now — the rules' plan is kept." : "The AI didn't answer — the rules' plan is kept." }, e instanceof QuotaExhausted ? 429 : 502);
    }
  }

  if (action === "ai_test") {
    // Each provider and model, for real: a tiny text question and (where there's a vision model) a tiny image.
    const results = await testAi();
    return json({ ok: results.length > 0 && results.some((r) => r.ok), results });
  }

  if (action === "disconnect") {
    const targets = input.all === true ? rows : rows.filter((r) => r.id === input.id || (!input.id && rows.length === 1));
    if (!targets.length && rows.length) return json({ error: "Pick which mailbox to disconnect." }, 400);
    for (const row of targets) {
      if (PUSH_TOPIC() && row.watch_expires_at) await accessToken(admin, row).then((t) => gmail(t, "/stop", { method: "POST" })).catch(() => null);
      const refresh = await openToken(admin, row.refresh_token).catch(() => null);
      if (refresh) await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: refresh }) }).catch(() => null);
      await admin.from("gmail_tokens").delete().eq("id", row.id).eq("user_id", userId);
      if (input.clearHistory === true) {
        await admin.from("email_events").delete().eq("user_id", userId).eq("mailbox", mailboxOf(row));
        await admin.from("inbound_leads").delete().eq("user_id", userId).eq("mailbox", mailboxOf(row)).eq("status", "new");
      }
    }
    const remaining = rows.length - targets.length;
    if (input.clearHistory === true && remaining === 0) await admin.from("email_events").delete().eq("user_id", userId).eq("mailbox", "");
    await admin.from("profiles").update({ gmail_connected: remaining > 0 }).eq("id", userId);
    return json({ connected: remaining > 0, removed: targets.map((r) => r.email) });
  }

  if (!configured) return json({ error: "Gmail isn't set up on the server yet.", code: "not_configured" }, 503);
  if (!first) return json({ error: "Connect Gmail first.", code: "not_connected" }, 409);

  if (action === "sync") {
    // Track now and answer; the heavier reading carries on after the answer.
    const { results, errors, deferred, readAll } = await syncUser(admin, rows, rows, Date.now() + 40_000, { force: input.force === true, read: "due" });
    const later = readAll(Date.now() + 60_000).catch(() => []);
    // deno-lint-ignore no-explicit-any
    const runtime = (globalThis as any).EdgeRuntime as { waitUntil?: (p: Promise<unknown>) => void } | undefined;
    if (runtime?.waitUntil) runtime.waitUntil(later);
    else await later;
    const sum = (key: string) => results.reduce((s, r) => s + Number(r[key] || 0), 0);
    if (!results.length && !errors.length) return json({ skipped: true, deferred });
    const failed = errors.length > 0 && !results.length;
    // A rate limit is a temporary, retryable condition, not a server fault:
    // return 429 so the UI and logs describe it correctly.
    const status = !failed ? 200 : errors[0].reconnect ? 409 : errors[0].retryable ? 429 : 502;
    return json({ ok: errors.length === 0, events: sum("events"), leads: sum("leads"), files: sum("files"), statusChanges: sum("statusChanges"), scheduledChanges: sum("scheduledChanges"), mailboxes: results.length, deferred, errors, ...(failed ? { error: errors[0].error, reconnect: errors[0].reconnect } : {}) }, status);
  }

  if (action === "cancel_scheduled") {
    // Only a row of YOURS that is still scheduled, in a mailbox of yours that
    // granted gmail.modify. Gmail cancels a scheduled send when it is trashed;
    // it stays in Trash for 30 days (nothing is deleted forever).
    const gmailId = typeof input.gmailId === "string" && /^[0-9a-f]{6,40}$/i.test(input.gmailId) ? input.gmailId : "";
    if (!gmailId) return json({ error: "Invalid email" }, 400);
    const res = await cancelScheduledSend(admin, userId, rows, gmailId, "manual");
    return "ok" in res ? json({ ok: true }) : json({ error: res.error, ...(res.code ? { code: res.code } : {}) }, res.status);
  }

  if (action === "send") {
    try {
      return json({ ok: true, ...(await send(admin, rows, input)) });
    } catch (e) {
      const status = e instanceof GmailError && e.status >= 400 && e.status < 500 ? e.status : 502;
      return json({ error: e instanceof Error ? e.message : "Couldn't send", reconnect: e instanceof GmailError && e.reconnect }, status);
    }
  }

  return json({ error: "Unknown action" }, 400);
});
