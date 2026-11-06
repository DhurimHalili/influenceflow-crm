import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { hasSupabase, supabase } from "../lib/supabase";
import type { Creator, SocialLink } from "../types";
import { useData } from "./DataContext";

// YouTube numbers for influencers, from the youtube-sync function.
//   lookup(link)   — quick fill: the channel's facts and suggested stars, nothing saved
//   refresh(ids)   — fresh numbers for some or all influencers, 10 at a time.
//                    {force: true} (the Refresh buttons) takes YouTube's values
//                    back even where you changed them — never your email.
// A refresh runs here, above the pages, so it keeps going when you open an
// influencer or switch tabs; the progress shows wherever you are. Each result
// is saved through the normal edit path (updateCreator), so it can never
// overwrite a change you make in the meantime, and a record deleted or
// archived mid-run is simply skipped.

export type ChannelFacts = {
  channelId: string; handle: string; title: string; url: string; country: string; thumbnail: string;
  subscribers: number; hiddenSubscribers: boolean; videoCount: number; totalViews: number;
  avgViews: number; engagementRate: number; sampled: number; uploads90d: number; lastUploadAt: string;
  emails: string[]; businessEmailHidden: boolean; stars: { engagement: number; consistency: number; demographics: number }; at: string;
  niche: string; subNiche: string; includesRecent: boolean;
  sample: { id: string; title: string; views: number; at: string; cut?: "high" | "low" }[];
};
export type Progress = { total: number; done: number; failed: number; running: boolean; ids: Set<string>; message: string };

type Value = {
  enabled: boolean;
  progress: Progress;
  lookup: (input: string) => Promise<{ facts?: ChannelFacts; error?: string }>;
  refresh: (ids: string[], opts?: { quiet?: boolean; force?: boolean }) => Promise<{ done: number; failed: number; message: string }>;
  cancel: () => void;
  /** The YouTube link or @handle on a record, or "". */
  channelOf: (socials: SocialLink[] | undefined) => string;
};

const YouTubeContext = createContext<Value | null>(null);
const idle: Progress = { total: 0, done: 0, failed: 0, running: false, ids: new Set(), message: "" };
const channelOf = (socials: SocialLink[] | undefined) => {
  const s = (socials || []).find((x) => x.platform === "YouTube" && (x.url || x.handle));
  return s ? s.url || `@${s.handle}` : "";
};

async function call<T>(body: Record<string, unknown>): Promise<{ data?: T; error?: string; status?: number }> {
  const { data, error } = await supabase.functions.invoke("youtube-sync", { body });
  if (!error) return { data: data as T };
  const res = (error as { context?: Response }).context;
  let message = "YouTube didn't answer — try again in a moment.";
  try {
    const parsed = res ? ((await res.clone().json()) as { error?: string; results?: unknown }) : null;
    if (parsed?.error) message = parsed.error;
    if (parsed && "results" in parsed) return { data: parsed as T, error: message, status: res?.status };
  } catch {
    // keep the plain message
  }
  return { error: message, status: res?.status };
}

export function YouTubeProvider({ children }: { children: ReactNode }) {
  const data = useData();
  const dataRef = useRef(data);
  dataRef.current = data;
  const [progress, setProgress] = useState<Progress>(idle);
  const running = useRef(false);
  const stop = useRef(false);
  const enabled = hasSupabase && data.profile.preferences?.youtube_auto !== false;
  // Settings: count videos younger than a day too (off by default).
  const recentRef = useRef(false);
  recentRef.current = data.profile.preferences?.youtube_recent === true;

  const lookup = useCallback(async (input: string) => {
    const res = await call<{ facts?: ChannelFacts }>({ action: "lookup", input, recent: recentRef.current });
    return res.data?.facts ? { facts: res.data.facts } : { error: res.error || "Couldn't read that channel." };
  }, []);

  const refresh = useCallback(async (ids: string[], opts?: { quiet?: boolean; force?: boolean }) => {
    const wanted = Array.from(new Set(ids)).filter((id) => channelOf(dataRef.current.creators.find((c) => c.id === id)?.socials));
    if (!wanted.length) return { done: 0, failed: 0, message: "None of them has a YouTube channel on their profile." };
    if (running.current) return { done: 0, failed: 0, message: "A YouTube refresh is already running." };
    running.current = true;
    stop.current = false;
    let done = 0, failed = 0, message = "";
    if (!opts?.quiet) setProgress({ total: wanted.length, done: 0, failed: 0, running: true, ids: new Set(wanted), message: "" });
    else setProgress((p) => ({ ...p, ids: new Set(wanted) }));
    for (let i = 0; i < wanted.length && !stop.current; i += 10) {
      const batch = wanted.slice(i, i + 10);
      // What's on screen right now: a record saved a moment ago may not be in the database yet.
      const items = batch.map((id) => dataRef.current.creators.find((c) => c.id === id)).filter((c): c is Creator => !!c && !c.archived_at)
        .map((c) => ({ id: c.id, link: channelOf(c.socials), name: c.name, country: c.country || "", contact_email: c.contact_email, niche: c.niche || "", avg_views: c.avg_views || 0, engagement_rate: c.engagement_rate || 0, stars_engagement: c.stars_engagement || 0, stars_consistency: c.stars_consistency || 0, stars_demographics: c.stars_demographics || 0, youtube: c.youtube ? { auto: c.youtube.auto } : null, socials: c.socials || [] }));
      const res = items.length ? await call<{ results?: { id: string; ok: boolean; patch?: Partial<Creator>; error?: string }[]; quota?: boolean }>({ action: "refresh", items, recent: recentRef.current, force: opts?.force === true }) : { data: { results: [] } };
      for (const r of res.data?.results || []) {
        const record = dataRef.current.creators.find((c) => c.id === r.id);
        if (r.ok && r.patch && record && !record.archived_at) {
          dataRef.current.updateCreator(r.id, r.patch, { quiet: true });
          done++;
        } else failed++;
      }
      if ("error" in res && res.error) {
        message = res.error;
        failed += batch.length - (res.data?.results?.length || 0);
        if ("status" in res && (res.status === 429 || res.status === 503 || res.status === 401)) break;
      }
      if (!opts?.quiet) setProgress((p) => ({ ...p, done, failed }));
    }
    running.current = false;
    setProgress((p) => ({ ...p, running: false, done, failed, ids: new Set(), message: stop.current ? "Stopped" : message }));
    return { done, failed, message: stop.current ? "Stopped — the rest refresh within the hour." : message };
  }, []);

  const cancel = useCallback(() => { stop.current = true; }, []);
  const value = useMemo(() => ({ enabled, progress, lookup, refresh, cancel, channelOf }), [enabled, progress, lookup, refresh, cancel]);
  return <YouTubeContext.Provider value={value}>{children}</YouTubeContext.Provider>;
}

export const useYouTube = () => {
  const value = useContext(YouTubeContext);
  if (!value) throw new Error("useYouTube must be used inside YouTubeProvider");
  return value;
};
