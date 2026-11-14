// Whose API keys a piece of server work runs on.
//
// Every member brings their own keys (Settings → Your API keys): YouTube, AI (Gemini, Groq, Cloudflare,
// OpenRouter) and lookups (Clay, Hunter). The workspace keys set as Supabase secrets are the OWNER's: they
// serve the owner's work and the server's own housekeeping, never a member's. One function run often works
// for several members at once (the cron), so the keys travel with the work itself: `asMember(admin, id, fn)`
// runs `fn` — and everything it awaits — inside that member's key ring (AsyncLocalStorage), and every module
// asks `cred("GEMINI_API_KEYS")` instead of reading the environment.
//
//   inside a member's ring  → only that member's own keys ("" when they have none: the feature waits)
//   inside the owner's ring → the owner's own key if they saved one, else the workspace secret
//   outside any ring        → the workspace secret (server housekeeping, owner-only paths)
//
// Budgets kept in ai_budget (Clef neurons, listening seconds, brand questions…) are per key owner too:
// `scoped("listen")` = "listen" for the owner, "listen@<member id>" for a member.

import { AsyncLocalStorage } from "node:async_hooks";
import { openKey, vaultKey, type Service } from "./memberKeys.ts";

export type Ring = { userId: string; owner: boolean; creds: Record<string, string>; services: Service[] };

const als = new AsyncLocalStorage<Ring>();
const env = (name: string) => (typeof Deno !== "undefined" ? Deno.env.get(name) || "" : "").trim();

/** Every credential name a member's own key replaces (all of them are "" for a member without that key). */
export const CRED_NAMES = [
  "YOUTUBE_API_KEYS", "YOUTUBE_API_KEY",
  "GEMINI_API_KEYS", "GEMINI_API_KEY", "GROQ_API_KEYS", "GROQ_API_KEY", "OPENROUTER_API_KEYS", "OPENROUTER_API_KEY",
  "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_AI_TOKENS", "CLOUDFLARE_AI_TOKEN", "ANTHROPIC_API_KEY",
  "HUNTER_API_KEY", "CLAY_API_KEY",
  "YTAI_API_KEY", "SUPADATA_API_KEY", "TUBEALFRED_API_KEY", "TRANSCRIPTAPI_API_KEY",
] as const;

export const currentRing = (): Ring | null => als.getStore() || null;

/** A credential for the work running now (see the table above). */
export function cred(name: string): string {
  const r = als.getStore();
  if (!r) return env(name);
  if (Object.prototype.hasOwnProperty.call(r.creds, name)) return r.creds[name];
  return r.owner ? env(name) : "";
}

/** An ai_budget route for the key owner of the work running now. */
export function scoped(route: string): string {
  const r = als.getStore();
  return r && !r.owner ? `${route}@${r.userId}` : route;
}

/** Runs `fn` inside a key ring. */
export function runInRing<T>(ring: Ring, fn: () => Promise<T>): Promise<T> {
  return als.run(ring, fn);
}

/** Credentials from a member's opened keys (service → plain values in slot order). */
export function credsFrom(keys: Partial<Record<Service, string[]>>): Record<string, string> {
  const out: Record<string, string> = {};
  const list = (s: Service) => (keys[s] || []).filter(Boolean);
  if (list("youtube").length) { out.YOUTUBE_API_KEYS = list("youtube").join(","); out.YOUTUBE_API_KEY = ""; }
  if (list("gemini").length) { out.GEMINI_API_KEYS = list("gemini").join(","); out.GEMINI_API_KEY = ""; }
  if (list("groq").length) { out.GROQ_API_KEYS = list("groq").join(","); out.GROQ_API_KEY = ""; }
  if (list("openrouter").length) { out.OPENROUTER_API_KEYS = list("openrouter").join(","); out.OPENROUTER_API_KEY = ""; }
  if (list("cloudflare").length) {
    // Stored as JSON {account, token}.
    try {
      const c = JSON.parse(list("cloudflare")[0]) as { account?: string; token?: string };
      if (c.account && c.token) { out.CLOUDFLARE_ACCOUNT_ID = c.account; out.CLOUDFLARE_AI_TOKENS = c.token; out.CLOUDFLARE_AI_TOKEN = ""; }
    } catch { /* unreadable: treated as missing */ }
  }
  if (list("hunter").length) out.HUNTER_API_KEY = list("hunter")[0];
  if (list("clay").length) out.CLAY_API_KEY = list("clay")[0];
  return out;
}

// deno-lint-ignore no-explicit-any
type Admin = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: any }>; from: (t: string) => any };

const rings = new Map<string, { at: number; ring: Promise<Ring> }>();
const RING_TTL = 30_000;
/** Forget a member's ring (after they save or remove a key) so the next work reads it fresh. */
export const forgetRing = (userId: string) => { rings.delete(userId); };

/** A member's ring: their own keys, opened; the owner also gets the workspace secrets underneath. */
export function ringFor(admin: Admin, userId: string): Promise<Ring> {
  const hit = rings.get(userId);
  if (hit && Date.now() - hit.at < RING_TTL) return hit.ring;
  const ring = (async (): Promise<Ring> => {
    const [{ data: p }, { data: rows }] = await Promise.all([
      admin.from("profiles").select("role, access").eq("id", userId).maybeSingle(),
      admin.from("member_keys").select("service, slot, sealed, status").eq("user_id", userId).order("slot", { ascending: true }),
    ]);
    const owner = p?.role === "owner" && p?.access === "approved";
    const vk = vaultKey(admin);
    const opened: Partial<Record<Service, string[]>> = {};
    for (const r of (rows || []) as { service: Service; slot: number; sealed: string; status: string }[]) {
      if (r.status === "refused") continue;
      const plain = await openKey(vk, userId, r.service, r.sealed, r.slot);
      if (plain) (opened[r.service] ||= []).push(plain);
    }
    return { userId, owner, creds: credsFrom(opened), services: Object.keys(opened) as Service[] };
  })();
  rings.set(userId, { at: Date.now(), ring });
  // A failed read isn't kept: the next call tries again.
  ring.catch(() => rings.delete(userId));
  return ring;
}

/** Runs `fn` with `userId`'s keys (and only theirs). */
export async function asMember<T>(admin: Admin, userId: string, fn: () => Promise<T>): Promise<T> {
  return runInRing(await ringFor(admin, userId), fn);
}
