import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { aiEnabled, hasAudience, readAttachment, readCreatorEmail, type AudienceFacts } from "../_shared/ai.ts";
import { decodeEntities } from "../_shared/leadScanner.ts";
import { negotiate, normalizeRateHistory, normalizeRateMeta, setListPrices, type RateEvent, type RateKey, type Rates } from "../_shared/negotiation.ts";

// What a creator's email adds to their CRM profile:
//   • attachments that are their media kit / rate card / stats screenshot are
//     saved to private storage (PDF or image, ≤ 10 MB, real file type checked by
//     its first bytes — not its name), then read by Claude when AI is on;
//   • a media kit or screenshot that proves audience numbers fills the
//     "Verified" audience panel; numbers they only typed in an email go to
//     "Their words" with a caution;
//   • prices they state become their asking (list) prices; a clearly accepted
//     price ("2,500 for the integration works") is applied as a negotiation —
//     the related format follows by the same % (see _shared/negotiation.ts).
// Email bodies are read in memory and never stored.

type Admin = SupabaseClient;
type Part = { mimeType?: string; filename?: string; body?: { data?: string; size?: number; attachmentId?: string }; parts?: Part[]; headers?: { name: string; value: string }[] };
export type FullMessage = { id: string; threadId: string; payload?: Part; snippet?: string; internalDate?: string };
export type Attachment = { filename: string; mime: string; size: number; attachmentId: string };
export type Fetcher = <T>(path: string) => Promise<T>;

const MAX_FILE = 10 * 1024 * 1024;
const USER_QUOTA = 300 * 1024 * 1024;
const ALLOWED: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const AI_DAILY_LIMIT = 150;

