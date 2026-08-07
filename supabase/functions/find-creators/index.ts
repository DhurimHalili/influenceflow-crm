import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const YT = "https://www.googleapis.com/youtube/v3";
const TARGET_DEFAULT = 50;
const VIDEOS_PER_CHANNEL = 15;
const STATS_SAMPLE = 10;
const MIN_SUBS = 50_000;
const MIN_AVG_VIEWS = 50_000;
const MIN_ENGAGEMENT = 0.01;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH_MS = 48_000;
const MAX_PAGES_PER_QUERY = 5;

type NichePack = { keywords: string[]; match: string[]; label: string };

/** Large curated discovery banks (server-only). Accuracy comes from match terms + metric gates. */
const EXTRA_QUERIES: Record<string, string[]> = {
  "sim-racing-rigs": [
    "sim racing",
    "sim racing rig",
    "sim racing cockpit",
    "sim racing setup",
    "sim racing build",
    "sim racing wheel",
    "sim racing pedals",
    "sim racing wheelbase",
    "racing simulator",
    "racing sim rig",
    "iRacing rig",
    "iRacing setup",
    "Assetto Corsa rig",
    "ACC sim racing",
    "Fanatec CSL DD",
    "Fanatec GT DD Pro",
    "Fanatec Clubsport",
    "Simagic Alpha Mini",
    "Simagic Alpha U",
    "Simagic P1000",
    "Moza R9",
    "Moza R12",
    "Moza R16",
    "Moza R21",
    "Simucube 2 Pro",
    "Simucube 2 Sport",
    "Asetek Invicta",
    "Asetek Forte",
    "Heusinkveld Sprint",
    "Heusinkveld Ultimate",
    "Logitech G Pro Racing Wheel",
    "Thrustmaster T818",
    "Thrustmaster T248",
    "Next Level Racing F-GT",
    "Trak Racer TR160",
    "Sim-Lab P1X",
    "GT Omega Prime",
    "Aspire sim racing",
    "direct drive wheel review",
    "load cell pedals review",
    "sim racing cockpit review",
    "formula sim racing",
    "gt sim racing setup",
    "sim racing desk mount",
    "sim racing triple screen",
    "sim racing vr setup",
    "best sim racing wheel 2025",
    "best sim racing wheel 2026",
    "sim racing beginners rig",
    "budget sim racing rig",
    "endurance sim racing",
    "sim racing league",
  ],
  "desk-setups": [
    "desk setup",
    "battlestation",
    "desk tour",
    "ultrawide setup",
    "gaming desk setup",
    "office desk setup",
    "minimal desk setup",
    "dual monitor setup",
    "programmer desk setup",
    "streaming desk setup",
    "desk accessories review",
    "monitor arm setup",
    "cable management desk",
    "standing desk setup",
    "home office setup tour",
  ],
  tech: [
    "tech review",
    "gadget review",
    "tech unboxing",
    "consumer electronics review",
    "new tech 2026",
    "hardware review",
    "tech creator",
    "tech tips youtube",
  ],
  ai: [
    "AI tools review",
    "ChatGPT review",
    "AI software demo",
    "best AI apps",
    "LLM tools",
    "AI agent demo",
    "OpenAI tools",
    "AI productivity tools",
  ],
};

