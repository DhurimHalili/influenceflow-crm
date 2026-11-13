// YouTube channel facts for the CRM — one place for the quick fill, the
// "Refresh" buttons and the hourly background refresh, so all three agree.
//
//   • the channel is found from whatever was pasted: youtube.com/@handle,
//     /channel/UC…, /user/…, /c/… (one search), a video or Short link, or @handle
//   • average views = the latest 12 long videos from the channel's Videos tab
//     (YouTube's own list: no Shorts, no past live streams — the plain uploads
//     list counts a finished 4-hour stream as a video), videos younger than
//     1 day left out (a video still collecting its first views would drag the
//     number down; Settings can include them),
//     minus the highest and the lowest
//     → the mean of the 10 in the middle; one viral hit or one flop never
//     moves the number
//   • engagement rate = (likes + comments) ÷ views over those same 10 videos
//   • a business email is taken from the channel description when it is
//     written there; YouTube hides the "View email address" one behind a
//     captcha, so that is flagged for you to open, never guessed
//   • stars (quick fill only): engagement and upload consistency from the
//     numbers, audience from the channel's country; niche fit stays yours
//   • niche + sub-niche from what the channel actually makes: YouTube's own
//     topic categories, the description, and the titles/tags of the latest
//     videos (e.g. "Gaming · Mac gaming"). Rules only — no AI quota.
// Uses about 3 quota units per channel (+2 when the Videos tab list is missing,
// +100 for a /c/ name search). The videos behind the average are kept (sample).
// Pure helpers are exported for tests; nothing here touches the database.

const YT = "https://www.googleapis.com/youtube/v3";

