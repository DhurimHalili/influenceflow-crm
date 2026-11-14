import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { detectHelper, helperTranscript, type HelperResult } from "../lib/helperBridge";
import { hasSupabase } from "../lib/supabase";
import { useData } from "./DataContext";
import { matchCall, useMatch } from "./MatchContext";
import helperManifest from "../helper/manifest.json";

// Transcripts, read by the free InfluenceFlow helper while a CRM tab is open.
// YouTube lets people (not servers) read captions, so the helper reads them from
// this browser's own connection, politely: one video every ~8 s, at most
// DAILY a day on this device, one tab at a time, and a long stop the moment
// YouTube asks it to slow down. The server only ever gets the caption lines of
// the member's own creators' videos and keeps just the lines that matter.

const PACE_MS = 8_000;
const DAILY = 1_500;
const BLOCK_PAUSE_MS = 6 * 3600_000;
// A plain refusal (403) is often the browser, not YouTube's limit: try again sooner.
const REFUSED_PAUSE_MS = 3600_000;
const STORE = "if.helper.v1";
/** The helper this app ships; an older one installed is asked to update (1.0 was refused by YouTube). */
const HELPER_LATEST = helperManifest.version;
const newer = (a: string, b: string) => {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};

type Saved = { paused: boolean; blockedUntil: number; blockedWhy: string; blockedBy: string; day: string; count: number; seen: string };
const today = () => new Date().toISOString().slice(0, 10);
const load = (): Saved => {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || "{}") as Partial<Saved>;
    return { paused: !!s.paused, blockedUntil: Number(s.blockedUntil) || 0, blockedWhy: String(s.blockedWhy || ""), blockedBy: String(s.blockedBy || ""), day: s.day === today() ? s.day : today(), count: s.day === today() ? Number(s.count) || 0 : 0, seen: String(s.seen || "") };
  } catch { return { paused: false, blockedUntil: 0, blockedWhy: "", blockedBy: "", day: today(), count: 0, seen: "" }; }
};
const save = (s: Saved) => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* private mode: state lives in memory only */ } };

export type HelperState = {
  /** The helper's version, "" when not installed, null while checking. */
  version: string | null;
  /** Reading right now in this tab. */
  running: boolean;
  /** Another CRM tab is the one reading. */
  elsewhere: boolean;
  paused: boolean;
  blockedUntil: number;
  /** Why it stopped: "bot check", "player 429", "player 403"… */
  blockedWhy: string;
  /** An older helper is installed: it must be updated before it reads. */
  outdated: boolean;
  /** This browser had the helper before and it's gone now (usually: the folder it was loaded from was deleted or moved). */
  missing: boolean;
  latest: string;
  /** Read today on this device. */
  today: number;
  dailyCap: number;
  /** Read since this tab opened, and deals heard in them. */
  session: { read: number; found: number };
  /** Videos of the last year still without captions read (from the server). */
  left: number | null;
  current: string;
  error: string;
};
type Value = HelperState & { setPaused: (p: boolean) => void; recheck: () => Promise<void> };

const HelperContext = createContext<Value | null>(null);

/** setTimeout that a background tab doesn't slow down (falls back to the page's own timers). */
function makeTicker(): { after: (ms: number, fn: () => void) => () => void; close: () => void } {
  try {
    const src = "const t=new Map();onmessage=(e)=>{const[d,id,ms]=e.data;if(d==='set')t.set(id,setTimeout(()=>{t.delete(id);postMessage(id)},ms));else{clearTimeout(t.get(id));t.delete(id)}}";
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    const waiting = new Map<number, () => void>();
    let next = 1;
    worker.onmessage = (e: MessageEvent<number>) => { const fn = waiting.get(e.data); waiting.delete(e.data); fn?.(); };
    return {
      after: (ms, fn) => { const id = next++; waiting.set(id, fn); worker.postMessage(["set", id, ms]); return () => { if (waiting.delete(id)) worker.postMessage(["clear", id, 0]); }; },
      close: () => { worker.terminate(); waiting.clear(); },
    };
  } catch {
    return { after: (ms, fn) => { const t = window.setTimeout(fn, ms); return () => window.clearTimeout(t); }, close: () => {} };
  }
}

