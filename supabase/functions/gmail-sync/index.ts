import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

// Gmail ⇄ CRM sync.
//
// Actions (POST JSON, user JWT unless noted):
//   status      — is Gmail connected, which scopes, last sync, last error
//   sync        — pull new mail for this user now (rate-limited)
//   send        — send an email (optionally as a reply in an existing thread)
//   disconnect  — revoke Google access and forget the tokens
//   cron        — background sync for everyone (x-cron-secret header only)
//   health      — no auth; only says whether the server is configured
//
// What is stored: for messages to/from an email address that is on one of
// your influencers, brands or brand contacts — direction, date, subject and
// Gmail's ~100-character preview. Bodies and unrelated mail are never stored.
//
// Status automation ("the email moves the pipeline, you keep the last word"):
//   New        + you email them        → Contacted
//   New        + they email you        → Inbound
//   Contacted / No reply + they reply  → Replied
//   Inbound    + you answer            → Replied
// Only emails newer than the record's last status change count, so any status
// you set by hand stays until a newer email arrives — and Negotiating, Roster,
// Signed and Denied are never changed automatically.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const EMAIL_RE = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const VALID_EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
const BACKFILL_DAYS = 180;
const USER_MIN_INTERVAL_MS = 20_000;
const RUN_BUDGET_MS = 110_000;

type Admin = SupabaseClient;
type TokenRow = { user_id: string; access_token: string | null; refresh_token: string; expiry: string | null; email: string | null; scopes: string; history_id: string | null; last_sync_at: string | null; backfilled: string[] | null };
type Entity = { type: "creator" | "brand"; id: string };
type Meta = { id: string; threadId: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: { headers?: { name: string; value: string }[] } };
type EventRow = { user_id: string; gmail_id: string; thread_id: string; direction: "out" | "in"; entity_type: "creator" | "brand"; entity_id: string; counterpart: string; subject: string; snippet: string; at: string };

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

// ----- tokens ----------------------------------------------------------------

async function accessToken(admin: Admin, row: TokenRow): Promise<string> {
  if (row.access_token && row.expiry && new Date(row.expiry).getTime() - Date.now() > 90_000) return row.access_token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: Deno.env.get("GOOGLE_CLIENT_ID")!, client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!, refresh_token: row.refresh_token, grant_type: "refresh_token" }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    const reconnect = body.error === "invalid_grant" || body.error === "unauthorized_client";
    throw new GmailError(reconnect ? "Google access expired or was removed — reconnect Gmail in Settings." : "Couldn't refresh Gmail access.", res.status, reconnect);
  }
  row.access_token = body.access_token;
  row.expiry = new Date(Date.now() + Number(body.expires_in || 3600) * 1000).toISOString();
  await admin.from("gmail_tokens").update({ access_token: row.access_token, expiry: row.expiry, ...(body.scope ? { scopes: body.scope } : {}) }).eq("user_id", row.user_id);
  if (body.scope) row.scopes = body.scope;
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

