import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { isSealed, openToken, sealToken } from "../_shared/googleTokens.ts";
import { aiEnabled, classifyLead } from "../_shared/ai.ts";
import { decodeEntities, precheck, scanForLead, type Lead, type ScanInput } from "../_shared/leadScanner.ts";
import { analyzeStoredFile, bodyOf, processCreatorMail, type FullMessage } from "./intel.ts";

// Gmail ⇄ CRM sync, for every mailbox a user connected (an agency often runs
// two or three).
//
// Actions (POST JSON, user JWT unless noted):
//   status      — the connected mailboxes: address, scopes, last sync, last error
//   sync        — pull new mail for all of this user's mailboxes now (rate-limited)
//   send        — send an email from one mailbox (optionally as a reply in a thread)
//   disconnect  — revoke Google access for one mailbox and forget its tokens
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
const USER_MIN_INTERVAL_MS = 20_000;
const RUN_BUDGET_MS = 110_000;
const SENDS_PER_DAY = 400; // per mailbox, well under Gmail's own limits
const MAX_MAILBOXES = 5;

type Admin = SupabaseClient;
type TokenRow = { id: string; user_id: string; access_token: string | null; refresh_token: string; expiry: string | null; email: string | null; scopes: string; history_id: string | null; last_sync_at: string | null; backfilled: string[] | null; sync_error?: string; connected_at?: string | null; send_day?: string | null; send_count?: number; leads_scanned_at?: string | null };
type Entity = { type: "creator" | "brand"; id: string };
type Meta = { id: string; threadId: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: { headers?: { name: string; value: string }[] } };
type EventRow = { user_id: string; gmail_id: string; thread_id: string; direction: "out" | "in"; entity_type: "creator" | "brand"; entity_id: string; counterpart: string; subject: string; snippet: string; at: string; mailbox: string; message_key: string };

