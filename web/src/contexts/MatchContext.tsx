import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { hasSupabase, supabase } from "../lib/supabase";
import { byCreator, type BrandLink, type ContentRow, type IntelRow, type MatchWorld, type Pitch, type SeenBrand } from "../lib/match";
import { normalizeCriteria } from "../lib/criteria";
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
// Loaded the first time a screen asks (useMatch), refreshed every minute while
// something is still being read, and after every action. Your verdicts and
// pitches update on screen at once and roll back visibly if saving fails.
// A creator you add with a YouTube channel is read right away (not at the
// next 3-minute cron), and a toast says what was found.

export type MatchStatus = { creators: number; read: number; brands: number; researched: number; youtube: boolean; clef: { configured: boolean; left: number; cap: number; pausedUntil: string | null }; listen: { configured: boolean; secondsLeft: number } };
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
  verdict: (linkId: string, verdict: "" | "yes" | "no", kind?: DealKind | null) => Promise<void>;
  addLink: (creatorId: string, brandId: string, kind: DealKind) => Promise<void>;
  hide: (key: string, hidden: boolean) => Promise<void>;
  pitch: (brandId: string, creatorIds: string[], source?: "manual" | "pitch") => Promise<void>;
  unpitch: (brandId: string, creatorId: string) => Promise<void>;
};

const MatchContext = createContext<Value | null>(null);

