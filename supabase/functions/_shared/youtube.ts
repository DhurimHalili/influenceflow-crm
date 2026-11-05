// YouTube channel facts for the CRM — one place for the quick fill, the
// "Refresh" buttons and the hourly background refresh, so all three agree.
//
//   • the channel is found from whatever was pasted: youtube.com/@handle,
//     /channel/UC…, /user/…, /c/… (one search), a video or Short link, or @handle
//   • average views = the latest 12 long videos (Shorts, live streams and
//     videos younger than 2 days left out), minus the highest and the lowest
//     → the mean of the 10 in the middle; one viral hit or one flop never
//     moves the number
//   • engagement rate = (likes + comments) ÷ views over those same 10 videos
//   • a business email is taken from the channel description when it is
//     written there; YouTube hides the "View email address" one behind a
//     captcha, so that is flagged for you to open, never guessed
//   • stars (quick fill only): engagement and upload consistency from the
//     numbers, audience from the channel's country; niche fit stays yours
// Uses about 3 quota units per channel (+100 for a /c/ name search).
// Pure helpers are exported for tests; nothing here touches the database.

const YT = "https://www.googleapis.com/youtube/v3";

export type ChannelRef = { kind: "id" | "handle" | "user" | "custom" | "video"; value: string };
export type Stars = { engagement: number; consistency: number; demographics: number };
export type ChannelFacts = {
  channelId: string; handle: string; title: string; url: string; country: string; thumbnail: string;
  subscribers: number; hiddenSubscribers: boolean; videoCount: number; totalViews: number;
  avgViews: number; engagementRate: number; sampled: number; uploads90d: number; lastUploadAt: string;
  emails: string[]; businessEmailHidden: boolean; stars: Stars; at: string;
};

export class YouTubeQuota extends Error {
  constructor() { super("Every YouTube key is out of quota for today"); }
}

/** Which channel a pasted link, handle or id points to. */
export function parseChannelRef(input: string): ChannelRef | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (/^UC[\w-]{22}$/.test(raw)) return { kind: "id", value: raw };
  if (/^@[\w.\-·]{2,100}$/.test(raw)) return { kind: "handle", value: raw.slice(1) };
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  if (host === "youtu.be") { const id = u.pathname.slice(1).split("/")[0]; return /^[\w-]{11}$/.test(id) ? { kind: "video", value: id } : null; }
  if (host !== "youtube.com") return null;
  const parts = u.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));
  if (!parts.length) { const v = u.searchParams.get("v"); return v && /^[\w-]{11}$/.test(v) ? { kind: "video", value: v } : null; }
  if (parts[0] === "watch") { const v = u.searchParams.get("v"); return v && /^[\w-]{11}$/.test(v) ? { kind: "video", value: v } : null; }
  if ((parts[0] === "shorts" || parts[0] === "live" || parts[0] === "embed") && /^[\w-]{11}$/.test(parts[1] || "")) return { kind: "video", value: parts[1] };
  if (parts[0].startsWith("@")) return { kind: "handle", value: parts[0].slice(1) };
  if (parts[0] === "channel" && /^UC[\w-]{22}$/.test(parts[1] || "")) return { kind: "id", value: parts[1] };
  if (parts[0] === "user" && parts[1]) return { kind: "user", value: parts[1] };
  if (parts[0] === "c" && parts[1]) return { kind: "custom", value: parts[1] };
  return null;
}

/** ISO 8601 duration ("PT1H2M3S") in seconds. */
export const seconds = (iso: string) => {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || "");
  return m ? (Number(m[1] || 0) * 86400) + (Number(m[2] || 0) * 3600) + (Number(m[3] || 0) * 60) + Number(m[4] || 0) : 0;
};