export function HelperProvider({ children }: { children: ReactNode }) {
  const data = useData();
  const m = useMatch();
  const cloud = hasSupabase && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.profile.id || "") && !data.demoSeeded;
  const [version, setVersion] = useState<string | null>(null);
  const [stored, setStored] = useState<Saved>(load);
  const [running, setRunning] = useState(false);
  const [elsewhere, setElsewhere] = useState(false);
  const [session, setSession] = useState({ read: 0, found: 0 });
  const [left, setLeft] = useState<number | null>(null);
  const [current, setCurrent] = useState("");
  const [error, setError] = useState("");
  const storedRef = useRef(stored);
  storedRef.current = stored;
  const versionRef = useRef(version);
  versionRef.current = version;
  const refreshRef = useRef(m.refresh);
  refreshRef.current = m.refresh;

  const update = useCallback((patch: Partial<Saved>) => setStored((s) => { const next = { ...s, ...patch }; save(next); return next; }), []);
  const recheck = useCallback(async () => { setVersion(await detectHelper(1500)); }, []);
  useEffect(() => { if (cloud) void recheck(); }, [cloud, recheck]);
  // Installed while the CRM was open: it says hello by itself on the next load; check again when the tab comes back.
  useEffect(() => {
    if (!cloud || version) return;
    const again = () => { if (document.visibilityState === "visible") void recheck(); };
    document.addEventListener("visibilitychange", again);
    return () => document.removeEventListener("visibilitychange", again);
  }, [cloud, version, recheck]);

  const outdated = !!version && newer(HELPER_LATEST, version);
  // Remember that this browser had it, so a helper that vanished (folder deleted or moved) is told apart from a first install.
  useEffect(() => { if (version && stored.seen !== version) update({ seen: version }); }, [version, stored.seen, update]);
  // A stop recorded by an older helper version doesn't hold for the new one (1.0's stops were the browser's doing).
  useEffect(() => {
    if (version && stored.blockedUntil > Date.now() && stored.blockedBy && newer(version, stored.blockedBy)) update({ blockedUntil: 0, blockedWhy: "" });
  }, [version, stored.blockedUntil, stored.blockedBy, update]);
  const canRun = cloud && !!version && !outdated && !stored.paused && stored.blockedUntil < Date.now() && stored.count < DAILY;
  useEffect(() => {
    if (!canRun) return;
    let stop = false;
    // Sleeps end at once when this tab stops reading (pause, unmount), so a new run never overlaps an old one.
    const wakers = new Set<() => void>();
    // Timers in a hidden tab are slowed to once a minute; a tiny worker's are not, so a CRM tab in the
    // background keeps its pace.
    const ticker = makeTicker();
    const sleep = (ms: number) => new Promise<void>((ok) => {
      if (stop) { ok(); return; }
      let cancel = () => {};
      const done = () => { cancel(); wakers.delete(done); ok(); };
      cancel = ticker.after(ms, done);
      wakers.add(done);
    });
    const work = async () => {
      setRunning(true); setElsewhere(false); setError("");
      const skip: string[] = [];
      let lastRefresh = 0, foundSinceRefresh = 0;
      try {
        while (!stop) {
          const q = await matchCall<{ items: { id: string; title: string }[]; left: number }>({ action: "transcript_queue", n: 8, skip: skip.slice(-200) });
          if (q.error || !q.data) { setError(q.error || "The CRM didn't answer."); await sleep(120_000); continue; }
          setLeft(q.data.left);
          if (!q.data.items.length) { setCurrent(""); await sleep(15 * 60_000); continue; }
          const batch: (HelperResult & { id: string })[] = [];
          const flush = async () => {
            if (!batch.length) return;
            const items = batch.splice(0).map((r) => ({ id: r.id, status: r.status, ...(r.status === "ok" ? { lang: r.lang, kind: r.kind, caps: r.caps } : {}) }));
            const res = await matchCall<{ saved: number; found: number }>({ action: "transcript_save", items });
            if (res.error) { setError(res.error); for (const i of items) skip.push(i.id); return; }
            const found = res.data?.found || 0;
            setSession((s) => ({ read: s.read + items.length, found: s.found + found }));
            setLeft((l) => (l === null ? l : Math.max(0, l - items.length)));
            foundSinceRefresh += found;
            // New deals heard: show them (not more than every 2 minutes).
            if (foundSinceRefresh && Date.now() - lastRefresh > 120_000) { lastRefresh = Date.now(); foundSinceRefresh = 0; void refreshRef.current(); }
          };
          for (const item of q.data.items) {
            if (stop) break;
            const s = storedRef.current;
            if (s.paused || s.count >= DAILY) { stop = true; break; }
            setCurrent(item.title);
            const r = await helperTranscript(item.id);
            if (r.status === "blocked") {
              // YouTube wants this connection to slow down: stop for hours, keep everything read so far.
              const why = r.why || "";
              update({ blockedUntil: Date.now() + (/403/.test(why) ? REFUSED_PAUSE_MS : BLOCK_PAUSE_MS), blockedWhy: why, blockedBy: versionRef.current || "" });
              stop = true;
              break;
            }
            update({ count: (storedRef.current.day === today() ? storedRef.current.count : 0) + 1, day: today() });
            batch.push({ ...r, id: item.id });
            if (batch.length >= 4) await flush();
            await sleep(PACE_MS + Math.random() * 4000);
          }
          await flush();
        }
      } finally {
        setRunning(false); setCurrent("");
      }
    };
    // One tab reads; the others show what it does.
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (locks?.request) {
      void locks.request("influenceflow-transcripts", { ifAvailable: true }, async (lock) => {
        if (!lock) { setElsewhere(true); return; }
        await work();
      });
    } else void work();
    return () => { stop = true; for (const w of [...wakers]) w(); ticker.close(); };
  }, [canRun, update]);

  // A block ends by itself: wake up when it's over.
  useEffect(() => {
    if (stored.blockedUntil <= Date.now()) return;
    const t = window.setTimeout(() => setStored(load()), Math.min(stored.blockedUntil - Date.now() + 1000, 2 ** 31 - 1));
    return () => window.clearTimeout(t);
  }, [stored.blockedUntil]);

  const value = useMemo<Value>(() => ({
    version, running, elsewhere, missing: version === "" && !!stored.seen, paused: stored.paused, blockedUntil: stored.blockedUntil, blockedWhy: stored.blockedWhy, outdated, latest: HELPER_LATEST, today: stored.count, dailyCap: DAILY, session, left, current, error,
    setPaused: (p) => update({ paused: p }), recheck,
  }), [version, running, elsewhere, stored, outdated, session, left, current, error, update, recheck]);
  return <HelperContext.Provider value={value}>{children}</HelperContext.Provider>;
}

export function useHelper() {
  const v = useContext(HelperContext);
  if (!v) throw new Error("useHelper must be used inside HelperProvider");
  return v;
}
