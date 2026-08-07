import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const YT = "https://www.googleapis.com/youtube/v3";
const TARGET_DEFAULT = 50;
const VIDEOS_PER_CHANNEL = 20;
const STATS_SAMPLE = 10;
const MIN_SUBS = 50_000;
const MIN_AVG_VIEWS = 50_000;
const MIN_ENGAGEMENT = 0.01;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH_MS = 45_000;

type NichePack = { keywords: string[]; match: string[]; label: string }

const NICHE_MAP: Record<string, NichePack & { subniches?: Record<string, NichePack> }> = {
  automotive: {
    label: 'Automotive',
    keywords: ['car review', 'automotive review', 'car detailing', 'EV car review', 'modded car'],
    match: ['car', 'auto', 'vehicle', 'automotive', 'ev', 'truck'],
  },
  productivity: {
    label: 'Productivity',
    keywords: ['productivity apps review', 'notion setup', 'second brain apps', 'time management tools'],
    match: ['productivity', 'notion', 'habits', 'workflow', 'gtd'],
  },
  podcasts: {
    label: 'Podcasts',
    keywords: ['podcast gear review', 'podcast microphone setup', 'best podcast equipment'],
    match: ['podcast', 'microphone', 'recording studio'],
  },
  education: {
    label: 'Education',
    keywords: ['online learning tools', 'study apps review', 'education technology review'],
    match: ['education', 'learn', 'study', 'course', 'tutor'],
  },
  pets: {
    label: 'Pets',
    keywords: ['dog products review', 'pet products review', 'cat products review'],
    match: ['pet', 'dog', 'cat', 'puppy', 'kitten'],
  },
  'baby-kids': {
    label: 'Baby & Kids Products',
    keywords: ['baby products review', 'kids toys review', 'stroller review'],
    match: ['baby', 'kids', 'toddler', 'stroller', 'nursery'],
  },
  ai: {
    label: 'AI',
    keywords: ['best AI tools 2025', 'ChatGPT tools review', 'AI agent tools', 'AI software review', 'artificial intelligence tools'],
    match: ['ai', 'chatgpt', 'openai', 'llm', 'machine learning', 'artificial intelligence'],
  },
  tech: {
    label: 'Tech',
    keywords: ['tech gadgets review', 'consumer tech review', 'new tech unboxing', 'tech product review'],
    match: ['tech', 'gadget', 'electronics', 'hardware', 'device'],
    subniches: {
      'desk-setups': {
        label: 'Desk Setups',
        keywords: ['desk setup tour', 'battlestation setup', 'ultrawide desk setup', 'office desk setup review', 'monitor desk setup', 'desk accessories review'],
        match: ['desk setup', 'battlestation', 'desk tour', 'workspace setup', 'monitor setup', 'desk mat'],
      },
      'sim-racing-rigs': {
        label: 'Sim Racing Rigs',
        keywords: [
          'sim racing rig review',
          'sim racing cockpit build',
          'racing simulator setup',
          'fanatec wheelbase review',
          'simagic direct drive review',
          'moza racing wheel review',
          'sim racing pedal review',
          'sim racing rig tour',
          'direct drive sim racing',
          'sim racing cockpit review',
        ],
        match: ['sim racing', 'racing sim', 'simrig', 'sim rig', 'fanatec', 'simagic', 'moza racing', 'cockpit', 'direct drive wheel', 'racing simulator'],
      },
    },
  },
  diy: {
    label: 'DIY Products',
    keywords: ['DIY tools review', 'home DIY products', 'maker tools review'],
    match: ['diy', 'maker', 'craft', 'build', 'handmade'],
  },
  content: {
    label: 'Content',
    keywords: ['content creator gear', 'camera for youtube', 'creator tools review'],
    match: ['content creator', 'youtube gear', 'filmmaking', 'vlogging'],
  },
  'physical-products': {
    label: 'Physical Products',
    keywords: ['product review unboxing', 'amazon finds review', 'physical product review'],
    match: ['unboxing', 'product review', 'amazon finds'],
  },
  books: {
    label: 'Books',
    keywords: ['book recommendations', 'best books review', 'nonfiction book review'],
    match: ['book', 'reading', 'author', 'literature'],
  },
  'self-development': {
    label: 'Self-Development',
    keywords: ['self improvement tips', 'personal development books', 'motivation habits'],
    match: ['self improvement', 'mindset', 'habits', 'motivation', 'personal development'],
  },
  travel: {
    label: 'Travel',
    keywords: ['travel gear review', 'best travel accessories', 'travel packing products'],
    match: ['travel', 'trip', 'luggage', 'backpack', 'vacation'],
  },
  lifestyle: {
    label: 'Lifestyle',
    keywords: ['lifestyle products review', 'daily lifestyle haul'],
    match: ['lifestyle', 'day in my life', 'vlog'],
  },
  teaching: {
    label: 'Teaching',
    keywords: ['teacher classroom products', 'teaching tools review'],
    match: ['teacher', 'teaching', 'classroom', 'lesson'],
  },
  'home-decor': {
    label: 'Home Decor',
    keywords: ['home decor haul', 'interior design products', 'home styling review'],
    match: ['home decor', 'interior', 'furniture', 'styling'],
  },
  'home-garden': {
    label: 'Home & Garden',
    keywords: ['garden tools review', 'home improvement products', 'lawn garden review'],
    match: ['garden', 'lawn', 'home improvement', 'outdoor'],
  },
  'wedding-events': {
    label: 'Wedding & Events',
    keywords: ['wedding products review', 'event planning products', 'wedding favors review'],
    match: ['wedding', 'event planning', 'bridal', 'party'],
  },
};