async function addressBook(admin: Admin, userId: string, own: string | null) {
  const [creators, brands, contacts] = await Promise.all([
    admin.from("creators").select("id, contact_email, secondary_email").eq("user_id", userId).is("archived_at", null),
    admin.from("brands").select("id, contact_email, secondary_email").eq("user_id", userId).is("archived_at", null),
    admin.from("brand_contacts").select("brand_id, email").eq("user_id", userId),
  ]);
  const map = new Map<string, Entity[]>();
  const add = (email: string | null | undefined, entity: Entity) => {
    for (const e of addresses(email || "")) {
      if (own && e === own.toLowerCase()) continue;
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

function eventsFor(meta: Meta, userId: string, book: Map<string, Entity[]>, own: string | null): EventRow[] {
  const labels = meta.labelIds || [];
  if (labels.some((l) => l === "DRAFT" || l === "SPAM" || l === "TRASH" || l === "CHAT")) return [];
  const self = (own || "").toLowerCase();
  const from = addresses(header(meta, "From"));
  const out = labels.includes("SENT") || (!!self && from.includes(self));
  const counterparts = out ? [...addresses(header(meta, "To")), ...addresses(header(meta, "Cc"))].filter((e) => e !== self) : from.filter((e) => e !== self);
  const at = meta.internalDate ? new Date(Number(meta.internalDate)).toISOString() : new Date(header(meta, "Date") || Date.now()).toISOString();
  const rows: EventRow[] = [];
  const seen = new Set<string>();
  for (const email of counterparts) {
    for (const entity of book.get(email) || []) {
      if (seen.has(entity.id)) continue;
      seen.add(entity.id);
      rows.push({ user_id: userId, gmail_id: meta.id, thread_id: meta.threadId || "", direction: out ? "out" : "in", entity_type: entity.type, entity_id: entity.id, counterpart: email, subject: header(meta, "Subject").slice(0, 300), snippet: (meta.snippet || "").slice(0, 240), at });
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

const META_PATH = (id: string) => `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID`;

async function fetchMetas(token: string, ids: string[], deadline: number) {
  const metas: Meta[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    if (Date.now() > deadline) break;
    const batch = await Promise.all(ids.slice(i, i + 10).map((id) => gmail<Meta>(token, META_PATH(id)).catch((e) => (e instanceof GmailError && e.status === 404 ? null : Promise.reject(e)))));
    metas.push(...(batch.filter(Boolean) as Meta[]));
  }
  return metas;
}

const chunk = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
const searchFor = (emails: string[], days: number) => `{${emails.map((e) => `from:${e} to:${e} cc:${e}`).join(" ")}} newer_than:${days}d`;

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
      admin.from("email_events").select("entity_id, entity_type, direction, at, subject").eq("user_id", userId).in("entity_id", ids).gte("at", since).order("at", { ascending: true }),
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
          why = ev.direction === "out" ? `you emailed “${ev.subject || "(no subject)"}”` : `they emailed “${ev.subject || "(no subject)"}”`;
        }
      }
      if (!at || status === record.pipeline_status) continue;
      const patch: Record<string, unknown> = { pipeline_status: status, status_updated_at: at, status_source: "gmail" };
      if (!record.date_contacted) patch.date_contacted = (first || at).slice(0, 10);
      let { error } = await admin.from(record.table).update(patch).eq("id", record.id).eq("user_id", userId).eq("pipeline_status", record.pipeline_status);
      if (error && /status_source/.test(error.message)) {
        delete patch.status_source;
        ({ error } = await admin.from(record.table).update(patch).eq("id", record.id).eq("user_id", userId).eq("pipeline_status", record.pipeline_status));
      }
      if (error) continue;
      changed++;
      await admin.from("activities").insert({ user_id: userId, text: `Gmail: ${record.name} moved to ${LABEL[status] || status} — ${why}`.slice(0, 500), at: new Date().toISOString(), entity_type: record.kind, entity_id: record.id });
    }
  }
  return changed;
}

// ----- one user's sync ---------------------------------------------------------

async function syncUser(admin: Admin, row: TokenRow, deadline: number) {
  const token = await accessToken(admin, row);
  if (!(row.scopes || "").includes("gmail.readonly")) throw new GmailError("Gmail read access wasn't granted — reconnect and tick “Read your email”.", 403, true);
  const book = await addressBook(admin, row.user_id, row.email);
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

  // 2. Everything since the last run, via Gmail's change history.
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

  // 3. Skip messages already stored, read the rest (headers only), match them.
  const list = Array.from(ids);
  const known = new Set<string>();
  for (const part of chunk(list, 300)) {
    const { data } = await admin.from("email_events").select("gmail_id").eq("user_id", row.user_id).in("gmail_id", part);
    (data || []).forEach((r) => known.add(r.gmail_id));
  }
  const metas = await fetchMetas(token, list.filter((id) => !known.has(id)), deadline);
  if (metas.length < list.filter((id) => !known.has(id)).length) complete = false;
  const rows = metas.flatMap((m) => eventsFor(m, row.user_id, book, row.email));
  for (const part of chunk(rows, 200)) {
    const { error } = await admin.from("email_events").upsert(part, { onConflict: "user_id,gmail_id,entity_id", ignoreDuplicates: true });
    if (error) throw new GmailError(`Couldn't store email activity: ${error.message}`);
  }

  // 4. Move statuses (self-healing: also re-checks anything with recent mail).
  const { data: recent } = await admin.from("email_events").select("entity_id").eq("user_id", row.user_id).gte("at", new Date(Date.now() - 14 * 86400000).toISOString()).limit(2000);
  const touched = Array.from(new Set([...rows.map((r) => r.entity_id), ...(recent || []).map((r) => r.entity_id)]));
  const changed = await applyStatuses(admin, row.user_id, touched);

  // 5. Remember where we got to. An unfinished run keeps the old history id so
  //    the next run picks up exactly where this one stopped.
  const patch: Record<string, unknown> = { last_sync_at: new Date().toISOString(), sync_error: "", backfilled: Array.from(new Set([...done, ...backfilled])).slice(-5000) };
  if (complete || !row.history_id) {
    const profile = await gmail<{ historyId?: string; emailAddress?: string }>(token, "/profile");
    if (complete || !historyId) patch.history_id = profile.historyId || historyId;
    if (profile.emailAddress && !row.email) patch.email = profile.emailAddress;
  }
  await admin.from("gmail_tokens").update(patch).eq("user_id", row.user_id);
  return { messages: metas.length, events: rows.length, statusChanges: changed, complete };
}

async function recordError(admin: Admin, userId: string, e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  await admin.from("gmail_tokens").update({ sync_error: message.slice(0, 300), last_sync_at: new Date().toISOString() }).eq("user_id", userId);
  return message;
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

async function send(admin: Admin, row: TokenRow, input: Record<string, unknown>) {
  if (!(row.scopes || "").includes("gmail.send")) throw new GmailError("Sending wasn't allowed when Gmail was connected — reconnect and tick “Send email on your behalf”.", 403, true);
  const token = await accessToken(admin, row);
  const to = recipients(input.to);
  const cc = input.cc ? recipients(input.cc) : [];
  if (!to.length) throw new GmailError("Add a recipient.", 400);
  let subject = clean(input.subject, 300);
  const body = String(input.body ?? "").slice(0, 100_000);
  const threadId = typeof input.threadId === "string" && /^[0-9a-f]{6,40}$/i.test(input.threadId) ? input.threadId : "";
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
  // Record it right away so the CRM updates without waiting for the next sync.
  const book = await addressBook(admin, row.user_id, row.email);
  const meta = await gmail<Meta>(token, META_PATH(sent.id)).catch(() => null);
  const rows = meta ? eventsFor({ ...meta, labelIds: Array.from(new Set([...(meta.labelIds || []), "SENT"])) }, row.user_id, book, row.email) : [];
  if (rows.length) await admin.from("email_events").upsert(rows, { onConflict: "user_id,gmail_id,entity_id", ignoreDuplicates: true });
  const changed = await applyStatuses(admin, row.user_id, rows.map((r) => r.entity_id));
  return { id: sent.id, threadId: sent.threadId, events: rows.length, statusChanges: changed };
}

// ----- entry -----------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const configured = !!(Deno.env.get("GOOGLE_CLIENT_ID") && Deno.env.get("GOOGLE_CLIENT_SECRET") && Deno.env.get("GMAIL_OAUTH_REDIRECT_URI"));
  let input: Record<string, unknown> = {};
  try {
    input = await req.json();
  } catch {
    // empty body
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
    const { data: rows } = await admin.from("gmail_tokens").select("*").order("last_sync_at", { ascending: true, nullsFirst: true }).limit(200);
    const results: Record<string, unknown>[] = [];
    for (const row of (rows || []) as TokenRow[]) {
      if (Date.now() > deadline - 10_000) break;
      if (row.last_sync_at && Date.now() - new Date(row.last_sync_at).getTime() < 4 * 60_000) continue;
      try {
        results.push(await syncUser(admin, row, Math.min(deadline, Date.now() + 40_000)));
      } catch (e) {
        await recordError(admin, row.user_id, e);
      }
    }
    return json({ users: results.length });
  }

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const { data: userData, error: userError } = await createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } }).auth.getUser();
  if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;
  const { data: row } = await admin.from("gmail_tokens").select("*").eq("user_id", userId).maybeSingle();
  const tokenRow = row as TokenRow | null;

  if (action === "status") {
    if (!tokenRow) return json({ configured, connected: false });
    return json({ configured, connected: true, email: tokenRow.email, canRead: (tokenRow.scopes || "").includes("gmail.readonly"), canSend: (tokenRow.scopes || "").includes("gmail.send"), lastSyncAt: tokenRow.last_sync_at, error: (row as { sync_error?: string }).sync_error || "" });
  }

  if (action === "disconnect") {
    if (tokenRow) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenRow.refresh_token)}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } }).catch(() => null);
      await admin.from("gmail_tokens").delete().eq("user_id", userId);
    }
    await admin.from("profiles").update({ gmail_connected: false }).eq("id", userId);
    if (input.clearHistory === true) await admin.from("email_events").delete().eq("user_id", userId);
    return json({ connected: false });
  }

  if (!configured) return json({ error: "Gmail isn't set up on the server yet.", code: "not_configured" }, 503);
  if (!tokenRow) return json({ error: "Connect Gmail first.", code: "not_connected" }, 409);

  if (action === "sync") {
    if (tokenRow.last_sync_at && Date.now() - new Date(tokenRow.last_sync_at).getTime() < USER_MIN_INTERVAL_MS && input.force !== true) return json({ skipped: true, lastSyncAt: tokenRow.last_sync_at });
    try {
      const result = await syncUser(admin, tokenRow, Date.now() + RUN_BUDGET_MS);
      return json({ ok: true, ...result });
    } catch (e) {
      const message = await recordError(admin, userId, e);
      return json({ error: message, reconnect: e instanceof GmailError && e.reconnect }, e instanceof GmailError && e.reconnect ? 409 : 502);
    }
  }

  if (action === "send") {
    try {
      return json({ ok: true, ...(await send(admin, tokenRow, input)) });
    } catch (e) {
      const status = e instanceof GmailError && e.status >= 400 && e.status < 500 ? e.status : 502;
      return json({ error: e instanceof Error ? e.message : "Couldn't send", reconnect: e instanceof GmailError && e.reconnect }, status);
    }
  }

  return json({ error: "Unknown action" }, 400);
});
