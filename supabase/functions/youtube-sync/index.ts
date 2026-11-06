import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { channelFacts, youtubeConfigured, YouTubeQuota, type ChannelFacts } from "../_shared/youtube.ts";

// YouTube numbers for influencers (see _shared/youtube.ts for how they're read).
//
// Actions (POST JSON):
//   lookup  {input}   — quick fill: everything about a pasted channel, stars
//                       included. Nothing is saved; the form shows it to edit.
//   refresh {ids}     — up to 10 of YOUR influencers: their fresh numbers come
//                       back as patches the app saves like your own edit, so a
//                       refresh never overwrites a change you're making.
//   cron              — hourly, server only (x-cron-secret): every member who
//                       has "Keep YouTube stats fresh" on gets their influencers
//                       refreshed, oldest first, straight into the database.
// A refresh updates average views, engagement rate, subscribers and the
// YouTube facts; name, country and email only when they're empty. It never
// touches stars — those are yours once set.

const APP_URL = (Deno.env.get("APP_URL") || "https://dhurimhalili.github.io/influenceflow-crm").replace(/\/$/, "");
const ALLOWED_ORIGINS = new Set([new URL(APP_URL).origin, "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FRESH_MS = 55 * 60_000;

type Social = { platform: string; url: string; handle: string; followers: number };
type CreatorRow = { id: string; user_id: string; name: string; country: string | null; contact_email: string | null; socials: Social[] | null; youtube: Record<string, unknown> | null; youtube_synced_at: string | null };

/** The YouTube link or handle on a record (the first YouTube social), or "". */
export const youtubeOf = (socials: Social[] | null | undefined) => {
  const s = (socials || []).find((x) => x && x.platform === "YouTube" && (x.url || x.handle));
  return s ? s.url || `@${s.handle}` : "";
};

/** "US" → "United States" (the CRM stores country names). */
const countryName = (code: string) => {
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code; } catch { return code; }
};

/** What a refresh writes. Stars are never touched; name/country/email only fill blanks. */
export function patchFor(c: Pick<CreatorRow, "name" | "country" | "contact_email" | "socials">, f: ChannelFacts) {
  // Only the first YouTube link (the one that was read) gets the subscriber count.
  const first = (c.socials || []).findIndex((s) => s && s.platform === "YouTube" && (s.url || s.handle));
  const socials = (c.socials || []).map((s, i) => (i === first ? { ...s, url: s.url || f.url, handle: s.handle || f.handle, followers: f.subscribers || s.followers || 0 } : s));
  const patch: Record<string, unknown> = {
    socials,
    youtube: { channel_id: f.channelId, handle: f.handle, title: f.title, url: f.url, country: f.country, subscribers: f.subscribers, hidden_subscribers: f.hiddenSubscribers, video_count: f.videoCount, total_views: f.totalViews, avg_views: f.avgViews, engagement_rate: f.engagementRate, sampled: f.sampled, uploads_90d: f.uploads90d, last_upload_at: f.lastUploadAt, emails: f.emails, business_email_hidden: f.businessEmailHidden, at: f.at },
    youtube_synced_at: f.at,
  };
  if (f.sampled) { patch.avg_views = f.avgViews; patch.engagement_rate = f.engagementRate; }
  if (!String(c.name || "").trim() && f.title) patch.name = f.title;
  if (!String(c.country || "").trim() && f.country) patch.country = countryName(f.country);
  if (!String(c.contact_email || "").trim() && f.emails[0]) patch.contact_email = f.emails[0];
  return patch;
}

const approvedUser = async (admin: SupabaseClient, auth: string) => {
  if (!auth.startsWith("Bearer ")) return null;
  const { data } = await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } }).auth.getUser();
  if (!data.user) return null;
  const { data: me } = await admin.from("profiles").select("access").eq("id", data.user.id).maybeSingle();
  return me && me.access && me.access !== "approved" ? null : data.user.id;
};

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const cors = { "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : new URL(APP_URL).origin, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let input: Record<string, unknown> = {};
  try { input = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!youtubeConfigured()) return json({ error: "YouTube isn't set up on the server yet (YOUTUBE_API_KEYS).", code: "not_configured" }, 503);

  if (input.action === "cron") {
    const given = req.headers.get("x-cron-secret") || "";
    const { data: ok } = given.length >= 32 ? await admin.rpc("gmail_cron_secret_ok", { p_secret: given }) : { data: false };
    if (ok !== true) return json({ error: "Unauthorized" }, 401);
    const deadline = Date.now() + 100_000;
    const { data: members } = await admin.from("profiles").select("id, preferences, access").eq("access", "approved").limit(500);
    const on = new Set((members || []).filter((m) => (m.preferences as { youtube_auto?: boolean } | null)?.youtube_auto !== false).map((m) => m.id));
    const stale = new Date(Date.now() - FRESH_MS).toISOString();
    const { data: rows } = await admin.from("creators").select("id, user_id, name, country, contact_email, socials, youtube, youtube_synced_at").is("archived_at", null).or(`youtube_synced_at.is.null,youtube_synced_at.lt.${stale}`).order("youtube_synced_at", { ascending: true, nullsFirst: true }).limit(600);
    let done = 0, skipped = 0;
    for (const c of (rows || []) as CreatorRow[]) {
      if (Date.now() > deadline) break;
      if (!on.has(c.user_id)) continue;
      const ref = youtubeOf(c.socials);
      if (!ref) continue;
      try {
        const f = await channelFacts(ref);
        if (!f) { await admin.from("creators").update({ youtube_synced_at: new Date().toISOString() }).eq("id", c.id).eq("user_id", c.user_id); skipped++; continue; }
        // Only these columns are written; an archived record is left alone.
        const { error } = await admin.from("creators").update(patchFor(c, f)).eq("id", c.id).eq("user_id", c.user_id).is("archived_at", null);
        if (!error) done++;
      } catch (e) {
        if (e instanceof YouTubeQuota) break;
        skipped++;
      }
    }
    return json({ refreshed: done, skipped });
  }

  const userId = await approvedUser(admin, req.headers.get("Authorization") || "");
  if (!userId) return json({ error: "Unauthorized" }, 401);

  if (input.action === "lookup") {
    const text = typeof input.input === "string" ? input.input.trim().slice(0, 500) : "";
    if (!text) return json({ error: "Paste a YouTube channel link or @handle." }, 400);
    try {
      const f = await channelFacts(text);
      return f ? json({ ok: true, facts: f }) : json({ error: "Couldn't find that YouTube channel — check the link." }, 404);
    } catch (e) {
      return json({ error: e instanceof YouTubeQuota ? "YouTube's daily limit is reached — it resets at midnight Pacific time." : e instanceof Error ? e.message : "YouTube didn't answer." }, e instanceof YouTubeQuota ? 429 : 502);
    }
  }

  if (input.action === "refresh") {
    // The app sends what it has on screen (a record you just saved may not have
    // reached the database yet). Only public channel facts come back as a patch;
    // nothing is read from or written to anyone's records here.
    const items = (Array.isArray(input.items) ? input.items : []).slice(0, 10).map((x) => (x && typeof x === "object" ? x as Record<string, unknown> : {}))
      .filter((x) => typeof x.id === "string" && UUID.test(x.id) && typeof x.link === "string" && x.link.length <= 500)
      .map((x) => ({ id: x.id as string, link: x.link as string, name: String(x.name || "").slice(0, 300), country: String(x.country || "").slice(0, 80), contact_email: String(x.contact_email || "").slice(0, 254), socials: (Array.isArray(x.socials) ? x.socials : []).slice(0, 30) as Social[] }));
    if (!items.length) return json({ error: "Pick at least one influencer with a YouTube channel." }, 400);
    const results: { id: string; ok: boolean; patch?: Record<string, unknown>; error?: string }[] = [];
    for (const c of items) {
      try {
        const f = await channelFacts(c.link);
        results.push(f ? { id: c.id, ok: true, patch: patchFor(c, f) } : { id: c.id, ok: false, error: "Couldn't find that YouTube channel" });
      } catch (e) {
        if (e instanceof YouTubeQuota) return json({ results, error: "YouTube's daily limit is reached — the rest refresh after midnight Pacific time.", quota: true }, 429);
        results.push({ id: c.id, ok: false, error: e instanceof Error ? e.message : "YouTube didn't answer" });
      }
    }
    return json({ ok: true, results });
  }

  return json({ error: "Unknown action" }, 400);
});