const NICHE_MAP: Record<string, NichePack & { subniches?: Record<string, NichePack> }> = {
  automotive: {
    label: "Automotive",
    keywords: ["car review", "automotive review", "car detailing", "EV car review", "modded car", "car mods", "supercar review"],
    match: ["car review", "automotive", "car detailing", "vehicle review", "ev review", "car mods"],
  },
  productivity: {
    label: "Productivity",
    keywords: ["productivity apps review", "notion setup", "second brain apps", "time management tools", "productivity system"],
    match: ["productivity", "notion", "second brain", "time management", "gtd"],
  },
  podcasts: {
    label: "Podcasts",
    keywords: ["podcast gear review", "podcast microphone setup", "best podcast equipment", "podcast studio setup"],
    match: ["podcast", "podcast mic", "podcast studio", "podcast gear"],
  },
  education: {
    label: "Education",
    keywords: ["online learning tools", "study apps review", "education technology review", "study with me"],
    match: ["education", "study tips", "online learning", "edtech", "tutor"],
  },
  pets: {
    label: "Pets",
    keywords: ["dog products review", "pet products review", "cat products review", "dog gear review"],
    match: ["pet products", "dog review", "cat products", "puppy", "pet gear"],
  },
  "baby-kids": {
    label: "Baby & Kids Products",
    keywords: ["baby products review", "kids toys review", "stroller review", "baby gear review"],
    match: ["baby products", "kids toys", "stroller", "baby gear", "nursery"],
  },
  ai: {
    label: "AI",
    keywords: [
      "best AI tools 2025",
      "best AI tools 2026",
      "ChatGPT tools review",
      "AI agent tools",
      "AI software review",
      "artificial intelligence tools",
    ],
    match: ["chatgpt", "openai", "llm", "machine learning", "artificial intelligence", "ai tools", "ai agent"],
  },
  tech: {
    label: "Tech",
    keywords: ["tech gadgets review", "consumer tech review", "new tech unboxing", "tech product review", "gadget unboxing"],
    match: ["tech review", "gadget", "electronics review", "hardware review", "tech unboxing"],
    subniches: {
      "desk-setups": {
        label: "Desk Setups",
        keywords: [
          "desk setup tour",
          "battlestation setup",
          "ultrawide desk setup",
          "office desk setup review",
          "monitor desk setup",
          "desk accessories review",
        ],
        match: ["desk setup", "battlestation", "desk tour", "workspace setup", "monitor setup", "desk mat", "standing desk"],
      },
      "sim-racing-rigs": {
        label: "Sim Racing Rigs",
        keywords: [
          "sim racing rig review",
          "sim racing cockpit build",
          "racing simulator setup",
          "fanatec wheelbase review",
          "simagic direct drive review",
          "moza racing wheel review",
          "sim racing pedal review",
          "sim racing rig tour",
          "direct drive sim racing",
          "sim racing cockpit review",
        ],
        // Strict terms only — no lone "cockpit" (false positives)
        match: [
          "sim racing",
          "racing sim",
          "simrig",
          "sim rig",
          "fanatec",
          "simagic",
          "moza racing",
          "moza r9",
          "moza r12",
          "racing simulator",
          "direct drive wheel",
          "sim racing rig",
          "sim racing cockpit",
          "heusinkveld",
          "simucube",
          "asetek",
          "iracing",
          "assetto corsa",
          "load cell pedal",
          "next level racing",
          "trak racer",
          "sim-lab",
          "gt omega",
        ],
      },
    },
  },
  diy: {
    label: "DIY Products",
    keywords: ["DIY tools review", "home DIY products", "maker tools review", "diy project"],
    match: ["diy", "maker project", "diy tools", "handmade"],
  },
  content: {
    label: "Content",
    keywords: ["content creator gear", "camera for youtube", "creator tools review", "youtube gear review"],
    match: ["content creator", "youtube gear", "filmmaking", "vlogging gear", "creator camera"],
  },
  "physical-products": {
    label: "Physical Products",
    keywords: ["product review unboxing", "amazon finds review", "physical product review"],
    match: ["unboxing", "product review", "amazon finds"],
  },
  books: {
    label: "Books",
    keywords: ["book recommendations", "best books review", "nonfiction book review", "book haul"],
    match: ["book review", "book haul", "reading list", "nonfiction"],
  },
  "self-development": {
    label: "Self-Development",
    keywords: ["self improvement tips", "personal development books", "motivation habits", "self help"],
    match: ["self improvement", "personal development", "mindset", "self help"],
  },
  travel: {
    label: "Travel",
    keywords: ["travel gear review", "best travel accessories", "travel packing products", "travel vlog"],
    match: ["travel gear", "travel vlog", "packing list", "travel accessories"],
  },
  lifestyle: {
    label: "Lifestyle",
    keywords: ["lifestyle products review", "daily lifestyle haul", "lifestyle vlog"],
    match: ["lifestyle vlog", "day in my life", "lifestyle haul"],
  },
  teaching: {
    label: "Teaching",
    keywords: ["teacher classroom products", "teaching tools review", "classroom setup"],
    match: ["teacher", "classroom", "teaching tools", "lesson"],
  },
  "home-decor": {
    label: "Home Decor",
    keywords: ["home decor haul", "interior design products", "home styling review"],
    match: ["home decor", "interior design", "home styling"],
  },
  "home-garden": {
    label: "Home & Garden",
    keywords: ["garden tools review", "home improvement products", "lawn garden review"],
    match: ["garden", "lawn care", "home improvement"],
  },
  "wedding-events": {
    label: "Wedding & Events",
    keywords: ["wedding products review", "event planning products", "wedding favors review"],
    match: ["wedding", "event planning", "bridal"],
  },
};

