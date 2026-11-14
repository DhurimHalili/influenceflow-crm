// A member's own API keys: YouTube (up to 3 slots), AI (Gemini, Groq, Cloudflare Workers AI, OpenRouter) and
// the lookup services (Clay, Hunter). See keyring.ts for how work picks the keys it runs on.
//
// Stored only sealed (AES-256-GCM) in public.member_keys, with a Vault key used for nothing else
// (member_key_secret(), service role only). The member id + service are bound in as associated data,
// so a sealed value copied to another row or account won't open. The plain key exists only in this
// function's memory while a lookup runs; it is never logged, never returned to the browser (only its
// last 4 characters), and never put in a URL (headers only).
//
// Whose key a lookup uses: the member's own key always; else, for the owner only, the workspace key set
// as a Supabase secret (HUNTER_API_KEY / CLAY_API_KEY). Members never spend the owner's credits.

export type Service = "youtube" | "gemini" | "groq" | "cloudflare" | "openrouter" | "hunter" | "clay";
export const SERVICES: Service[] = ["youtube", "gemini", "groq", "cloudflare", "openrouter", "hunter", "clay"];
/** How many keys a member may keep per service. Only YouTube allows more than one (each from a project with its own approved quota). */
export const SLOTS: Record<Service, number> = { youtube: 3, gemini: 1, groq: 1, cloudflare: 1, openrouter: 1, hunter: 1, clay: 1 };
export const SERVICE_NAME: Record<Service, string> = { youtube: "YouTube", gemini: "Gemini", groq: "Groq", cloudflare: "Cloudflare", openrouter: "OpenRouter", hunter: "Hunter", clay: "Clay" };

// deno-lint-ignore no-explicit-any
type Admin = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: any }>; from: (t: string) => any };
type KeySource = () => Promise<CryptoKey | null>;

const enc = new TextEncoder();
const b64u = (bytes: Uint8Array) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64u = (t: string) => Uint8Array.from(atob(t.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((t.length + 3) % 4)), (c) => c.charCodeAt(0));
// Slot 0 keeps the original binding (keys saved before slots existed still open).
const aad = (userId: string, service: Service, slot = 0) => enc.encode(`member_keys:${userId}:${service}${slot ? `:${slot}` : ""}`);

let cached: Promise<CryptoKey | null> | null = null;
/** The Vault key, imported once per function instance (a failure isn't cached). */
export function vaultKey(admin: Admin): KeySource {
  return () => {
    if (!cached) {
      cached = (async () => {
        const { data, error } = await admin.rpc("member_key_secret");
        const hex = typeof data === "string" ? data : "";
        if (error || !/^[0-9a-f]{64}$/i.test(hex)) return null;
        return crypto.subtle.importKey("raw", Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16))), "AES-GCM", false, ["encrypt", "decrypt"]);
      })().catch(() => null);
      cached.then((k) => { if (!k) cached = null; });
    }
    return cached;
  };
}

export async function sealKey(key: KeySource, userId: string, service: Service, plain: string, slot = 0): Promise<string> {
  const k = await key();
  if (!k) throw new Error("The key vault isn't available — nothing was saved.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(userId, service, slot) }, k, enc.encode(plain)));
  return `k1.${b64u(iv)}.${b64u(ct)}`;
}

/** The plain key, or "" when the value can't be opened (wrong account, tampered, vault missing). */
export async function openKey(key: KeySource, userId: string, service: Service, sealed: string, slot = 0): Promise<string> {
  const [v, iv, ct] = String(sealed || "").split(".");
  if (v !== "k1" || !iv || !ct) return "";
  const k = await key();
  if (!k) return "";
  try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64u(iv), additionalData: aad(userId, service, slot) }, k, unb64u(ct))); }
  catch { return ""; }
}