function resolveNichePack(nicheId: string, subnicheId?: string | null): NichePack {
  const niche = NICHE_MAP[nicheId];
  if (!niche) {
    return { label: nicheId || 'Tech', keywords: NICHE_MAP.tech.keywords, match: NICHE_MAP.tech.match };
  }
  if (subnicheId && niche.subniches?.[subnicheId]) {
    const sub = niche.subniches[subnicheId];
    // Subniche searches must match subniche terms only — parent niche terms are too broad
    return {
      label: `${niche.label} · ${sub.label}`,
      keywords: sub.keywords,
      match: sub.match,
    };
  }
  return { label: niche.label, keywords: niche.keywords, match: niche.match };
}

function matchesNiche(text: string, terms: string[]): boolean {
  const blob = (text || '').toLowerCase();
  if (!blob.trim() || !terms.length) return false;
  return terms.some((t) => {
    const term = t.toLowerCase();
    if (term.length <= 3) {
      const re = new RegExp(`(?:^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z0-9]|$)`, 'i');
      return re.test(blob);
    }
    return blob.includes(term);
  });
}

const BLOCKED_DOMAINS = new Set([
  "youtube.com", "youtu.be", "google.com", "twitter.com", "x.com",
  "instagram.com", "facebook.com", "linkedin.com", "tiktok.com",
  "discord.gg", "discord.com", "patreon.com", "amazon.com", "amzn.to",
  "bit.ly", "t.co", "github.com", "reddit.com", "spotify.com", "apple.com",
  "music.apple.com", "paypal.com", "stripe.com", "gum.co", "gumroad.com",
  "ko-fi.com", "buymeacoffee.com", "linktr.ee", "beacons.ai", "bio.link",
  "googleusercontent.com", "wikipedia.org", "medium.com", "substack.com",
  "notion.site", "vercel.app", "netlify.app", "cloudflare.com", "forms.gle",
  "docs.google.com", "twitch.tv", "snapchat.com", "pinterest.com",
]);

const SPONSOR_MARKERS = [
  /#ad\b/i,
  /#sponsor/i,
  /sponsored by/i,
  /this video is sponsored/i,
  /thanks to .{0,60} for sponsoring/i,
  /partnered with/i,
  /brought to you by/i,
  /promo code/i,
  /use code/i,
  /paid partnership/i,
  /in partnership with/i,
];