type Strategy = {
  id: string;
  type: "video" | "channel";
  order: string;
  regionCode?: string;
  usePublishedAfter: boolean;
};

const STRATEGIES: Strategy[] = [
  { id: "video-rel-us", type: "video", order: "relevance", regionCode: "US", usePublishedAfter: true },
  { id: "video-views-us", type: "video", order: "viewCount", regionCode: "US", usePublishedAfter: true },
  { id: "video-date-us", type: "video", order: "date", regionCode: "US", usePublishedAfter: true },
  { id: "video-rel-gb", type: "video", order: "relevance", regionCode: "GB", usePublishedAfter: true },
  { id: "video-rel-ca", type: "video", order: "relevance", regionCode: "CA", usePublishedAfter: true },
  { id: "video-rel-au", type: "video", order: "relevance", regionCode: "AU", usePublishedAfter: true },
  { id: "video-views-global", type: "video", order: "viewCount", usePublishedAfter: true },
  { id: "video-rel-global", type: "video", order: "relevance", usePublishedAfter: true },
  { id: "channel-rel-us", type: "channel", order: "relevance", regionCode: "US", usePublishedAfter: false },
  { id: "channel-views-us", type: "channel", order: "viewCount", regionCode: "US", usePublishedAfter: false },
  { id: "channel-rel-global", type: "channel", order: "relevance", usePublishedAfter: false },
];

function resolveNichePack(nicheId: string, subnicheId?: string | null): NichePack {
  const niche = NICHE_MAP[nicheId];
  if (!niche) {
    return { label: nicheId || "Tech", keywords: NICHE_MAP.tech.keywords, match: NICHE_MAP.tech.match };
  }
  if (subnicheId && niche.subniches?.[subnicheId]) {
    const sub = niche.subniches[subnicheId];
    return {
      label: `${niche.label} · ${sub.label}`,
      keywords: sub.keywords,
      match: sub.match,
    };
  }
  return { label: niche.label, keywords: niche.keywords, match: niche.match };
}

function buildQueryBank(nicheId: string, subnicheId: string | null, pack: NichePack): string[] {
  const extras = [
    ...(EXTRA_QUERIES[subnicheId || ""] || []),
    ...(EXTRA_QUERIES[nicheId] || []),
  ];
  const merged = [...pack.keywords, ...extras];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const q of merged) {
    const key = q.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(q.trim());
  }
  return out;
}

function matchesNiche(text: string, terms: string[]): boolean {
  const blob = (text || "").toLowerCase();
  if (!blob.trim() || !terms.length) return false;
  return terms.some((t) => {
    const term = t.toLowerCase();
    if (term.length <= 3) {
      const re = new RegExp(`(?:^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9]|$)`, "i");
      return re.test(blob);
    }
    return blob.includes(term);
  });
}

const FEMALE_NAMES = new Set([
  "sarah", "emma", "olivia", "ava", "isabella", "sophia", "mia", "charlotte",
  "amelia", "harper", "evelyn", "abigail", "emily", "elizabeth", "sofia",
  "ella", "madison", "scarlett", "victoria", "aria", "grace", "chloe", "camila",
  "penelope", "riley", "layla", "lillian", "nora", "zoey", "mila", "aubrey",
  "hannah", "lily", "addison", "eleanor", "natalie", "luna", "savannah", "brooklyn",
  "leah", "zoe", "stella", "hazel", "ellie", "paisley", "audrey", "skylar", "violet",
  "claire", "bella", "lucy", "caroline", "genesis", "aaliyah", "kennedy", "kinsley",
  "allison", "maya", "willow", "naomi", "ailey", "elena", "jessica", "ashley",
  "amanda", "jennifer", "melissa", "nicole", "stephanie", "rachel", "lauren", "kayla",
  "megan", "samantha", "alexandra", "maria", "anna", "lisa", "michelle", "kimberly",
  "amy", "angela", "tiffany", "christina", "rebecca", "laura", "heather", "julie",
  "katie", "aliya", "priya", "ananya", "fatima", "aisha", "mary", "susan",
]);

