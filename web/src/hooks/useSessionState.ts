import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

// List filters, search and sort survive moving around the app (open a
// profile, come back) but not leaving the site: sessionStorage lives exactly
// as long as the browser tab. "Clear filters" resets them, sign-out wipes them.
const PREFIX = "if.session.";

export function useSessionState<T>(key: string, fallback: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(PREFIX + key);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch {
      // storage blocked: fall through to the default
    }
    return typeof fallback === "function" ? (fallback as () => T)() : fallback;
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // storage blocked: state simply lives as long as the page
    }
  }, [key, value]);
  return [value, setValue];
}

export function clearSessionState() {
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith(PREFIX))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // nothing stored
  }
}

// Coming back to a list lands where you left it instead of at the top.
// A null key (e.g. a detail view shown on the same route) just opens at the top.
export function useScrollMemory(key: string | null, ready = true) {
  useEffect(() => {
    if (!key) {
      window.scrollTo(0, 0);
      return;
    }
    if (!ready) return;
    let saved = 0;
    try {
      saved = Number(sessionStorage.getItem(`${PREFIX}scroll.${key}`) || 0);
    } catch {
      // nothing stored
    }
    const frame = saved > 0 ? requestAnimationFrame(() => window.scrollTo(0, saved)) : 0;
    return () => {
      cancelAnimationFrame(frame);
      try {
        sessionStorage.setItem(`${PREFIX}scroll.${key}`, String(window.scrollY));
      } catch {
        // storage blocked
      }
    };
  }, [key, ready]);
}
