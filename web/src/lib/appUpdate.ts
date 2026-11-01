// Shared by the boot check (main.tsx) and the in-app watcher.

export const APP_VERSION = __APP_VERSION__;
export const APP_BUILT_AT = __APP_BUILT_AT__;
const RELOAD_GUARD = "if.update-reload";
const base = import.meta.env.BASE_URL || "/";

/** The build that is live right now, read past every cache. */
export async function liveVersion(timeoutMs = 6000): Promise<string | null> {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = window.setTimeout(() => ctrl?.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}version.json?t=${Date.now()}`, { cache: "no-store", signal: ctrl?.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as { version?: string };
    return typeof json.version === "string" ? json.version : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Editors with unsaved text save it when they hear this (see useSaveOnLeave). */
export const FLUSH_DRAFTS_EVENT = "if:flush-drafts";

/** One reload per new version, so a bad deploy can never cause a reload loop. */
export function reloadInto(version: string) {
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

// Opening the app on a phone or a long-idle tab often serves the cached,
// older page. Ask for the live build straight away, in parallel with startup
// (first paint is never delayed), and jump to it before anyone starts working.
// Safe at this point: edits not yet in the cloud live in this browser's
// storage and are pushed again after the reload.
export function bootUpdateCheck() {
  if (import.meta.env.DEV) return;
  const started = Date.now();
  void liveVersion(4000).then((live) => {
    if (!live || live === APP_VERSION) return;
    // Only within the first seconds; later the in-app watcher waits for a
    // safe moment instead of yanking the page away.
    if (Date.now() - started < 5000 && !document.querySelector(".modal-backdrop, .composer-backdrop")) reloadInto(live);
  });
}