const MALE_NAMES = new Set([
  "james", "john", "robert", "michael", "william", "david", "richard", "joseph",
  "thomas", "charles", "christopher", "daniel", "matthew", "anthony", "mark",
  "donald", "steven", "paul", "andrew", "joshua", "kenneth", "kevin", "brian",
  "george", "timothy", "ronald", "edward", "jason", "jeffrey", "ryan", "jacob",
  "gary", "nicholas", "eric", "jonathan", "stephen", "larry", "justin", "scott",
  "brandon", "benjamin", "samuel", "gregory", "alexander", "frank", "patrick",
  "raymond", "jack", "dennis", "jerry", "tyler", "aaron", "jose", "adam", "nathan",
  "henry", "douglas", "zachary", "peter", "kyle", "noah", "ethan", "jeremy",
  "walter", "christian", "keith", "roger", "terry", "austin", "sean", "gerald",
  "carl", "harold", "dylan", "jesse", "bryan", "billy", "jordan", "alex", "ivan",
  "omar", "ali", "hassan", "ahmed", "mohamed", "yusuf", "leo", "max", "sam",
  "chris", "mike", "dave", "tom", "nick", "ben", "matt", "josh", "jake", "luke",
]);

type YtKey = { key: string; used: number; limit: number };

type FoundCreator = {
  creator_id: string | null;
  name: string;
  channel_id: string;
  channel_link: string;
  niche: string;
  subscribers: number;
  avg_views: number;
  engagement: number;
  last_upload_at: string;
  already_in_crm: boolean;
};

type Cursor = {
  phase: "crm" | "youtube";
  crmOffset: number;
  strategyIndex: number;
  queryIndex: number;
  pageToken: string | null;
  pagesForQuery: number;
  channelQueue: string[];
  seenChannelIds: string[];
  niche?: string;
  subniche?: string | null;
  queries?: string[];
  match?: string[];
  nicheLabel?: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function loadKeys(): YtKey[] {
  const raw = Deno.env.get("YOUTUBE_API_KEYS") || "";
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((key) => ({ key, used: 0, limit: 9500 }));
}

async function ytGet(keys: YtKey[], endpoint: string, params: Record<string, string>, cost: number) {
  const tried = new Set<string>();
  let lastErr = "YouTube API quota exhausted for today. Add another key or retry tomorrow.";
  while (true) {
    const key = keys.find((k) => !tried.has(k.key) && k.used + cost <= k.limit);
    if (!key) throw new Error(lastErr);
    tried.add(key.key);
    const url = new URL(`${YT}/${endpoint}`);
    Object.entries({ ...params, key: key.key }).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url);
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message || `YouTube API error ${res.status}`;
    const reasons = (body?.error?.errors || []).map((e: { reason?: string }) => e.reason || "").join(" ");
    const quotaHit =
      res.status === 429 ||
      /quota|dailyLimitExceeded|rateLimitExceeded|userRateLimitExceeded|servingLimitExceeded/i.test(
        `${msg} ${reasons}`,
      );
    if (!res.ok && quotaHit) {
      key.used = key.limit; // retire this key for the rest of the batch
      lastErr = msg;
      continue;
    }
    key.used += cost;
    if (!res.ok) throw new Error(msg);
    return body;
  }
}

function firstNameToken(name: string): string {
  return (name || "").trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") || "";
}

