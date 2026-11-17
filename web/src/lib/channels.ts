// One person, many channels (app side). The rules that decide whether a found channel is really theirs live in
// supabase/functions/_shared/channels.ts and are shared with youtube-sync. This file turns a creator record into
// the channel network the profile draws: main channel, extra YouTube channels with their numbers, other networks,
// combined reach, how active each is — and handles yes / no on found channels without ever losing a record.
export * from "../../../supabase/functions/_shared/channels.ts";
import { ownLine, roleLabel, roleOf, type ChannelRole } from "../../../supabase/functions/_shared/channels.ts";
import { detectPlatform, resolveSocial, socialKey, SOCIAL_META } from "./socials";
import type { ChannelStats, Creator, CreatorChannels, FoundChannel, SocialLink, SocialPlatform } from "../types";

/** Networks where someone publishes (a channel); LinkedIn, websites and WhatsApp are contact links. */
export const CONTENT_PLATFORMS = new Set<SocialPlatform>(["YouTube", "Instagram", "TikTok", "X", "Twitch", "Kick", "Facebook", "Snapchat", "Pinterest", "Threads"]);
export const isChannel = (s: Pick<SocialLink, "platform">) => CONTENT_PLATFORMS.has(s.platform);

export type Activity = "active" | "slow" | "quiet" | "unknown";
export const ACTIVITY_LABEL: Record<Activity, string> = { active: "Active", slow: "Slowing down", quiet: "Quiet", unknown: "" };
const DAY = 86_400_000;
export function activityOf(lastUpload: string | undefined, now = Date.now()): Activity {
  const t = lastUpload ? new Date(lastUpload).getTime() : NaN;
  if (!Number.isFinite(t)) return "unknown";
  const days = (now - t) / DAY;
  return days <= 14 ? "active" : days <= 60 ? "slow" : "quiet";
}

export type NetChannel = {
  key: string; platform: SocialPlatform; url: string; handle: string; title: string;
  role: ChannelRole; roleText: string; main: boolean;
  followers: number; hidden: boolean;
  avgViews: number; uploads90d: number | null; lastUpload: string; activity: Activity;
  thumbnail: string; niche: string; stats?: ChannelStats;
};

const ROLES = new Set<ChannelRole>(["main", "second", "shorts", "clips", "podcast", "gaming", "live", "vlog", "music", "language", "other"]);
const asRole = (r: unknown): ChannelRole | null => (typeof r === "string" && ROLES.has(r as ChannelRole) ? r as ChannelRole : null);
const idOfUrl = (url: string) => /\/channel\/(UC[\w-]{22})/.exec(url)?.[1] || "";

