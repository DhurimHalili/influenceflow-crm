// Run: deno run --allow-env --allow-read supabase/functions/_shared/transcriptApis.test.ts
// Recorded response shapes (from each service's docs) — no network, no real keys.
import { fetchTranscript, parseStamped, PROVIDERS, txLeft } from "./transcriptApis.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
};

// Every request is recorded; answers come from `route`.
const seen: { url: string; headers: Record<string, string> }[] = [];
let route: (url: string) => Response = () => new Response("", { status: 500 });
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  seen.push({ url, headers: Object.fromEntries(Object.entries((init?.headers || {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])) });
  return Promise.resolve(route(url));
}) as typeof fetch;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

eq("a paragraph over several lines stays whole", parseStamped("Title: X\nLanguage: en\n\n**[0:05]** Hey everyone, today's video\nis sponsored by Ridge, the wallet\nthat lasts.\n\n[0:20] Let's get into it"), [[5000, "Hey everyone, today's video is sponsored by Ridge, the wallet that lasts."], [20000, "Let's get into it"]]);
eq("stamped markdown → ms", parseStamped("# Title\nlanguage: en\n\n[0:05] Hello there\n[1:02:03] This video is sponsored by NordVPN\nno stamp"), [[5000, "Hello there"], [3723000, "This video is sponsored by NordVPN no stamp"]]);

const by = (name: string) => PROVIDERS.find((p) => p.name === name)!;
route = () => json({ content: [{ text: "Thanks to Ridge for sponsoring", offset: 61000, duration: 3000, lang: "en" }], lang: "en", availableLangs: ["en"] });
eq("supadata: content[] offset ms", await by("supadata").get("abcdefghijk", "k1"), { status: "ok", lang: "en", kind: "", caps: [[61000, "Thanks to Ridge for sponsoring"]], by: "supadata" });
eq("supadata: always native captions (never AI-generated)", seen.at(-1)!.url.includes("mode=native"), true);
eq("supadata: key in a header, never the URL", [seen.at(-1)!.headers["x-api-key"], seen.at(-1)!.url.includes("k1")], ["k1", false]);
route = () => new Response("", { status: 206 });
eq("supadata: 206 = no captions", (await by("supadata").get("abcdefghijk", "k1")).status, "none");

route = () => json({ status: "ok", data: { video_id: "abcdefghijk", language_code: "en", is_auto_generated: true, transcript: [{ text: "Go to brilliant.org", start_ms: 4000, end_ms: 6000 }] } });
eq("tubealfred: data.transcript[] start_ms", await by("tubealfred").get("abcdefghijk", "k2"), { status: "ok", lang: "en", kind: "asr", caps: [[4000, "Go to brilliant.org"]], by: "tubealfred" });

route = () => json({ video_id: "abcdefghijk", language: "en", transcript: [{ text: "Use code TECH for 20% off", start: 12.5, duration: 2 }] });
eq("transcriptapi: start in seconds → ms", await by("transcriptapi").get("abcdefghijk", "k3"), { status: "ok", lang: "en", kind: "", caps: [[12500, "Use code TECH for 20% off"]], by: "transcriptapi" });
route = () => json({ detail: "No captions", code: "no_captions" }, 404);
eq("transcriptapi: 404 no_captions = none", (await by("transcriptapi").get("abcdefghijk", "k3")).status, "none");

route = () => new Response("Title: X\nLanguage: en\n\n[0:10] Today's video is sponsored by Squarespace", { status: 200 });
eq("youtube-transcript.ai: markdown", await by("ytai").get("abcdefghijk", "k4"), { status: "ok", lang: "en", kind: "", caps: [[10000, "Today's video is sponsored by Squarespace"]], by: "ytai" });
eq("youtube-transcript.ai: bearer header", seen.at(-1)!.headers.authorization, "Bearer k4");

// Status codes every service shares.
for (const [code, want] of [[401, "bad_key"], [403, "bad_key"], [429, "quota"], [402, "quota"], [503, "retry"]] as const) {
  route = () => new Response("", { status: code });
  eq(`${code} → ${want}`, (await by("tubealfred").get("abcdefghijk", "k")).status, want);
}

// ---- the chain: order, daily caps, pauses ----
const rows = new Map<string, { calls: number; paused_until: string | null }>();
const today = new Date().toISOString().slice(0, 10);
// deno-lint-ignore no-explicit-any
const q = (route: string): any => {
  const key = `${route}|${today}`;
  const chain = { eq: () => chain, not: () => chain, order: () => chain, limit: () => chain, maybeSingle: () => Promise.resolve({ data: rows.get(key) || null }) };
  return chain;
};
// deno-lint-ignore no-explicit-any
const admin: any = {
  from: () => ({
    select: () => ({ eq: (_c: string, r: string) => q(r) }),
    upsert: (v: { route: string; day: string; paused_until: string }) => { const k = `${v.route}|${v.day}`; rows.set(k, { calls: rows.get(k)?.calls || 0, paused_until: v.paused_until }); return Promise.resolve({}); },
  }),
  rpc: (_fn: string, a: { p_route: string }) => { const k = `${a.p_route}|${today}`; rows.set(k, { calls: (rows.get(k)?.calls || 0) + 1, paused_until: rows.get(k)?.paused_until || null }); return Promise.resolve({}); },
};
for (const p of PROVIDERS) Deno.env.delete(p.env);
eq("no keys: nothing to do", [await fetchTranscript(admin, "abcdefghijk"), await txLeft(admin)], [null, 0]);
Deno.env.set("YTAI_API_KEY", "a"); Deno.env.set("SUPADATA_API_KEY", "b");
eq("left today = both daily caps", await txLeft(admin), 13);
let ytaiCalls = 0;
route = (url) => { if (url.includes("youtube-transcript.ai")) { ytaiCalls++; return new Response("", { status: 429 }); } return json({ content: [{ text: "sponsored by Ridge", offset: 1000 }], lang: "en" }); };
const r1 = await fetchTranscript(admin, "abcdefghijk");
eq("quota on the first → the next one answers", [r1?.status, r1 && "by" in r1 ? r1.by : ""], ["ok", "supadata"]);
await fetchTranscript(admin, "abcdefghijk");
eq("a paused service isn't asked again", ytaiCalls, 1);
for (let i = 0; i < 5; i++) await fetchTranscript(admin, "abcdefghijk");
eq("daily cap respected (supadata 3 a day), then null", [rows.get(`tx:supadata|${today}`)?.calls, await fetchTranscript(admin, "abcdefghijk")], [3, null]);
eq("a bad id is never sent", await fetchTranscript(admin, "../../etc"), null);

if (fail) { console.log(`\n${fail} failing`); Deno.exit(1); } else console.log("\nall transcript-service tests pass");
