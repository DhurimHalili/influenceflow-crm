import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-discovery-secret",
};

const DEFAULTS = {
  targetCount: 50,
  maxKeywordsPerRun: 10,
  cooldownDays: 7,
  subscriberMin: 5e4,
  subscriberMax: 1e6,
  minAvgViews: 5e4,
  minEngagementPct: 1,
  maxDaysSinceUpload: 21,
  minLongformVideos: 3,
  maxLongformPerChannel: 12,
  shortsMaxSeconds: 60,
};

function normalizeUrl(url: string): string {
  let u = (url || "").trim();
  while (u.endsWith("/")) u = u.slice(0, -1);
  return u;
}

function rotate(arr: string[], cursor: number, count: number) {
  if (arr.length === 0) return { selected: [] as string[], nextCursor: 0 };
  // Never return duplicates within a single run: cap to pool size
  const effective = Math.min(count, arr.length);
  const selected: string[] = [];
  for (let i = 0; i < effective; i++) selected.push(arr[(cursor + i) % arr.length]);
  return { selected, nextCursor: (cursor + effective) % arr.length };
}

function parseDuration(iso: string | null | undefined): number {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+)S)?)?/);
  if (!m) return 0;
  return (
    parseInt(m[1] || "0", 10) * 3600 +
    parseInt(m[2] || "0", 10) * 60 +
    parseInt(m[3] || "0", 10)
  );
}

function daysAgo(dateStr: string | null | undefined): number {
  if (!dateStr) return 999;
  const parsed = Date.parse(dateStr);
  if (isNaN(parsed)) return 999;
  return Math.max(0, Math.floor((Date.now() - parsed) / 864e5));
}

function containsAny(text: string | null | undefined, terms: string[]): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return terms.some((t) => lower.includes(t.toLowerCase()));
}

function apiKeysFromEnv(): string[] {
  const multi = Deno.env.get("YOUTUBE_API_KEYS");
  if (multi) {
    const keys = multi.split(",").map((k) => k.trim()).filter(Boolean);
    if (keys.length) return keys;
  }
  const single = Deno.env.get("YOUTUBE_API_KEY");
  return single ? [single.trim()] : [];
}

function yt(url: string, apiKey: string) {
  const full =
    url + (url.includes("?") ? "&" : "?") + "key=" + encodeURIComponent(apiKey);
  return fetch(full);
}

