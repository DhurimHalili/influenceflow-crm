import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { isSealed, openToken, sealToken } from "../_shared/googleTokens.ts";
import { aiEnabled, aiKeyCount, aiModel, aiProvider, aiReadyAt, classifyLead, testAi, useKeyStore } from "../_shared/ai.ts";
import { decodeEntities, precheck, scanForLead, type Lead, type ScanInput } from "../_shared/leadScanner.ts";
import { classifyIncoming, myReplyIntent, type IncomingKind } from "../_shared/replyReader.ts";
import { analyzeStoredFile, bodyOf, drainQueue, gmailAttachment, processCreatorMail, processMyMail, sniff, type Fetcher, type FullMessage } from "./intel.ts";

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
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : new URL(APP_URL).origin,
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
const USER_MIN_INTERVAL_MS = 60_000;
const RUN_BUDGET_MS = 110_000;
const SENDS_PER_DAY = 400; // per mailbox, well under Gmail's own limits
const MAX_MAILBOXES = 5;

type Admin = SupabaseClient;
type TokenRow = { id: string; user_id: string; access_token: string | null; refresh_token: string; expiry: string | null; email: string | null; scopes: string; history_id: string | null; last_sync_at: string | null; backfilled: string[] | null; sync_error?: string; connected_at?: string | null; updated_at?: string | null; send_day?: string | null; send_count?: number; leads_scanned_at?: string | null; coverage?: unknown };
type Entity = { type: "creator" | "brand"; id: string };
type Meta = { id: string; threadId: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: { headers?: { name: string; value: string }[] } };
type EventRow = { user_id: string; gmail_id: string; thread_id: string; direction: "out" | "in"; entity_type: "creator" | "brand"; entity_id: string; counterpart: string; subject: string; snippet: string; at: string; mailbox: string; message_key: string; scheduled: boolean; reply_kind: IncomingKind; in_reply_to: string };
/** Gmail thread → the CRM records already in it (per mailbox: thread ids belong to one). */
type ThreadBook = Map<string, Entity[]>;
// Columns added by later migrations: a database without them still gets the mail.
const LATE_COLUMNS = ["reply_kind", "in_reply_to", "scheduled"] as const;

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
// at once. Every call is paced per mailbox to ~100 units/s (a message read is 5,
// a thread 10, a send 100), so a sync never trips the limit instead of
// tripping it and backing off.
const pacing = new Map<string, number>();
const unitsFor = (path: string, init?: RequestInit) => (init?.method === "POST" ? (path.includes("/send") ? 100 : 5) : path.startsWith("/threads/") ? 10 : path.startsWith("/history") ? 2 : 5);
async function pace(token: string, units: number) {
  const now = Date.now();
  const at = Math.max(now, pacing.get(token) || 0);
  pacing.set(token, at + units * 10);
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
    admin.from("creators").select("id, contact_email, secondary_email").eq("user_id", userId).is("archived_at", null),
    admin.from("brands").select("id, contact_email, secondary_email").eq("user_id", userId).is("archived_at", null),
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
  for (const c of creators.data || []) { add(c.contact_email, { type: "creator", id: c.id }); add(c.secondary_email, { type: "creator", id: c.id }); }
  for (const b of brands.data || []) { add(b.contact_email, { type: "brand", id: b.id }); add(b.secondary_email, { type: "brand", id: b.id }); }
  for (const p of contacts.data || []) if (p.brand_id) add(p.email, { type: "brand", id: p.brand_id });
  return map;
}

const DRIVE_SHARE = /drive-shares-(dm-)?noreply@google\.com/i;
const DRIVE_SHARES_DONE = "__drive_shares_v1";
const isOutgoing = (meta: Meta, own: Set<string>) => (meta.labelIds || []).includes("SENT") || addresses(header(meta, "From")).some((e) => own.has(e));
const sentAt = (meta: Meta) => (meta.internalDate ? new Date(Number(meta.internalDate)) : new Date(header(meta, "Date") || Date.now())).toISOString();
/** Dated more than a minute ahead: a scheduled send that hasn't gone out. */
const isFuture = (meta: Meta) => Number(meta.internalDate || 0) > Date.now() + 60_000;

