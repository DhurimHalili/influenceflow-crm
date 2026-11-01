import { AnimatePresence, motion } from "framer-motion";
import { RefreshCw, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useData } from "../contexts/DataContext";

// Keeps every open tab on the newest release — no hard refresh needed.
//
// How: each build ships /version.json with its id. The app asks for it
// (bypassing every cache) on start, every 2 minutes, and whenever the tab
// comes back into view. When a newer build is live, the tab updates itself at
// a safe moment — after your changes reached the cloud, when you switch pages
// or the tab is in the background — and offers an "Update now" button
// meanwhile. A chunk that fails to load after a deploy also triggers one
// clean reload instead of a broken page.

const CHECK_EVERY_MS = 2 * 60 * 1000;
const RELOAD_GUARD = "if.update-reload";
const base = import.meta.env.BASE_URL || "/";

async function liveVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${base}version.json?t=${Date.now()}`, { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
    if (!res.ok) return null;
    const json = (await res.json()) as { version?: string };
    return typeof json.version === "string" ? json.version : null;
  } catch {
    return null;
  }
}

/** One reload per new version, so a bad deploy can never cause a reload loop. */
function reloadOnce(version: string) {
  try {
    if (sessionStorage.getItem(RELOAD_GUARD) === version) return false;
    sessionStorage.setItem(RELOAD_GUARD, version);
  } catch {
    // storage off: still reload once in this page's life
  }
  // A fresh URL skips the cached index.html (GitHub Pages caches it ~10 min),
  // so the reload really lands on the new build.
  const url = new URL(window.location.href);
  url.searchParams.set("v", version);
  window.location.replace(url.toString());
  return true;
}

export function UpdateWatcher() {
  const data = useData();
  const location = useLocation();
  const [next, setNext] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);
  const firstPath = useRef(location.pathname);
  const nextRef = useRef<string | null>(null);
  nextRef.current = next;
  const dataRef = useRef(data);
  dataRef.current = data;

  const apply = async (version: string) => {
    setUpdating(true);
    // Never lose an edit: push pending changes first (they also stay on this device).
    await dataRef.current.flushAndWait(8000);
    if (!reloadOnce(version)) setUpdating(false);
  };

  // Poll for a newer build.
  useEffect(() => {
    if (import.meta.env.DEV) return;
    let stopped = false;
    const check = async () => {
      const live = await liveVersion();
      if (stopped || !live || live === __APP_VERSION__) return;
      setNext(live);
    };
    void check();
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    const onShow = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    window.addEventListener("online", onShow);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
      window.removeEventListener("online", onShow);
    };
  }, []);

  // A lazy page chunk from the previous deploy is gone: reload into the new one.
  useEffect(() => {
    const onPreloadError = (event: Event) => {
      event.preventDefault();
      void liveVersion().then((live) => reloadOnce(live || `chunk-${Date.now()}`));
    };
    window.addEventListener("vite:preloadError", onPreloadError);
    return () => window.removeEventListener("vite:preloadError", onPreloadError);
  }, []);

  // Safe moments to update on its own: the tab goes to the background, or you
  // move to another page (nothing half-typed is on screen).
  useEffect(() => {
    if (!next) return;
    const onHide = () => {
      if (document.visibilityState === "hidden" && nextRef.current && dataRef.current.syncState !== "saving") void apply(nextRef.current);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next]);
  useEffect(() => {
    if (!next || location.pathname === firstPath.current) return;
    firstPath.current = location.pathname;
    if (document.querySelector(".modal-backdrop, .composer-backdrop")) return;
    void apply(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, next]);

  return (
    <AnimatePresence>
      {next && !dismissed && (
        <motion.div className="update-card" role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
          <span className="update-icon"><Sparkles size={16} /></span>
          <span><strong>A new version of InfluenceFlow is ready</strong><small>It installs itself when you switch pages — your work is saved first.</small></span>
          <button type="button" className="update-now" onClick={() => void apply(next)} disabled={updating}><RefreshCw size={14} className={updating ? "spin" : ""} /> {updating ? "Updating…" : "Update now"}</button>
          <button type="button" className="update-close" onClick={() => setDismissed(true)} aria-label="Later"><X size={14} /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
