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
const BATCH_MS = 45_000;

type NichePack = { keywords: string[]; match: string[]; label: string };

const NICHE_MAP: Record<string, NichePack & { subniches?: Record<string, NichePack> }> = {
  automotive: {
    label: "Automotive",
    keywords: ["car review", "automotive review", "car detailing", "EV car review", "modded car"],
    match: ["car", "auto", "vehicle", "automotive", "ev", "truck"],
  },
  productivity: {
    label: "Productivity",
    keywords: ["productivity apps review", "notion setup", "second brain apps", "time management tools"],
    match: ["productivity", "notion", "habits", "workflow", "gtd"],
  },
  podcasts: {
    label: "Podcasts",
    keywords: ["podcast gear review", "podcast microphone setup", "best podcast equipment"],
    match: ["podcast", "microphone", "recording studio"],
  },
  education: {
    label: "Education",
    keywords: ["online learning tools", "study apps review", "education technology review"],
    match: ["education", "learn", "study", "course", "tutor"],
  },
  pets: {
    label: "Pets",
    keywords: ["dog products review", "pet products review", "cat products review"],
    match: ["pet", "dog", "cat", "puppy", "kitten"],
  },
  "baby-kids": {
    label: "Baby & Kids Products",
    keywords: ["baby products review", "kids toys review", "stroller review"],
    match: ["baby", "kids", "toddler", "stroller", "nursery"],
  },
  ai: {
    label: "AI",
    keywords: [
      "best AI tools 2025",
      "ChatGPT tools review",
      "AI agent tools",
      "AI software review",
      "artificial intelligence tools",
    ],
    match: ["ai", "chatgpt", "openai", "llm", "machine learning", "artificial intelligence"],
  },
  tech: {
    label: "Tech",
    keywords: ["tech gadgets review", "consumer tech review", "new tech unboxing", "tech product review"],
    match: ["tech", "gadget", "electronics", "hardware", "device"],
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
        match: ["desk setup", "battlestation", "desk tour", "workspace setup", "monitor setup", "desk mat"],
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
        match: [
          "sim racing",
          "racing sim",
          "simrig",
          "sim rig",
          "fanatec",
          "simagic",
          "moza racing",
          "cockpit",
          "direct drive wheel",
          "racing simulator",
        ],
      },
    },
  },
  diy: {
    label: "DIY Products",
    keywords: ["DIY tools review", "home DIY products", "maker tools review"],
    match: ["diy", "maker", "craft", "build", "handmade"],
  },
  content: {
    label: "Content",
    keywords: ["content creator gear", "camera for youtube", "creator tools review"],
    match: ["content creator", "youtube gear", "filmmaking", "vlogging"],
  },
  "physical-products": {
    label: "Physical Products",
    keywords: ["product review unboxing", "amazon finds review", "physical product review"],
    match: ["unboxing", "product review", "amazon finds"],
  },
  books: {
    label: "Books",
    keywords: ["book recommendations", "best books review", "nonfiction book review"],
    match: ["book", "reading", "author", "literature"],
  },
  "self-development": {
    label: "Self-Development",
    keywords: ["self improvement tips", "personal development books", "motivation habits"],
    match: ["self improvement", "mindset", "habits", "motivation", "personal development"],
  },
  travel: {
    label: "Travel",
    keywords: ["travel gear review", "best travel accessories", "travel packing products"],
    match: ["travel", "trip", "luggage", "backpack", "vacation"],
  },
  lifestyle: {
    label: "Lifestyle",
    keywords: ["lifestyle products review", "daily lifestyle haul"],
    match: ["lifestyle", "day in my life", "vlog"],
  },
  teaching: {
    label: "Teaching",
    keywords: ["teacher classroom products", "teaching tools review"],
    match: ["teacher", "teaching", "classroom", "lesson"],
  },
  "home-decor": {
    label: "Home Decor",
    keywords: ["home decor haul", "interior design products", "home styling review"],
    match: ["home decor", "interior", "furniture", "styling"],
  },
  "home-garden": {
    label: "Home & Garden",
    keywords: ["garden tools review", "home improvement products", "lawn garden review"],
    match: ["garden", "lawn", "home improvement", "outdoor"],
  },
  "wedding-events": {
    label: "Wedding & Events",
    keywords: ["wedding products review", "event planning products", "wedding favors review"],
    match: ["wedding", "event planning", "bridal", "party"],
  },
};

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
  keywordIndex: number;
  searchPageToken: string | null;
  channelQueue: string[];
  seenChannelIds: string[];
  niche?: string;
  subniche?: string | null;
  keywords?: string[];
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
  const key = keys.find((k) => k.used + cost <= k.limit);
  if (!key) throw new Error("YouTube API quota exhausted for today. Add another key or retry tomorrow.");
  const url = new URL(`${YT}/${endpoint}`);
  Object.entries({ ...params, key: key.key }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url);
  key.used += cost;
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error?.message || `YouTube API error ${res.status}`);
  }
  return body;
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
      if (!pack.keywords.length) return json({ error: "Unknown niche" }, 400);

      const { data, error } = await admin
        .from("creator_search_runs")
        .insert({
          user_id: userId,
          status: "running",
          target,
          phase: "youtube",
          cursor_json: {
            keywordIndex: 0,
            searchPageToken: null,
            channelQueue: [],
            seenChannelIds: [],
            niche: nicheId,
            subniche: subnicheId,
            keywords: pack.keywords,
            match: pack.match,
            nicheLabel: pack.label,
          },
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
    if (!cursor.keywords?.length || !cursor.match?.length) {
      const pack = resolveNichePack(cursor.niche || "tech", cursor.subniche || null);
      cursor.niche = cursor.niche || "tech";
      cursor.keywords = pack.keywords;
      cursor.match = pack.match;
      cursor.nicheLabel = pack.label;
    }
    if (!cursor.seenChannelIds) cursor.seenChannelIds = [];
    if (!cursor.channelQueue) cursor.channelQueue = [];

    const keywords = cursor.keywords!;
    const matchTerms = cursor.match!;
    const nicheLabel = cursor.nicheLabel || "Tech";
    const found: FoundCreator[] = Array.isArray(run!.results) ? [...(run!.results as FoundCreator[])] : [];
    const foundIds = new Set(found.map((f) => f.channel_id));
    const seen = new Set(cursor.seenChannelIds);

    const { data: existingCreators } = await admin
      .from("creators")
      .select("id,name,channel_link")
      .eq("user_id", userId)
      .is("archived_at", null);

    function findExisting(channelId: string, link: string) {
      return (existingCreators || []).find((c) => {
        const cl = (c.channel_link || "").toLowerCase();
        return cl.includes(channelId.toLowerCase()) || (link && cl === link.toLowerCase());
      });
    }

    let youtubeScanned = Number(run!.youtube_scanned || 0);
    let errorMsg: string | null = null;
    const publishedAfter = new Date(Date.now() - MONTH_MS).toISOString();

    async function evaluateChannel(channelId: string): Promise<FoundCreator | null> {
      if (foundIds.has(channelId) || seen.has(channelId)) return null;
      seen.add(channelId);
      cursor.seenChannelIds = [...seen];

      const ch = await getChannel(keys, channelId);
      if (!ch) return null;
      const sn = ch.snippet || {};
      const stats = ch.statistics || {};
      const subs = Number(stats.subscriberCount || 0);
      const desc = String(sn.description || "");
      const title = String(sn.title || "");
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
      const existing = findExisting(channelId, link);
      let creatorId = existing?.id || null;
      const wasInCrm = Boolean(existing);

      if (!existing) {
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
        if (!error && inserted) {
          creatorId = inserted.id;
          existingCreators?.push({ id: inserted.id, name: title, channel_link: link });
        }
      } else {
        await admin
          .from("creators")
          .update({
            avg_views: Math.round(metrics.avgViews),
            gender_guess: "male",
            niche: nicheLabel,
          })
          .eq("id", existing.id);
      }

      return {
        creator_id: creatorId,
        name: title,
        channel_id: channelId,
        channel_link: link,
        niche: nicheLabel,
        subscribers: subs,
        avg_views: Math.round(metrics.avgViews),
        engagement: Number(metrics.engagement.toFixed(4)),
        last_upload_at: lastPublished,
        already_in_crm: wasInCrm,
      };
    }

    try {
      while (found.length < target && Date.now() - started < BATCH_MS) {
        if (!cursor.channelQueue.length) {
          if (cursor.keywordIndex >= keywords.length) break;
          const keyword = keywords[cursor.keywordIndex];
          const params: Record<string, string> = {
            part: "snippet",
            type: "video",
            maxResults: "25",
            q: keyword,
            relevanceLanguage: "en",
            regionCode: "US",
            order: "relevance",
            publishedAfter,
          };
          if (cursor.searchPageToken) params.pageToken = cursor.searchPageToken;
          const search = await ytGet(keys, "search", params, 100);
          cursor.searchPageToken = search.nextPageToken || null;
          if (!cursor.searchPageToken) cursor.keywordIndex++;

          const ids = (search.items || [])
            .map((it: { snippet?: { channelId?: string } }) => it.snippet?.channelId)
            .filter((id: string | undefined): id is string => Boolean(id) && !seen.has(id) && !foundIds.has(id));
          cursor.channelQueue.push(...[...new Set(ids)]);
          if (!ids.length && !cursor.searchPageToken) cursor.keywordIndex++;
          continue;
        }

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
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    }

    const done =
      found.length >= target ||
      (cursor.keywordIndex >= keywords.length && !cursor.channelQueue.length) ||
      Boolean(errorMsg);
    const status = errorMsg && found.length === 0 ? "failed" : done ? "completed" : "running";

    await admin
      .from("creator_search_runs")
      .update({
        status,
        creators_found: found.length,
        youtube_scanned: youtubeScanned,
        phase: "youtube",
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
      phase: "youtube",
      niche: cursor.niche,
      subniche: cursor.subniche || null,
      niche_label: cursor.nicheLabel || null,
      results: found,
      error: errorMsg,
      quota_used_approx: keys.reduce((s, k) => s + k.used, 0),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
