// Captions of a public YouTube video from paid-tier transcript services, used on their FREE allowances
// only. Each one gets just the video id and its own API key (sent in a header, never in a URL) —
// never a YouTube login, cookie, email or anything about the member. YouTube blocks servers from
// reading captions directly; these services do the reading.
//
// Order = the allowance that resets soonest goes first, so nothing free is wasted:
//   youtube-transcript.ai  10 a day        YTAI_API_KEY
//   Supadata               100 a month     SUPADATA_API_KEY        (mode=native: never AI-generated, never 2 credits/min)
//   TubeAlfred             50 a month      TUBEALFRED_API_KEY
//   TranscriptAPI          100 once        TRANSCRIPTAPI_API_KEY   (last: its credits don't come back)
// Daily caps (TX_DAILY_<NAME>) spread the monthly ones over the month; a quota answer pauses that
// service (until UTC midnight, or a week for "no credits"), a bad key pauses it for a day. All out → null,
// and the video waits for the helper or for Gemini listening.

export type Caption = [number, string];
export type TxResult = { status: "ok"; lang: string; kind: "asr" | "manual" | ""; caps: Caption[]; by: string } | { status: "none"; by: string };

type Outcome = TxResult | { status: "quota" | "bad_key" | "retry" | "error"; why: string };
type Provider = { name: string; env: string; perDay: number; get: (id: string, key: string) => Promise<Outcome> };

const env = (k: string) => (typeof Deno !== "undefined" ? Deno.env.get(k) || "" : "");
const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
const sane = (caps: Caption[]) => caps.filter(([t, s]) => Number.isFinite(t) && t >= 0 && s).slice(0, 12_000).map(([t, s]) => [Math.round(t), s] as Caption);

async function call(url: string, headers: Record<string, string>): Promise<Response | null> {
  return await fetch(url, { headers: { Accept: "application/json, text/plain, */*", "User-Agent": "InfluenceFlowCRM/1.0", ...headers }, signal: AbortSignal.timeout(25_000) }).catch(() => null);
}
const common = (res: Response | null): Outcome | null =>
  !res ? { status: "retry", why: "no answer" }
    : res.status === 401 || res.status === 403 ? { status: "bad_key", why: `${res.status}` }
      : res.status === 429 || res.status === 402 ? { status: "quota", why: `${res.status}` }
        : res.status >= 500 || res.status === 408 ? { status: "retry", why: `${res.status}` }
          : null;

