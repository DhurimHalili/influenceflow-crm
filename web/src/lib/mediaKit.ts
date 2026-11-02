import { supabase } from "./supabase";
import { RATE_FIELDS } from "./prefs";
import type { Creator, SocialPlatform } from "../types";

// Media kits: a snapshot of a creator you choose to publish. The public page
// reads it through one database function that returns only this snapshot —
// never the CRM record, notes, emails or pipeline.

export type KitData = {
  v: 1;
  name: string;
  niche: string;
  country: string;
  platform: string;
  about: string;
  socials: { platform: SocialPlatform; url: string; handle: string; followers: number }[];
  followers: number;
  avg_views: number;
  engagement_rate: number;
  rates: { label: string; value: number; addon: boolean }[];
  currency: string;
  agency: string;
  contact_email: string;
  updated_at: string;
  /** Only numbers proven by a media kit or analytics screenshot. */
  audience?: { top_countries: { country: string; pct: number }[]; age_ranges: { range: string; pct: number }[]; gender_female_pct: number; source: string };
};

export type KitOptions = { about: string; showRates: boolean; showContact: boolean; contactEmail: string; showAudience?: boolean };

const SLUG_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
export const newSlug = (length = 14) => Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) => SLUG_CHARS[b % SLUG_CHARS.length]).join("");

const safeUrl = (url: string) => (/^https?:\/\//i.test(url) ? url : "");
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export const snapshot = (creator: Creator, options: KitOptions, ctx: { currency: string; agency: string }): KitData => ({
  v: 1,
  name: creator.name,
  niche: creator.niche || "",
  country: creator.country || "",
  platform: creator.platform,
  about: options.about.trim().slice(0, 1200),
  socials: (creator.socials || []).filter((s) => safeUrl(s.url)).map((s) => ({ platform: s.platform, url: safeUrl(s.url), handle: s.handle || "", followers: s.followers || 0 })),
  followers: (creator.socials || []).reduce((sum, s) => sum + (s.followers || 0), 0),
  avg_views: creator.avg_views || 0,
  engagement_rate: creator.engagement_rate || 0,
  // Brands see the creator's list price — never what you negotiated.
  rates: options.showRates ? RATE_FIELDS.filter((f) => (creator.rates?.[f.key] || 0) > 0).map((f) => ({ label: f.label, value: creator.rate_meta?.[f.key]?.list || creator.rates[f.key], addon: f.group === "addon" })) : [],
  audience: options.showAudience !== false && creator.audience?.verified && (creator.audience.verified.top_countries.length || creator.audience.verified.age_ranges.length || creator.audience.verified.gender_female_pct)
    ? { top_countries: creator.audience.verified.top_countries.slice(0, 5), age_ranges: creator.audience.verified.age_ranges.slice(0, 6), gender_female_pct: creator.audience.verified.gender_female_pct, source: creator.audience.verified.kind === "stats_screenshot" ? "platform analytics" : "the creator's media kit" }
    : undefined,
  currency: ctx.currency,
  agency: ctx.agency,
  contact_email: options.showContact && validEmail(options.contactEmail) ? options.contactEmail.trim() : "",
  updated_at: new Date().toISOString(),
});

export const kitUrl = (slug: string) => `${window.location.origin}${import.meta.env.BASE_URL || "/"}#/kit/${slug}`;

export async function loadKit(creatorId: string) {
  const { data, error } = await supabase.from("media_kits").select("slug, data, views, updated_at").eq("creator_id", creatorId).maybeSingle();
  if (error) return { error: error.message };
  return { kit: data as { slug: string; data: KitData; views: number; updated_at: string } | null };
}

export async function saveKit(userId: string, creatorId: string, data: KitData, slug?: string) {
  const row = { slug: slug || newSlug(), user_id: userId, creator_id: creatorId, data, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("media_kits").upsert(row, { onConflict: "user_id,creator_id" });
  if (error) return { error: error.message };
  return { slug: row.slug };
}

export async function deleteKit(creatorId: string) {
  const { error } = await supabase.from("media_kits").delete().eq("creator_id", creatorId);
  return { error: error?.message };
}

export async function fetchPublicKit(slug: string) {
  if (!/^[A-Za-z0-9]{10,32}$/.test(slug)) return null;
  const { data, error } = await supabase.rpc("get_media_kit", { p_slug: slug });
  if (error || !data || typeof data !== "object") return null;
  return data as KitData;
}