/** Every channel of theirs, main first, then YouTube by size, then other networks by size. */
export function networkOf(c: Pick<Creator, "socials" | "youtube" | "channels" | "name">, now = Date.now()) {
  const ch = c.channels || {};
  const socials = c.socials || [];
  const firstYt = socials.findIndex((s) => s.platform === "YouTube");
  const channels: NetChannel[] = [];
  const mainRef = { title: c.youtube?.title || c.name || "", handle: socials[firstYt]?.handle || "" };
  socials.forEach((s, i) => {
    if (!isChannel(s)) return;
    const key = socialKey(s.url);
    const main = i === firstYt;
    const yt = s.platform === "YouTube";
    const st: ChannelStats | undefined = main ? undefined : ch.stats?.[key];
    const y = main ? c.youtube || {} : null;
    const title = (main ? y?.title : st?.title) || (s.handle ? `@${s.handle}` : s.url.replace(/^https?:\/\/(www\.)?/, ""));
    const auto = yt ? (main ? { role: "main" as ChannelRole } : st?.role && asRole(st.role) ? { role: asRole(st.role)!, language: st.language } : roleOf({ title: st?.title || s.handle, handle: s.handle }, mainRef)) : { role: "other" as ChannelRole };
    const role = asRole(ch.roles?.[key]) || auto.role;
    const lastUpload = (main ? y?.last_upload_at : st?.last_upload_at) || "";
    const followers = (main ? y?.subscribers : st?.subscribers) || s.followers || 0;
    channels.push({
      key, platform: s.platform, url: s.url, handle: s.handle, title, role, main,
      roleText: yt ? roleLabel(role, role === auto.role ? (auto as { language?: string }).language : undefined) : SOCIAL_META[s.platform].label,
      followers, hidden: !!(main ? y?.hidden_subscribers : st?.hidden_subscribers),
      avgViews: (main ? y?.avg_views : st?.avg_views) || 0, uploads90d: yt ? ((main ? y?.uploads_90d : st?.uploads_90d) ?? null) : null,
      lastUpload, activity: yt ? activityOf(lastUpload, now) : "unknown",
      thumbnail: (main ? ch.main?.thumbnail : st?.thumbnail) || "", niche: (main ? y?.niche : st?.niche) || "", stats: st,
    });
  });
  channels.sort((a, b) => Number(b.main) - Number(a.main) || Number(b.platform === "YouTube") - Number(a.platform === "YouTube") || b.followers - a.followers);
  const reach = channels.reduce((n, x) => n + (x.hidden ? 0 : x.followers), 0);
  const links = socials.filter((s) => !isChannel(s));
  return { channels, links, reach, youtube: channels.filter((x) => x.platform === "YouTube").length, networks: new Set(channels.map((x) => x.platform)).size, found: pendingFound(c) };
}

/** Found channels still waiting for your yes / no (never one you already have or turned down). */
export function pendingFound(c: Pick<Creator, "socials" | "channels">): FoundChannel[] {
  const have = new Set((c.socials || []).map((s) => socialKey(s.url)));
  const haveIds = new Set([...(c.socials || []).map((s) => idOfUrl(s.url)), ...Object.values(c.channels?.stats || {}).map((s) => s.channel_id || "")].filter(Boolean));
  const no = new Set(c.channels?.dismissed || []);
  const yt = (c.channels?.found || []).filter((f) => (f.platform || "YouTube") === "YouTube" && !no.has(f.id) && !have.has(socialKey(f.url)) && !haveIds.has(f.id));
  return [...yt, ...socialsFound(c.channels?.links || [], c.socials || []).filter((f) => !no.has(f.id))];
}

/** How many channels they have (content networks only) and how many are waiting to be checked — for list pills. */
export function channelCounts(c: Pick<Creator, "socials" | "channels">) {
  return { channels: (c.socials || []).filter(isChannel).length, found: pendingFound(c).length };
}

/** The links of other networks in their YouTube description that are theirs by their own words. */
export function socialsFound(links: { url: string; line: string }[], socials: SocialLink[]): FoundChannel[] {
  const have = new Set(socials.map((s) => socialKey(s.url)));
  const out: FoundChannel[] = [];
  for (const l of links.slice(0, 30)) {
    const platform = detectPlatform(l.url);
    if (!platform || !CONTENT_PLATFORMS.has(platform) || platform === "YouTube") continue;
    const r = resolveSocial(l.url, platform);
    if (!r || !r.handle || have.has(socialKey(r.url))) continue;
    if (!ownLine(l.line, l.url)) continue;
    have.add(socialKey(r.url));
    out.push({ id: socialKey(r.url), url: r.url, title: `@${r.handle}`, handle: r.handle, platform, level: "sure", why: [`Linked in their YouTube description: “${l.line.slice(0, 90)}”`] });
  }
  return out.slice(0, 8);
}

export type DiscoveryAnswer = {
  main?: { id: string; title: string; handle: string; thumbnail: string };
  found?: (FoundChannel & { role?: string })[];
  extras?: { link: string; ok: boolean; facts?: ChannelStats }[];
  links?: { url: string; line: string }[];
};