async function call<T>(body: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  const { data, error } = await supabase.functions.invoke("brand-match", { body });
  if (!error) return { data: data as T };
  const res = (error as { context?: Response }).context;
  let message = "The matcher didn't answer — try again in a moment.";
  try { const parsed = res ? ((await res.clone().json()) as { error?: string }) : null; if (parsed?.error) message = parsed.error; } catch { /* keep the plain message */ }
  return { error: message };
}
const pageAll = async <T,>(table: string, columns: string, userId: string): Promise<T[]> => {
  const out: T[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).eq("user_id", userId).range(from, from + 999);
    if (error) throw error;
    out.push(...((data || []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
};

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
  const cloud = hasSupabase && !!userId && !data.demoSeeded;

  const refresh = useCallback(async () => {
    if (!cloud || busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const [l, i, c, s, p] = await Promise.all([
        pageAll<BrandLink>("creator_brands", "id, creator_id, brand_key, brand_name, domain, brand_id, kind, confidence, store, videos, first_at, last_at, evidence, by_ai, manual, verdict, verdict_kind, verdict_at, updated_at", userId),
        pageAll<IntelRow>("brand_intel", "brand_id, intel, status, researched_at", userId),
        pageAll<ContentRow>("creator_content", "creator_id, content, status, note, scanned_at", userId),
        pageAll<SeenBrand>("seen_brands", "brand_key, name, domain, domain_check, site, checked_at, hidden, added_brand_id", userId),
        pageAll<Pitch>("brand_pitches", "id, brand_id, creator_id, at, source", userId),
      ]);
      setLinks(l);
      setIntel(new Map(i.map((x) => [x.brand_id, x])));
      setContent(new Map(c.map((x) => [x.creator_id, x])));
      setSeen(new Map(s.map((x) => [x.brand_key, x])));
      setPitches(p);
      setReady(true);
      setError("");
      const st = await call<MatchStatus & { ok: boolean }>({ action: "status" });
      if (st.data) setStatus(st.data);
    } catch (e) {
      // Before the migration runs the tables don't exist: say so plainly, keep the app working.
      setError(e && typeof e === "object" && "message" in e && /relation|does not exist|schema cache/i.test(String((e as { message: string }).message)) ? "Matching isn't set up on the server yet." : "Couldn't load matches — check your connection.");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [cloud, userId]);

  const load = useCallback(() => setWanted(true), []);
  useEffect(() => { if (wanted) void refresh(); }, [wanted, refresh]);
  // While creators or brands are still being read, look again every minute.
  const pending = !!status && (status.read < status.creators || status.researched < status.brands);
  useEffect(() => {
    if (!wanted || !pending) return;
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 60_000);
    return () => window.clearInterval(t);
  }, [wanted, pending, refresh]);

  const scan = useCallback(async (creatorId: string, opts: { quiet?: boolean } = {}): Promise<Result> => {
    setScanning((s) => new Set(s).add(creatorId));
    try {
      const r = await call<{ ok: boolean; videos: number; newVideos: number; links: number; status: string }>({ action: "scan_creator", id: creatorId });
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
      const r = await call<{ ok: boolean }>({ action: "research_brand", id: brandId });
      if (r.error) { toast(r.error, "error"); return { ok: false, message: r.error }; }
      await refresh();
      toast("Brand research updated.");
      return { ok: true, message: "" };
    } finally {
      setResearching((s) => { const n = new Set(s); n.delete(brandId); return n; });
    }
  }, [refresh, toast]);

  const verdict = useCallback(async (linkId: string, v: "" | "yes" | "no", kind: DealKind | null = null) => {
    const before = links;
    setLinks((ls) => ls.map((l) => (l.id === linkId ? { ...l, verdict: v, verdict_kind: kind, verdict_at: v ? new Date().toISOString() : null } : l)));
    const { error: e } = await supabase.rpc("set_brand_link", { p_id: linkId, p_verdict: v, p_kind: kind });
    if (e) { setLinks(before); toast("Couldn't save that — try again.", "error"); return; }
    const undo = before.find((l) => l.id === linkId);
    if (v && undo) toast(v === "yes" ? "Marked as confirmed." : "Marked as wrong — it won't count anywhere.", "success", { label: "Undo", run: () => void supabase.rpc("set_brand_link", { p_id: linkId, p_verdict: undo.verdict, p_kind: undo.verdict_kind }).then(() => setLinks((ls) => ls.map((l) => (l.id === linkId ? undo : l)))) });
  }, [links, toast]);

  const addLink = useCallback(async (creatorId: string, brandId: string, kind: DealKind) => {
    const { error: e } = await supabase.rpc("add_brand_link", { p_creator: creatorId, p_brand: brandId, p_kind: kind });
    if (e) { toast("Couldn't save that — try again.", "error"); return; }
    await refresh();
    toast("Saved — they won't be pitched to this brand as new.");
  }, [refresh, toast]);

  const hide = useCallback(async (key: string, hidden: boolean) => {
    const before = seen.get(key);
    setSeen((m) => { const n = new Map(m); const s = n.get(key); if (s) n.set(key, { ...s, hidden }); return n; });
    const { error: e } = await supabase.rpc("hide_seen_brand", { p_key: key, p_hidden: hidden });
    if (e) { setSeen((m) => { const n = new Map(m); if (before) n.set(key, before); return n; }); toast("Couldn't save that — try again.", "error"); return; }
    if (hidden) toast(`${before?.name || "Brand"} hidden.`, "success", { label: "Undo", run: () => void supabase.rpc("hide_seen_brand", { p_key: key, p_hidden: false }).then(() => setSeen((m) => { const n = new Map(m); const s = n.get(key); if (s) n.set(key, { ...s, hidden: false }); return n; })) });
  }, [seen, toast]);

  const pitch = useCallback(async (brandId: string, creatorIds: string[], source: "manual" | "pitch" = "manual") => {
    const fresh = creatorIds.filter((id) => !pitches.some((p) => p.brand_id === brandId && p.creator_id === id));
    if (!fresh.length) return;
    const temp = fresh.map((id): Pitch => ({ id: `tmp-${id}`, brand_id: brandId, creator_id: id, at: new Date().toISOString(), source }));
    setPitches((ps) => [...ps, ...temp]);
    const { data: rows, error: e } = await supabase.from("brand_pitches").upsert(fresh.map((id) => ({ user_id: userId, brand_id: brandId, creator_id: id, source })), { onConflict: "user_id,brand_id,creator_id", ignoreDuplicates: true }).select("id, brand_id, creator_id, at, source");
    if (e) { setPitches((ps) => ps.filter((p) => !temp.includes(p))); toast("Couldn't mark them as pitched — check your connection.", "error"); return; }
    setPitches((ps) => [...ps.filter((p) => !temp.includes(p)), ...((rows || []) as Pitch[])]);
  }, [pitches, toast, userId]);

  const unpitch = useCallback(async (brandId: string, creatorId: string) => {
    const before = pitches;
    setPitches((ps) => ps.filter((p) => !(p.brand_id === brandId && p.creator_id === creatorId)));
    const { error: e } = await supabase.from("brand_pitches").delete().eq("user_id", userId).eq("brand_id", brandId).eq("creator_id", creatorId);
    if (e) { setPitches(before); toast("Couldn't undo the pitch — try again.", "error"); }
  }, [pitches, toast, userId]);

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

  const linksBy = useMemo(() => byCreator(links), [links]);
  const criteria = useMemo(() => normalizeCriteria(data.profile.preferences.youtube_criteria), [data.profile.preferences.youtube_criteria]);
  const world = useMemo<MatchWorld>(() => ({
    links, linksBy, pitches, campaigns: data.campaigns, creators: data.creators.filter((c) => !c.archived_at), brands: data.brands.filter((b) => !b.archived_at),
    intel, content, seen, criteria,
  }), [links, linksBy, pitches, data.campaigns, data.creators, data.brands, intel, content, seen, criteria]);

  const value = useMemo<Value>(() => ({ ready, loading, error, links, linksBy, intel, content, seen, pitches, status, scanning, researching, world, load, refresh, scan, research, verdict, addLink, hide, pitch, unpitch }),
    [ready, loading, error, links, linksBy, intel, content, seen, pitches, status, scanning, researching, world, load, refresh, scan, research, verdict, addLink, hide, pitch, unpitch]);
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
