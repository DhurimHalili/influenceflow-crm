import { useEffect, useRef } from "react";
import { FLUSH_DRAFTS_EVENT } from "../lib/appUpdate";

// Runs `save` when unsaved changes would otherwise be lost: leaving the
// profile, closing or reloading the tab, the phone suspending it, or the app
// installing an update.
export function useSaveOnLeave(dirty: boolean, save: () => void) {
  const latest = useRef({ dirty, save });
  latest.current = { dirty, save };
  useEffect(() => {
    const flush = () => {
      if (!latest.current.dirty) return;
      latest.current.dirty = false;
      latest.current.save();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener(FLUSH_DRAFTS_EVENT, flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener(FLUSH_DRAFTS_EVENT, flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, []);
}