/** A youtube-sync "channels" answer merged into what the record had. Dismissed stays dismissed; stats only grow. */
export function mergeDiscovery(prev: CreatorChannels | undefined, ans: DiscoveryAnswer, _socials: SocialLink[], opts: { discovered: boolean; now?: string }): CreatorChannels {
  const p = prev || {};
  const stats = { ...(p.stats || {}) };
  for (const e of ans.extras || []) if (e.ok && e.facts) stats[socialKey(e.link)] = e.facts;
  const found = opts.discovered ? (ans.found || []).map((f) => ({ ...f, platform: "YouTube" as SocialPlatform })) : p.found || [];
  return { ...p, stats, found, ...(opts.discovered ? { at: opts.now || new Date().toISOString(), links: (ans.links || []).slice(0, 30) } : {}), ...(ans.main ? { main: { id: ans.main.id, title: ans.main.title, thumbnail: ans.main.thumbnail } } : {}) };
}

/** Yes, theirs: the channel joins their socials (at the end — the main channel never changes) with what we know. */
export function linkFound(c: Pick<Creator, "socials" | "channels">, f: FoundChannel): { socials: SocialLink[]; channels: CreatorChannels } {
  const platform: SocialPlatform = f.platform || "YouTube";
  const social: SocialLink = { platform, url: f.url, handle: f.handle || "", followers: f.subscribers || 0 };
  const ch = c.channels || {};
  const key = socialKey(f.url);
  const stats = platform === "YouTube" ? { ...(ch.stats || {}), [key]: { channel_id: f.id, title: f.title, handle: f.handle, url: f.url, thumbnail: f.thumbnail, subscribers: f.subscribers, hidden_subscribers: f.hidden_subscribers, video_count: f.video_count, total_views: f.total_views, uploads_90d: f.uploads_90d, last_upload_at: f.last_upload_at, role: f.role, language: f.language, at: new Date().toISOString() } } : ch.stats;
  return { socials: [...(c.socials || []), social], channels: { ...ch, stats, found: (ch.found || []).filter((x) => x.id !== f.id) } };
}

/** Not theirs: never offered again (the id is kept). */
export function dismissFound(ch: CreatorChannels | undefined, id: string): CreatorChannels {
  const c = ch || {};
  return { ...c, dismissed: [...new Set([...(c.dismissed || []), id])].slice(-200) };
}

/** Another record in your list that has this channel (same YouTube channel id or the same link). */
export function twinsOf(c: Pick<Creator, "id">, all: Pick<Creator, "id" | "name" | "socials" | "youtube" | "channels" | "archived_at">[]) {
  const byKey = new Map<string, { id: string; name: string }>();
  for (const o of all) {
    if (o.id === c.id || o.archived_at) continue;
    for (const s of o.socials || []) if (isChannel(s)) byKey.set(socialKey(s.url), { id: o.id, name: o.name });
    if (o.youtube?.channel_id) byKey.set(o.youtube.channel_id, { id: o.id, name: o.name });
    for (const st of Object.values(o.channels?.stats || {})) if (st.channel_id) byKey.set(st.channel_id, { id: o.id, name: o.name });
  }
  return (key: string, channelId?: string) => byKey.get(key) || (channelId ? byKey.get(channelId) : undefined);
}

/** Extra YouTube channels whose numbers are older than `days` (or missing) — refreshed with the next search. */
export function staleExtras(c: Pick<Creator, "socials" | "channels">, days = 3, now = Date.now()) {
  const yts = (c.socials || []).filter((s) => s.platform === "YouTube").slice(1);
  return yts.filter((s) => { const at = c.channels?.stats?.[socialKey(s.url)]?.at; return !at || now - new Date(at).getTime() > days * DAY; })
    .map((s) => ({ link: s.url, id: c.channels?.stats?.[socialKey(s.url)]?.channel_id || idOfUrl(s.url) }));
}