function eventsFor(meta: Meta, userId: string, book: Map<string, Entity[]>, own: Set<string>, mailbox: string, threads?: ThreadBook): EventRow[] {
  const labels = meta.labelIds || [];
  if (labels.some((l) => l === "DRAFT" || l === "SPAM" || l === "TRASH" || l === "CHAT")) return [];
  const out = isOutgoing(meta, own);
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
    const reply_kind: IncomingKind = out ? "" : classifyIncoming({ headers: headersOf(meta), subject, text: snippet, fromOther });
    rows.push({ user_id: userId, gmail_id: meta.id, thread_id: meta.threadId || "", direction: out ? "out" : "in", entity_type: entity.type, entity_id: entity.id, counterpart: email, subject, snippet, at, mailbox, message_key: messageKey(meta), scheduled, reply_kind, in_reply_to: replyToKey(meta) });
  };
  for (const email of counterparts) for (const entity of book.get(email) || []) push(entity, email, false);
  // Nobody known on it, but it belongs to a conversation you're tracking: their
  // manager, agency or team answered from another address (or you wrote to them).
  // Your own colleagues (same company domain) are never "their side".
  if (!rows.length && meta.threadId && threads?.has(meta.threadId)) {
    const team = ownDomains(own);
    const other = counterparts.find((e) => !team.has(e.split("@")[1] || "") && !/(^|[.@])(mailer-daemon|postmaster)/i.test(e));
    if (other) for (const entity of threads.get(meta.threadId) || []) push(entity, other, true);
  }
  return rows;
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
  const direct = metas.flatMap((m) => eventsFor(m, userId, book, own, mailbox));
  const threads = await threadBook(admin, userId, mailbox, metas.map((m) => m.threadId));
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

