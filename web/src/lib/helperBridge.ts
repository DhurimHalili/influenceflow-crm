// Talks to the InfluenceFlow helper (a small browser extension, src/helper/)
// through window messages on this page only. The helper reads YouTube captions
// from the member's own connection — YouTube blocks servers, not people.

export type HelperResult =
  | { status: "ok"; lang: string; kind: "asr" | "manual"; caps: [number, string][] }
  | { status: "none" | "blocked" | "error"; why?: string };

const SOURCE_IN = "influenceflow-helper";
let version = "";
const waiting = new Map<string, (r: HelperResult) => void>();
const listeners = new Set<(v: string) => void>();

if (typeof window !== "undefined") {
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const d = event.data as { source?: string; type?: string; version?: string; req?: string; result?: HelperResult } | null;
    if (!d || d.source !== SOURCE_IN) return;
    if (d.type === "hello" && typeof d.version === "string") {
      version = d.version.slice(0, 20);
      for (const l of listeners) l(version);
    }
    if (d.type === "result" && typeof d.req === "string" && waiting.has(d.req)) {
      const done = waiting.get(d.req)!;
      waiting.delete(d.req);
      done(sanitize(d.result));
    }
  });
}

// The helper's answer is still data from another script: shape-check it.
function sanitize(r: unknown): HelperResult {
  const x = (r || {}) as Record<string, unknown>;
  if (x.status === "ok" && Array.isArray(x.caps)) {
    const caps = (x.caps as unknown[]).filter((c): c is [number, string] => Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "string").slice(0, 12000).map(([t, s]) => [t, s.slice(0, 400)] as [number, string]);
    return { status: "ok", lang: String(x.lang || "").slice(0, 16), kind: x.kind === "asr" ? "asr" : "manual", caps };
  }
  const status = x.status === "none" || x.status === "blocked" ? x.status : "error";
  return { status, why: String(x.why || "").slice(0, 120) };
}

/** The helper's version once it said hello, else "". */
export const helperVersion = () => version;

/** Ask the helper to say hello; resolves with its version, or "" when it isn't installed. */
export function detectHelper(ms = 1500): Promise<string> {
  if (typeof window === "undefined") return Promise.resolve("");
  if (version) return Promise.resolve(version);
  return new Promise((done) => {
    const t = window.setTimeout(() => { listeners.delete(hit); done(""); }, ms);
    const hit = (v: string) => { window.clearTimeout(t); listeners.delete(hit); done(v); };
    listeners.add(hit);
    window.postMessage({ source: "influenceflow", type: "ping" }, window.location.origin);
  });
}

/** Captions of one video, read by the helper. */
export function helperTranscript(id: string, ms = 45_000): Promise<HelperResult> {
  if (!/^[\w-]{11}$/.test(id)) return Promise.resolve({ status: "error", why: "bad id" });
  const req = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((done) => {
    const t = window.setTimeout(() => { waiting.delete(req); done({ status: "error", why: "timeout" }); }, ms);
    waiting.set(req, (r) => { window.clearTimeout(t); done(r); });
    window.postMessage({ source: "influenceflow", type: "transcript", id, req }, window.location.origin);
  });
}