class GmailError extends Error {
  constructor(message: string, public status = 0, public reconnect = false) {
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
const messageKey = (meta: Meta) => header(meta, "Message-ID").trim().replace(/^<|>$/g, "").toLowerCase().slice(0, 300);
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

async function gmail<T>(token: string, path: string, init?: RequestInit, attempt = 0): Promise<T> {
  const res = await fetch(`${GMAIL}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) } });
  if (res.status === 429 || res.status >= 500) {
    if (attempt < 3) {
      await sleep(400 * 2 ** attempt + Math.random() * 200);
      return gmail(token, path, init, attempt + 1);
    }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GmailError(`Gmail ${res.status}: ${text.slice(0, 200)}`, res.status, res.status === 401);
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

const isOutgoing = (meta: Meta, own: Set<string>) => (meta.labelIds || []).includes("SENT") || addresses(header(meta, "From")).some((e) => own.has(e));
const sentAt = (meta: Meta) => (meta.internalDate ? new Date(Number(meta.internalDate)) : new Date(header(meta, "Date") || Date.now())).toISOString();

function eventsFor(meta: Meta, userId: string, book: Map<string, Entity[]>, own: Set<string>, mailbox: string): EventRow[] {
  const labels = meta.labelIds || [];
  if (labels.some((l) => l === "DRAFT" || l === "SPAM" || l === "TRASH" || l === "CHAT")) return [];
  const out = isOutgoing(meta, own);
  const counterparts = (out ? [...addresses(header(meta, "To")), ...addresses(header(meta, "Cc"))] : addresses(header(meta, "From"))).filter((e) => !own.has(e));
  const at = sentAt(meta);
  const rows: EventRow[] = [];
  const seen = new Set<string>();
  for (const email of counterparts) {
    for (const entity of book.get(email) || []) {
      if (seen.has(entity.id)) continue;
      seen.add(entity.id);
      rows.push({ user_id: userId, gmail_id: meta.id, thread_id: meta.threadId || "", direction: out ? "out" : "in", entity_type: entity.type, entity_id: entity.id, counterpart: email, subject: decodeEntities(header(meta, "Subject")).slice(0, 300), snippet: decodeEntities(meta.snippet || "").slice(0, 240), at, mailbox, message_key: messageKey(meta) });
    }
  }
  return rows;
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
  for (let i = 0; i < ids.length; i += 10) {
    if (Date.now() > deadline) break;
    const batch = await Promise.all(ids.slice(i, i + 10).map((id) => gmail<Meta>(token, META_PATH(id)).catch((e) => (e instanceof GmailError && e.status === 404 ? null : Promise.reject(e)))));
    metas.push(...(batch.filter(Boolean) as Meta[]));
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
    if (aiEnabled()) {
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

async function applyStatuses(admin: Admin, userId: string, entityIds: string[]) {
  if (!entityIds.length) return 0;
  let changed = 0;
  for (const ids of chunk(entityIds, 100)) {
    const since = new Date(Date.now() - BACKFILL_DAYS * 86400000).toISOString();
    const [{ data: events }, { data: creators }, { data: brands }] = await Promise.all([
      admin.from("email_events").select("entity_id, entity_type, direction, at, subject, mailbox").eq("user_id", userId).in("entity_id", ids).gte("at", since).order("at", { ascending: true }),
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
        const next = NEXT[status]?.[ev.direction as "out" | "in"];
        if (next) {
          status = next;
          at = ev.at;
          const via = ev.mailbox ? ` (${ev.mailbox})` : "";
          why = ev.direction === "out" ? `you emailed “${ev.subject || "(no subject)"}”${via}` : `they emailed “${ev.subject || "(no subject)"}”${via}`;
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

// ----- one mailbox's sync -------------------------------------------------------

async function syncMailbox(admin: Admin, row: TokenRow, own: Set<string>, book: Map<string, Entity[]>, deadline: number) {
  const token = await accessToken(admin, row);
  if (!(row.scopes || "").includes("gmail.readonly")) throw new GmailError("Gmail read access wasn't granted — reconnect this mailbox and tick “Read your email”.", 403, true);
  const mailbox = mailboxOf(row);
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
        const params = new URLSearchParams({ startHistoryId: historyId, historyTypes: "messageAdded", maxResults: "500" });
        if (pageToken) params.set("pageToken", pageToken);
        const res = await gmail<{ history?: { messagesAdded?: { message: { id: string } }[] }[]; nextPageToken?: string; historyId?: string }>(token, `/history?${params}`);
        for (const h of res.history || []) for (const m of h.messagesAdded || []) ids.add(m.message.id);
        if (!res.nextPageToken) break;
        pageToken = res.nextPageToken;
        if (Date.now() > deadline) { complete = false; break; }
      }
    } catch (e) {
      // History too old (or reset): fall back to a short search on every address.
      if (!(e instanceof GmailError) || e.status !== 404) throw e;
      historyId = null;
      for (const group of chunk(all, 15)) {
        if (Date.now() > deadline) { complete = false; break; }
        (await listIds(token, searchFor(group, 10), 3)).forEach((id) => ids.add(id));
      }
    }
  }

  // 4. Skip messages already stored, read the rest (headers only), match them.
  const list = Array.from(ids);
  const known = new Set<string>();
  for (const part of chunk(list, 300)) {
    const { data } = await admin.from("email_events").select("gmail_id").eq("user_id", row.user_id).in("gmail_id", part);
    (data || []).forEach((r) => known.add(r.gmail_id));
  }
  const todo = list.filter((id) => !known.has(id));
  const metas = await fetchMetas(token, todo, deadline);
  if (metas.length < todo.length) complete = false;
  const matched = metas.flatMap((m) => eventsFor(m, row.user_id, book, own, mailbox));
  const rows = await dropCrossMailboxDuplicates(admin, row.user_id, matched);
  for (const part of chunk(rows, 200)) {
    const { error } = await admin.from("email_events").upsert(part, { onConflict: "user_id,gmail_id,entity_id", ignoreDuplicates: true });
    if (error) throw new GmailError(`Couldn't store email activity: ${error.message}`);
  }

  // 5. Mail from people who aren't in the CRM: is it a real enquiry?
  const matchedIds = new Set(matched.map((r) => r.gmail_id));
  const found = await findLeads(admin, row.user_id, token, metas.filter((m) => !matchedIds.has(m.id)), own, book, deadline).catch(() => []);
  const leads = await storeLeads(admin, row.user_id, mailbox, found).catch(() => 0);

  // 5b. New mail from creators in the CRM: media kits, prices, agreed rates (newest first, capped per run).
  const budget = { files: 10, ai: 12 };
  const creatorMail = Array.from(new Map(rows.filter((r) => r.direction === "in" && r.entity_type === "creator").sort((a, b) => b.at.localeCompare(a.at)).map((r) => [r.gmail_id, r])).values()).slice(0, 15);
  let filesSaved = 0;
  const { data: prof } = creatorMail.length ? await admin.from("profiles").select("preferences").eq("id", row.user_id).maybeSingle() : { data: null };
  const currency = String(((prof?.preferences || {}) as { currency?: string }).currency || "USD").toUpperCase();
  for (const ev of creatorMail) {
    if (Date.now() > deadline) break;
    const message = await gmail<FullMessage>(token, `/messages/${ev.gmail_id}?format=full`).catch(() => null);
    if (!message) continue;
    const res = await processCreatorMail({ admin, userId: row.user_id, mailbox, currency, message, creatorId: ev.entity_id, get: (path) => gmail(token, path), budget }).catch(() => ({ files: 0, changes: 0 }));
    filesSaved += res.files;
  }

  // 6. Move statuses (self-healing: also re-checks anything with recent mail).
  const { data: recent } = await admin.from("email_events").select("entity_id").eq("user_id", row.user_id).gte("at", new Date(Date.now() - 14 * 86400000).toISOString()).limit(2000);
  const touched = Array.from(new Set([...rows.map((r) => r.entity_id), ...(recent || []).map((r) => r.entity_id)]));
  const changed = await applyStatuses(admin, row.user_id, touched);

  // 7. Remember where we got to. An unfinished run keeps the old history id so
  //    the next run picks up exactly where this one stopped.
  const patch: Record<string, unknown> = { last_sync_at: new Date().toISOString(), sync_error: "", backfilled: Array.from(new Set([...done, ...backfilled])).slice(-5000) };
  if (leadsScanned && !row.leads_scanned_at && complete) patch.leads_scanned_at = new Date().toISOString();
  if (complete || !row.history_id) {
    const profile = await gmail<{ historyId?: string; emailAddress?: string }>(token, "/profile");
    if (complete || !historyId) patch.history_id = profile.historyId || historyId;
  }
  await admin.from("gmail_tokens").update(patch).eq("id", row.id);
  return { mailbox, messages: metas.length, events: rows.length, leads, files: filesSaved, statusChanges: changed, complete };
}

async function recordError(admin: Admin, row: TokenRow, e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  await admin.from("gmail_tokens").update({ sync_error: message.slice(0, 300), last_sync_at: new Date().toISOString() }).eq("id", row.id);
  return message;
}

async function syncUser(admin: Admin, rows: TokenRow[], allRows: TokenRow[], deadline: number, force: boolean) {
  const own = new Set(allRows.map(mailboxOf).filter(Boolean));
  const book = await addressBook(admin, allRows[0].user_id, own);
  const results: Record<string, unknown>[] = [];
  const errors: { mailbox: string; error: string; reconnect: boolean }[] = [];
  for (const row of rows) {
    if (Date.now() > deadline - 5_000) break;
    if (!force && row.last_sync_at && Date.now() - new Date(row.last_sync_at).getTime() < USER_MIN_INTERVAL_MS) continue;
    try {
      results.push(await syncMailbox(admin, row, own, book, deadline));
    } catch (e) {
      errors.push({ mailbox: mailboxOf(row), error: await recordError(admin, row, e), reconnect: e instanceof GmailError && e.reconnect });
    }
  }
  return { results, errors };
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
  const events = meta ? eventsFor({ ...meta, labelIds: Array.from(new Set([...(meta.labelIds || []), "SENT"])) }, row.user_id, book, own, mailboxOf(row)) : [];
  if (events.length) await admin.from("email_events").upsert(events, { onConflict: "user_id,gmail_id,entity_id", ignoreDuplicates: true });
  const changed = await applyStatuses(admin, row.user_id, events.map((r) => r.entity_id));
  return { id: sent.id, threadId: sent.threadId, from: row.email, events: events.length, statusChanges: changed };
}

// ----- entry -----------------------------------------------------------------------

const publicMailbox = (r: TokenRow) => ({ id: r.id, email: r.email, canRead: (r.scopes || "").includes("gmail.readonly"), canSend: (r.scopes || "").includes("gmail.send"), lastSyncAt: r.last_sync_at, error: r.sync_error || "", connectedAt: r.connected_at || null, sentToday: r.send_day === new Date().toISOString().slice(0, 10) ? r.send_count || 0 : 0 });

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
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
    const { data } = await admin.from("gmail_tokens").select("*").order("last_sync_at", { ascending: true, nullsFirst: true }).limit(500);
    const byUser = new Map<string, TokenRow[]>();
    for (const row of (data || []) as TokenRow[]) byUser.set(row.user_id, [...(byUser.get(row.user_id) || []), row]);
    let mailboxes = 0;
    for (const rows of byUser.values()) {
      if (Date.now() > deadline - 10_000) break;
      const due = rows.filter((r) => !r.last_sync_at || Date.now() - new Date(r.last_sync_at).getTime() >= 4 * 60_000);
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

  if (action === "analyze_file") {
    if (typeof input.id !== "string" || !/^[0-9a-f-]{36}$/i.test(input.id)) return json({ error: "Invalid file" }, 400);
    const { data: prof } = await admin.from("profiles").select("preferences").eq("id", userId).maybeSingle();
    const currency = String(((prof?.preferences || {}) as { currency?: string }).currency || "USD").toUpperCase();
    const result = await analyzeStoredFile(admin, userId, input.id, currency).catch(() => ({ error: "Couldn't check the file." }));
    return json(result, "error" in result && result.error ? 422 : 200);
  }

  if (action === "status") {
    const mailboxes = rows.map(publicMailbox);
    if (!first) return json({ configured, connected: false, mailboxes, ai: aiEnabled() });
    // Top-level fields describe the first mailbox (older app versions read them).
    return json({ configured, connected: true, ...publicMailbox(first), mailboxes, maxMailboxes: MAX_MAILBOXES, ai: aiEnabled() });
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
    const { results, errors } = await syncUser(admin, rows, rows, Date.now() + RUN_BUDGET_MS, input.force === true);
    const sum = (key: string) => results.reduce((s, r) => s + Number(r[key] || 0), 0);
    if (!results.length && !errors.length) return json({ skipped: true });
    const failed = errors.length > 0 && !results.length;
    return json({ ok: errors.length === 0, events: sum("events"), leads: sum("leads"), files: sum("files"), statusChanges: sum("statusChanges"), mailboxes: results.length, errors, ...(failed ? { error: errors[0].error, reconnect: errors[0].reconnect } : {}) }, failed ? (errors[0].reconnect ? 409 : 502) : 200);
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