/** "[1:02:03] text" / "[m:ss] text" paragraphs (youtube-transcript.ai's markdown) → [ms, text]. */
export function parseStamped(text: string): Caption[] {
  const out: Caption[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*\[(?:(\d+):)?(\d{1,2}):(\d{2})\]\s*(.+)$/.exec(line);
    if (!m) continue;
    out.push([((Number(m[1] || 0) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000, clean(m[4])]);
  }
  return out;
}

export const PROVIDERS: Provider[] = [
  {
    name: "ytai", env: "YTAI_API_KEY", perDay: 10,
    get: async (id, key) => {
      const res = await call(`https://youtube-transcript.ai/transcript/${id}.txt?lang=en`, { Authorization: `Bearer ${key}` });
      const bad = common(res); if (bad) return bad;
      if (res!.status === 404) return { status: "none", by: "ytai" };
      if (!res!.ok) return { status: "error", why: `${res!.status}` };
      const text = await res!.text();
      const caps = sane(parseStamped(text));
      const lang = /language:\s*([\w-]+)/i.exec(text)?.[1] || "";
      return caps.length ? { status: "ok", lang, kind: /auto|asr/i.test(text.slice(0, 600)) ? "asr" : "", caps, by: "ytai" } : { status: "none", by: "ytai" };
    },
  },
  {
    name: "supadata", env: "SUPADATA_API_KEY", perDay: 3,
    get: async (id, key) => {
      const url = `https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&lang=en&mode=native`;
      let res = await call(url, { "x-api-key": key });
      // Long videos: a job to poll (free), at most ~40 s.
      if (res?.status === 202) {
        const job = String(((await res.json().catch(() => ({}))) as { jobId?: string }).jobId || "");
        if (!/^[\w-]{4,80}$/.test(job)) return { status: "error", why: "no job id" };
        for (let i = 0; i < 20; i++) {
          await new Promise((ok) => setTimeout(ok, 2000));
          res = await call(`https://api.supadata.ai/v1/transcript/${job}`, { "x-api-key": key });
          const body = res?.ok ? await res.clone().json().catch(() => null) as { status?: string } | null : null;
          if (!body || body.status === "completed" || body.status === "failed" || !body.status) break;
        }
      }
      const bad = common(res); if (bad) return bad;
      if (res!.status === 206 || res!.status === 404) return { status: "none", by: "supadata" };
      if (!res!.ok) return { status: "error", why: `${res!.status}` };
      const d = await res!.json().catch(() => null) as { content?: { text?: string; offset?: number }[]; lang?: string; status?: string } | null;
      if (d?.status === "failed") return { status: "none", by: "supadata" };
      const caps = sane((Array.isArray(d?.content) ? d!.content : []).map((c) => [Number(c.offset), clean(c.text)] as Caption));
      return caps.length ? { status: "ok", lang: clean(d?.lang).slice(0, 12), kind: "", caps, by: "supadata" } : { status: "none", by: "supadata" };
    },
  },
  {
    name: "tubealfred", env: "TUBEALFRED_API_KEY", perDay: 2,
    get: async (id, key) => {
      const res = await call(`https://api.tubealfred.com/v1/youtube/video/${id}/transcript/fast`, { Authorization: `Bearer ${key}` });
      const bad = common(res); if (bad) return bad;
      if (res!.status === 404) return { status: "none", by: "tubealfred" };
      if (!res!.ok) return { status: "error", why: `${res!.status}` };
      const d = (await res!.json().catch(() => null) as { data?: { transcript?: { text?: string; start_ms?: number }[]; language_code?: string; is_auto_generated?: boolean } } | null)?.data;
      const caps = sane((Array.isArray(d?.transcript) ? d!.transcript : []).map((c) => [Number(c.start_ms), clean(c.text)] as Caption));
      return caps.length ? { status: "ok", lang: clean(d?.language_code).slice(0, 12), kind: d?.is_auto_generated ? "asr" : "manual", caps, by: "tubealfred" } : { status: "none", by: "tubealfred" };
    },
  },
  {
    name: "transcriptapi", env: "TRANSCRIPTAPI_API_KEY", perDay: 4,
    get: async (id, key) => {
      const res = await call(`https://transcriptapi.com/api/v2/youtube/transcript?video_url=${id}&format=json&include_timestamp=true&language=en,asr-en`, { Authorization: `Bearer ${key}` });
      const bad = common(res); if (bad) return bad;
      if (res!.status === 404 || res!.status === 422) return { status: "none", by: "transcriptapi" };
      if (!res!.ok) return { status: "error", why: `${res!.status}` };
      const d = await res!.json().catch(() => null) as { transcript?: { text?: string; start?: number }[]; language?: string } | null;
      const caps = sane((Array.isArray(d?.transcript) ? d!.transcript : []).map((c) => [Number(c.start) * 1000, clean(c.text)] as Caption));
      return caps.length ? { status: "ok", lang: clean(d?.language).slice(0, 12), kind: /asr/i.test(String(d?.language || "")) ? "asr" : "", caps, by: "transcriptapi" } : { status: "none", by: "transcriptapi" };
    },
  },
];

// deno-lint-ignore no-explicit-any
type Admin = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };
const utcDay = () => new Date().toISOString().slice(0, 10);
const nextUtcMidnight = () => { const d = new Date(); d.setUTCHours(24, 0, 5, 0); return d.getTime(); };
const capOf = (p: Provider) => { const v = Number(env(`TX_DAILY_${p.name.toUpperCase()}`)); return Number.isFinite(v) && v >= 0 && env(`TX_DAILY_${p.name.toUpperCase()}`) !== "" ? v : p.perDay; };

/** Services with a key set (in try order). */
export const txProviders = () => PROVIDERS.filter((p) => !!env(p.env));
export const txConfigured = () => txProviders().length > 0;

async function state(admin: Admin, p: Provider) {
  const { data } = await admin.from("ai_budget").select("calls, paused_until").eq("route", `tx:${p.name}`).eq("day", utcDay()).maybeSingle();
  // A pause carries over days (a week for "no credits"), so read the latest one too.
  const { data: last } = await admin.from("ai_budget").select("paused_until").eq("route", `tx:${p.name}`).not("paused_until", "is", null).order("day", { ascending: false }).limit(1).maybeSingle();
  const paused = Math.max(data?.paused_until ? new Date(data.paused_until).getTime() : 0, last?.paused_until ? new Date(last.paused_until).getTime() : 0);
  return { used: Number(data?.calls) || 0, paused };
}
const pauseFor = (admin: Admin, p: Provider, until: number, note: string) =>
  Promise.resolve(admin.from("ai_budget").upsert({ route: `tx:${p.name}`, day: utcDay(), paused_until: new Date(until).toISOString(), note: note.slice(0, 200) })).catch(() => null);
const count = (admin: Admin, p: Provider) => Promise.resolve(admin.rpc("ai_budget_use", { p_route: `tx:${p.name}`, p_units: 0 })).catch(() => null);

/** How many transcripts the services can still read today (all keys together). */
export async function txLeft(admin: Admin): Promise<number> {
  let n = 0;
  for (const p of txProviders()) { const s = await state(admin, p); if (s.paused <= Date.now()) n += Math.max(0, capOf(p) - s.used); }
  return n;
}

/**
 * Captions of one video from the first service with free allowance left. null = none could answer
 * right now (keep the video queued); {status: "none"} = the video has no captions (final).
 */
export async function fetchTranscript(admin: Admin, videoId: string): Promise<TxResult | null> {
  if (!/^[\w-]{11}$/.test(videoId)) return null;
  for (const p of txProviders()) {
    const s = await state(admin, p);
    if (s.paused > Date.now() || s.used >= capOf(p)) continue;
    const out = await p.get(videoId, env(p.env)).catch((e) => ({ status: "retry", why: String(e).slice(0, 80) }) as Outcome);
    if (out.status === "ok" || out.status === "none") { await count(admin, p); return out; }
    if (out.status === "quota") await pauseFor(admin, p, out.why === "402" ? Date.now() + 7 * 86400_000 : nextUtcMidnight(), `quota ${out.why}`);
    else if (out.status === "bad_key") await pauseFor(admin, p, Date.now() + 86400_000, `key refused ${out.why}`);
    else { await count(admin, p); continue; } // a failed call: counted, so a broken service can't eat the day
  }
  return null;
}
