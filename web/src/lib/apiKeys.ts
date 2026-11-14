// Your own API keys (YouTube, AI, lookups) — what the server says you have, shared by Settings → Your API keys
// and the one-day "bring your own keys" notice. The keys themselves never reach the browser: only their last
// 4 characters, the account they belong to and whether they work.

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type Service = "youtube" | "gemini" | "groq" | "cloudflare" | "openrouter" | "hunter" | "clay";
export type SavedKey = { slot: number; hint: string; label: string; status: "" | "ok" | "refused" | "quota" | "not_enabled"; checked_at: string | null; saved_at: string | null };
export type ServiceRow = { service: Service; max: number; keys: SavedKey[]; workspace: boolean; left: number | null; paused_until: string | null; usage?: { used: number; capacity: number; background: number } };
export type KeyStatus = { owner: boolean; rows: ServiceRow[] };
export type SaveResult = { ok: true; service: Service; slot: number; hint: string; label: string; left: number | null; total: number | null; resets: string | null; checked_at: string };

export const AI_SERVICES: Service[] = ["gemini", "groq", "cloudflare", "openrouter"];

/** Calls brand-match; errors come back as plain words (+ which field was wrong). */
export async function keysCall<T>(body: Record<string, unknown>): Promise<{ data?: T; error?: string; field?: string }> {
  const { data, error } = await supabase.functions.invoke("brand-match", { body });
  if (!error) return { data: data as T };
  const res = (error as { context?: Response }).context;
  try { const parsed = res ? ((await res.clone().json()) as { error?: string; field?: string }) : null; if (parsed?.error) return { error: parsed.error, field: parsed.field }; } catch { /* plain message below */ }
  return { error: "The server didn't answer — nothing changed. Try again in a moment." };
}

/** A working key of this service (your own, or — for the owner — the workspace's). */
export const usable = (row: ServiceRow | undefined) => !!row && (row.workspace || row.keys.some((k) => k.status !== "refused"));

/** The four things every member needs for the CRM to run on their own keys. */
export function readiness(st: KeyStatus | null) {
  const get = (s: Service) => st?.rows.find((r) => r.service === s);
  const items = [
    { id: "youtube", label: "YouTube key", what: "stats, videos, sponsors", done: usable(get("youtube")) },
    { id: "ai", label: "An AI key", what: "prices, media kits, replies · Gemini is free", done: AI_SERVICES.some((s) => usable(get(s))) },
    { id: "clay", label: "Clay key", what: "company facts, LinkedIn people", done: usable(get("clay")) },
    { id: "hunter", label: "Hunter key", what: "work emails of the deal-makers", done: usable(get("hunter")) },
  ];
  return { items, done: items.filter((i) => i.done).length, all: items.every((i) => i.done) };
}

// One shared copy, so saving a key in Settings updates the notice (and the other way round).
let current: KeyStatus | null = null;
let loading: Promise<KeyStatus | null> | null = null;
const listeners = new Set<(s: KeyStatus | null) => void>();
const publish = (s: KeyStatus | null) => { current = s; for (const l of listeners) l(s); };

export async function loadKeyStatus(force = false): Promise<{ status: KeyStatus | null; error?: string }> {
  if (current && !force) return { status: current };
  if (!loading || force) {
    loading = keysCall<{ ok: boolean; owner: boolean; keys: ServiceRow[] }>({ action: "keys_status" })
      .then((r) => (r.data?.keys ? { owner: !!r.data.owner, rows: r.data.keys } : Promise.reject(new Error(r.error || "Couldn't load your keys."))));
  }
  try { const s = await loading; publish(s); return { status: s }; }
  catch (e) { loading = null; return { status: current, error: e instanceof Error ? e.message : "Couldn't load your keys." }; }
}

/** The shared key status; `enabled` = only for a signed-in cloud account. */
export function useKeyStatus(enabled: boolean) {
  const [status, setStatus] = useState<KeyStatus | null>(current);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    listeners.add(setStatus);
    void loadKeyStatus().then((r) => { setStatus(r.status); setError(r.error || ""); });
    return () => { listeners.delete(setStatus); };
  }, [enabled]);
  const reload = async () => { const r = await loadKeyStatus(true); setError(r.error || ""); };
  return { status, error, reload };
}
