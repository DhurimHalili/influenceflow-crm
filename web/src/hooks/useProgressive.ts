import { startTransition, useEffect, useState } from "react";

/**
 * Long lists render their first rows at once and the rest in small chunks right after, so
 * opening a page with hundreds of records never freezes the screen. Typing and clicks stay
 * responsive (chunks are low-priority transitions). Returns the rows to draw and whether all are in.
 */
export function useProgressive<T>(items: T[], first = 40): [T[], boolean] {
  const [count, setCount] = useState(first);
  const done = count >= items.length;
  useEffect(() => {
    if (done) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    // Each step draws three times as many rows (40 → 120 → 360 → …): a few quick renders, not dozens.
    const grow = () => startTransition(() => setCount((c) => c * 3));
    if (w.requestIdleCallback) { const id = w.requestIdleCallback(grow, { timeout: 60 }); return () => w.cancelIdleCallback?.(id); }
    const t = window.setTimeout(grow, 16);
    return () => window.clearTimeout(t);
  }, [count, done]);
  return [done ? items : items.slice(0, count), done];
}