function guessMale(name: string, description: string): boolean {
  const token = firstNameToken(name);
  if (FEMALE_NAMES.has(token)) return false;
  if (MALE_NAMES.has(token)) return true;
  const blob = `${name} ${description}`.toLowerCase();
  if (/\b(she\/her|her channel|i'm a girl|i am a woman)\b/.test(blob)) return false;
  if (/\b(he\/him|his channel)\b/.test(blob)) return true;
  return !FEMALE_NAMES.has(token);
}

function looksEnglish(text: string): boolean {
  if (!text) return true;
  const sample = text.slice(0, 500);
  const latin = (sample.match(/[a-zA-Z]/g) || []).length;
  return latin / Math.max(sample.length, 1) > 0.55;
}

function parseChannelId(link: string | null | undefined): string | null {
  if (!link) return null;
  try {
    const u = new URL(link.startsWith("http") ? link : `https://${link}`);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "channel" && parts[1]?.startsWith("UC")) return parts[1];
    if (parts[0]?.startsWith("UC") && parts[0].length > 20) return parts[0];
  } catch {
    /* ignore */
  }
  const m = link.match(/UC[\w-]{20,}/);
  return m?.[0] || null;
}

async function resolveHandleToChannelId(keys: YtKey[], handleOrUrl: string): Promise<string | null> {
  const direct = parseChannelId(handleOrUrl);
  if (direct) return direct;
  let q = handleOrUrl;
  try {
    const u = new URL(handleOrUrl.startsWith("http") ? handleOrUrl : `https://youtube.com/${handleOrUrl}`);
    const parts = u.pathname.split("/").filter(Boolean);
    q = parts[0]?.startsWith("@") ? parts[0] : parts[parts.length - 1] || handleOrUrl;
  } catch {
    /* keep q */
  }
  const data = await ytGet(keys, "search", {
    part: "snippet",
    type: "channel",
    maxResults: "1",
    q: q.replace(/^@/, ""),
    relevanceLanguage: "en",
  }, 100);
  return data.items?.[0]?.snippet?.channelId || data.items?.[0]?.id?.channelId || null;
}

async function getChannel(keys: YtKey[], channelId: string) {
  const data = await ytGet(keys, "channels", {
    part: "snippet,statistics,contentDetails",
    id: channelId,
  }, 1);
  return data.items?.[0] || null;
}

async function getRecentVideos(keys: YtKey[], uploadsPlaylistId: string, n: number) {
  const pl = await ytGet(keys, "playlistItems", {
    part: "contentDetails,snippet",
    playlistId: uploadsPlaylistId,
    maxResults: String(Math.min(n, 50)),
  }, 1);
  const ids = (pl.items || [])
    .map((it: { contentDetails?: { videoId?: string } }) => it.contentDetails?.videoId)
    .filter(Boolean);
  if (!ids.length) return [];
  const vids = await ytGet(keys, "videos", {
    part: "snippet,statistics",
    id: ids.join(","),
  }, 1);
  return vids.items || [];
}

function computeMetrics(videos: Array<{ statistics?: Record<string, string> }>) {
  const sample = videos.slice(0, STATS_SAMPLE);
  if (!sample.length) return { avgViews: 0, engagement: 0 };
  let views = 0;
  let eng = 0;
  let n = 0;
  for (const v of sample) {
    const st = v.statistics || {};
    const viewCount = Number(st.viewCount || 0);
    const likes = Number(st.likeCount || 0);
    const comments = Number(st.commentCount || 0);
    if (viewCount <= 0) continue;
    views += viewCount;
    eng += (likes + comments) / viewCount;
    n++;
  }
  return {
    avgViews: n ? views / n : 0,
    engagement: n ? eng / n : 0,
  };
}

function channelUrl(channelId: string, customUrl?: string): string {
  if (customUrl) {
    const handle = customUrl.startsWith("@") ? customUrl : `@${customUrl.replace(/^\/+/, "")}`;
    return `https://www.youtube.com/${handle}`;
  }
  return `https://www.youtube.com/channel/${channelId}`;
}

function formatEngagement(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

function discoveryFullyDrained(cursor: Cursor, queryCount: number): boolean {
  return (
    cursor.phase === "youtube" &&
    cursor.strategyIndex >= STRATEGIES.length &&
    !cursor.channelQueue.length &&
    !cursor.pageToken
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const action = body.action || "start";
    const target = Number(body.target || TARGET_DEFAULT);
    const keys = loadKeys();
    if (!keys.length) return json({ error: "YOUTUBE_API_KEYS secret is not set" }, 500);

    let runId = body.run_id as string | undefined;
    let run: Record<string, unknown> | null = null;

    if (action === "start" || !runId) {
      const nicheId = String(body.niche || "tech");
      const subnicheId = body.subniche ? String(body.subniche) : null;
      const pack = resolveNichePack(nicheId, subnicheId);
      const queries = buildQueryBank(nicheId, subnicheId, pack);
      if (!queries.length) return json({ error: "Unknown niche" }, 400);

      const { data, error } = await admin
        .from("creator_search_runs")
        .insert({
          user_id: userId,
          status: "running",
          target,
          phase: "youtube",
          cursor_json: {
            phase: "youtube",
            crmOffset: 0,
            strategyIndex: 0,
            queryIndex: 0,
            pageToken: null,
            pagesForQuery: 0,
            channelQueue: [],
            seenChannelIds: [],
            niche: nicheId,
            subniche: subnicheId,
            queries,
            match: pack.match,
            nicheLabel: pack.label,
          } satisfies Cursor,
          results: [],
        })
        .select("*")
        .single();
      if (error) return json({ error: error.message }, 400);
      run = data;
      runId = data.id;
    } else {
      const { data, error } = await admin
        .from("creator_search_runs")
        .select("*")
        .eq("id", runId)
        .eq("user_id", userId)
        .single();
      if (error || !data) return json({ error: error?.message || "Run not found" }, 404);
      run = data;
      if (data.status === "completed" || data.status === "failed") {
        return json({
          run_id: data.id,
          status: data.status,
          done: true,
          creators_found: data.creators_found,
          target: data.target,
          youtube_scanned: data.youtube_scanned,
          phase: data.phase,
          results: data.results,
          error: data.error,
          niche: (data.cursor_json as Cursor)?.niche,
          subniche: (data.cursor_json as Cursor)?.subniche,
          niche_label: (data.cursor_json as Cursor)?.nicheLabel,
        });
      }
    }

    const started = Date.now();
    const cursor = (run!.cursor_json || {}) as Cursor;
    const nicheId = cursor.niche || "tech";
    const subnicheId = cursor.subniche || null;
    const pack = resolveNichePack(nicheId, subnicheId);

    if (!cursor.queries?.length) cursor.queries = buildQueryBank(nicheId, subnicheId, pack);
    if (!cursor.match?.length) cursor.match = pack.match;
    if (!cursor.nicheLabel) cursor.nicheLabel = pack.label;
    if (!cursor.seenChannelIds) cursor.seenChannelIds = [];
    if (!cursor.channelQueue) cursor.channelQueue = [];
    if (cursor.phase !== "crm" && cursor.phase !== "youtube") cursor.phase = "crm";
    if (typeof cursor.crmOffset !== "number") cursor.crmOffset = 0;
    if (typeof cursor.strategyIndex !== "number") cursor.strategyIndex = 0;
    if (typeof cursor.queryIndex !== "number") cursor.queryIndex = 0;
    if (typeof cursor.pagesForQuery !== "number") cursor.pagesForQuery = 0;

    const queries = cursor.queries!;
    const matchTerms = cursor.match!;
    const nicheLabel = cursor.nicheLabel || "Tech";
    const found: FoundCreator[] = Array.isArray(run!.results) ? [...(run!.results as FoundCreator[])] : [];
    const foundIds = new Set(found.map((f) => f.channel_id));
    const seen = new Set(cursor.seenChannelIds);

    // Block active + deleted (archived) CRM creators and permanent exclusions
    const [{ data: allCreators }, { data: creatorExclusions }] = await Promise.all([
      admin.from("creators").select("id,name,channel_link,niche,notes,personalization,archived_at").eq("user_id", userId),
      admin.from("search_exclusions").select("exclusion_key,channel_link").eq("user_id", userId).eq("kind", "creator"),
    ]);

    const blockedChannelIds = new Set<string>();
    const blockedKeys = new Set<string>();

    function blockKey(raw: string | null | undefined) {
      const v = (raw || "").trim().toLowerCase();
      if (v) blockedKeys.add(v);
    }

    for (const c of allCreators || []) {
      const id = (c.channel_link || "").match(/UC[\w-]{20,}/)?.[0];
      if (id) blockedChannelIds.add(id);
      blockKey(c.channel_link);
      blockKey(c.name);
    }
    for (const ex of creatorExclusions || []) {
      blockKey(ex.exclusion_key);
      blockKey(ex.channel_link);
      const id = (ex.exclusion_key || "").match(/UC[\w-]{20,}/)?.[0] ||
        (ex.channel_link || "").match(/UC[\w-]{20,}/)?.[0];
      if (id) blockedChannelIds.add(id);
    }

    function isBlockedChannel(channelId: string, link: string, title: string): boolean {
      if (blockedChannelIds.has(channelId)) return true;
      if (blockedKeys.has(channelId.toLowerCase())) return true;
      if (link && blockedKeys.has(link.toLowerCase())) return true;
      if (title && blockedKeys.has(title.toLowerCase())) return true;
      return false;
    }

    let youtubeScanned = Number(run!.youtube_scanned || 0);
    let errorMsg: string | null = null;
    const publishedAfter = new Date(Date.now() - MONTH_MS).toISOString();

    async function evaluateChannel(channelId: string): Promise<FoundCreator | null> {
      if (foundIds.has(channelId)) return null;
      if (seen.has(channelId)) return null;
      seen.add(channelId);
      cursor.seenChannelIds = [...seen];

      // Skip anyone already in Creators (active) or Deleted, or permanently excluded
      if (blockedChannelIds.has(channelId) || blockedKeys.has(channelId.toLowerCase())) return null;

      const ch = await getChannel(keys, channelId);
      if (!ch) return null;
      const sn = ch.snippet || {};
      const stats = ch.statistics || {};
      const subs = Number(stats.subscriberCount || 0);
      const desc = String(sn.description || "");
      const title = String(sn.title || "");
      const linkEarly = channelUrl(channelId, sn.customUrl);
      if (isBlockedChannel(channelId, linkEarly, title)) return null;
      if (subs < MIN_SUBS) return null;
      if (!looksEnglish(desc) && !looksEnglish(title)) return null;
      if (!guessMale(title, desc)) return null;

      const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
      if (!uploads) return null;
      const videos = await getRecentVideos(keys, uploads, VIDEOS_PER_CHANNEL);
      if (!videos.length) return null;

      const lastPublished = String(videos[0]?.snippet?.publishedAt || "");
      if (!lastPublished) return null;
      if (Date.now() - new Date(lastPublished).getTime() > MONTH_MS) return null;

      const metrics = computeMetrics(videos);
      if (metrics.avgViews < MIN_AVG_VIEWS || metrics.engagement < MIN_ENGAGEMENT) return null;

      const videoBlob = videos
        .map((v: { snippet?: { title?: string; description?: string } }) =>
          `${v.snippet?.title || ""}\n${v.snippet?.description || ""}`
        )
        .join("\n");
      if (!matchesNiche(`${title}\n${desc}\n${videoBlob}`, matchTerms)) return null;

      const link = channelUrl(channelId, sn.customUrl);
      // Never return creators already in CRM / Deleted — only brand-new discoveries
      if (isBlockedChannel(channelId, link, title)) return null;

      const { data: inserted, error } = await admin
        .from("creators")
        .insert({
          user_id: userId,
          name: title,
          channel_link: link,
          niche: nicheLabel,
          avg_views: Math.round(metrics.avgViews),
          platform: "YouTube",
          pipeline_status: "new",
          gender_guess: "male",
          notes: `Discovered via Search · ${nicheLabel} · ${subs.toLocaleString()} subs · ${formatEngagement(metrics.engagement)} ER · last upload ${lastPublished.slice(0, 10)}`,
          personalization: `YouTube channel ${channelId}. Avg views ~${Math.round(metrics.avgViews).toLocaleString()}.`,
        })
        .select("id")
        .single();
      if (error || !inserted) return null;

      blockedChannelIds.add(channelId);
      blockKey(link);
      blockKey(title);
      allCreators?.push({
        id: inserted.id,
        name: title,
        channel_link: link,
        niche: nicheLabel,
        notes: null,
        personalization: null,
        archived_at: null,
      });

      return {
        creator_id: inserted.id,
        name: title,
        channel_id: channelId,
        channel_link: link,
        niche: nicheLabel,
        subscribers: subs,
        avg_views: Math.round(metrics.avgViews),
        engagement: Number(metrics.engagement.toFixed(4)),
        last_upload_at: lastPublished,
        already_in_crm: false,
      };
    }

    function enqueueChannels(ids: string[]) {
      const fresh = [...new Set(ids)].filter(
        (id) => id && !seen.has(id) && !foundIds.has(id) && !blockedChannelIds.has(id),
      );
      cursor.channelQueue.push(...fresh);
    }

    function advanceQuery() {
      cursor.pageToken = null;
      cursor.pagesForQuery = 0;
      cursor.queryIndex++;
      if (cursor.queryIndex >= queries.length) {
        cursor.queryIndex = 0;
        cursor.strategyIndex++;
      }
    }

    try {
      // Skip CRM phase — active/deleted creators must not appear in Search results
      cursor.phase = "youtube";

      while (cursor.phase === "youtube" && found.length < target && Date.now() - started < BATCH_MS) {
        if (!cursor.channelQueue.length) {
          if (cursor.strategyIndex >= STRATEGIES.length) break;
          if (cursor.queryIndex >= queries.length) {
            cursor.queryIndex = 0;
            cursor.strategyIndex++;
            cursor.pageToken = null;
            cursor.pagesForQuery = 0;
            continue;
          }

          const strategy = STRATEGIES[cursor.strategyIndex];
          const keyword = queries[cursor.queryIndex];
          const params: Record<string, string> = {
            part: "snippet",
            type: strategy.type,
            maxResults: "50",
            q: keyword,
            relevanceLanguage: "en",
            order: strategy.order,
          };
          if (strategy.regionCode) params.regionCode = strategy.regionCode;
          if (strategy.usePublishedAfter && strategy.type === "video") {
            params.publishedAfter = publishedAfter;
          }
          if (cursor.pageToken) params.pageToken = cursor.pageToken;

          const search = await ytGet(keys, "search", params, 100);
          cursor.pagesForQuery++;
          cursor.pageToken = search.nextPageToken || null;

          const ids = (search.items || [])
            .map((it: {
              snippet?: { channelId?: string };
              id?: { channelId?: string };
            }) => it.snippet?.channelId || it.id?.channelId)
            .filter((id: string | undefined): id is string => Boolean(id));

          enqueueChannels(ids);

          if (cursor.pageToken && cursor.pagesForQuery < MAX_PAGES_PER_QUERY) {
            // keep same query, next page
          } else {
            advanceQuery();
          }

          if (!ids.length && !cursor.channelQueue.length) continue;
        }

        while (cursor.channelQueue.length && found.length < target && Date.now() - started < BATCH_MS) {
          const channelId = cursor.channelQueue.shift()!;
          youtubeScanned++;
          try {
            const hit = await evaluateChannel(channelId);
            if (hit) {
              found.push(hit);
              foundIds.add(hit.channel_id);
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (/quota/i.test(msg)) throw e;
          }
        }
      }
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    }

    const drained = discoveryFullyDrained(cursor, queries.length);

    // Keep status=running under target until every strategy/query page is drained (or quota error)
    const done =
      found.length >= target ||
      Boolean(errorMsg) ||
      drained;

    let status: string;
    if (errorMsg && found.length === 0) status = "failed";
    else if (found.length >= target) status = "completed";
    else if (drained && found.length < target) {
      status = "completed";
      if (!errorMsg) {
        errorMsg = `Scan finished with ${found.length}/${target} after full multi-strategy discovery. Add more YouTube API keys or retry tomorrow to keep filling.`;
      }
    } else status = "running";

    const phaseOut = cursor.phase === "crm" ? "crm" : `yt:${STRATEGIES[Math.min(cursor.strategyIndex, STRATEGIES.length - 1)]?.id || "done"}`;

    await admin
      .from("creator_search_runs")
      .update({
        status,
        creators_found: found.length,
        youtube_scanned: youtubeScanned,
        phase: phaseOut,
        cursor_json: cursor,
        results: found,
        error: errorMsg,
        updated_at: new Date().toISOString(),
        finished_at: done ? new Date().toISOString() : null,
      })
      .eq("id", runId);

    return json({
      run_id: runId,
      status,
      done,
      creators_found: found.length,
      target,
      youtube_scanned: youtubeScanned,
      phase: phaseOut,
      niche: cursor.niche,
      subniche: cursor.subniche || null,
      niche_label: cursor.nicheLabel || null,
      results: found,
      error: errorMsg,
      queries_total: queries.length,
      strategies_total: STRATEGIES.length,
      quota_used_approx: keys.reduce((s, k) => s + k.used, 0),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
