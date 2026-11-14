// Cloudflare's Clef decision models (Workers AI): typed answers — yes/no
import { cred, scoped } from "./keyring.ts";
// probabilities, a choice among named options, an ordered score — instead of
// free text. Fast (tens of ms) and cheap: clef-flash ≈ $0.038 per million
// input tokens, so Cloudflare's free 10,000 neurons/day cover ≈ 2.9M tokens.
//
// Used where the rules are unsure, never instead of them:
//   • which topic an unclear video is about
//   • whether a found brand is really a paid deal, a seeded product, an
//     affiliate link, the creator's own thing or a plain mention
//   • how much of a brand's catalog is each topic
// It can't hold the CRM up: every call is checked against a daily budget
// (CLEF_DAILY_NEURONS, default 8,000 — headroom for the chat models on the same
// account), quota / auth / model errors pause it (until UTC midnight for a
// daily limit) and the caller falls back to the rules. A null answer always
// means "no AI this time", never an error the caller has to handle.
// Needs CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AI_TOKEN (already used by ai.ts).

export type ClefQuestion =
  | { type: "noul"; instructions: string }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };
export type ClefAnswer = { yes?: number; choice?: string; probs?: Record<string, number>; confidence?: number; score?: number };
export type ClefModel = "clef" | "clef-flash";

const env = (name: string) => (Deno.env.get(name) || "").trim();
// Neurons per input token (Workers AI: $0.011 per 1,000 neurons).
const NEURONS_PER_TOKEN: Record<ClefModel, number> = { "clef": 0.24 / 0.011 / 1000, "clef-flash": 0.038 / 0.011 / 1000 };
const dailyCap = () => Math.max(0, Number(env("CLEF_DAILY_NEURONS")) || 8000);

// deno-lint-ignore no-explicit-any
type Admin = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };
let admin: Admin | null = null;
// One budget per Cloudflare account owner: "clef" (workspace) / "clef@<member id>".
const days = new Map<string, { day: string; used: number; paused: number }>();
export function useClefBudget(a: Admin) { admin = a; days.clear(); }

const utcDay = () => new Date().toISOString().slice(0, 10);
const nextUtcMidnight = () => { const d = new Date(); d.setUTCHours(24, 2, 0, 0); return d.getTime(); };

async function load() {
  const day = utcDay();
  const route = scoped("clef");
  const have = days.get(route);
  if (have && have.day === day) return have;
  let today = { day, used: 0, paused: 0 };
  if (admin) {
    const { data } = await admin.from("ai_budget").select("units, paused_until").eq("route", route).eq("day", day).maybeSingle();
    if (data) today = { day, used: Number(data.units) || 0, paused: data.paused_until ? new Date(data.paused_until).getTime() : 0 };
  }
  days.set(route, today);
  return today;
}
async function pause(until: number, note: string) {
  const t = await load();
  t.paused = until;
  if (admin) await Promise.resolve(admin.from("ai_budget").upsert({ route: scoped("clef"), day: t.day, units: t.used, paused_until: new Date(until).toISOString(), note: note.slice(0, 200) })).catch(() => null);
}
async function spend(neurons: number) {
  const t = await load();
  t.used += neurons;
  if (admin) {
    const { data } = await admin.rpc("ai_budget_use", { p_route: scoped("clef"), p_units: Math.round(neurons * 100) / 100 });
    if (typeof data === "number" || typeof data === "string") t.used = Number(data);
  }
}