/** A pasted key, cleaned: trimmed, "Bearer " / quotes dropped. "" when it can't be a key. */
export function cleanKey(service: Service, raw: unknown): string {
  const unquote = (x: string) => x.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
  const s = unquote(unquote(String(raw ?? "")).replace(/^bearer\s+/i, ""));
  if (s.length < 16 || s.length > 256 || !/^[\x21-\x7e]+$/.test(s)) return "";
  if (service === "hunter" && !/^[A-Za-z0-9_-]+$/.test(s)) return "";
  if (service === "clay" && !/^[A-Za-z0-9_.-]+$/.test(s)) return "";
  // Google keys (YouTube, Gemini): "AIza…" (39) or the newer "AQ.…" form.
  if ((service === "youtube" || service === "gemini") && !/^(?:AIza[\w-]{30,40}|AQ\.[\w.-]{20,300})$/.test(s)) return "";
  if ((service === "groq" || service === "openrouter") && !/^[\w-]{20,200}$/.test(s)) return "";
  if (service === "cloudflare" && !/^[\w.-]{20,300}$/.test(s)) return "";
  return s;
}
export const hintOf = (key: string) => key.slice(-4);
/** A Cloudflare account id: 32 hex characters (Dashboard → Workers AI → the id in the URL / "Account ID"). */
export const cleanAccount = (raw: unknown) => { const s = String(raw ?? "").trim().toLowerCase(); return /^[a-f0-9]{32}$/.test(s) ? s : ""; };

type Fetcher = (url: string, headers: Record<string, string>) => Promise<{ status: number; body: unknown } | null>;
const defaultFetch: Fetcher = async (url, headers) => {
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "InfluenceFlowCRM/1.0 (key check)", ...headers }, signal: AbortSignal.timeout(12_000) }).catch(() => null);
  return res ? { status: res.status, body: await res.json().catch(() => null) } : null;
};

export type KeyCheck =
  | { ok: true; label: string; left: number | null; total: number | null; resets: string | null }
  | { ok: false; why: "refused" | "quota" | "unreachable" | "not_enabled" };

const text = (b: unknown) => { try { return JSON.stringify(b ?? "").slice(0, 2000); } catch { return ""; } };

/**
 * Asks the service whether the key works — free or 1-unit calls: YouTube i18nRegions (1 unit), Gemini models
 * list, Groq models list, OpenRouter /key, Cloudflare Workers AI model search, Hunter /v2/account, Clay /me.
 * Cloudflare's "key" is JSON {account, token}. Keys go in headers, never URLs.
 */