const FEMALE_NAMES = new Set([
  "sarah", "emma", "olivia", "ava", "isabella", "sophia", "mia", "charlotte",
  "amelia", "harper", "evelyn", "abigail", "emily", "elizabeth", "sofia",
  "ella", "madison", "scarlett", "victoria", "aria", "grace", "chloe", "camila",
  "penelope", "riley", "layla", "lillian", "nora", "zoey", "mila", "aubrey",
  "hannah", "lily", "addison", "eleanor", "natalie", "luna", "savannah", "brooklyn",
  "leah", "zoe", "stella", "hazel", "ellie", "paisley", "audrey", "skylar", "violet",
  "claire", "bella", "lucy", "caroline", "genesis", "aaliyah", "kennedy", "kinsley",
  "allison", "maya", "willow", "naomi", "ailey", "elena", "sarah", "jessica", "ashley",
  "amanda", "jennifer", "melissa", "nicole", "stephanie", "rachel", "lauren", "kayla",
  "megan", "samantha", "alexandra", "maria", "anna", "lisa", "michelle", "kimberly",
  "amy", "angela", "tiffany", "christina", "rebecca", "laura", "heather", "julie",
  "katie", "ali", "aliya", "priya", "ananya", "fatima", "aisha", "mary", "susan",
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

type FoundBrand = {
  brand_name: string;
  domain: string;
  source_creator_id: string | null;
  source_creator_name: string;
  source_video_url: string;
  brand_id?: string;
};

type Cursor = {
  crmOffset: number;
  keywordIndex: number;
  searchPageToken: string | null;
  youtubeChannelQueue: string[];
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
    const quotaHit = /quota|dailyLimitExceeded|rateLimitExceeded/i.test(msg) || res.status === 403;
    if (!res.ok && quotaHit) {
      key.used = key.limit;
      lastErr = msg;
      continue;
    }
    key.used += cost;
    if (!res.ok) throw new Error(msg);
    return body;
  }
}

function normalizeDomain(raw: string): string {
  try {
    let s = raw.trim().toLowerCase();
    if (!s.startsWith("http")) s = "https://" + s;
    const u = new URL(s);
    let host = u.hostname.replace(/^www\./, "");
    return host;
  } catch {
    return "";
  }
}

function isSponsorDomain(domain: string): boolean {
  if (!domain || domain.length < 4) return false;
  if (BLOCKED_DOMAINS.has(domain)) return false;
  for (const b of BLOCKED_DOMAINS) {
    if (domain.endsWith("." + b)) return false;
  }
  if (domain.endsWith(".gov") || domain.endsWith(".edu")) return false;
  if (/^(blog|docs|cdn|static|support|help|status)\./.test(domain)) return false;
  return true;
}

function domainToBrandName(domain: string): string {
  const base = domain.split(".")[0] || domain;
  return base.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractUrls(text: string): string[] {
  if (!text) return [];
  const re = /https?:\/\/[^\s<>"']+|(?:[a-zA-Z0-9\-]+\.)+[a-zA-Z]{2,}(?:\/[^\s<>"']*)?/g;
  return text.match(re) || [];
}

function sponsorTextWindow(text: string): string {
  if (!text) return "";
  for (const marker of SPONSOR_MARKERS) {
    const m = marker.exec(text);
    if (m && m.index != null) {
      const start = Math.max(0, m.index - 80);
      return text.slice(start, start + 700);
    }
  }
  return text.slice(0, 1200);
}

function extractDomainsFromText(text: string, creatorHints: string[]): string[] {
  const window = sponsorTextWindow(text);
  const out: string[] = [];
  for (const url of extractUrls(window)) {
    const domain = normalizeDomain(url);
    if (!isSponsorDomain(domain)) continue;
    if (creatorHints.some((h) => h && domain.includes(h))) continue;
    out.push(domain);
  }
  return [...new Set(out)];
}

function parseChannelId(link: string | null | undefined): string | null {
  if (!link) return null;
  try {
    const u = new URL(link.startsWith("http") ? link : `https://${link}`);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "channel" && parts[1]?.startsWith("UC")) return parts[1];
    if (parts[0] === "c" || parts[0] === "user" || parts[0]?.startsWith("@")) return null;
    if (parts[0]?.startsWith("UC") && parts[0].length > 20) return parts[0];
  } catch {
    /* ignore */
  }
  const m = link.match(/UC[\w-]{20,}/);
  return m?.[0] || null;
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
  // Best-effort default: keep unless clearly female-coded
  return !FEMALE_NAMES.has(token);
}

function looksEnglish(text: string): boolean {
  if (!text) return true;
  const sample = text.slice(0, 500);
  const latin = (sample.match(/[a-zA-Z]/g) || []).length;
  return latin / Math.max(sample.length, 1) > 0.55;
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
    part: "snippet,statistics,contentDetails,brandingSettings",
    id: channelId,
  }, 1);
  return data.items?.[0] || null;
}