export const b64urlToBytes = (data: string) => {
  const bin = atob(data.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((data.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const bytesToB64 = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const htmlToText = (html: string) =>
  decodeEntities(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

/** Plain text of a message and its attachment list — read in memory only. */
export function bodyOf(message: FullMessage): { text: string; attachments: Attachment[] } {
  let plain = "";
  let html = "";
  const attachments: Attachment[] = [];
  const walk = (part?: Part) => {
    if (!part) return;
    const mime = (part.mimeType || "").toLowerCase();
    if (part.filename && part.body?.attachmentId) attachments.push({ filename: part.filename, mime, size: part.body.size || 0, attachmentId: part.body.attachmentId });
    else if (mime === "text/plain" && part.body?.data && !plain) plain = new TextDecoder().decode(b64urlToBytes(part.body.data));
    else if (mime === "text/html" && part.body?.data && !html) html = new TextDecoder().decode(b64urlToBytes(part.body.data));
    for (const p of part.parts || []) walk(p);
  };
  walk(message.payload);
  return { text: (plain || htmlToText(html)).slice(0, 20000), attachments };
}

/** The file really is what it says: PDF / PNG / JPEG / WEBP magic bytes. */
const sniff = (b: Uint8Array): string | null => {
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
};
const sha256 = async (b: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", b as Uint8Array<ArrayBuffer>)), (x) => x.toString(16).padStart(2, "0")).join("");
const safeName = (name: string) => name.replace(/[^\w.\- ()]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "file";
const looksLikeKit = (name: string) => /media[\s_-]?kit|rate[\s_-]?card|rates|press[\s_-]?kit|kit|stats|insights|analytics|demographic|audience|deck/i.test(name);

type CreatorRow = { id: string; name: string; rates: Partial<Rates> | null; rate_meta: unknown; rate_history: unknown; audience: Record<string, unknown> | null; socials: { handle?: string }[] | null };

async function aiAllowed(admin: Admin, userId: string) {
  if (!aiEnabled()) return false;
  const { data } = await admin.rpc("ai_take", { p_user: userId, p_limit: AI_DAILY_LIMIT });
  return data === true;
}

const audienceBlock = (facts: AudienceFacts, extra: Record<string, unknown>) => ({
  top_countries: facts.topCountries, age_ranges: facts.ageRanges, gender_female_pct: facts.genderFemalePct, avg_views: facts.avgViews,
  followers: facts.followers, engagement_rate: facts.engagementRate, ...extra,
});

/** One inbound email from a creator in the CRM. */
export async function processCreatorMail(ctx: { admin: Admin; userId: string; mailbox: string; currency: string; message: FullMessage; creatorId: string; get: Fetcher; budget: { files: number; ai: number } }) {
  const { admin, userId, message, creatorId } = ctx;
  const { data: creator } = await admin.from("creators").select("id, name, rates, rate_meta, rate_history, audience, socials").eq("id", creatorId).eq("user_id", userId).maybeSingle();
  if (!creator) return { files: 0, changes: 0 };
  const c = creator as CreatorRow;
  const { text, attachments } = bodyOf(message);
  const subject = decodeEntities(message.payload?.headers?.find((h) => h.name.toLowerCase() === "subject")?.value || "").slice(0, 200);
  const at = message.internalDate ? new Date(Number(message.internalDate)).toISOString() : new Date().toISOString();
  let rates: Partial<Rates> = { ...(c.rates || {}) };
  let meta = normalizeRateMeta(c.rate_meta);
  const history: RateEvent[] = normalizeRateHistory(c.rate_history);
  const audience: Record<string, unknown> = { ...(c.audience || {}) };
  const activities: string[] = [];
  let saved = 0;
  let touched = false;

  // ---- attachments ----
  for (const att of attachments) {
    if (ctx.budget.files <= 0) break;
    const declared = ALLOWED[att.mime] ? att.mime : "";
    if (!declared || att.size > MAX_FILE || att.size < 15_000) continue; // skip signature logos & oversize
    const res = await ctx.get<{ data?: string; size?: number }>(`/messages/${message.id}/attachments/${att.attachmentId}`).catch(() => null);
    if (!res?.data) continue;
    const bytes = b64urlToBytes(res.data);
    const real = sniff(bytes);
    if (!real || bytes.length > MAX_FILE) continue; // renamed executables, broken files…
    const hash = await sha256(bytes);
    const { data: dupe } = await admin.from("creator_files").select("id").eq("user_id", userId).eq("creator_id", creatorId).eq("sha256", hash).maybeSingle();
    if (dupe) continue;
    const { data: used } = await admin.from("creator_files").select("size").eq("user_id", userId);
    if ((used || []).reduce((s, r) => s + (r.size || 0), 0) + bytes.length > USER_QUOTA) break;
    const path = `${userId}/${creatorId}/${hash.slice(0, 16)}.${ALLOWED[real]}`;
    const up = await admin.storage.from("creator-files").upload(path, bytes, { contentType: real, upsert: true });
    if (up.error) continue;
    ctx.budget.files--;
    const filename = safeName(att.filename);
    const { data: row } = await admin.from("creator_files").insert({ user_id: userId, creator_id: creatorId, path, filename, mime: real, size: bytes.length, sha256: hash, source: "gmail", gmail_id: message.id, mailbox: ctx.mailbox, received_at: at, kind: looksLikeKit(filename) ? "media_kit" : "unknown" }).select("id").maybeSingle();
    if (!row) continue;
    saved++;
    activities.push(`Saved “${filename}” from ${c.name}'s email`);

    if (ctx.budget.ai > 0 && (await aiAllowed(admin, userId))) {
      ctx.budget.ai--;
      const handles = (c.socials || []).map((s) => s.handle || "").filter(Boolean).slice(0, 6);
      const reading = await readAttachment({ creator: c.name, handles, filename, mime: real, base64: bytesToB64(bytes) }).catch(() => null);
      if (!reading) continue;
      const useful = reading.kind !== "other" && reading.belongs === "yes" && !reading.suspicious;
      const verdict = reading.suspicious ? "Not used: the file contained instructions aimed at software" : reading.kind === "other" ? `Not a media kit: ${reading.summary}` : reading.belongs === "no" ? `Belongs to someone else (${reading.nameSeen || "another name"})` : reading.belongs === "unclear" ? `Couldn't confirm it's ${c.name}'s — check it` : reading.summary;
      await admin.from("creator_files").update({ kind: reading.kind, status: useful ? "analyzed" : reading.kind === "other" || reading.suspicious || reading.belongs === "no" ? "rejected" : "stored", verdict: verdict.slice(0, 240), analysis: { rates: reading.rates, audience: reading.audience, name_seen: reading.nameSeen, summary: reading.summary } }).eq("id", row.id);
      if (!useful) continue;
      if (hasAudience(reading.audience)) {
        audience.verified = audienceBlock(reading.audience, { at, file_id: row.id, filename, kind: reading.kind });
        touched = true;
        activities.push(`${c.name}'s audience updated from their ${reading.kind === "stats_screenshot" ? "stats screenshot" : "media kit"} (verified)`);
      }
      const prices = Object.fromEntries(reading.rates.filter((r) => !r.currency || r.currency === ctx.currency).map((r) => [r.key, r.amount])) as Partial<Record<RateKey, number>>;
      const listed = setListPrices(rates, meta, prices, { at, source: "media_kit", evidence: filename });
      if (listed.event) {
        rates = listed.rates; meta = listed.meta; history.unshift(listed.event); touched = true;
        activities.push(`${c.name}: ${listed.event.summary}`);
      }
    }
  }

  // ---- what the email itself says ----
  if (text.length > 20 && ctx.budget.ai > 0 && (await aiAllowed(admin, userId))) {
    ctx.budget.ai--;
    const claims = await readCreatorEmail({ creator: c.name, subject, body: text, currentRates: rates }).catch(() => null);
    if (claims && !claims.suspicious && claims.confidence >= 0.7) {
      if (claims.agreement) {
        const agreed = Object.fromEntries(claims.agreement.items.filter((r) => !r.currency || r.currency === ctx.currency).map((r) => [r.key, r.amount])) as Partial<Record<RateKey, number>>;
        const done = negotiate(rates, meta, agreed, { at, source: "email", evidence: claims.agreement.quote || subject });
        if (done.event) {
          rates = done.rates; meta = done.meta; history.unshift(done.event); touched = true;
          activities.push(`Negotiated with ${c.name} by email: ${done.event.summary}`);
        }
      } else if (claims.statedRates.length) {
        const prices = Object.fromEntries(claims.statedRates.filter((r) => !r.currency || r.currency === ctx.currency).map((r) => [r.key, r.amount])) as Partial<Record<RateKey, number>>;
        const listed = setListPrices(rates, meta, prices, { at, source: "email", evidence: subject });
        if (listed.event) {
          rates = listed.rates; meta = listed.meta; history.unshift(listed.event); touched = true;
          activities.push(`${c.name} sent their prices: ${listed.event.summary.replace(/^New asking prices: /, "")}`);
        }
      }
      if (hasAudience(claims.audience)) {
        audience.claimed = audienceBlock(claims.audience, { at, subject });
        touched = true;
        activities.push(`${c.name} described their audience by email (not proven)`);
      }
    }
  }

  if (touched) {
    await admin.from("creators").update({ rates, rate_meta: meta, rate_history: history.slice(0, 60), audience }).eq("id", creatorId).eq("user_id", userId);
  }
  if (activities.length) await admin.from("activities").insert(activities.slice(0, 6).map((t) => ({ user_id: userId, text: t.slice(0, 500), at: new Date().toISOString(), entity_type: "creator", entity_id: creatorId })));
  return { files: saved, changes: touched ? 1 : 0 };
}

/** "Check it with AI" on a file already in storage (an upload, or one saved before AI was on). */
export async function analyzeStoredFile(admin: Admin, userId: string, fileId: string, currency: string) {
  if (!aiEnabled()) return { error: "AI reading isn't set up on the server (ANTHROPIC_API_KEY)." };
  const { data: file } = await admin.from("creator_files").select("id, creator_id, path, filename, mime, received_at").eq("id", fileId).eq("user_id", userId).maybeSingle();
  if (!file) return { error: "File not found." };
  if (!(await aiAllowed(admin, userId))) return { error: "Daily AI limit reached — try again tomorrow." };
  const { data: blob, error } = await admin.storage.from("creator-files").download(file.path);
  if (error || !blob) return { error: "Couldn't read the file." };
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const real = sniff(bytes);
  if (!real || bytes.length > MAX_FILE) return { error: "That file isn't a valid PDF or image." };
  const { data: creator } = await admin.from("creators").select("id, name, rates, rate_meta, rate_history, audience, socials").eq("id", file.creator_id).eq("user_id", userId).maybeSingle();
  if (!creator) return { error: "Influencer not found." };
  const c = creator as CreatorRow;
  const handles = (c.socials || []).map((s) => s.handle || "").filter(Boolean).slice(0, 6);
  const reading = await readAttachment({ creator: c.name, handles, filename: file.filename, mime: real, base64: bytesToB64(bytes) }).catch(() => null);
  if (!reading) return { error: "Couldn't read this file — try again later." };
  const useful = reading.kind !== "other" && reading.belongs === "yes" && !reading.suspicious;
  const verdict = (reading.suspicious ? "Not used: the file contained instructions aimed at software" : reading.kind === "other" ? `Not a media kit: ${reading.summary}` : reading.belongs === "no" ? `Belongs to someone else (${reading.nameSeen || "another name"})` : reading.belongs === "unclear" ? `Couldn't confirm it's ${c.name}'s — check it` : reading.summary).slice(0, 240);
  await admin.from("creator_files").update({ kind: reading.kind, status: useful ? "analyzed" : reading.belongs === "unclear" && reading.kind !== "other" && !reading.suspicious ? "stored" : "rejected", verdict, analysis: { rates: reading.rates, audience: reading.audience, name_seen: reading.nameSeen, summary: reading.summary } }).eq("id", file.id);
  if (!useful) return { verdict };
  let rates: Partial<Rates> = { ...(c.rates || {}) };
  let meta = normalizeRateMeta(c.rate_meta);
  const history = normalizeRateHistory(c.rate_history);
  const audience: Record<string, unknown> = { ...(c.audience || {}) };
  const at = file.received_at || new Date().toISOString();
  if (hasAudience(reading.audience)) audience.verified = audienceBlock(reading.audience, { at, file_id: file.id, filename: file.filename, kind: reading.kind });
  const prices = Object.fromEntries(reading.rates.filter((r) => !r.currency || r.currency === currency).map((r) => [r.key, r.amount])) as Partial<Record<RateKey, number>>;
  const listed = setListPrices(rates, meta, prices, { at, source: "media_kit", evidence: file.filename });
  if (listed.event) { rates = listed.rates; meta = listed.meta; history.unshift(listed.event); }
  await admin.from("creators").update({ rates, rate_meta: meta, rate_history: history.slice(0, 60), audience }).eq("id", c.id).eq("user_id", userId);
  await admin.from("activities").insert({ user_id: userId, text: `${c.name}: ${file.filename} checked — ${verdict}`.slice(0, 500), at: new Date().toISOString(), entity_type: "creator", entity_id: c.id });
  return { verdict: listed.event ? `${verdict} · prices updated` : verdict, updated: true };
}