export const clefConfigured = () => cred("CLOUDFLARE_ACCOUNT_ID").replace(/[^a-f0-9]/gi, "").length >= 16 && !!token();
const token = () => (cred("CLOUDFLARE_AI_TOKENS") || cred("CLOUDFLARE_AI_TOKEN")).split(/[\s,;]+/).map((k) => k.trim().replace(/^["']+|["']+$/g, "")).find((k) => /^[\w.-]{20,300}$/.test(k)) || "";

/** Is Clef usable right now, and how much of today's budget is left (neurons)? */
export async function clefStatus(): Promise<{ configured: boolean; left: number; cap: number; pausedUntil: string | null }> {
  const t = await load();
  return { configured: clefConfigured(), left: Math.max(0, dailyCap() - t.used), cap: dailyCap(), pausedUntil: t.paused > Date.now() ? new Date(t.paused).toISOString() : null };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
/** One answer, whatever shape it came back in (a bare probability, or an object). */
export function readAnswer(raw: unknown, q: ClefQuestion): ClefAnswer | null {
  if (raw === null || raw === undefined) return null;
  const o = (typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  if (q.type === "noul") {
    const p = num(raw) ?? num(o.noul) ?? num(o.probability) ?? num(o.yes) ?? num(o.value);
    return p === undefined ? null : { yes: Math.max(0, Math.min(1, p)) };
  }
  const probsRaw = (o.probabilities || o.probs) as unknown;
  let probs: Record<string, number> | undefined;
  if (probsRaw && typeof probsRaw === "object") {
    probs = {};
    if (Array.isArray(probsRaw)) {
      const keys = q.type === "choice" ? Object.keys(q.criteria) : q.criteria;
      probsRaw.forEach((p, i) => { const v = num(p) ?? num((p as Record<string, unknown>)?.probability); if (v !== undefined && keys[i] !== undefined) probs![String(keys[i])] = v; });
    } else for (const [k, v] of Object.entries(probsRaw as Record<string, unknown>)) { const n = num(v); if (n !== undefined) probs[k] = n; }
  }
  if (q.type === "choice") {
    let choice = typeof raw === "string" ? raw : typeof o.choice === "string" ? o.choice : typeof o.answer === "string" ? o.answer : "";
    if (!choice && probs) choice = Object.entries(probs).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
    if (!(choice in q.criteria)) return null;
    return { choice, probs, confidence: num(o.confidence) ?? probs?.[choice] };
  }
  const score = num(raw) ?? num(o.score) ?? num(o.value);
  return score === undefined ? null : { score: Math.max(0, Math.min(q.criteria.length - 1, score)), probs, confidence: num(o.confidence) };
}

/**
 * Ask Clef several questions about one state. Null when Clef isn't set up,
 * the day's budget is spent, it is paused, or it didn't answer — the caller
 * keeps its rules answer. Never throws.
 */
export async function decide(state: unknown, questions: Record<string, ClefQuestion>, opts: { model?: ClefModel } = {}): Promise<Record<string, ClefAnswer> | null> {
  const ids = Object.keys(questions).filter((k) => /^[\w.-]{1,100}$/.test(k)).slice(0, 64);
  if (!ids.length || !clefConfigured()) return null;
  const model: ClefModel = opts.model || (env("CLEF_MODEL") === "clef" ? "clef" : "clef-flash");
  const body = JSON.stringify({ model, state, questions: Object.fromEntries(ids.map((id) => [id, questions[id]])) });
  // Rough size check before spending: ~4 characters per token.
  const estTokens = Math.ceil(body.length / 3.6);
  if (estTokens > (model === "clef" ? 60_000 : 23_000)) return null;
  const t = await load();
  if (t.paused > Date.now()) return null;
  if (t.used + estTokens * NEURONS_PER_TOKEN[model] > dailyCap()) return null;
  const account = cred("CLOUDFLARE_ACCOUNT_ID").replace(/[^a-f0-9]/gi, "");
  let res: Response | null = null;
  try {
    res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/@cf/cloudflare/${model}`, {
      method: "POST", headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(25_000),
    });
  } catch { return null; }
  const textBody = await res.text().catch(() => "");
  if (!res.ok) {
    const note = `${res.status} ${textBody.replace(/\s+/g, " ").slice(0, 160)}`;
    if (res.status === 429 || /daily free allocation|neurons|quota|4006/i.test(textBody)) await pause(/daily|neurons|4006/i.test(textBody) ? nextUtcMidnight() : Date.now() + 5 * 60_000, note);
    else if (res.status === 401 || res.status === 403) await pause(Date.now() + 6 * 3600_000, note);
    else if (res.status === 404 || /5006|no such model|not found/i.test(textBody)) await pause(Date.now() + 24 * 3600_000, note);
    return null;
  }
  let data: { result?: { answers?: Record<string, unknown>; usage?: Record<string, unknown> }; answers?: Record<string, unknown>; usage?: Record<string, unknown> } | null = null;
  try { data = JSON.parse(textBody); } catch { return null; }
  const result = data?.result || data || {};
  const usage = (result as { usage?: Record<string, unknown> }).usage || {};
  const tokens = num(usage.input_tokens) ?? num(usage.prompt_tokens) ?? num(usage.total_tokens) ?? estTokens;
  await spend(tokens * NEURONS_PER_TOKEN[model]);
  const answers = (result as { answers?: Record<string, unknown> }).answers;
  if (!answers || typeof answers !== "object") return null;
  const out: Record<string, ClefAnswer> = {};
  for (const id of ids) { const a = readAnswer(answers[id], questions[id]); if (a) out[id] = a; }
  return Object.keys(out).length ? out : null;
}