async function getRecentVideos(keys: YtKey[], uploadsPlaylistId: string, n: number) {
  const pl = await ytGet(keys, "playlistItems", {
    part: "contentDetails",
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

async function fetchCaptionsText(videoId: string): Promise<string> {
  try {
    const listUrl = `https://www.youtube.com/api/timedtext?type=list&v=${videoId}`;
    const listRes = await fetch(listUrl);
    const listXml = await listRes.text();
    const langMatch = listXml.match(/lang_code="(en[^"]*)"/i) || listXml.match(/lang_code="([^"]+)"/i);
    if (!langMatch) return "";
    const lang = langMatch[1];
    const trackUrl = `https://www.youtube.com/api/timedtext?lang=${encodeURIComponent(lang)}&v=${videoId}`;
    const trackRes = await fetch(trackUrl);
    const xml = await trackRes.text();
    return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000);
  } catch {
    return "";
  }
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

function creatorHints(name: string, customUrl?: string): string[] {
  const hints: string[] = [];
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (slug.length > 3) hints.push(slug.slice(0, Math.min(slug.length, 20)));
  if (customUrl) hints.push(customUrl.toLowerCase().replace(/[^a-z0-9]/g, ""));
  return hints.filter(Boolean);
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
        .from("brand_search_runs")
        .insert({
          user_id: userId,
          status: "running",
          target,
          phase: "crm",
          cursor_json: {
            crmOffset: 0,
            keywordIndex: 0,
            searchPageToken: null,
            youtubeChannelQueue: [],
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
        .from("brand_search_runs")
        .select("*")
        .eq("id", runId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error || !data) return json({ error: "Run not found" }, 404);
      run = data;
      if (data.status === "completed" || data.status === "failed") {
        return json({
          run_id: runId,
          status: data.status,
          brands_found: data.brands_found,
          creators_scanned: data.creators_scanned,
          youtube_scanned: data.youtube_scanned,
          results: data.results,
          done: true,
          error: data.error,
        });
      }
    }

    const started = Date.now();
    const cursor = (run!.cursor_json || {}) as Cursor;
    // Backfill niche pack for older runs / missing cursor fields
    if (!cursor.keywords?.length || !cursor.match?.length) {
      const pack = resolveNichePack(cursor.niche || "tech", cursor.subniche || null);
      cursor.niche = cursor.niche || "tech";
      cursor.keywords = pack.keywords;
      cursor.match = pack.match;
      cursor.nicheLabel = pack.label;
    }
    const keywords = cursor.keywords!;
    const matchTerms = cursor.match!;
    const found: FoundBrand[] = Array.isArray(run!.results) ? [...(run!.results as FoundBrand[])] : [];
    const knownDomains = new Set(found.map((f) => f.domain));

    const { data: existingBrands } = await admin
      .from("brands")
      .select("id,name,domain")
      .eq("user_id", userId)
      .is("archived_at", null);
    for (const b of existingBrands || []) {
      if (b.domain) knownDomains.add(String(b.domain).toLowerCase());
      const guess = domainToBrandName(String(b.domain || "")).toLowerCase();
      if (guess) knownDomains.add(guess);
      knownDomains.add(String(b.name || "").toLowerCase());
    }

    let creatorsScanned = Number(run!.creators_scanned || 0);
    let youtubeScanned = Number(run!.youtube_scanned || 0);
    let phase = String(run!.phase || "crm");
    let errorMsg: string | null = null;

    async function saveBrand(fb: FoundBrand) {
      if (knownDomains.has(fb.domain) || knownDomains.has(fb.brand_name.toLowerCase())) return false;
      const { data: brand, error } = await admin
        .from("brands")
        .insert({
          user_id: userId,
          name: fb.brand_name,
          domain: fb.domain,
          pipeline_status: "new",
          notes: `Discovered via Search · sponsored ${fb.source_creator_name}`,
          personalization: `Source influencer: ${fb.source_creator_name}. Video: ${fb.source_video_url}`,
        })
        .select("id")
        .single();
      if (error || !brand) return false;

      await admin.from("external_links").insert({
        user_id: userId,
        brand_id: brand.id,
        creator_id: fb.source_creator_id,
        creator_name: fb.source_creator_name,
        source_video_url: fb.source_video_url,
        video_link: fb.source_video_url,
        relationship_type: "sponsorship",
        domain: fb.domain,
        discovered_at: new Date().toISOString(),
        notes: `Auto-discovered via Search from ${fb.source_creator_name}`,
      });

      fb.brand_id = brand.id;
      found.push(fb);
      knownDomains.add(fb.domain);
      knownDomains.add(fb.brand_name.toLowerCase());
      return true;
    }

    async function scanChannel(opts: {
      channelId: string;
      creatorId: string | null;
      creatorName: string;
      markCrmUsed?: boolean;
      requireNicheMatch?: boolean;
    }) {
      const ch = await getChannel(keys, opts.channelId);
      if (!ch) return;
      const sn = ch.snippet || {};
      const stats = ch.statistics || {};
      const subs = Number(stats.subscriberCount || 0);
      const desc = String(sn.description || "");
      const title = String(sn.title || opts.creatorName);
      if (subs < MIN_SUBS) return;
      if (!looksEnglish(desc) && !looksEnglish(title)) return;
      if (opts.requireNicheMatch !== false && !matchesNiche(`${title}\n${desc}`, matchTerms)) return;
      if (!guessMale(title, desc)) {
        if (opts.creatorId) {
          await admin.from("creators").update({ gender_guess: "female" }).eq("id", opts.creatorId);
        }
        return;
      }
      const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
      if (!uploads) return;
      const videos = await getRecentVideos(keys, uploads, VIDEOS_PER_CHANNEL);
      const metrics = computeMetrics(videos);
      if (metrics.avgViews < MIN_AVG_VIEWS || metrics.engagement < MIN_ENGAGEMENT) return;

      // Extra niche gate: recent video titles should relate when searching a subniche
      const videoBlob = videos.map((v: { snippet?: { title?: string; description?: string } }) =>
        `${v.snippet?.title || ""}\n${v.snippet?.description || ""}`
      ).join("\n");
      if (!matchesNiche(`${title}\n${desc}\n${videoBlob}`, matchTerms)) return;

      const hints = creatorHints(title, sn.customUrl);
      for (const video of videos) {
        if (found.length >= target) break;
        const vs = video.snippet || {};
        const videoId = video.id as string;
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const caption = await fetchCaptionsText(videoId);
        const blob = [vs.title || "", vs.description || "", caption].join("\n");
        const domains = extractDomainsFromText(blob, hints);
        for (const domain of domains) {
          if (found.length >= target) break;
          await saveBrand({
            brand_name: domainToBrandName(domain),
            domain,
            source_creator_id: opts.creatorId,
            source_creator_name: opts.creatorName || title,
            source_video_url: videoUrl,
          });
        }
      }

      if (opts.markCrmUsed && opts.creatorId) {
        await admin
          .from("creators")
          .update({
            last_brand_search_at: new Date().toISOString(),
            gender_guess: "male",
            avg_views: Math.round(metrics.avgViews),
          })
          .eq("id", opts.creatorId);
      }
    }

    try {
      if (phase === "crm" && found.length < target) {
        const { data: creators } = await admin
          .from("creators")
          .select("id,name,channel_link,niche,notes,personalization,last_brand_search_at,archived_at")
          .eq("user_id", userId)
          .is("archived_at", null)
          .order("created_at", { ascending: true });

        const now = Date.now();
        const eligible = (creators || []).filter((c) => {
          if (!c.channel_link) return false;
          const nicheBlob = [c.name, c.niche, c.notes, c.personalization].filter(Boolean).join("\n");
          if (!matchesNiche(nicheBlob, matchTerms)) return false;
          if (!c.last_brand_search_at) return true;
          return now - new Date(c.last_brand_search_at).getTime() >= WEEK_MS;
        });

        while (cursor.crmOffset < eligible.length && found.length < target && Date.now() - started < BATCH_MS) {
          const c = eligible[cursor.crmOffset++];
          creatorsScanned++;
          try {
            const channelId = await resolveHandleToChannelId(keys, c.channel_link);
            if (!channelId) continue;
            await scanChannel({
              channelId,
              creatorId: c.id,
              creatorName: c.name,
              markCrmUsed: true,
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (/quota/i.test(msg)) throw e;
          }
        }

        if (cursor.crmOffset >= eligible.length) phase = "youtube";
      }

      if (phase === "youtube" && found.length < target) {
        while (found.length < target && Date.now() - started < BATCH_MS) {
          if (!cursor.youtubeChannelQueue.length) {
            if (cursor.keywordIndex >= keywords.length) break;
            const keyword = keywords[cursor.keywordIndex];
            const params: Record<string, string> = {
              part: "snippet",
              type: "channel",
              maxResults: "15",
              q: keyword,
              relevanceLanguage: "en",
              regionCode: "US",
            };
            if (cursor.searchPageToken) params.pageToken = cursor.searchPageToken;
            const search = await ytGet(keys, "search", params, 100);
            cursor.searchPageToken = search.nextPageToken || null;
            if (!cursor.searchPageToken) cursor.keywordIndex++;
            const ids = (search.items || [])
              .map((it: { snippet?: { channelId?: string }; id?: { channelId?: string } }) =>
                it.snippet?.channelId || it.id?.channelId
              )
              .filter(Boolean);
            cursor.youtubeChannelQueue.push(...ids);
            if (!ids.length && !cursor.searchPageToken) cursor.keywordIndex++;
            continue;
          }

          const channelId = cursor.youtubeChannelQueue.shift()!;
          youtubeScanned++;
          try {
            const ch = await getChannel(keys, channelId);
            const name = ch?.snippet?.title || "YouTube creator";
            // Match CRM creator by channel if possible
            const { data: match } = await admin
              .from("creators")
              .select("id,name")
              .eq("user_id", userId)
              .ilike("channel_link", `%${channelId}%`)
              .maybeSingle();
            await scanChannel({
              channelId,
              creatorId: match?.id || null,
              creatorName: match?.name || name,
              markCrmUsed: Boolean(match?.id),
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (/quota/i.test(msg)) throw e;
          }
        }
      }
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    }

    const done = found.length >= target || (phase === "youtube" && cursor.keywordIndex >= keywords.length && !cursor.youtubeChannelQueue.length) || Boolean(errorMsg);
    const status = errorMsg && found.length === 0 ? "failed" : done ? "completed" : "running";

    await admin
      .from("brand_search_runs")
      .update({
        status,
        brands_found: found.length,
        creators_scanned: creatorsScanned,
        youtube_scanned: youtubeScanned,
        phase,
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
      brands_found: found.length,
      target,
      creators_scanned: creatorsScanned,
      youtube_scanned: youtubeScanned,
      phase,
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