function chunk(arr: string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function normalizeCfg(s: any): any {
  const cfg: any = { ...DEFAULTS };
  if (!s) return cfg;
  cfg.targetCount = s.target_count ?? cfg.targetCount;
  cfg.maxKeywordsPerRun = s.max_keywords_per_run ?? cfg.maxKeywordsPerRun;
  cfg.cooldownDays = s.cooldown_days ?? cfg.cooldownDays;
  cfg.subscriberMin = s.subscriber_min ?? cfg.subscriberMin;
  cfg.subscriberMax = s.subscriber_max ?? cfg.subscriberMax;
  cfg.minAvgViews = s.min_avg_views ?? cfg.minAvgViews;
  cfg.minEngagementPct = Number(s.min_engagement_pct ?? cfg.minEngagementPct);
  cfg.maxDaysSinceUpload = s.max_days_since_upload ?? cfg.maxDaysSinceUpload;
  cfg.minLongformVideos = s.min_longform_videos ?? cfg.minLongformVideos;
  cfg.maxLongformPerChannel = s.max_longform_per_channel ?? cfg.maxLongformPerChannel;
  cfg.shortsMaxSeconds = s.shorts_max_seconds ?? cfg.shortsMaxSeconds;
  return cfg;
}

// Returns true if this user's scheduled slot is due RIGHT NOW (within the 5-min tick window)
function isDueNow(row: any): boolean {
  const tz = row.schedule_timezone || "Etc/UTC";
  const time = row.schedule_time || "08:00"; // HH:MM
  const [hStr, mStr] = time.split(":");
  const wantH = parseInt(hStr, 10);
  const wantM = parseInt(mStr, 10);
  if (isNaN(wantH) || isNaN(wantM)) return false;

  // Current date/time in the user's timezone
  const now = new Date();
  // Use Intl to extract wall-clock time in that timezone
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "0";
  const curY = get("year");
  const curMo = get("month");
  const curD = get("day");
  const curH = parseInt(get("hour"), 10);
  const curM = parseInt(get("minute"), 10);
  const todayStr = `${curY}-${curMo}-${curD}`;

  // Already ran today?
  if (row.last_scheduled_run_date === todayStr) return false;

  // Within the 5-minute tick window: current minute is >= scheduled minute and < scheduled + 5
  const wantTotal = wantH * 60 + wantM;
  const curTotal = curH * 60 + curM;
  const diff = curTotal - wantTotal;
  // Allow running if we are 0-4 minutes after the scheduled time
  return diff >= 0 && diff < 5;
}

async function persistRun(
  admin: any,
  userId: string,
  log: any,
  ranAt: string
) {
  try {
    await admin.from("discovery_runs").insert({
      user_id: userId,
      trigger: log.trigger,
      ran_at: ranAt,
      keywords_searched: log.keywords_searched ?? null,
      searches_performed: log.searches_performed ?? null,
      keyword_pool_total: log.keyword_pool_total ?? null,
      channels_found: log.channels_found ?? null,
      channels_skipped_cooldown: log.channels_skipped_cooldown ?? null,
      channels_dupe_existing: log.channels_dupe_existing ?? null,
      channels_considered: log.channels_considered ?? null,
      shortlisted: log.shortlisted ?? null,
      fresh: log.fresh ?? null,
      inserted: log.inserted ?? null,
      api_keys_used: log.api_keys_used ?? null,
      quota_exhausted: log.quota_exhausted ?? false,
      error: log.error ?? null,
    });
  } catch {
    // logging best-effort
  }
}

async function runDiscovery(
  admin: any,
  userId: string,
  raw: any,
  trigger: string,
  ranAt: string
) {
  const cfg = normalizeCfg(raw);
  const keys = apiKeysFromEnv();

  // Resolve keyword pools from DB or fall back to defaults (desk setups niche)
  const dbKeywords = Array.isArray(raw.keywords) && raw.keywords.length
    ? raw.keywords
    : ["gaming setup","battlestation","desk setup","triple monitor setup","cable management","dual monitor setup","white gaming setup","rgb setup","mechanical keyboard setup","gaming room setup","streamer setup","pc build showcase","study desk setup","productivity desk setup","minimalist gaming setup","gaming chair setup","cozy gaming setup","pink gaming setup","desk tour","gaming corner","custom pc setup","ultrawide monitor setup","standing desk gaming","modded pc build","home office gaming setup","gaming desk","room setup","desk cable management","monitor setup","content creator setup"];
  const dbNeg = Array.isArray(raw.negative_kw) && raw.negative_kw.length
    ? raw.negative_kw
    : ["kitchen setup","school desk","office furniture wholesale","stock trading setup","forex setup","call center setup","dentist office setup","photography studio setup","wedding setup","camping setup","tattoo studio setup","makeup vanity setup","aquarium setup","home theater setup","network server setup","vpn setup tutorial","printer setup","router setup","accounting desk","law office setup","realtor desk","baby nursery setup","toy room setup","classroom desk setup","church sound setup","DJ booth setup","sound system setup home","garage workshop setup","sewing room setup","art studio setup","giveaway free desk setup"];
  const dbBio = Array.isArray(raw.niche_bio_kw) && raw.niche_bio_kw.length
    ? raw.niche_bio_kw
    : ["gaming setup","battlestation","desk setup","pc setup","setup tour","rig","workspace","streamer","desk","cable management","keyboard","monitor","gaming room","gaming pc","rgb","setup","peripherals"];

  const log: any = {
    trigger, keywords_searched: 0, searches_performed: 0,
    keyword_pool_total: dbKeywords.length, channels_found: 0,
    channels_skipped_cooldown: 0, channels_dupe_existing: 0,
    channels_considered: 0, shortlisted: 0, fresh: 0, inserted: 0,
    api_keys_used: 0, quota_exhausted: false, error: null,
  };

  if (!keys.length) {
    log.error = "No YOUTUBE_API_KEY(s) configured";
    await persistRun(admin, userId, log, ranAt);
    return log;
  }

  // Build negative query for YouTube search
  const NEG_QUERY = dbNeg.map((k: string) => k.includes(" ") ? `-"${k}"` : `-${k}`).join(" ");

  // 7-day cooldown: don't re-evaluate channels already searched this week
  const cooldownCutoff = new Date(Date.now() - cfg.cooldownDays * 864e5).toISOString();
  const { data: cdRows } = await admin
    .from("searched_channels")
    .select("channel_url").eq("user_id", userId).gte("last_searched_at", cooldownCutoff);
  const cdUrls = new Set((cdRows || []).map((r: any) => normalizeUrl(r.channel_url)));

  // Skip channels already in the CRM
  const { data: exRows } = await admin
    .from("creators")
    .select("channel_link").eq("user_id", userId).not("channel_link", "is", null);
  const exUrls = new Set((exRows || []).map((r: any) => normalizeUrl(r.channel_link)));

  // Rotate keywords — different subset each run (capped to pool size so no duplicates per run)
  const { selected, nextCursor } = rotate(dbKeywords, raw.keyword_cursor || 0, cfg.maxKeywordsPerRun);
  await admin.from("creator_discovery_settings")
    .update({ keyword_cursor: nextCursor, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  // --- Phase 1: Search via keyword rotation across up to 5 API keys ---
  let keyIdx = 0;
  const exhausted = new Set<number>();
  const usedKeys = new Set<number>();
  const keyFor = (): string | null => {
    for (let i = 0; i < keys.length; i++) {
      const idx = (keyIdx + i) % keys.length;
      if (!exhausted.has(idx)) { keyIdx = idx; return keys[idx]; }
    }
    return null;
  };

  const found = new Map();
  let lastErr: string | null = null;
  for (const keyword of selected) {
    const searchKey = keyFor();
    if (!searchKey) { log.quota_exhausted = true; break; }
    log.keywords_searched++;
    const q = `${keyword} ${NEG_QUERY}`;
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&maxResults=50&relevanceLanguage=en`;
    let res: Response;
    try {
      res = await yt(url, searchKey);
    } catch (e: any) {
      lastErr = `fetch failed keyword="${keyword}": ${String(e?.message || e)}`;
      continue;
    }
    if (res.status === 403) {
      // Try to read body for quota vs other 403
      let bodyText = "";
      try { bodyText = await res.text(); } catch {}
      // Mark key exhausted, try next key on next keyword. Don't count as performed.
      exhausted.add(keys.indexOf(searchKey));
      log.quota_exhausted = true;
      lastErr = `quota 403 on key ${keys.indexOf(searchKey)} for "${keyword}": ${bodyText.slice(0, 300)}`;
      // If all keys exhausted, stop keyword loop
      if (exhausted.size >= keys.length) break;
      continue;
    }
    if (!res.ok) {
      try { lastErr = `HTTP ${res.status} keyword="${keyword}": ${(await res.text()).slice(0, 300)}`; } catch { lastErr = `HTTP ${res.status} keyword="${keyword}"`; }
      continue;
    }
    log.searches_performed++;
    usedKeys.add(keys.indexOf(searchKey));
    let body: any;
    try { body = await res.json(); } catch { lastErr = `json parse fail keyword="${keyword}"`; continue; }
    for (const item of body.items || []) {
      const cid = item?.snippet?.channelId;
      if (!cid) continue;
      if (containsAny(item.snippet?.title, dbNeg) || containsAny(item.snippet?.description, dbNeg)) continue;
      const u = normalizeUrl(`https://www.youtube.com/channel/${cid}`);
      if (!found.has(u)) found.set(u, { id: cid, url: u, name: item.snippet?.channelTitle || "" });
    }
  }
  log.channels_found = found.size;
  log.api_keys_used = usedKeys.size;
  // Only set error if no channels found and we have a diagnostic
  if (found.size === 0 && lastErr && !log.error) log.error = lastErr.slice(0, 500);

  // --- Phase 2: Filter out cooldown + existing, then fetch channel details ---
  const toEvaluate: any[] = [];
  for (const ch of found.values()) {
    if (cdUrls.has(ch.url)) { log.channels_skipped_cooldown++; continue; }
    if (exUrls.has(ch.url)) { log.channels_dupe_existing++; continue; }
    toEvaluate.push(ch);
  }

  // Fetch channel details (subscriber count filter) — batched 50 at a time
  const bandPassed: any[] = [];
  for (const ids of chunk(toEvaluate.map((c) => c.id), 50)) {
    const lookKey = keyFor();
    if (!lookKey) break;
    let res: Response;
    try { res = await yt(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${ids.join(",")}`, lookKey); } catch { continue; }
    if (res.status === 403) { exhausted.add(keys.indexOf(lookKey)); continue; }
    if (!res.ok) continue;
    usedKeys.add(keys.indexOf(lookKey));
    let body: any;
    try { body = await res.json(); } catch { continue; }
    for (const ch of body.items || []) {
      const subs = parseInt(ch?.statistics?.subscriberCount || "0", 10);
      if (subs < cfg.subscriberMin || subs > cfg.subscriberMax) continue;
      bandPassed.push({
        id: ch.id,
        url: normalizeUrl(`https://www.youtube.com/channel/${ch.id}`),
        name: ch?.snippet?.title || "Unknown",
        subs,
        desc: ch?.snippet?.description || "",
        uploads: ch?.contentDetails?.relatedPlaylists?.uploads || null,
      });
    }
  }
  log.channels_considered = bandPassed.length;

  // --- Phase 3: Fetch recent videos per channel ---
  const channelVideos: Record<string, string[]> = {};
  for (const c of bandPassed) {
    if (!c.uploads) continue;
    const listKey = keyFor();
    if (!listKey) { log.quota_exhausted = true; break; }
    let res: Response;
    try { res = await yt(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${c.uploads}&maxResults=30`, listKey); } catch { continue; }
    if (!res.ok) continue;
    usedKeys.add(keys.indexOf(listKey));
    let body: any;
    try { body = await res.json(); } catch { continue; }
    channelVideos[c.id] = (body.items || [])
      .map((it: any) => it?.contentDetails?.videoId)
      .filter(Boolean);
  }

  // --- Phase 4: Fetch video stats (batched 50 at a time) ---
  const videoIdToChannel: Record<string, string> = {};
  const allVideoIds: string[] = [];
  for (const c of bandPassed) {
    for (const vid of channelVideos[c.id] || []) {
      if (!(vid in videoIdToChannel)) {
        videoIdToChannel[vid] = c.id;
        allVideoIds.push(vid);
      }
    }
  }

  const videoStats: Record<string, any> = {};
  for (const ids of chunk(allVideoIds, 50)) {
    const statsKey = keyFor();
    if (!statsKey) { log.quota_exhausted = true; break; }
    let res: Response;
    try { res = await yt(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids.join(",")}`, statsKey); } catch { continue; }
    if (!res.ok) continue;
    usedKeys.add(keys.indexOf(statsKey));
    let body: any;
    try { body = await res.json(); } catch { continue; }
    for (const v of body.items || []) videoStats[v.id] = v;
  }
  // --- Phase 5: Score channels ---
  const channelsMap: Record<string, any> = {};
  for (const c of bandPassed) {
    channelsMap[c.id] = {
      channelName: c.name,
      channelUrl: c.url,
      subscribers: c.subs,
      channelDescription: c.desc,
      latestVideos: [],
    };
  }

  for (const vid of allVideoIds) {
    const chId = videoIdToChannel[vid];
    const ch = channelsMap[chId];
    const v = videoStats[vid];
    if (!ch || !v) continue;
    const durationSec = parseDuration(v?.contentDetails?.duration);
    if (durationSec > 0 && durationSec <= cfg.shortsMaxSeconds) continue;
    if (ch.latestVideos.length >= cfg.maxLongformPerChannel) continue;
    ch.latestVideos.push({
      viewCount: parseInt(v?.statistics?.viewCount || "0", 10),
      likeCount: parseInt(v?.statistics?.likeCount || "0", 10),
      commentCount: parseInt(v?.statistics?.commentCount || "0", 10),
      uploadedAt: v?.snippet?.publishedAt || "",
      daysAgo: daysAgo(v?.snippet?.publishedAt),
      isOffTopic:
        containsAny(v?.snippet?.title, dbNeg) ||
        containsAny(v?.snippet?.description, dbNeg),
    });
  }

  const scored: any[] = [];
  for (const id in channelsMap) {
    const ch = channelsMap[id];
    const videos = ch.latestVideos;
    if (videos.length < cfg.minLongformVideos) continue;
    videos.sort((a: any, b: any) => a.daysAgo - b.daysAgo);
    const totalEngagements = videos.reduce((s: number, v: any) => s + v.likeCount + v.commentCount, 0);
    const viewCounts = videos.map((v: any) => v.viewCount).sort((a: number, b: number) => a - b);
    const trimmed = viewCounts.length >= 3 ? viewCounts.slice(1, -1) : viewCounts;
    const avgViews = trimmed.length ? Math.round(trimmed.reduce((a: number, b: number) => a + b, 0) / trimmed.length) : 0;
    const totalViews = viewCounts.reduce((a: number, b: number) => a + b, 0);
    const engagementRate = totalViews > 0 ? parseFloat((totalEngagements / totalViews * 100).toFixed(2)) : 0;
    const onTopicCount = videos.filter((v: any) => !v.isOffTopic).length;
    scored.push({
      channelName: ch.channelName,
      channelUrl: ch.channelUrl,
      subscribers: ch.subscribers,
      avgViews,
      engagementRate,
      daysSinceLastUpload: videos[0].daysAgo,
      onTopicCount,
      onTopicRatio: videos.length > 0 ? parseFloat((onTopicCount / videos.length).toFixed(2)) : 0,
      bioIsNiche: containsAny(ch.channelDescription, dbBio),
      totalVideos: videos.length,
    });
  }

  // Shortlist + sort by bio match, on-topic ratio, engagement
  let shortlisted = scored.filter(
    (c) =>
      c.avgViews >= cfg.minAvgViews &&
      c.engagementRate >= cfg.minEngagementPct &&
      c.daysSinceLastUpload <= cfg.maxDaysSinceUpload &&
      c.onTopicCount >= 1 &&
      c.subscribers >= cfg.subscriberMin &&
      c.subscribers <= cfg.subscriberMax
  );
  shortlisted.sort((a: any, b: any) => {
    if ((b.bioIsNiche ? 1 : 0) !== (a.bioIsNiche ? 1 : 0))
      return (b.bioIsNiche ? 1 : 0) - (a.bioIsNiche ? 1 : 0);
    if (b.onTopicRatio !== a.onTopicRatio)
      return b.onTopicRatio - a.onTopicRatio;
    return b.engagementRate - a.engagementRate;
  });
  log.shortlisted = shortlisted.length;

  // Only insert channels not already in the CRM
  const fresh = shortlisted.filter(
    (c) => !exUrls.has(normalizeUrl(c.channelUrl))
  );
  log.fresh = fresh.length;

  const inserts = fresh.slice(0, cfg.targetCount);
  let inserted = 0;
  if (inserts.length) {
    const now = new Date().toISOString();
    const rows = inserts.map((c) => ({
      user_id: userId,
      name: c.channelName,
      channel_link: c.channelUrl,
      niche: raw.niche || "Desk Setups",
      avg_views: c.avgViews,
      platform: raw.platform || "youtube",
      pipeline_status: "new",
      on_roster: false,
      notes: `Subs: ${c.subscribers} | Engagement: ${c.engagementRate}% | Avg views: ${c.avgViews} | Days: ${c.daysSinceLastUpload}`,
      updated_at: now,
      created_at: now,
    }));
    const { error } = await admin.from("creators").insert(rows);
    if (error) log.error = String(error.message);
    else inserted = rows.length;
  }
  log.inserted = inserted;
  log.api_keys_used = usedKeys.size;

  // Remember searched channels for cooldown (only those we actually evaluated)
  if (found.size) {
    const arr = [...found.values()].filter(
      (c: any) => !cdUrls.has(normalizeUrl(c.url))
    );
    if (arr.length) {
      await admin.from("searched_channels").upsert(
        arr.map((c: any) => ({
          user_id: userId,
          channel_url: normalizeUrl(c.url),
          channel_id: c.id,
          last_searched_at: ranAt,
        })),
        { onConflict: "user_id,channel_url" }
      );
    }
  }

  await persistRun(admin, userId, log, ranAt);
  return log;
}



Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("Authorization");
  const presentedSecret = req.headers.get("x-discovery-secret");
  const expectedSecret = Deno.env.get("DISCOVERY_SECRET");

  // Cron tick: either no auth header (legacy pg_cron) OR valid x-discovery-secret
  const isCronTick = !authHeader;
  const hasValidSecret = expectedSecret && presentedSecret === expectedSecret;

  if (isCronTick) {
    // Security: if DISCOVERY_SECRET is configured, require it for unauthenticated cron ticks
    if (expectedSecret && !hasValidSecret) {
      // No secret supplied but one is expected — reject bare anon calls so only pg_cron (with secret) and authenticated users trigger discovery
      // However, pg_cron jobs created before secret rotation will fail — log and return 403 with hint
      return new Response(JSON.stringify({ error: "Forbidden: missing x-discovery-secret for cron tick" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Scheduled tick — process only users whose slot is due NOW
    const { data: rows } = await admin
      .from("creator_discovery_settings")
      .select("*").eq("enabled", true);

    const results: any[] = [];
    let acted = 0;
    let skippedNotDue = 0;
    for (const row of rows || []) {
      if (!isDueNow(row)) { skippedNotDue++; continue; }
      acted++;
      const summary = await runDiscovery(
        admin, row.user_id, row, "cron", new Date().toISOString()
      );
      // Compute today's date in the user's timezone for idempotency
      const tz = row.schedule_timezone || "Etc/UTC";
      const todayParts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
      const get = (t: string) => todayParts.find((p) => p.type === t)?.value || "0";
      const todayStr = `${get("year")}-${get("month")}-${get("day")}`;
      await admin
        .from("creator_discovery_settings")
        .update({
          last_scheduled_run_date: todayStr,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", row.user_id);
      results.push({ user_id: row.user_id, schedule: `${row.schedule_time} ${row.schedule_timezone}`, ...summary });
    }
    return new Response(
      JSON.stringify({ ok: true, cronTick: true, acted, skippedNotDue, totalEnabled: (rows || []).length, results }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  // Manual run (JWT from UI "Run now" button) — authenticated
  if (authHeader) {
    let anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!anonKey) {
      try {
        const dict = JSON.parse(
          Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}"
        );
        anonKey =
          Object.values(dict).find(
            (v: any) => typeof v === "string" && v.length > 20
          ) || "";
      } catch {
        anonKey = "";
      }
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...cors, "Content-Type": "application/json" },
        }
      );
    }
    const userId = userData.user.id;
    const { data: settings, error: sErr } = await admin
      .from("creator_discovery_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (sErr || !settings) {
      return new Response(
        JSON.stringify({ error: "Discovery not configured for this user yet" }),
        {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        }
      );
    }
    const summary = await runDiscovery(
      admin, userId, settings, "manual", new Date().toISOString()
    );
    return new Response(JSON.stringify(summary), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ error: "Forbidden" }),
    {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    }
  );
});