async function fetchMetas(token: string, ids: string[], deadline: number) {
  const metas: Meta[] = [];
  for (let i = 0; i < ids.length; i += 5) {
    if (Date.now() > deadline) break;
    try {
      const batch = await Promise.all(ids.slice(i, i + 5).map((id) => gmail<Meta>(token, META_PATH(id)).catch((e) => (e instanceof GmailError && e.status === 404 ? null : Promise.reject(e)))));
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
const LABEL: Record<string, string> = { contacted: "Contacted", inbound: "Inbound", replied: "Replied" };
/** A new email this long after you marked them Denied reopens the conversation. */
const REOPEN_AFTER_MS = 14 * 86400000;

async function applyStatuses(admin: Admin, userId: string, entityIds: string[]) {
  if (!entityIds.length) return 0;
  let changed = 0;
  const nowIso = new Date().toISOString();
  for (const ids of chunk(entityIds, 100)) {
    const since = new Date(Date.now() - BACKFILL_DAYS * 86400000).toISOString();
    const [{ data: events }, { data: creators }, { data: brands }] = await Promise.all([
      admin.from("email_events").select("*").eq("user_id", userId).in("entity_id", ids).gte("at", since).order("at", { ascending: true }),
      admin.from("creators").select("id, name, pipeline_status, status_updated_at, date_contacted, archived_at").eq("user_id", userId).in("id", ids),
      admin.from("brands").select("id, name, pipeline_status, status_updated_at, date_contacted, archived_at").eq("user_id", userId).in("id", ids),
    ]);
    const records = [...(creators || []).map((r) => ({ ...r, table: "creators" as const, kind: "creator" as const })), ...(brands || []).map((r) => ({ ...r, table: "brands" as const, kind: "brand" as const }))];
    for (const record of records) {
      if (record.archived_at) continue;
      const changedAt = record.status_updated_at ? new Date(record.status_updated_at).getTime() : 0;
      let status = record.pipeline_status as string;
      let at: string | null = null;
      let why = "";
      let first: string | null = null;
      for (const ev of (events || []).filter((e) => e.entity_id === record.id)) {
        first = first || ev.at;
        // Only mail newer than your last status change can move it.
        if (new Date(ev.at).getTime() <= changedAt) continue;
        // An out-of-office, or their management turning it down for them, is not a reply.
        if (ev.direction === "in" && (ev.reply_kind === "auto" || ev.reply_kind === "managed_no")) continue;
        // Writing again to someone who passed, weeks later (not a quick "thanks
        // anyway"), reopens the conversation: the follow-ups start over.
        const reopen = status === "denied" && ev.direction === "out" && !ev.scheduled && new Date(ev.at).getTime() - changedAt >= REOPEN_AFTER_MS ? "contacted" : "";
        const next = reopen || NEXT[status]?.[ev.direction as "out" | "in"];
        if (next) {
          status = next;
          // A scheduled email carries its future send time; a status change is never dated ahead.
          at = ev.at > nowIso ? nowIso : ev.at;
          const via = ev.mailbox ? ` (${ev.mailbox})` : "";
          why = reopen ? `you emailed again after they passed — “${ev.subject || "(no subject)"}”${via}` : ev.direction === "out" ? `you emailed “${ev.subject || "(no subject)"}”${via}` : `they emailed “${ev.subject || "(no subject)"}”${via}`;
        }
      }
      if (!at || status === record.pipeline_status) continue;
      const patch: Record<string, unknown> = { pipeline_status: status, status_updated_at: at, status_source: "gmail" };
      if (!record.date_contacted) patch.date_contacted = (first || at).slice(0, 10);
      const { error } = await admin.from(record.table).update(patch).eq("id", record.id).eq("user_id", userId).eq("pipeline_status", record.pipeline_status);
      if (error) continue;
      changed++;
      await admin.from("activities").insert({ user_id: userId, text: `Gmail: ${record.name} moved to ${LABEL[status] || status} — ${why}`.slice(0, 500), at: new Date().toISOString(), entity_type: record.kind, entity_id: record.id });
    }
  }
  return changed;
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
async function recheckScheduled(admin: Admin, userId: string, token: string, mailbox: string, deadline: number) {
  // What Gmail says is waiting right now — also catches rows stored as sent
  // before scheduled sends were told apart.
  const listed = await listIds(token, "in:scheduled", 3).then((ids) => ids, () => null);
  const waiting = listed || [];
  const waitingSet = new Set(waiting);
  for (const part of chunk(waiting, 200)) await admin.from("email_events").update({ scheduled: true }).eq("user_id", userId).eq("mailbox", mailbox).eq("direction", "out").eq("scheduled", false).in("gmail_id", part);
  const { data, error } = await admin.from("email_events").select("gmail_id, entity_id, entity_type, direction").eq("user_id", userId).eq("mailbox", mailbox).eq("scheduled", true).limit(300);
  if (error || !data?.length) return { sent: 0, cancelled: 0 };
  let sent = 0;
  const gone: string[] = [];
  for (const ids of chunk(Array.from(new Set(data.map((r) => r.gmail_id as string))), 10)) {
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
  if (!gone.length) return { sent, cancelled: 0 };
  await admin.from("email_events").delete().eq("user_id", userId).in("gmail_id", gone);
  const records = Array.from(new Map(data.filter((r) => gone.includes(r.gmail_id) && r.direction === "out").map((r) => [r.entity_id as string, r.entity_type as "creator" | "brand"])).entries());
  for (const [id, type] of records) await undoScheduledStatus(admin, userId, type, id);
  return { sent, cancelled: gone.length };
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
  const ins = (mail || []).filter((m) => m.direction === "in" && m.reply_kind !== "auto" && m.reply_kind !== "managed_no").length + (logged || []).filter((f) => f.kind === "reply").length;
  if (outs > 0) return;
  const back = record.pipeline_status === "contacted" && ins === 0 ? "new" : record.pipeline_status === "replied" && ins > 0 ? "inbound" : "";
  if (!back) return;
  const patch: Record<string, unknown> = { pipeline_status: back, status_updated_at: new Date().toISOString(), status_source: "gmail" };
  if (back === "new") patch.date_contacted = null;
  const { error } = await admin.from(table).update(patch).eq("id", id).eq("user_id", userId).eq("pipeline_status", record.pipeline_status);
  if (error) return;
  await admin.from("activities").insert({ user_id: userId, text: `Gmail: the scheduled email to ${record.name} was cancelled — moved back to ${back === "new" ? "New" : "Inbound"}`.slice(0, 500), at: new Date().toISOString(), entity_type: type, entity_id: id });
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
const COVERAGE_DAYS = 2;
type Untracked = { id: string; to: string[]; at: string; subject: string };
type Coverage = { at: string; days: number; sent: number; tracked: number; pending: number; untracked: Untracked[] };
const readCoverage = (value: unknown): Coverage => {
  const v = (value && typeof value === "object" ? value : {}) as Partial<Coverage>;
  const untracked = (Array.isArray(v.untracked) ? v.untracked : [])
    .filter((u): u is Untracked => !!u && typeof u.id === "string" && Array.isArray(u.to))
    .map((u) => ({ id: u.id, to: u.to.filter((e) => typeof e === "string").slice(0, 5), at: String(u.at || ""), subject: String(u.subject || "").slice(0, 120) }));
  return { at: String(v.at || ""), days: COVERAGE_DAYS, sent: Number(v.sent) || 0, tracked: Number(v.tracked) || 0, pending: Number(v.pending) || 0, untracked };
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
  let sent = 0, tracked = 0, pending = 0;
  const untracked: Untracked[] = [];
  for (const id of sweep) {
    if (stored.has(id)) { sent++; tracked++; continue; }
    const meta = fetched.get(id);
    const known = meta
      ? { id, to: [...addresses(header(meta, "To")), ...addresses(header(meta, "Cc"))].filter(outside).slice(0, 5), at: sentAt(meta), subject: decodeEntities(header(meta, "Subject")).slice(0, 120) }
      : before.get(id);
    if (!known) { pending++; sent++; continue; }
    if (!known.to.length) continue; // only to yourself or your team: not outreach
    sent++;
    if (known.to.some((e) => leads.has(e))) { tracked++; continue; }
    // In your CRM (just added — the next sync's backfill brings it in — or the
    // same email already counted from your other mailbox).
    if (known.to.some((e) => book.has(e))) { tracked++; continue; }
    untracked.push(known);
  }
  return { at: new Date().toISOString(), days: COVERAGE_DAYS, sent, tracked, pending, untracked: untracked.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200) };
}

// ----- one mailbox's sync -------------------------------------------------------

async function syncMailbox(admin: Admin, row: TokenRow, own: Set<string>, book: Map<string, Entity[]>, deadline: number) {
  const token = await accessToken(admin, row);
  if (!(row.scopes || "").includes("gmail.readonly")) throw new GmailError("Gmail read access wasn't granted — reconnect this mailbox and tick “Read your email”.", 403, true);
  const mailbox = mailboxOf(row);
  // 0. Scheduled sends from earlier runs: gone out, still waiting, or cancelled?
  //    (First, so a cancelled one is gone before its sent twin is stored.)
  const scheduled = await recheckScheduled(admin, row.user_id, token, mailbox, deadline - 60_000).catch(() => ({ sent: 0, cancelled: 0 }));
  const all = Array.from(book.keys());
  const done = new Set((row.backfilled || []).map((e) => e.toLowerCase()));
  const fresh = all.filter((e) => !done.has(e));
  const ids = new Set<string>();
  let complete = true;

  // 1. New addresses (or a first connection): look back over the last months.
  const backfilled: string[] = [];
  for (const group of chunk(fresh, 15)) {
    if (Date.now() > deadline) { complete = false; break; }
    (await listIds(token, searchFor(group, BACKFILL_DAYS), 5)).forEach((id) => ids.add(id));
    backfilled.push(...group);
  }

  // 1b. Once per mailbox: files creators shared through Google Drive (sent by Google, not by them).
  if (!done.has(DRIVE_SHARES_DONE) && Date.now() < deadline) {
    (await listIds(token, `from:(drive-shares-dm-noreply@google.com OR drive-shares-noreply@google.com) newer_than:${BACKFILL_DAYS}d`, 2)).forEach((id) => ids.add(id));
    backfilled.push(DRIVE_SHARES_DONE);
  }

  // 2. First time: look through the last month of the primary inbox for people
  //    who reached out and aren't in the CRM yet.
  let leadsScanned = !!row.leads_scanned_at;
  if (!leadsScanned && Date.now() < deadline) {
    (await listIds(token, `in:inbox newer_than:${LEAD_LOOKBACK_DAYS}d -category:promotions -category:social -category:forums -in:chats`, 2)).forEach((id) => ids.add(id));
    leadsScanned = true;
  }

  // 3. Everything since the last run, via Gmail's change history.
  let historyId = row.history_id;
  if (historyId) {
    try {
      let pageToken = "";
      for (let page = 0; page < 20; page++) {
        // messageAdded = new mail; labelAdded catches mail that only became
        // "sent" later — a draft you sent, or a scheduled email going out.
        const params = new URLSearchParams({ startHistoryId: historyId, maxResults: "500" });
        params.append("historyTypes", "messageAdded");
        params.append("historyTypes", "labelAdded");
        if (pageToken) params.set("pageToken", pageToken);
        const res = await gmail<{ history?: { messagesAdded?: { message: { id: string } }[]; labelsAdded?: { message: { id: string }; labelIds?: string[] }[] }[]; nextPageToken?: string; historyId?: string }>(token, `/history?${params}`);
        for (const h of res.history || []) {
          for (const m of h.messagesAdded || []) ids.add(m.message.id);
          for (const l of h.labelsAdded || []) if ((l.labelIds || []).some((x) => x === "SENT" || x === "SCHEDULED" || x === "INBOX")) ids.add(l.message.id);
        }
        if (!res.nextPageToken) break;
        pageToken = res.nextPageToken;
        if (Date.now() > deadline) { complete = false; break; }
      }
    } catch (e) {
      // Limited mid-way: keep what came in; the old history id stays, so nothing is skipped.
      if (e instanceof GmailError && e.retryable) complete = false;
      // History too old (or reset): fall back to a short search on every address.
      else if (!(e instanceof GmailError) || e.status !== 404) throw e;
      else {
      historyId = null;
      for (const group of chunk(all, 15)) {
        if (Date.now() > deadline) { complete = false; break; }
        (await listIds(token, searchFor(group, 10), 3)).forEach((id) => ids.add(id));
      }
      }
    }
  }

  // 3b. Safety net, every run: everything you sent in the last 2 days. Anything
  //     the history missed is picked up here. Emails already checked that
  //     aren't to anyone in your CRM are skipped (they're listed in the
  //     tracking check instead).
  const prevCoverage = readCoverage(row.coverage);
  const checkedBefore = new Set(prevCoverage.untracked.map((u) => u.id));
  const sweep = Date.now() < deadline - 50_000 ? await listIds(token, `in:sent newer_than:${COVERAGE_DAYS}d`, 3).catch(() => null) : null;
  for (const id of sweep || []) if (!checkedBefore.has(id)) ids.add(id);

  // 4. Skip messages already stored, read the rest (headers only), match them.
  const list = Array.from(ids);
  const known = new Set<string>();
  for (const part of chunk(list, 300)) {
    const { data } = await admin.from("email_events").select("gmail_id").eq("user_id", row.user_id).in("gmail_id", part);
    (data || []).forEach((r) => known.add(r.gmail_id));
  }
  // A long history (or a mailbox that was offline for a while) can contain
  // thousands of messages. Gmail's per-minute query quota is shared by every
  // mailbox of the user, so process a bounded batch: the stored ids are
  // skipped next run, which makes the backlog drain without re-fetching it.
  const MAX_NEW_PER_RUN = 300;
  const todoAll = list.filter((id) => !known.has(id));
  const todo = todoAll.slice(0, MAX_NEW_PER_RUN);
  if (todoAll.length > todo.length) complete = false;
  const metas = await fetchMetas(token, todo, deadline);
  if (metas.length < todo.length) complete = false;
  const matched = await matchAll(admin, row.user_id, metas, book, own, mailbox);
  const rows = await dropCrossMailboxDuplicates(admin, row.user_id, matched);
  await storeEvents(admin, rows);

  // 4b. Once per mailbox: replies that came back from another address (a
  //     manager or agency answering for a creator) before threads were matched.
  const threadScan = await scanOldThreads(admin, row, token, own, mailbox, done, deadline - 40_000).catch(() => ({ rows: [] as EventRow[], marker: [] as string[] }));
  rows.push(...threadScan.rows);
  backfilled.push(...threadScan.marker);

  // 4c. Your answers to people who emailed you first (inbound leads).
  const leadReplies = await trackLeadReplies(admin, row.user_id, token, metas.filter((m) => !matched.some((r) => r.gmail_id === m.id)), own, mailbox, done.has(LEAD_REPLIES_DONE), deadline - 30_000).catch(() => ({ updated: 0, backfilled: false }));
  if (leadReplies.backfilled) backfilled.push(LEAD_REPLIES_DONE);

  // 5. Mail from people who aren't in the CRM: is it a real enquiry?
  const matchedIds = new Set(matched.map((r) => r.gmail_id));
  const found = await findLeads(admin, row.user_id, token, metas.filter((m) => !matchedIds.has(m.id)), own, book, deadline).catch(() => []);
  const leads = await storeLeads(admin, row.user_id, mailbox, found).catch(() => 0);

  // 5a. Once per mailbox: read every creator email again with the better price
  //     rules (durations, bundles, extended integrations) and your own replies.
  //     The backfill below works through them, a slice per run.
  if (!done.has(REREAD_DONE)) {
    const { error: reset } = await admin.from("email_events").update({ intel_at: null }).eq("user_id", row.user_id).eq("mailbox", mailbox).eq("entity_type", "creator");
    if (!reset) backfilled.push(REREAD_DONE);
  }

  // 5b. New mail from creators in the CRM: media kits, prices, agreed rates (newest first, capped per run).
  const budget = { files: 8, ai: 12, bytes: 24 * 1024 * 1024 };
  const get: Fetcher = (path) => gmail(token, path);
  const { data: prof } = await admin.from("profiles").select("preferences").eq("id", row.user_id).maybeSingle();
  const currency = String(((prof?.preferences || {}) as { currency?: string }).currency || "USD").toUpperCase();
  // Newest 15, then read oldest first: their price list before your "looks good".
  const creatorMail = Array.from(new Map(rows.filter((r) => r.entity_type === "creator" && !r.scheduled).sort((a, b) => b.at.localeCompare(a.at)).map((r) => [r.gmail_id, r])).values()).slice(0, 15).reverse();
  let filesSaved = 0;
  const checked: string[] = [];
  for (const ev of creatorMail) {
    if (Date.now() > deadline) break;
    if (!(await claim(admin, row.user_id, ev.gmail_id))) continue; // another sync has it
    const message = await gmail<FullMessage>(token, `/messages/${ev.gmail_id}?format=full`).catch(() => null);
    if (!message) { await unclaim(admin, row.user_id, ev.gmail_id); continue; } // picked up again by the backfill
    const read = ev.direction === "out" ? processMyMail : processCreatorMail;
    const res = await read({ admin, userId: row.user_id, mailbox, currency, message, creatorId: ev.entity_id, get, budget }).catch(() => ({ files: 0, changes: 0, deferred: false }));
    filesSaved += res.files;
    if (res.deferred) await unclaim(admin, row.user_id, ev.gmail_id);
    else checked.push(ev.gmail_id);
  }

  // 5c. Older mail from creators that was never checked (kits sent before this
  //     existed): roster and live deals first, each creator's mail oldest → newest.
  filesSaved += await backfillCreatorMail({ admin, userId: row.user_id, mailbox, currency, get, budget, deadline: deadline - 15_000, checked });
  for (const part of chunk(checked, 200)) await admin.from("email_events").update({ intel_at: new Date().toISOString() }).eq("user_id", row.user_id).in("gmail_id", part);

  // 5d. Files waiting for the AI (it was off or out of quota when they arrived).
  const aiRead = budget.ai > 0 && (await aiReadyAt()) === 0 ? await drainQueue({ admin, userId: row.user_id, currency, mailbox, get, max: Math.min(4, budget.ai), deadline: deadline - 10_000 }).catch(() => 0) : 0;

  // 6. Move statuses (self-healing: also re-checks anything with recent mail).
  const { data: recent } = await admin.from("email_events").select("entity_id").eq("user_id", row.user_id).gte("at", new Date(Date.now() - 14 * 86400000).toISOString()).limit(2000);
  const touched = Array.from(new Set([...rows.map((r) => r.entity_id), ...(recent || []).map((r) => r.entity_id)]));
  const changed = await applyStatuses(admin, row.user_id, touched);

  // 7. Remember where we got to. An unfinished run keeps the old history id so
  //    the next run picks up exactly where this one stopped.
  const now = new Date().toISOString();
  // A new thread-scan cursor replaces the old one.
  const keep = backfilled.some((b) => b.startsWith(THREAD_SCAN_AT)) ? Array.from(done).filter((b) => !b.startsWith(THREAD_SCAN_AT)) : Array.from(done);
  const patch: Record<string, unknown> = { last_sync_at: now, updated_at: now, sync_error: "", backfilled: Array.from(new Set([...keep, ...backfilled])).slice(-5000) };
  if (sweep) {
    const coverage = await measureCoverage(admin, row.user_id, sweep, metas, prevCoverage, own, book).catch(() => null);
    if (coverage) patch.coverage = coverage;
  }
  if (leadsScanned && !row.leads_scanned_at && complete) patch.leads_scanned_at = new Date().toISOString();
  if (complete || !row.history_id) {
    const profile = await gmail<{ historyId?: string; emailAddress?: string }>(token, "/profile");
    if (complete || !historyId) patch.history_id = profile.historyId || historyId;
  }
  await admin.from("gmail_tokens").update(patch).eq("id", row.id);
  return { mailbox, messages: metas.length, events: rows.length, leads: leads + leadReplies.updated, files: filesSaved, aiRead, statusChanges: changed, scheduledChanges: scheduled.sent + scheduled.cancelled, complete };
}

async function recordError(admin: Admin, row: TokenRow, e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  // last_sync_at means "last successful sync" — leave it alone on failure so
  // the UI shows the truth. updated_at is the last attempt, so a mailbox that
  // failed moves to the back of the queue instead of starving the others.
  await admin.from("gmail_tokens").update({ sync_error: message.slice(0, 300), updated_at: new Date().toISOString() }).eq("id", row.id);
  return message;
}

async function syncUser(admin: Admin, rows: TokenRow[], allRows: TokenRow[], deadline: number, force: boolean) {
  const own = new Set(allRows.map(mailboxOf).filter(Boolean));
  const book = await addressBook(admin, allRows[0].user_id, own);
  const results: Record<string, unknown>[] = [];
  const errors: { mailbox: string; error: string; reconnect: boolean; status: number; retryable: boolean }[] = [];
  // Each connected mailbox is its own Google account with its own quota, and
  // every call is paced (see pace()), so mailboxes sync one after another in
  // the same run; the one touched least recently goes first.
  let deferred = 0;
  const queue = [...rows].sort((a, b) => (a.updated_at || a.last_sync_at || a.connected_at || "").localeCompare(b.updated_at || b.last_sync_at || b.connected_at || ""));
  for (let i = 0; i < queue.length; i++) {
    const row = queue[i];
    if (Date.now() > deadline - 5_000) { deferred = queue.length - i; break; }
    if (!force && row.last_sync_at && Date.now() - new Date(row.last_sync_at).getTime() < USER_MIN_INTERVAL_MS) continue;
    try {
      results.push(await syncMailbox(admin, row, own, book, deadline));
    } catch (e) {
      errors.push({ mailbox: mailboxOf(row), error: await recordError(admin, row, e), reconnect: e instanceof GmailError && e.reconnect, status: e instanceof GmailError ? e.status : 0, retryable: e instanceof GmailError && e.retryable });
    }
  }
  return { results, errors, deferred };
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

  if (action === "health") return json({ configured });

  if (action === "cron") {
    // The secret lives in Vault (checked by a service-role-only function); an
    // env secret also works for self-hosted setups.
    const given = req.headers.get("x-cron-secret") || "";
    let allowed = timingSafeEqual(given, Deno.env.get("GMAIL_CRON_SECRET") || "");
    if (!allowed && given.length >= 32) {
      const { data } = await admin.rpc("gmail_cron_secret_ok", { p_secret: given });
      allowed = data === true;
    }
    if (!allowed) return json({ error: "Unauthorized" }, 401);
    if (!configured) return json({ skipped: "not configured" });
    const deadline = Date.now() + RUN_BUDGET_MS;
    const { data } = await admin.from("gmail_tokens").select("*").order("updated_at", { ascending: true, nullsFirst: true }).limit(500);
    const byUser = new Map<string, TokenRow[]>();
    for (const row of (data || []) as TokenRow[]) byUser.set(row.user_id, [...(byUser.get(row.user_id) || []), row]);
    let mailboxes = 0;
    for (const rows of byUser.values()) {
      if (Date.now() > deadline - 10_000) break;
      const due = rows.filter((r) => !r.updated_at || Date.now() - new Date(r.updated_at).getTime() >= 4 * 60_000);
      if (!due.length) continue;
      try {
        const { results } = await syncUser(admin, due, rows, Math.min(deadline, Date.now() + 45_000), true);
        mailboxes += results.length;
      } catch {
        // one user's trouble never stops everyone else's sync
      }
    }
    return json({ users: byUser.size, mailboxes });
  }

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const { data: userData, error: userError } = await createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } }).auth.getUser();
  if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;
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
    const ai = { ai: aiEnabled(), aiProvider: aiProvider(), aiModel: aiModel(), aiKeys: aiKeyCount(), aiReadyAt: readyAt ? new Date(readyAt).toISOString() : null };
    if (!first) return json({ configured, connected: false, mailboxes, ...ai });
    // Top-level fields describe the first mailbox (older app versions read them).
    return json({ configured, connected: true, ...publicMailbox(first), mailboxes, maxMailboxes: MAX_MAILBOXES, ...ai });
  }

  if (action === "ai_test") {
    const result = await testAi(typeof input.model === "string" ? input.model : undefined, input.structured === true);
    return json(result, result.ok ? 200 : 502);
  }

  if (action === "disconnect") {
    const targets = input.all === true ? rows : rows.filter((r) => r.id === input.id || (!input.id && rows.length === 1));
    if (!targets.length && rows.length) return json({ error: "Pick which mailbox to disconnect." }, 400);
    for (const row of targets) {
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
    const { results, errors, deferred } = await syncUser(admin, rows, rows, Date.now() + RUN_BUDGET_MS, input.force === true);
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
    const { data: ev } = await admin.from("email_events").select("gmail_id, mailbox, scheduled, direction, entity_id, entity_type").eq("user_id", userId).eq("gmail_id", gmailId).eq("direction", "out").limit(1).maybeSingle();
    if (!ev) return json({ error: "That email isn't in your CRM." }, 404);
    if (!ev.scheduled) return json({ error: "That email has already gone out." }, 409);
    const row = rows.find((r) => mailboxOf(r) === ev.mailbox);
    if (!row) return json({ error: `Reconnect ${ev.mailbox} to cancel it from here.` }, 409);
    if (!(row.scopes || "").includes("gmail.modify")) return json({ error: `Reconnect ${ev.mailbox} and allow “Manage drafts and send” to cancel from the CRM.`, code: "needs_modify" }, 403);
    try {
      const token = await accessToken(admin, row);
      // Not found = already gone in Gmail; any other trouble stops here so nothing is forgotten that would still send.
      const meta = await gmail<Meta>(token, META_PATH(gmailId)).catch((e) => (e instanceof GmailError && e.status === 404 ? null : Promise.reject(e)));
      const labels = meta?.labelIds || [];
      if (meta && !(labels.includes("SCHEDULED") && !labels.includes("SENT"))) return json({ error: "That email has already gone out." }, 409);
      if (meta) await gmail(token, `/messages/${gmailId}/trash`, { method: "POST" });
      await admin.from("email_events").delete().eq("user_id", userId).eq("gmail_id", gmailId);
      await undoScheduledStatus(admin, userId, ev.entity_type, ev.entity_id);
      await admin.from("activities").insert({ user_id: userId, text: `Cancelled a scheduled email (it's in Gmail's Trash for 30 days)`, at: new Date().toISOString(), entity_type: ev.entity_type, entity_id: ev.entity_id });
      return json({ ok: true });
    } catch (e) {
      const status = e instanceof GmailError && e.status >= 400 && e.status < 500 ? e.status : 502;
      return json({ error: e instanceof Error ? e.message : "Couldn't cancel it" }, status);
    }
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
