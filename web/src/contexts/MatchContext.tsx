import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { hasSupabase, supabase } from "../lib/supabase";
import { byCreator, trustedLinks, type BrandIntel, type BrandLink, type CompanyFacts, type ContentRow, type IntelRow, type MatchWorld, type Pitch, type SeenBrand } from "../lib/match";
import { normalizeCriteria } from "../lib/criteria";
import { applyChanges, fresh, sinceOf, type Changes, type MatchRows } from "../lib/matchSync";
import { readCopy, saveCopy } from "../lib/matchCache";
import type { DealKind } from "../lib/sponsors";
import { useData } from "./DataContext";
import { useToast } from "./ToastContext";

// What the brand-match function found, loaded once and kept here (above the
// pages) so Match, brand and creator profiles all see the same data:
//   creator_content  each creator's content mix
//   brand_intel      what each brand's site says it sells
//   creator_brands   who works with whom (with the evidence)
//   seen_brands      brands found in videos that aren't in the CRM
//   brand_pitches    who you already pitched to which brand
// Loaded the first time a screen asks (useMatch): from this device's copy at once
// (lib/matchCache.ts), then only what changed since (`match_changes`, lib/matchSync.ts)
// — every minute while something is still being read, every 5 minutes otherwise, when
// the tab comes back, and after every action. Everything is downloaded again only for
// a new device or a copy older than 12 days. Your verdicts and pitches update on screen
// at once and roll back visibly if saving fails.
// A creator you add with a YouTube channel is read right away (not at the
// next 3-minute cron), and a toast says what was found.

export type MatchStatus = { stamp?: string; creators: number; read: number; failed?: number; backfilling?: number; videos?: number; paidVideos?: number; transcripts?: number; noCaptions?: number; transcriptWaiting?: number; listened?: number; listenQueue?: number; noYoutube?: number; lastRead?: string | null; everyMin?: number; perRun?: number; rescanDays?: number; brandDays?: number; brands: number; researched: number; youtube: boolean; clef: { configured: boolean; left: number; cap: number; pausedUntil: string | null }; listen: { configured: boolean; secondsLeft: number }; tx?: { services: string[]; left: number }; hunter?: { configured: boolean; own?: boolean; left: number }; clay?: { configured: boolean; own?: boolean; left: number }; apollo?: { configured: boolean; own?: boolean; used: number; paused: boolean } };
type Result = { ok: boolean; message: string };
type Value = {
  ready: boolean;
  loading: boolean;
  error: string;
  links: BrandLink[];
  linksBy: Map<string, BrandLink[]>;
  intel: Map<string, IntelRow>;
  content: Map<string, ContentRow>;
  seen: Map<string, SeenBrand>;
  pitches: Pitch[];
  status: MatchStatus | null;
  scanning: Set<string>;
  researching: Set<string>;
  /** Everything matching needs, assembled from this + the workspace. */
  world: MatchWorld;
  load: () => void;
  refresh: () => Promise<void>;
  scan: (creatorId: string, opts?: { quiet?: boolean }) => Promise<Result>;
  research: (brandId: string) => Promise<Result>;
  /** Clay + Hunter: the company record ("company") or the people who work there ("people") for one of your brands, by its website. */
  lookup: (brandId: string, what: "company" | "people") => Promise<Result>;
  looking: Set<string>;
  /** Re-reads only the status (lookup services, counts) — e.g. after you save a key in Settings. */
  refreshStatus: () => Promise<void>;
  verdict: (linkId: string, verdict: "" | "yes" | "no", kind?: DealKind | null) => Promise<void>;
  /** Saves a deal you know about; `retries` waits for a brand created a moment ago to finish saving. */
  addLink: (creatorId: string, brandId: string, kind: DealKind, opts?: { retries?: number }) => Promise<boolean>;
  hide: (key: string, hidden: boolean) => Promise<void>;
  pitch: (brandId: string, creatorIds: string[], source?: "manual" | "pitch") => Promise<void>;
  unpitch: (brandId: string, creatorId: string) => Promise<void>;
};

const MatchContext = createContext<Value | null>(null);

