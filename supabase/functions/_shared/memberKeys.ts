// A member's own API keys for the lookup services (Clay, Hunter).
//
// Stored only sealed (AES-256-GCM) in public.member_keys, with a Vault key used for nothing else
// (member_key_secret(), service role only). The member id + service are bound in as associated data,
// so a sealed value copied to another row or account won't open. The plain key exists only in this
// function's memory while a lookup runs; it is never logged, never returned to the browser (only its
// last 4 characters), and never put in a URL (headers only).
//
// Whose key a lookup uses: the member's own key always; else, for the owner only, the workspace key set
// as a Supabase secret (HUNTER_API_KEY / CLAY_API_KEY). Members never spend the owner's credits.

export type Service = "hunter" | "clay";
export const SERVICES: Service[] = ["hunter", "clay"];

// deno-lint-ignore no-explicit-any
type Admin = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: any }>; from: (t: string) => any };
type KeySource = () => Promise<CryptoKey | null>;

const enc = new TextEncoder();
const b64u = (bytes: Uint8Array) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64u = (t: string) => Uint8Array.from(atob(t.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((t.length + 3) % 4)), (c) => c.charCodeAt(0));
const aad = (userId: string, service: Service) => enc.encode(`member_keys:${userId}:${service}`);

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

export async function sealKey(key: KeySource, userId: string, service: Service, plain: string): Promise<string> {
  const k = await key();
  if (!k) throw new Error("The key vault isn't available — nothing was saved.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(userId, service) }, k, enc.encode(plain)));
  return `k1.${b64u(iv)}.${b64u(ct)}`;
}

/** The plain key, or "" when the value can't be opened (wrong account, tampered, vault missing). */
export async function openKey(key: KeySource, userId: string, service: Service, sealed: string): Promise<string> {
  const [v, iv, ct] = String(sealed || "").split(".");
  if (v !== "k1" || !iv || !ct) return "";
  const k = await key();
  if (!k) return "";
  try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64u(iv), additionalData: aad(userId, service) }, k, unb64u(ct))); }
  catch { return ""; }
}

/** A pasted key, cleaned: trimmed, "Bearer " / quotes dropped. "" when it can't be a key. */
export function cleanKey(service: Service, raw: unknown): string {
  const unquote = (x: string) => x.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
  const s = unquote(unquote(String(raw ?? "")).replace(/^bearer\s+/i, ""));
  if (s.length < 16 || s.length > 256 || !/^[\x21-\x7e]+$/.test(s)) return "";
  if (service === "hunter" && !/^[A-Za-z0-9_-]+$/.test(s)) return "";
  if (service === "clay" && !/^[A-Za-z0-9_.-]+$/.test(s)) return "";
  return s;
}
export const hintOf = (key: string) => key.slice(-4);

type Fetcher = (url: string, headers: Record<string, string>) => Promise<{ status: number; body: unknown } | null>;
const defaultFetch: Fetcher = async (url, headers) => {
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "InfluenceFlowCRM/1.0 (key check)", ...headers }, signal: AbortSignal.timeout(12_000) }).catch(() => null);
  return res ? { status: res.status, body: await res.json().catch(() => null) } : null;
};

export type KeyCheck =
  | { ok: true; label: string; left: number | null; total: number | null; resets: string | null }
  | { ok: false; why: "refused" | "quota" | "unreachable" };

/** Asks the service who the key belongs to — free calls (Hunter /v2/account, Clay /me). */
export async function checkKey(service: Service, key: string, get: Fetcher = defaultFetch): Promise<KeyCheck> {
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
const envKey = (service: Service) => (typeof Deno !== "undefined" ? Deno.env.get(service === "hunter" ? "HUNTER_API_KEY" : "CLAY_API_KEY") || "" : "");

/**
 * The key a member's lookups use, and the budget scope it counts against: their own key ("<service>@<id>"),
 * else the workspace key for the owner only ("<service>"). null = no lookups for them.
 */
export async function keyFor(admin: Admin, userId: string, service: Service, memo = new Map<string, KeyChoice>()): Promise<KeyChoice> {
  const id = `${userId}:${service}`;
  if (memo.has(id)) return memo.get(id)!;
  let choice: KeyChoice = null;
  const { data: row } = await admin.from("member_keys").select("sealed, status").eq("user_id", userId).eq("service", service).maybeSingle();
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