/** Mean of the middle: with 4+ values the single highest and lowest are dropped. */
export function middleMean(values: number[]) {
  const v = values.filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  const mid = v.length >= 4 ? v.slice(1, -1) : v;
  return mid.length ? mid.reduce((s, x) => s + x, 0) / mid.length : 0;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
/** Business emails written in a channel description (no image/file look-alikes). */
export const emailsIn = (text: string) =>
  Array.from(new Set((String(text || "").match(EMAIL) || []).map((e) => e.toLowerCase().replace(/[.,;:]+$/, ""))))
    .filter((e) => !/\.(png|jpe?g|gif|webp|svg)$/i.test(e) && !/^(noreply|no-reply)@/.test(e))
    .slice(0, 3);

const TIER1 = new Set(["US", "GB", "CA", "AU"]);
const TIER2 = new Set(["DE", "FR", "NL", "SE", "NO", "DK", "CH", "AT", "IE", "NZ", "BE", "FI", "LU"]);
const TIER3 = new Set(["ES", "IT", "PT", "PL", "CZ", "JP", "KR", "SG", "AE", "IL", "HK", "TW", "SA", "QA"]);

export function starsFor(f: { engagementRate: number; uploads90d: number; country: string; sampled: number }): Stars {
  const er = f.engagementRate;
  const engagement = !f.sampled ? 0 : er >= 6 ? 5 : er >= 4 ? 4 : er >= 2.5 ? 3 : er >= 1.2 ? 2 : 1;
  const u = f.uploads90d;
  const consistency = u >= 12 ? 5 : u >= 8 ? 4 : u >= 4 ? 3 : u >= 2 ? 2 : 1;
  const c = (f.country || "").toUpperCase();
  const demographics = !c ? 0 : TIER1.has(c) ? 5 : TIER2.has(c) ? 4 : TIER3.has(c) ? 3 : 2;
  return { engagement, consistency, demographics };
}

// ---- API ------------------------------------------------------------------------

const keys = () => Array.from(new Set(`${Deno.env.get("YOUTUBE_API_KEYS") || ""},${Deno.env.get("YOUTUBE_API_KEY") || ""}`.split(/[\s,;]+/).map((k) => k.trim()).filter((k) => /^[\w-]{20,60}$/.test(k))));
export const youtubeConfigured = () => keys().length > 0;
const dead = new Set<string>();

// deno-lint-ignore no-explicit-any
async function api(path: string, params: Record<string, string>): Promise<any> {
  for (const key of keys()) {
    if (dead.has(key)) continue;
    const q = new URLSearchParams({ ...params, key });
    const res = await fetch(`${YT}/${path}?${q}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!res) throw new Error("YouTube didn't answer — try again in a moment");
    if (res.status === 403 || res.status === 429) {
      const body = await res.text().catch(() => "");
      if (/quota|rateLimit|dailyLimit|keyInvalid|accessNotConfigured|forbidden/i.test(body)) { dead.add(key); continue; }
    }
    if (res.status === 400) {
      const body = await res.text().catch(() => "");
      if (/API key not valid|keyInvalid/i.test(body)) { dead.add(key); continue; }
      throw new Error("YouTube couldn't read that channel");
    }
    if (!res.ok) throw new Error(`YouTube answered ${res.status} — try again in a moment`);
    return res.json();
  }
  throw new YouTubeQuota();
}

async function channelIdFor(ref: ChannelRef): Promise<string | null> {
  if (ref.kind === "id") return ref.value;
  if (ref.kind === "handle") return (await api("channels", { part: "id", forHandle: `@${ref.value}` })).items?.[0]?.id || null;
  if (ref.kind === "user") return (await api("channels", { part: "id", forUsername: ref.value })).items?.[0]?.id || null;
  if (ref.kind === "video") return (await api("videos", { part: "snippet", id: ref.value })).items?.[0]?.snippet?.channelId || null;
  // /c/name: try it as a handle first (most /c/ names became handles), then one search.
  const asHandle = (await api("channels", { part: "id", forHandle: `@${ref.value}` })).items?.[0]?.id;
  if (asHandle) return asHandle;
  return (await api("search", { part: "snippet", type: "channel", q: ref.value, maxResults: "1" })).items?.[0]?.snippet?.channelId || null;
}

/** Everything the CRM knows how to use about one channel. Null when it can't be found. */
export async function channelFacts(input: string, now = new Date()): Promise<ChannelFacts | null> {
  const ref = parseChannelRef(input);
  if (!ref) return null;
  const id = await channelIdFor(ref);
  if (!id) return null;
  const ch = (await api("channels", { part: "snippet,statistics,contentDetails,brandingSettings", id })).items?.[0];
  if (!ch) return null;
  const uploads = ch.contentDetails?.relatedPlaylists?.uploads || "";
  const items = uploads ? ((await api("playlistItems", { part: "contentDetails", playlistId: uploads, maxResults: "40" }).catch(() => ({ items: [] }))).items || []) : [];
  const ids: string[] = items.map((i: { contentDetails?: { videoId?: string } }) => i.contentDetails?.videoId).filter(Boolean).slice(0, 40);
  const videos: { views: number; likes: number; comments: number; secs: number; at: string; live: string }[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const got = await api("videos", { part: "statistics,contentDetails,snippet", id: ids.slice(i, i + 50).join(",") });
    for (const v of got.items || []) videos.push({ views: Number(v.statistics?.viewCount || 0), likes: Number(v.statistics?.likeCount || 0), comments: Number(v.statistics?.commentCount || 0), secs: seconds(v.contentDetails?.duration || ""), at: v.snippet?.publishedAt || "", live: v.snippet?.liveBroadcastContent || "none" });
  }
  videos.sort((a, b) => b.at.localeCompare(a.at));
  const settled = now.getTime() - 2 * 86400000;
  const isLong = (v: (typeof videos)[number]) => v.live === "none" && v.secs > 180 && new Date(v.at).getTime() < settled;
  let pick = videos.filter(isLong).slice(0, 12);
  // A Shorts-only channel: its latest 12 settled videos of any length.
  if (pick.length < 4) pick = videos.filter((v) => v.live === "none" && new Date(v.at).getTime() < settled).slice(0, 12);
  const sorted = [...pick].sort((a, b) => a.views - b.views);
  const middle = sorted.length >= 4 ? sorted.slice(1, -1) : sorted;
  const views = middle.reduce((s, v) => s + v.views, 0);
  const engagementRate = views ? Math.round(((middle.reduce((s, v) => s + v.likes + v.comments, 0) / views) * 100) * 100) / 100 : 0;
  const uploads90d = videos.filter((v) => new Date(v.at).getTime() > now.getTime() - 90 * 86400000).length;
  const description = String(ch.snippet?.description || "");
  const country = String(ch.snippet?.country || ch.brandingSettings?.channel?.country || "").toUpperCase().slice(0, 2);
  const handle = String(ch.snippet?.customUrl || "").replace(/^@/, "");
  const emails = emailsIn(description);
  const facts = {
    channelId: id, handle, title: String(ch.snippet?.title || "").slice(0, 200), url: handle ? `https://www.youtube.com/@${handle}` : `https://www.youtube.com/channel/${id}`,
    country, thumbnail: String(ch.snippet?.thumbnails?.medium?.url || ch.snippet?.thumbnails?.default?.url || ""),
    subscribers: ch.statistics?.hiddenSubscriberCount ? 0 : Number(ch.statistics?.subscriberCount || 0), hiddenSubscribers: !!ch.statistics?.hiddenSubscriberCount,
    videoCount: Number(ch.statistics?.videoCount || 0), totalViews: Number(ch.statistics?.viewCount || 0),
    avgViews: Math.round(middleMean(pick.map((v) => v.views))), engagementRate, sampled: middle.length, uploads90d, lastUploadAt: videos[0]?.at || "",
    emails, businessEmailHidden: !emails.length, at: now.toISOString(),
  };
  return { ...facts, stars: starsFor(facts) };
}