export async function matchCall<T>(body: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  const { data, error } = await supabase.functions.invoke("brand-match", { body });
  if (!error) return { data: data as T };
  const res = (error as { context?: Response }).context;
  let message = "The matcher didn't answer — try again in a moment.";
  try { const parsed = res ? ((await res.clone().json()) as { error?: string }) : null; if (parsed?.error) message = parsed.error; } catch { /* keep the plain message */ }
  return { error: message };
}
// A request that fails for a moment (a busy server, a dropped connection) is tried again before giving up.
async function retried<T>(run: () => PromiseLike<{ data: T | null; error: unknown; count?: number | null }>, tries = 3): Promise<{ data: T | null; count?: number | null }> {
  let last: unknown = null;
  for (let i = 0; i < tries; i++) {
    const r = await run();
    if (!r.error) return r;
    last = r.error;
    if (i < tries - 1) await new Promise((ok) => setTimeout(ok, 800 * 3 ** i));
  }
  throw last;
}
// All pages at once: count first, then every 1,000-row page in parallel.
const pageAll = async <T,>(table: string, columns: string, userId: string): Promise<T[]> => {
  const { count } = await retried(() => supabase.from(table).select("user_id", { count: "exact", head: true }).eq("user_id", userId));
  const pages = Math.min(50, Math.max(1, Math.ceil((count || 0) / 1000)));
  const got = await Promise.all(Array.from({ length: pages }, (_, i) => retried<T[]>(() => supabase.from(table).select(columns).eq("user_id", userId).range(i * 1000, i * 1000 + 999) as unknown as PromiseLike<{ data: T[] | null; error: unknown }>)));
  return got.flatMap((g) => (g.data || []) as T[]);
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY_ROWS: MatchRows = { links: [], intel: [], content: [], seen: [], pitches: [] };
const ALL_TABLES = ["links", "intel", "content", "seen", "pitches"] as const;

export function MatchProvider({ children }: { children: ReactNode }) {
  const data = useData();
  const { toast } = useToast();
  const userId = data.profile.id;
  const [wanted, setWanted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [links, setLinks] = useState<BrandLink[]>([]);
  const [intel, setIntel] = useState<Map<string, IntelRow>>(new Map());
  const [content, setContent] = useState<Map<string, ContentRow>>(new Map());
  const [seen, setSeen] = useState<Map<string, SeenBrand>>(new Map());
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [status, setStatus] = useState<MatchStatus | null>(null);
  const [scanning, setScanning] = useState<Set<string>>(new Set());
  const [researching, setResearching] = useState<Set<string>>(new Set());
  const busy = useRef(false);
  // What this device holds (the same rows the screens show) and the database's clock of the last answer.
  const rowsRef = useRef<MatchRows | null>(null);
  const cursor = useRef("");
  const statusAt = useRef(0);
  const lastSync = useRef(0);
  const saveTimer = useRef(0);
  // Only a real account id — the placeholder profile before sign-in finishes ("guest") must never be queried.
  const cloud = hasSupabase && UUID_RE.test(userId || "") && !data.demoSeeded;
  // A refresh asked for while one runs is not dropped: it runs right after (the account may have just loaded).
  const again = useRef(false);
  const current = useRef(userId);
  current.current = userId;
  const retryTimer = useRef(0);

  // Rows → screens: only the tables that changed get a new value, so nothing else re-scores.
  const publish = useCallback((rows: MatchRows, tables: readonly (keyof MatchRows)[]) => {
    rowsRef.current = rows;
    if (tables.includes("links")) setLinks(rows.links);
    if (tables.includes("intel")) setIntel(new Map(rows.intel.map((x) => [x.brand_id, x])));
    if (tables.includes("content")) setContent(new Map(rows.content.map((x) => [x.creator_id, x])));
    if (tables.includes("seen")) setSeen(new Map(rows.seen.map((x) => [x.brand_key, x])));
    if (tables.includes("pitches")) setPitches(rows.pitches);
  }, []);
  // The device copy is written a moment after the last change (one write for a burst of changes).
  const keep = useCallback((forUser: string) => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      if (current.current === forUser && rowsRef.current && cursor.current) void saveCopy(forUser, cursor.current, rowsRef.current);
    }, 1500);
  }, []);
  // A change made here (your verdict, a pitch): on screen at once, and in the copy.
  const patch = useCallback(<K extends keyof MatchRows>(name: K, fn: (rows: MatchRows[K]) => MatchRows[K]) => {
    const base = rowsRef.current || EMPTY_ROWS;
    publish({ ...base, [name]: fn(base[name]) }, [name]);
    if (current.current) keep(current.current);
  }, [publish, keep]);
  // Another account on this device: nothing of the last one stays on screen.
  useEffect(() => {
    publish(EMPTY_ROWS, ALL_TABLES);
    // Nothing loaded yet (not "an empty list"): the next refresh starts from this device's copy.
    rowsRef.current = null; cursor.current = ""; statusAt.current = 0;
    setStatus(null); setReady(false);
  }, [userId, publish]);

  const refresh = useCallback(async () => {
    if (!cloud) return;
    if (busy.current) { again.current = true; return; }
    busy.current = true;
    setLoading(true);
    const forUser = userId;
    try {
      let changed = 0;
      // First time in this tab: this device's copy, at once.
      if (!rowsRef.current) {
        const copy = await readCopy(forUser);
        if (current.current !== forUser) return;
        if (copy && fresh(copy.at)) { cursor.current = copy.at; publish(copy.rows, ALL_TABLES); setReady(true); }
      }
      let full = !rowsRef.current || !cursor.current;
      if (!full) {
        // Only what changed since the last answer (a little overlap so a write still saving isn't missed).
        const { data: ch, error: e } = await supabase.rpc("match_changes", { p_since: sinceOf(cursor.current) });
        if (current.current !== forUser) return;
        if (e) throw e;
        const c = ch as Changes | null;
        if (!c?.at || c.full) full = true;
        else {
          const r = applyChanges(rowsRef.current!, c);
          if (r.changed) publish(r.state, r.tables);
          changed = r.changed;
          cursor.current = c.at;
        }
      }
      if (full) {
        // The database's clock BEFORE the download: anything saved while the pages come in is in the next answer.
        const { data: t0 } = await supabase.rpc("match_changes", { p_since: "9999-01-01T00:00:00Z" });
        const at = (t0 as Changes | null)?.at || new Date(Date.now() - 10 * 60_000).toISOString();
        const [l, i, c, s, p] = await Promise.all([
          pageAll<BrandLink>("creator_brands", "id, creator_id, brand_key, brand_name, domain, brand_id, kind, confidence, store, videos, first_at, last_at, evidence, by_ai, manual, verdict, verdict_kind, verdict_at, updated_at, video_ids", forUser),
          pageAll<IntelRow>("brand_intel", "brand_id, intel, status, researched_at, updated_at", forUser),
          pageAll<ContentRow>("creator_content", "creator_id, content, status, note, scanned_at, updated_at", forUser),
          pageAll<SeenBrand>("seen_brands", "brand_key, name, domain, domain_check, site, checked_at, hidden, added_brand_id, updated_at", forUser),
          pageAll<Pitch>("brand_pitches", "id, brand_id, creator_id, at, source, updated_at", forUser),
        ]);
        if (current.current !== forUser) return;
        publish({ links: l, intel: i, content: c, seen: s, pitches: p }, ALL_TABLES);
        cursor.current = at;
        changed = 1;
      }
      lastSync.current = Date.now();
      setReady(true);
      setError("");
      if (changed) keep(forUser);
      // The counts (coverage strip, read state): after a change (at most every 2 minutes), else every 5.
      const since = Date.now() - statusAt.current;
      if (!statusAt.current || since > 5 * 60_000 || (changed && since > 2 * 60_000)) {
        statusAt.current = Date.now();
        const st = await matchCall<MatchStatus & { ok: boolean }>({ action: "status" });
        if (st.data && current.current === forUser) setStatus(st.data);
      }
    } catch (e) {
      if (current.current !== forUser) return;
      // Before the migration runs the tables don't exist: say so plainly, keep the app working.
      const missing = e && typeof e === "object" && "message" in e && /relation|does not exist|schema cache/i.test(String((e as { message: string }).message));
      setError(missing ? "Matching isn't set up on the server yet." : "Couldn't reach the server — trying again in 30 seconds.");
      // What was loaded before stays on screen; try again by itself.
      window.clearTimeout(retryTimer.current);
      if (!missing) retryTimer.current = window.setTimeout(() => { again.current = true; void refreshRef.current(); }, 30_000);
    } finally {
      busy.current = false;
      setLoading(false);
      if (again.current) { again.current = false; void refreshRef.current(); }
    }
  }, [cloud, userId, publish, keep]);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => () => { window.clearTimeout(retryTimer.current); window.clearTimeout(saveTimer.current); }, []);

  const load = useCallback(() => setWanted(true), []);
  useEffect(() => { if (wanted) void refresh(); }, [wanted, refresh]);
  // Asking "what changed?" costs one small call that usually answers "nothing": every minute while creators or
  // brands are still being read, every 5 minutes otherwise, and when you come back to the tab.
  const pending = !!status && (status.read < status.creators || status.researched < status.brands);
  useEffect(() => {
    if (!wanted || !cloud) return;
    const tick = () => { if (document.visibilityState === "visible" && !busy.current) void refreshRef.current(); };
    const t = window.setInterval(tick, pending ? 60_000 : 5 * 60_000);
    const back = () => { if (document.visibilityState === "visible" && Date.now() - lastSync.current > 60_000) tick(); };
    document.addEventListener("visibilitychange", back);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", back); };
  }, [wanted, cloud, pending]);

  const scan = useCallback(async (creatorId: string, opts: { quiet?: boolean } = {}): Promise<Result> => {
    setScanning((s) => new Set(s).add(creatorId));
    try {
      const r = await matchCall<{ ok: boolean; videos: number; newVideos: number; links: number; status: string }>({ action: "scan_creator", id: creatorId });
      if (r.error || !r.data) { if (!opts.quiet) toast(r.error || "Couldn't read their videos.", "error"); return { ok: false, message: r.error || "" }; }
      await refresh();
      const d = r.data;
      const message = d.status === "no_channel" ? "No YouTube channel to read." : `Read ${d.videos} video${d.videos === 1 ? "" : "s"} — ${d.links ? `works with ${d.links} brand${d.links === 1 ? "" : "s"}` : "no brand deals found"}.`;
      if (!opts.quiet) toast(message, d.status === "no_channel" ? "info" : "success");
      return { ok: true, message };
    } finally {
      setScanning((s) => { const n = new Set(s); n.delete(creatorId); return n; });
    }
  }, [refresh, toast]);

  const research = useCallback(async (brandId: string): Promise<Result> => {
    setResearching((s) => new Set(s).add(brandId));
    try {
      const r = await matchCall<{ ok: boolean }>({ action: "research_brand", id: brandId });
      if (r.error) { toast(r.error, "error"); return { ok: false, message: r.error }; }
      await refresh();
      toast("Brand research updated.");
      return { ok: true, message: "" };
    } finally {
      setResearching((s) => { const n = new Set(s); n.delete(brandId); return n; });
    }
  }, [refresh, toast]);

  const [looking, setLooking] = useState<Set<string>>(new Set());
  const refreshStatus = useCallback(async () => {
    const st = await matchCall<MatchStatus & { ok: boolean }>({ action: "status" });
    if (st.data) { setStatus(st.data); statusAt.current = Date.now(); }
  }, []);
  const lookup = useCallback(async (brandId: string, what: "company" | "people"): Promise<Result> => {
    const tag = `${what}:${brandId}`;
    setLooking((s) => new Set(s).add(tag));
    try {
      const r = await matchCall<{ ok: boolean; company?: CompanyFacts; people?: BrandIntel["people"]; found?: boolean; hunter?: { configured: boolean; left: number }; clay?: { configured: boolean; left: number }; apollo?: { configured: boolean; used: number; paused: boolean } }>({ action: what === "company" ? "company_lookup" : "people_find", id: brandId });
      if (r.error || !r.data) { toast(r.error || "The lookup didn't answer — try again in a minute.", "error"); return { ok: false, message: r.error || "" }; }
      const d = r.data;
      patch("intel", (rows) => rows.map((row) => (row.brand_id === brandId && row.intel ? { ...row, intel: { ...row.intel, ...(d.company ? { company: d.company } : {}), ...(d.people ? { people: d.people } : {}) } } : row)));
      if (d.hunter || d.clay || d.apollo) setStatus((st) => (st ? { ...st, ...(d.hunter ? { hunter: d.hunter } : {}), ...(d.clay ? { clay: d.clay } : {}), ...(d.apollo ? { apollo: d.apollo } : {}) } : st));
      if (what === "company") toast(d.found === false ? "No company record for this website yet." : d.company?.linkedin ? "Company facts added." : "Company facts added — no LinkedIn page on record.", d.found === false ? "info" : "success");
      else toast(d.people?.list.length ? `${d.people.list.length} ${d.people.list.length === 1 ? "person" : "people"} found.` : "No one found at this website yet.", d.people?.list.length ? "success" : "info");
      return { ok: true, message: "" };
    } finally {
      setLooking((s) => { const n = new Set(s); n.delete(tag); return n; });
    }
  }, [toast, patch]);

  const verdict = useCallback(async (linkId: string, v: "" | "yes" | "no", kind: DealKind | null = null) => {
    const undo = (rowsRef.current?.links || []).find((l) => l.id === linkId);
    const put = (row: BrandLink) => patch("links", (ls) => ls.map((l) => (l.id === linkId ? row : l)));
    if (undo) put({ ...undo, verdict: v, verdict_kind: kind, verdict_at: v ? new Date().toISOString() : null });
    const { error: e } = await supabase.rpc("set_brand_link", { p_id: linkId, p_verdict: v, p_kind: kind });
    if (e) { if (undo) put(undo); toast("Couldn't save that — try again.", "error"); return; }
    if (v && undo) toast(v === "yes" ? "Marked as confirmed." : "Marked as wrong — it won't count anywhere.", "success", { label: "Undo", run: () => void supabase.rpc("set_brand_link", { p_id: linkId, p_verdict: undo.verdict, p_kind: undo.verdict_kind }).then(({ error: u }) => { if (u) toast("Couldn't undo that — try again.", "error"); else put(undo); }) });
  }, [patch, toast]);

  const addLink = useCallback(async (creatorId: string, brandId: string, kind: DealKind, opts?: { retries?: number }) => {
    let { error: e } = await supabase.rpc("add_brand_link", { p_creator: creatorId, p_brand: brandId, p_kind: kind });
    // A brand added from the picker a moment ago may still be saving: wait for it (1.5 s steps).
    for (let i = 0; e && i < (opts?.retries || 0); i++) {
      await new Promise((ok) => setTimeout(ok, 1500));
      ({ error: e } = await supabase.rpc("add_brand_link", { p_creator: creatorId, p_brand: brandId, p_kind: kind }));
    }
    if (e) { toast("Couldn't save the deal — check your connection and try again.", "error"); return false; }
    await refresh();
    toast("Deal saved — they won't be pitched to this brand as new.");
    return true;
  }, [refresh, toast]);

  const hide = useCallback(async (key: string, hidden: boolean) => {
    const before = (rowsRef.current?.seen || []).find((x) => x.brand_key === key);
    const put = (h: boolean) => patch("seen", (rows) => rows.map((x) => (x.brand_key === key ? { ...x, hidden: h } : x)));
    put(hidden);
    const { error: e } = await supabase.rpc("hide_seen_brand", { p_key: key, p_hidden: hidden });
    if (e) { put(before?.hidden ?? !hidden); toast("Couldn't save that — try again.", "error"); return; }
    if (hidden) toast(`${before?.name || "Brand"} hidden.`, "success", { label: "Undo", run: () => void supabase.rpc("hide_seen_brand", { p_key: key, p_hidden: false }).then(({ error: u }) => { if (u) toast("Couldn't undo that — try again.", "error"); else put(false); }) });
  }, [patch, toast]);

  const pitch = useCallback(async (brandId: string, creatorIds: string[], source: "manual" | "pitch" = "manual") => {
    const fresh = creatorIds.filter((id) => !pitches.some((p) => p.brand_id === brandId && p.creator_id === id));
    if (!fresh.length) return;
    const temp = fresh.map((id): Pitch => ({ id: `tmp-${id}`, brand_id: brandId, creator_id: id, at: new Date().toISOString(), source }));
    patch("pitches", (ps) => [...ps, ...temp]);
    const { data: rows, error: e } = await supabase.from("brand_pitches").upsert(fresh.map((id) => ({ user_id: userId, brand_id: brandId, creator_id: id, source })), { onConflict: "user_id,brand_id,creator_id", ignoreDuplicates: true }).select("id, brand_id, creator_id, at, source, updated_at");
    if (e) { patch("pitches", (ps) => ps.filter((p) => !temp.includes(p))); toast("Couldn't mark them as pitched — check your connection.", "error"); return; }
    const saved = (rows || []) as Pitch[];
    patch("pitches", (ps) => [...ps.filter((p) => !temp.includes(p) && !saved.some((r) => r.id === p.id)), ...saved]);
  }, [pitches, patch, toast, userId]);

  const unpitch = useCallback(async (brandId: string, creatorId: string) => {
    const gone = pitches.filter((p) => p.brand_id === brandId && p.creator_id === creatorId);
    patch("pitches", (ps) => ps.filter((p) => !gone.includes(p)));
    const { error: e } = await supabase.from("brand_pitches").delete().eq("user_id", userId).eq("brand_id", brandId).eq("creator_id", creatorId);
    if (e) { patch("pitches", (ps) => [...ps, ...gone]); toast("Couldn't undo the pitch — try again.", "error"); }
  }, [pitches, patch, toast, userId]);

  // A creator added now with a YouTube channel: read their videos as soon as the record has saved.
  const seenIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!cloud) return;
    const ids = new Set(data.creators.map((c) => c.id));
    if (!seenIds.current) { seenIds.current = ids; return; }
    const added = data.creators.filter((c) => !seenIds.current!.has(c.id) && !c.archived_at && (c.socials || []).some((s) => s.platform === "YouTube" && (s.url || s.handle)));
    seenIds.current = ids;
    if (!added.length || added.length > 5) return; // an import is left to the background reader
    for (const c of added) {
      window.setTimeout(async () => {
        let r = await scan(c.id, { quiet: true });
        // Not saved yet: one more try a little later.
        if (!r.ok && /isn't in your CRM|hasn't saved/.test(r.message)) { await new Promise((ok) => setTimeout(ok, 20_000)); r = await scan(c.id, { quiet: true }); }
        if (r.ok) toast(`${c.name}: ${r.message.replace(/^Read /, "read ")}`, "info");
      }, 9000);
    }
  }, [cloud, data.creators, scan, toast]);

  const activeBrands = useMemo(() => data.brands.filter((b) => !b.archived_at), [data.brands]);
  // Only trusted deals reach the screens (Sure / Likely, about a verified brand) — see trustedLinks.
  const shown = useMemo(() => trustedLinks(links, seen, data.brands), [links, seen, data.brands]);
  const linksBy = useMemo(() => byCreator(shown), [shown]);
  const criteria = useMemo(() => normalizeCriteria(data.profile.preferences.youtube_criteria), [data.profile.preferences.youtube_criteria]);
  const world = useMemo<MatchWorld>(() => ({
    links: shown, linksBy, pitches, campaigns: data.campaigns, creators: data.creators.filter((c) => !c.archived_at), brands: activeBrands, archivedBrands: data.brands.filter((b) => b.archived_at),
    intel, content, seen, criteria,
  }), [shown, linksBy, pitches, data.campaigns, data.creators, data.brands, activeBrands, intel, content, seen, criteria]);

  const value = useMemo<Value>(() => ({ ready, loading, error, links: shown, linksBy, intel, content, seen, pitches, status, scanning, researching, world, load, refresh, scan, research, lookup, looking, refreshStatus, verdict, addLink, hide, pitch, unpitch }),
    [ready, loading, error, shown, linksBy, intel, content, seen, pitches, status, scanning, researching, world, load, refresh, scan, research, lookup, looking, refreshStatus, verdict, addLink, hide, pitch, unpitch]);
  return <MatchContext.Provider value={value}>{children}</MatchContext.Provider>;
}

/** Match data for a screen; loads it the first time any screen asks. */
export function useMatch() {
  const ctx = useContext(MatchContext);
  if (!ctx) throw new Error("useMatch must be used inside MatchProvider");
  const { load } = ctx;
  useEffect(() => { load(); }, [load]);
  return ctx;
}
