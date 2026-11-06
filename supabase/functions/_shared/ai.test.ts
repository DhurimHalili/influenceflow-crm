// Run: deno run --allow-env --allow-net=none supabase/functions/_shared/ai.test.ts
// The provider chain with fake providers: quota, missing model, bad JSON, timeout → the next one does the work.
Deno.env.set("GEMINI_API_KEY", "AIzaFAKEFAKEFAKEFAKEFAKEFAKE1");
Deno.env.set("GROQ_API_KEY", "gsk_FAKEFAKEFAKEFAKEFAKEFAKE2");
Deno.env.set("CLOUDFLARE_ACCOUNT_ID", "0123456789abcdef0123456789abcdef");
Deno.env.set("CLOUDFLARE_AI_TOKEN", "cfFAKEFAKEFAKEFAKEFAKEFAKE3");
Deno.env.set("OPENROUTER_API_KEY", "sk-or-FAKEFAKEFAKEFAKEFAKE4");

const { aiChain, aiReadyAt, readCreatorEmail, readAttachment, QuotaExhausted } = await import("./ai.ts");

let fail = 0;
const check = (name: string, ok: boolean, extra = "") => { if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", name, extra); };
const calls: string[] = [];
type Plan = Record<string, (body: Record<string, unknown>) => Response>;
const json = (v: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json", ...headers } });
const answer = { stated_rates: [{ key: "video", amount: 1500, currency: "USD" }], final_agreement: { agreed: false, items: [], quote: "" }, audience_claims: { top_countries: [], age_ranges: [], gender_female_pct: 0, gender_male_pct: 0, avg_views: 0, followers: [], engagement_rate: 0 }, contains_instructions: false, confidence: 0.9 };
const openAiOk = (v: unknown) => json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(v) } }] });
let plan: Plan = {};
let groqMode = "";
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const host = new URL(url).hostname;
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  calls.push(`${host}:${body.model || url.split("/models/")[1]?.split(":")[0] || ""}`);
  const handler = plan[host];
  return handler ? handler(body) : json({ error: "no plan" }, 500);
}) as typeof fetch;
const email = { creator: "Nick", subject: "rates", body: "My integration is $1,500.", currentRates: {} };

// 1. Gemini out of daily quota → Groq answers.
plan = {
  "generativelanguage.googleapis.com": () => json({ error: { message: "quota", details: [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel" }] }] } }, 429),
  "api.groq.com": (b) => { groqMode = (b.response_format as { type?: string })?.type || ""; return openAiOk(answer); },
};
calls.length = 0;
const r1 = await readCreatorEmail(email);
check("gemini quota → groq does it", r1?.statedRates[0]?.amount === 1500 && calls[0].startsWith("generativelanguage") && calls[1] === "api.groq.com:llama-3.3-70b-versatile", calls.join(" → "));
check("llama on groq gets JSON mode (schema in the prompt)", groqMode === "json_object", groqMode);

// 2. Next call skips Gemini (cooling down) without asking it.
calls.length = 0;
await readCreatorEmail(email);
check("cooled-down gemini isn't asked again", !calls.some((c) => c.startsWith("generativelanguage")), calls.join(" → "));

// 3. Groq rate-limited + Cloudflare model missing → OpenRouter.
plan["api.groq.com"] = () => json({ error: { message: "Rate limit reached ... tokens per minute" } }, 429, { "retry-after": "30" });
plan["api.cloudflare.com"] = () => json({ errors: [{ message: "No such model" }] }, 404);
plan["openrouter.ai"] = (b) => { check("openrouter asked with json_schema + require_parameters", (b.response_format as { type?: string })?.type === "json_schema" && (b.provider as { require_parameters?: boolean })?.require_parameters === true); return openAiOk(answer); };
calls.length = 0;
const r3 = await readCreatorEmail(email);
check("groq 429 + cloudflare 404 → openrouter", r3?.statedRates.length === 1 && calls.at(-1) === "openrouter.ai:openai/gpt-oss-120b", calls.join(" → "));

// 4. Everything out → QuotaExhausted (the work stays queued), with a time.
plan["openrouter.ai"] = () => json({ error: { message: "Insufficient credits" } }, 402);
let threw: unknown = null;
try { await readCreatorEmail(email); } catch (e) { threw = e; }
check("all out → QuotaExhausted", threw instanceof QuotaExhausted && (threw as InstanceType<typeof QuotaExhausted>).until > Date.now());
check("aiReadyAt says when", (await aiReadyAt("text")) > Date.now());

// 5. A PDF never goes to a text-only model; images go to vision models.
const chain = await aiChain();
check("chain lists 4 providers", chain.length === 4, chain.map((c) => `${c.provider}[${c.can.join("/")}]`).join(" "));
check("groq can't read PDFs", !chain.find((c) => c.provider === "groq")!.can.includes("pdf"));
check("openrouter vision model reads PDFs", chain.find((c) => c.provider === "openrouter")!.models.includes("google/gemini-2.5-flash-lite"));

console.log(fail ? `${fail} failed` : "all ai chain tests pass");
if (fail) Deno.exit(1);
