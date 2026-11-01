import { AnimatePresence, motion } from "framer-motion";
import { RefreshCw, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { APP_VERSION, FLUSH_DRAFTS_EVENT, liveVersion, reloadInto } from "../lib/appUpdate";

// Keeps every open tab on the newest release — nobody waits, nobody needs a
// hard refresh.
//
// 1. On open: main.tsx checks the live build at once and jumps to it.
// 2. While open: a tiny version.json request (≈60 bytes, never cached) runs
//    every minute while the tab is visible, and every time it comes back into
//    view (unlocking the phone, switching back to the tab).
// 3. A newer build installs itself the moment it is safe: no dialog or
//    composer open, nothing focused for typing, every change in the cloud.
//    Half-typed notes and drafts are saved first. Switching pages or sending
//    the tab to the background also count as safe moments.
// 4. A page chunk from the previous deploy that fails to load triggers one
//    clean reload instead of a broken screen.

const CHECK_EVERY_MS = 60 * 1000;
const SAFE_POLL_MS = 1500;

const typingNow = () => {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
};
const dialogOpen = () => !!document.querySelector(".modal-backdrop, .composer-backdrop");

export function UpdateWatcher() {
  const data = useData();
  const location = useLocation();
  const [next, setNext] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);
  const lastPath = useRef(location.pathname);
  const nextRef = useRef<string | null>(null);
  nextRef.current = next;
  const dataRef = useRef(data);
  dataRef.current = data;
  const applying = useRef(false);

  const apply = async (version: string) => {
    if (applying.current) return;
    applying.current = true;
    setUpdating(true);
    // Never lose a word: editors save what is typed, then the cloud confirms.
    window.dispatchEvent(new Event(FLUSH_DRAFTS_EVENT));
    await new Promise((resolve) => window.setTimeout(resolve, 60));
    await dataRef.current.flushAndWait(8000);
    if (!reloadInto(version)) {
      applying.current = false;
      setUpdating(false);
    }
  };

  // Look for a newer build.
  useEffect(() => {
    if (import.meta.env.DEV) return;
    let stopped = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const live = await liveVersion();
      if (stopped || !live || live === APP_VERSION) return;
      setNext(live);
    };
    void check();
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    const onShow = () => void check();
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    window.addEventListener("online", onShow);
    window.addEventListener("pageshow", onShow);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
      window.removeEventListener("online", onShow);
      window.removeEventListener("pageshow", onShow);
    };
  }, []);

  // A lazy page chunk from the previous deploy is gone: reload into the new one.
  useEffect(() => {
    const onPreloadError = (event: Event) => {
      event.preventDefault();
      void liveVersion().then((live) => reloadInto(live || `chunk-${Date.now()}`));
    };
    window.addEventListener("vite:preloadError", onPreloadError);
    return () => window.removeEventListener("vite:preloadError", onPreloadError);
  }, []);

  // Install as soon as it is safe — usually within a second or two.
  useEffect(() => {
    if (!next) return;
    const tryNow = () => {
      const v = nextRef.current;
      if (!v || applying.current) return;
      const state = dataRef.current.syncState;
      const settled = state === "synced" || state === "local";
      if (document.visibilityState === "hidden") return void apply(v);
      if (settled && !typingNow() && !dialogOpen()) void apply(v);
    };
    tryNow();
    const timer = window.setInterval(tryNow, SAFE_POLL_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") tryNow();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next]);

  // Moving to another page is always a safe moment (unless a dialog is open).
  useEffect(() => {
    const moved = location.pathname !== lastPath.current;
    lastPath.current = location.pathname;
    if (moved && next && !dialogOpen()) void apply(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <AnimatePresence>
      {next && !dismissed && (
        <motion.div className="update-card" role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
          <span className="update-icon"><Sparkles size={16} /></span>
          <span><strong>{updating ? "Installing the new version…" : "A new version of InfluenceFlow is ready"}</strong><small>{updating ? "Saving your work first — one moment." : "It installs itself as soon as you stop typing."}</small></span>
          <button type="button" className="update-now" onClick={() => void apply(next)} disabled={updating}><RefreshCw size={14} className={updating ? "spin" : ""} /> {updating ? "Updating…" : "Update now"}</button>
          {!updating && <button type="button" className="update-close" onClick={() => setDismissed(true)} aria-label="Later"><X size={14} /></button>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