export async function checkKey(service: Service, key: string, get: Fetcher = defaultFetch): Promise<KeyCheck> {
  if (service === "youtube") {
    const r = await get("https://www.googleapis.com/youtube/v3/i18nRegions?part=snippet&hl=en_US", { "X-Goog-Api-Key": key });
    if (!r || r.status >= 500) return { ok: false, why: "unreachable" };
    const b = text(r.body);
    if (r.status === 200) return { ok: true, label: "YouTube Data API v3", left: null, total: 10000, resets: null };
    if (/quotaExceeded|dailyLimitExceeded|rateLimitExceeded/i.test(b)) return { ok: false, why: "quota" };
    if (/accessNotConfigured|SERVICE_DISABLED|has not been used in project|is disabled/i.test(b)) return { ok: false, why: "not_enabled" };
    return { ok: false, why: "refused" };
  }
  if (service === "gemini") {
    const r = await get("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", { "x-goog-api-key": key });
    if (!r || r.status >= 500) return { ok: false, why: "unreachable" };
    if (r.status === 200) return { ok: true, label: "Google AI Studio", left: null, total: null, resets: null };
    if (r.status === 429) return { ok: false, why: "quota" };
    if (/SERVICE_DISABLED|has not been used in project|is disabled/i.test(text(r.body))) return { ok: false, why: "not_enabled" };
    return { ok: false, why: "refused" };
  }
  if (service === "groq") {
    const r = await get("https://api.groq.com/openai/v1/models", { Authorization: `Bearer ${key}` });
    if (!r || r.status >= 500) return { ok: false, why: "unreachable" };
    if (r.status === 200) return { ok: true, label: "Groq", left: null, total: null, resets: null };
    if (r.status === 429) return { ok: false, why: "quota" };
    return { ok: false, why: "refused" };
  }
  if (service === "openrouter") {
    const r = await get("https://openrouter.ai/api/v1/key", { Authorization: `Bearer ${key}` });
    if (!r || r.status >= 500) return { ok: false, why: "unreachable" };
    if (r.status === 429) return { ok: false, why: "quota" };
    const d = (r.body as { data?: { is_free_tier?: boolean; limit_remaining?: number | null } } | null)?.data;
    if (r.status !== 200 || !d) return { ok: false, why: "refused" };
    return { ok: true, label: d.is_free_tier ? "OpenRouter · free tier" : "OpenRouter", left: null, total: null, resets: null };
  }
  if (service === "cloudflare") {
    let c: { account?: string; token?: string } = {};
    try { c = JSON.parse(key); } catch { return { ok: false, why: "refused" }; }
    if (!c.account || !c.token) return { ok: false, why: "refused" };
    const r = await get(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(c.account)}/ai/models/search?per_page=1`, { Authorization: `Bearer ${c.token}` });
    if (!r || r.status >= 500) return { ok: false, why: "unreachable" };
    if (r.status === 429) return { ok: false, why: "quota" };
    if (r.status === 200 && (r.body as { success?: boolean } | null)?.success !== false) return { ok: true, label: "Workers AI", left: null, total: 10000, resets: null };
    return { ok: false, why: "refused" };
  }
  if (service === "hunter") {
    const r = await get("https://api.hunter.io/v2/account", { "X-API-KEY": key });
    if (!r || r.status >= 500) return { ok: false, why: "unreachable" };
    if (r.status === 401 || r.status === 403) return { ok: false, why: "refused" };
    if (r.status === 429) return { ok: false, why: "quota" };
    const d = (r.body as { data?: Record<string, unknown> } | null)?.data;
    if (r.status !== 200 || !d) return { ok: false, why: "refused" };
    const req = (d.requests || {}) as Record<string, { available?: number; remaining?: number; used?: number }>;
    const pool = req.credits || req.searches;
    const total = Number.isFinite(Number(pool?.available)) ? Number(pool!.available) : null;
    const left = Number.isFinite(Number(pool?.remaining)) ? Number(pool!.remaining) : total !== null && Number.isFinite(Number(pool?.used)) ? Math.max(0, total - Number(pool!.used)) : null;
    const plan = String(d.plan_name || "").replace(/[^\w .+-]/g, "").slice(0, 40);
    return { ok: true, label: plan ? `${plan} plan` : "Hunter account", left, total, resets: /^\d{4}-\d{2}-\d{2}/.test(String(d.reset_date || "")) ? String(d.reset_date).slice(0, 10) : null };
  }
  const r = await get("https://api.clay.com/public/v0/me", { "clay-api-key": key });
  if (!r || r.status >= 500) return { ok: false, why: "unreachable" };
  if (r.status === 401 || r.status === 403) return { ok: false, why: "refused" };
  if (r.status === 429 || r.status === 402) return { ok: false, why: "quota" };
  const ws = (r.body as { workspace?: { name?: unknown; id?: unknown } } | null)?.workspace;
  if (r.status !== 200 || !ws) return { ok: false, why: "refused" };
  const name = String(ws.name || "").replace(/<[^>]*>/g, "").replace(/[^\p{L}\p{N} .'&+-]/gu, "").trim().slice(0, 50);
  return { ok: true, label: name ? `${name} workspace` : "Clay workspace", left: null, total: null, resets: null };
}

export type KeyChoice = { key: string; scope: string; own: boolean } | null;
const envKey = (service: "hunter" | "clay") => (typeof Deno !== "undefined" ? Deno.env.get(service === "hunter" ? "HUNTER_API_KEY" : "CLAY_API_KEY") || "" : "");

/**
 * The key a member's lookups use, and the budget scope it counts against: their own key ("<service>@<id>"),
 * else the workspace key for the owner only ("<service>"). null = no lookups for them.
 */
export async function keyFor(admin: Admin, userId: string, service: "hunter" | "clay", memo = new Map<string, KeyChoice>()): Promise<KeyChoice> {
  const id = `${userId}:${service}`;
  if (memo.has(id)) return memo.get(id)!;
  let choice: KeyChoice = null;
  const { data: row } = await admin.from("member_keys").select("sealed, status").eq("user_id", userId).eq("service", service).eq("slot", 0).maybeSingle();
  if (row?.sealed && row.status !== "refused") {
    const plain = await openKey(vaultKey(admin), userId, service, row.sealed);
    if (plain) choice = { key: plain, scope: `${service}@${userId}`, own: true };
  }
  if (!choice && envKey(service)) {
    const { data: p } = await admin.from("profiles").select("role, access").eq("id", userId).maybeSingle();
    if (p?.role === "owner" && p?.access === "approved") choice = { key: envKey(service), scope: service, own: false };
  }
  memo.set(id, choice);
  return choice;
}