export type ChannelRef = { kind: "id" | "handle" | "user" | "custom" | "video"; value: string };
export type Stars = { engagement: number; consistency: number; demographics: number };
export type ChannelFacts = {
  channelId: string; handle: string; title: string; url: string; country: string; thumbnail: string;
  subscribers: number; hiddenSubscribers: boolean; videoCount: number; totalViews: number;
  avgViews: number; engagementRate: number; sampled: number; uploads90d: number; lastUploadAt: string;
  emails: string[]; businessEmailHidden: boolean; stars: Stars; at: string;
  niche: string; subNiche: string; includesRecent: boolean;
  /** The videos behind the average, newest first; "high"/"low" = the one left out. */
  sample: SampleVideo[];
};
export type SampleVideo = { id: string; title: string; views: number; at: string; cut?: "high" | "low" };
export type Video = {
  id: string; views: number; likes: number; comments: number; secs: number; at: string; title: string; tags: string[];
  /** liveBroadcastContent: "none" once it's a normal video (also for a finished stream). */
  live: string;
  /** It was broadcast live (or premiered) — liveStreamingDetails.actualStartTime is set. */
  stream: boolean;
  /** Came from the channel's Videos tab (long videos only, YouTube's own split). */
  videosTab?: boolean;
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

/**
 * Average views + ER from a channel's latest videos:
 *   the latest 12 long videos that are 1 day+ old (any age with includeRecent),
 *   minus the single highest and lowest → the mean of the middle 10.
 * Long = from the Videos tab (YouTube already left out Shorts and streams), or,
 * from the plain uploads list, over 3 minutes and never broadcast live.
 * A Shorts-only channel falls back to its latest 12 settled videos of any length
 * (still no streams).
 */
export function averageOf(videos: Video[], now: Date, opts: { includeRecent?: boolean } = {}) {
  const settled = opts.includeRecent ? Infinity : now.getTime() - 86400000;
  const newest = [...videos].filter((v) => v.live === "none" && new Date(v.at).getTime() < settled).sort((a, b) => b.at.localeCompare(a.at));
  const notStream = (v: Video) => v.videosTab || !v.stream;
  let pick = newest.filter((v) => notStream(v) && (v.videosTab || v.secs > 180)).slice(0, 12);
  if (pick.length < 4) pick = newest.filter(notStream).slice(0, 12);
  const sorted = [...pick].sort((a, b) => a.views - b.views);
  const trim = sorted.length >= 4;
  const middle = trim ? sorted.slice(1, -1) : sorted;
  const views = middle.reduce((s, v) => s + v.views, 0);
  const low = trim ? sorted[0] : null;
  const high = trim ? sorted[sorted.length - 1] : null;
  return {
    avgViews: Math.round(middleMean(pick.map((v) => v.views))),
    engagementRate: views ? Math.round(((middle.reduce((s, v) => s + v.likes + v.comments, 0) / views) * 100) * 100) / 100 : 0,
    sampled: middle.length,
    sample: pick.map((v): SampleVideo => ({ id: v.id, title: v.title.slice(0, 160), views: v.views, at: v.at, ...(v === high ? { cut: "high" as const } : v === low ? { cut: "low" as const } : {}) })),
  };
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

// ---- niche ------------------------------------------------------------------------

type NicheDef = { niche: string; topics: RegExp; words: RegExp; subs: [string, RegExp][] };
const W = (list: string) => new RegExp(`(?:^|[^a-z0-9])(?:${list})(?:$|[^a-z0-9])`, "i");
// Order matters only for ties: more specific niches first.
const NICHES: NicheDef[] = [
  { niche: "Gaming", topics: /video_game|action_game|role-playing_video_game|strategy_video_game|action-adventure_game|sports_game|simulation_video_game|puzzle_video_game|casual_game|music_video_game|racing_video_game/i,
    words: W("gaming|gameplay|gamer|playthrough|walkthrough|let'?s play|speedrun|esports?|steam deck|xbox|ps5|ps4|playstation|nintendo|switch 2|minecraft|fortnite|roblox|gta|elden ring|call of duty|valorant|game"),
    subs: [["Mac gaming", W("mac gaming|on mac|macbook|apple silicon|m[1-5] (?:pro|max|ultra)?|macos|crossover|whisky|game porting toolkit")], ["Minecraft", W("minecraft")], ["Fortnite", W("fortnite")], ["Roblox", W("roblox")], ["Shooters", W("call of duty|cod|warzone|valorant|cs2|counter-?strike|apex|battlefield|halo|overwatch|rainbow six")], ["Retro gaming", W("retro|snes|n64|gamecube|gameboy|game boy|sega|dreamcast|ps1|ps2|emulat\\w*|arcade")], ["Nintendo", W("nintendo|switch|zelda|mario|pok[eé]mon|smash")], ["PC gaming", W("pc gaming|steam|rtx|fps test|benchmark|graphics settings")], ["Mobile gaming", W("mobile game|clash|brawl stars|genshin|pubg mobile")], ["Horror games", W("horror|scary|fnaf|five nights")], ["GTA & open world", W("gta|red dead|open world")], ["Strategy & sims", W("strategy|simulator|city builder|civilization|cities skylines|sims")]] },
  { niche: "Tech", topics: /technology|computer|consumer_electronics|mobile_phone|smartphone/i,
    words: W("tech|review|unboxing|gadget|setup|laptop|iphone|android|smartphone|pc build|gpu|cpu|apple|samsung|pixel|ai|chatgpt|software|tutorial|headphones|camera|keyboard|monitor"),
    subs: [["Apple", W("iphone|ipad|macbook|mac mini|imac|mac studio|apple|ios|airpods|vision pro|apple watch")], ["Android & phones", W("android|samsung|galaxy|pixel|oneplus|xiaomi|smartphone|phone")], ["PC building", W("pc build|build a pc|gpu|cpu|rtx|radeon|ryzen|intel|motherboard|ssd|gaming pc")], ["AI", W("ai|chatgpt|openai|gpt|llm|gemini|claude|midjourney|artificial intelligence")], ["Audio", W("headphones|earbuds|speaker|audio|dac|iem")], ["Smart home", W("smart home|home assistant|alexa|homekit|robot vacuum")], ["Software & how-to", W("tutorial|how to|tips|tricks|windows|excel|app|software|productivity")], ["Coding", W("coding|programming|developer|python|javascript|react|code")], ["Desk setups", W("desk setup|setup tour|workspace|keyboard|mechanical keyboard|monitor")]] },
  { niche: "Beauty", topics: /physical_attractiveness|cosmetics/i, words: W("makeup|skincare|skin care|beauty|grwm|get ready with me|lipstick|foundation|hair|nails|serum"),
    subs: [["Makeup", W("makeup|lipstick|foundation|eyeshadow|concealer")], ["Skincare", W("skincare|skin care|serum|acne|spf|retinol")], ["Hair", W("hair|curls|haircut|hairstyle")], ["Nails", W("nails|manicure|nail art")]] },
  { niche: "Fashion", topics: /fashion/i, words: W("outfit|haul|streetwear|style|lookbook|sneakers?|fashion|try on|ootd|thrift"),
    subs: [["Streetwear & sneakers", W("streetwear|sneakers?|jordan|yeezy|nike|hype")], ["Hauls & try-ons", W("haul|try on|try-on|thrift")], ["Menswear", W("menswear|men'?s style|suit")]] },
  { niche: "Fitness", topics: /physical_fitness|health/i, words: W("workout|gym|fitness|bodybuilding|calisthenics|yoga|running|marathon|weight loss|protein|training|abs|hiit"),
    subs: [["Bodybuilding", W("bodybuilding|bulk|cut|hypertrophy|physique")], ["Calisthenics", W("calisthenics|pull ?ups?|street workout")], ["Running", W("running|marathon|5k|10k|ultra")], ["Yoga & mobility", W("yoga|mobility|stretch|pilates")], ["Weight loss", W("weight loss|fat loss|diet|calorie")]] },
  { niche: "Food & cooking", topics: /food|cooking|recipe/i, words: W("recipe|cooking|cook|baking|bake|food|kitchen|chef|meal prep|mukbang|eating|restaurant|vegan"),
    subs: [["Recipes", W("recipe|cook|how to make")], ["Baking", W("baking|bake|cake|bread|dessert|cookies")], ["Food reviews", W("food review|restaurant|trying|taste test|mukbang|street food")], ["Healthy & vegan", W("vegan|healthy|meal prep|plant based")]] },
  { niche: "Travel", topics: /tourism|travel/i, words: W("travel|trip|vlog|visiting|tour|backpacking|van life|vanlife|hotel|flight|airport|city guide|things to do"),
    subs: [["Van life", W("van life|vanlife|camper|rv")], ["Luxury travel", W("luxury|first class|business class|resort")], ["Budget & backpacking", W("budget|backpacking|hostel|cheap")], ["City guides", W("things to do|city guide|where to eat")]] },
  { niche: "Finance & business", topics: /business|finance/i, words: W("investing|stocks?|crypto|bitcoin|money|side hustle|real estate|entrepreneur|passive income|business|trading|finance|budget|wealth"),
    subs: [["Investing", W("investing|stocks?|etf|index fund|dividend|portfolio")], ["Crypto", W("crypto|bitcoin|ethereum|altcoin|nft")], ["Side hustles", W("side hustle|make money|passive income|dropshipping|amazon fba")], ["Real estate", W("real estate|property|rental|airbnb")], ["Business & startups", W("startup|entrepreneur|founder|business|marketing")]] },
  { niche: "Education & science", topics: /knowledge|science|history|physics|astronomy/i, words: W("explained|science|history|physics|math|space|engineering|documentary|how does|why do|lesson|learn"),
    subs: [["Science", W("science|physics|chemistry|biology|experiment")], ["Space", W("space|nasa|spacex|planet|universe|astronomy")], ["History", W("history|historical|ancient|ww2|war")], ["Engineering", W("engineering|how it'?s made|machine|build")]] },
  { niche: "Cars", topics: /vehicle|automobile|motorsport/i, words: W("car|cars|supercar|ev|tesla|bmw|porsche|ferrari|lamborghini|drive|driving|detailing|engine|f1|formula 1|motorsport|truck"),
    subs: [["Electric cars", W("ev|electric|tesla|rivian|charging")], ["Supercars", W("supercar|ferrari|lamborghini|mclaren|bugatti")], ["Detailing", W("detailing|ceramic|wash")], ["Motorsport", W("f1|formula 1|motorsport|racing|nascar")], ["Car reviews", W("review|test drive|walkaround")]] },
  { niche: "Music", topics: /music|hip_hop|pop_music|rock_music|electronic_music|classical_music|jazz|country_music|rhythm_and_blues|reggae|soul_music|independent_music/i, words: W("music|song|cover|official video|music video|guitar|piano|drums|beat|producer|album|lyrics|remix|rapper"),
    subs: [["Covers", W("cover|acoustic")], ["Production", W("producer|beat|ableton|fl studio|mixing")], ["Instruments", W("guitar|piano|drums|bass|violin")]] },
  { niche: "Sports", topics: /sport|association_football|basketball|american_football|baseball|cricket|golf|tennis|boxing|mixed_martial_arts|ice_hockey|wrestling/i, words: W("football|soccer|nba|basketball|nfl|cricket|golf|tennis|ufc|mma|boxing|premier league|highlights|match"),
    subs: [["Football", W("football|soccer|premier league|champions league|fifa")], ["Basketball", W("nba|basketball")], ["Combat sports", W("ufc|mma|boxing|fight")], ["Golf", W("golf")]] },
  { niche: "Comedy & entertainment", topics: /humour|entertainment|television_program|film/i, words: W("comedy|funny|sketch|prank|reaction|reacting|challenge|meme|try not to laugh|skit"),
    subs: [["Sketches", W("sketch|skit|parody")], ["Reactions", W("reaction|reacting|reacts")], ["Challenges & pranks", W("challenge|prank|24 hours|last to leave")]] },
  { niche: "Lifestyle & vlogs", topics: /lifestyle_\(sociology\)/i, words: W("vlog|day in my life|routine|morning routine|weekly vlog|life update|apartment|moving|self care"),
    subs: [["Daily vlogs", W("vlog|day in my life|weekly")], ["Productivity", W("productivity|routine|study with me|habits")], ["Minimalism", W("minimalism|declutter|minimalist")]] },
  { niche: "Parenting & family", topics: /parenting|family/i, words: W("baby|pregnancy|pregnant|mom|dad|kids|toddler|family vlog|newborn|parenting"), subs: [["Family vlogs", W("family vlog|our family")], ["Baby & pregnancy", W("baby|pregnan\\w*|newborn")]] },
  { niche: "Pets & animals", topics: /pet|animal/i, words: W("dog|cat|puppy|kitten|pet|animals|rescue|aquarium"), subs: [["Dogs", W("dog|puppy")], ["Cats", W("cat|kitten")]] },
  { niche: "DIY & home", topics: /hobby|home_improvement/i, words: W("diy|renovation|woodworking|interior|garden|gardening|organization|organize|home tour|build|restore|restoration"),
    subs: [["Woodworking", W("woodworking|wood|carpentry")], ["Home renovation", W("renovation|remodel|flip")], ["Gardening", W("garden|gardening|plants")], ["Restoration", W("restore|restoration|rusty")]] },
  { niche: "Art & design", topics: /visual_arts|performing_arts/i, words: W("drawing|painting|art|animation|illustration|sketchbook|procreate|design|digital art"), subs: [["Drawing & painting", W("drawing|painting|sketchbook|watercolor")], ["Animation", W("animation|animated|animator")], ["Digital art", W("procreate|digital art|photoshop")]] },
  { niche: "Photography & film", topics: /photography|film/i, words: W("photography|photographer|camera|filmmaking|cinematic|editing|premiere|davinci|lens|drone"), subs: [["Filmmaking", W("filmmaking|cinematic|short film")], ["Camera gear", W("camera|lens|sony|canon|nikon|fujifilm")], ["Editing", W("editing|premiere|davinci|final cut|after effects")]] },
  { niche: "Outdoors", topics: /outdoor/i, words: W("camping|fishing|hunting|hiking|bushcraft|survival|overlanding|kayak"), subs: [["Fishing", W("fishing|bass|carp")], ["Camping & bushcraft", W("camping|bushcraft|survival|shelter")], ["Hiking", W("hiking|trail|mountain")]] },
  { niche: "News & commentary", topics: /politics|society/i, words: W("news|commentary|politics|drama|podcast|opinion|debate|exposed|controversy"), subs: [["Podcasts", W("podcast|episode|ep\\.? ?\\d+")], ["Internet drama", W("drama|exposed|controversy|tea")], ["Politics", W("politics|election|government")]] },
  { niche: "Kids", topics: /children|kids/i, words: W("nursery rhymes|kids songs|for kids|toys|toy review|cocomelon|learning colors"), subs: [["Toys", W("toys?|toy review|unboxing toys")]] },
];

/** The niche and sub-niche a channel's own content shows. Empty when nothing is clear. */
export function nicheOf(input: { topics: string[]; description: string; titles: string[]; tags: string[] }): { niche: string; subNiche: string } {
  const titles = input.titles.slice(0, 30).map((t) => t.toLowerCase());
  const desc = (input.description || "").toLowerCase();
  const tags = input.tags.slice(0, 200).map((t) => t.toLowerCase());
  const topics = input.topics.map((t) => decodeURIComponent(t.split("/wiki/")[1] || t).toLowerCase());
  const count = (re: RegExp, list: string[]) => list.reduce((n, x) => n + (re.test(x) ? 1 : 0), 0);
  let best: { def: NicheDef; score: number } | null = null;
  for (const def of NICHES) {
    const score = count(def.topics, topics) * 4 + count(def.words, titles) * 1.5 + (def.words.test(desc) ? 3 : 0) + Math.min(6, count(def.words, tags) * 0.5);
    if (!best || score > best.score) best = { def, score };
  }
  if (!best || best.score < 4) return { niche: "", subNiche: "" };
  let sub = "", subScore = 0;
  for (const [name, re] of best.def.subs) {
    const s = count(re, titles) * 1.5 + (re.test(desc) ? 2 : 0) + Math.min(4, count(re, tags) * 0.5);
    if (s > subScore) { sub = name; subScore = s; }
  }
  return { niche: best.def.niche, subNiche: subScore >= 3 ? sub : "" };
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
export async function channelFacts(input: string, now = new Date(), opts: { includeRecent?: boolean } = {}): Promise<ChannelFacts | null> {
  const ref = parseChannelRef(input);
  if (!ref) return null;
  const id = await channelIdFor(ref);
  if (!id) return null;
  const ch = (await api("channels", { part: "snippet,statistics,contentDetails,brandingSettings,topicDetails", id })).items?.[0];
  if (!ch) return null;
  const uploads = ch.contentDetails?.relatedPlaylists?.uploads || "";
  // The channel's "Videos" tab as its own playlist (UULF…): long videos only —
  // no Shorts and no past live streams. The plain uploads list (UU…) mixes all
  // three, and a finished stream looks like a normal video there.
  const longList = /^UC[\w-]{22}$/.test(id) ? `UULF${id.slice(2)}` : "";
  const listed = async (playlistId: string) => {
    const got = await api("playlistItems", { part: "contentDetails", playlistId, maxResults: "40" });
    return (got.items || []).map((i: { contentDetails?: { videoId?: string } }) => i.contentDetails?.videoId).filter(Boolean).slice(0, 40) as string[];
  };
  const read = async (ids: string[]) => {
    const out: Video[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const got = await api("videos", { part: "statistics,contentDetails,snippet,liveStreamingDetails", id: ids.slice(i, i + 50).join(",") });
      for (const v of got.items || []) out.push({ id: String(v.id || ""), views: Number(v.statistics?.viewCount || 0), likes: Number(v.statistics?.likeCount || 0), comments: Number(v.statistics?.commentCount || 0), secs: seconds(v.contentDetails?.duration || ""), at: v.snippet?.publishedAt || "", live: v.snippet?.liveBroadcastContent || "none", stream: !!v.liveStreamingDetails?.actualStartTime, title: String(v.snippet?.title || ""), tags: Array.isArray(v.snippet?.tags) ? v.snippet.tags.map(String) : [] });
    }
    return out;
  };
  // The Videos tab first; the full uploads list only when it is missing or too
  // thin (a Shorts-only channel), and then streams are filtered out by hand.
  const longIds = longList ? await listed(longList).catch(() => []) : [];
  let videos: Video[] = longIds.length ? (await read(longIds)).map((v) => ({ ...v, videosTab: true })) : [];
  let avg = averageOf(videos, now, opts);
  if (avg.sampled < 4 && uploads) {
    const all = await read(await listed(uploads).catch(() => []));
    const avgAll = averageOf(all, now, opts);
    if (avgAll.sampled > avg.sampled) { videos = all; avg = avgAll; }
  }
  videos.sort((a, b) => b.at.localeCompare(a.at));
  const engagementRate = avg.engagementRate;
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
    avgViews: avg.avgViews, engagementRate, sampled: avg.sampled, sample: avg.sample, uploads90d, lastUploadAt: videos[0]?.at || "",
    emails, businessEmailHidden: !emails.length, at: now.toISOString(), includesRecent: !!opts.includeRecent,
    ...nicheOf({ topics: [...(ch.topicDetails?.topicCategories || [])].map(String), description, titles: videos.map((v) => v.title), tags: videos.flatMap((v) => v.tags) }),
  };
  return { ...facts, stars: starsFor(facts) };
}

// ---- reading a channel's videos (brand-match) ------------------------------------

export type FullVideo = { id: string; title: string; description: string; tags: string[]; at: string; secs: number; views: number; paid: boolean; live: string; stream: boolean };

/** The channel id behind a link / handle / id (1 unit, 0 for a plain id). */
export async function channelIdOf(input: string): Promise<string | null> {
  const ref = parseChannelRef(input);
  return ref ? await channelIdFor(ref) : null;
}

/** One page (50) of a channel's uploads, newest first: ids + publish dates. 1 unit. */
export async function uploadsPage(channelId: string, pageToken = ""): Promise<{ items: { id: string; at: string }[]; next: string }> {
  if (!/^UC[\w-]{22}$/.test(channelId)) return { items: [], next: "" };
  const got = await api("playlistItems", { part: "contentDetails", playlistId: `UU${channelId.slice(2)}`, maxResults: "50", ...(pageToken ? { pageToken } : {}) });
  const items = (got.items || []).map((i: { contentDetails?: { videoId?: string; videoPublishedAt?: string } }) => ({ id: String(i.contentDetails?.videoId || ""), at: String(i.contentDetails?.videoPublishedAt || "") })).filter((x: { id: string }) => /^[\w-]{11}$/.test(x.id));
  return { items, next: typeof got.nextPageToken === "string" ? got.nextPageToken : "" };
}

/** Full details of up to 50 videos per unit: description, tags, YouTube's paid-promotion label. */
export async function videoDetails(ids: string[]): Promise<FullVideo[]> {
  const out: FullVideo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const got = await api("videos", { part: "snippet,contentDetails,statistics,liveStreamingDetails,paidProductPlacementDetails", id: ids.slice(i, i + 50).join(",") });
    for (const v of got.items || []) out.push({
      id: String(v.id || ""), title: String(v.snippet?.title || "").slice(0, 300), description: String(v.snippet?.description || "").slice(0, 6000),
      tags: Array.isArray(v.snippet?.tags) ? v.snippet.tags.map(String).slice(0, 40) : [], at: String(v.snippet?.publishedAt || ""),
      secs: seconds(v.contentDetails?.duration || ""), views: Number(v.statistics?.viewCount || 0),
      paid: v.paidProductPlacementDetails?.hasPaidProductPlacement === true, live: String(v.snippet?.liveBroadcastContent || "none"), stream: !!v.liveStreamingDetails?.actualStartTime,
    });
  }
  return out;
}
