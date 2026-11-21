// Match data: load everything once, then only what changed (owner's rule, Nov 2026 — data transfer).
// The server stamps every real change (`updated_at`, migration 20261206000000) and notes every delete
// (`match_gone`); `match_changes(since)` returns both in one call, stamped with the database's own clock (`at`).
// These helpers merge such an answer into what the device already holds — pure, so they are tested
// (matchSync.test.ts) and the app re-scores only when something really changed.
import type { BrandLink, ContentRow, IntelRow, Pitch, SeenBrand } from "./match.ts";

export type MatchRows = { links: BrandLink[]; intel: IntelRow[]; content: ContentRow[]; seen: SeenBrand[]; pitches: Pitch[] };
export type Gone = { tbl: string; key: string; at: string };
export type Changes = Partial<MatchRows> & { at: string; full: boolean; gone?: Gone[] };

/** Asked again from a little before the last answer: a write that was still saving when we asked is never missed. */
export const OVERLAP_MS = 2 * 60_000;
/** The server keeps delete notes 14 days; a copy older than this loads everything again. */
export const MAX_AGE_MS = 12 * 86_400_000;

export const sinceOf = (at: string) => new Date(Date.parse(at) - OVERLAP_MS).toISOString();
/** Can a copy stamped `at` still be brought up to date with changes only? */
export const fresh = (at: string | null | undefined, now = Date.now()) => !!at && Number.isFinite(Date.parse(at)) && now - Date.parse(at) < MAX_AGE_MS;

const TABLE: Record<keyof MatchRows, { tbl: string; key: (r: never) => string }> = {
  links: { tbl: "creator_brands", key: (r: BrandLink) => r.id },
  intel: { tbl: "brand_intel", key: (r: IntelRow) => r.brand_id },
  content: { tbl: "creator_content", key: (r: ContentRow) => r.creator_id },
  seen: { tbl: "seen_brands", key: (r: SeenBrand) => r.brand_key },
  pitches: { tbl: "brand_pitches", key: (r: Pitch) => r.id },
} as never;

const stampOf = (r: { updated_at?: string } | undefined) => (r?.updated_at ? Date.parse(r.updated_at) : NaN);

/** One table: newer rows replace older ones, a delete note removes a row it is not older than.
 *  Returns the SAME array when nothing changed (so nothing downstream recomputes). */
export function mergeTable<T extends { updated_at?: string }>(rows: T[], incoming: T[] | undefined, gone: Gone[], tbl: string, key: (r: T) => string): { rows: T[]; changed: number } {
  const drops = gone.filter((g) => g.tbl === tbl);
  if (!incoming?.length && !drops.length) return { rows, changed: 0 };
  const map = new Map(rows.map((r) => [key(r), r]));
  let changed = 0;
  for (const r of incoming || []) {
    const k = key(r);
    const have = map.get(k);
    const a = stampOf(have), b = stampOf(r);
    // Same stamp = the same version we already have (the overlap re-sends it): keep ours, no re-render.
    if (have && have.updated_at && have.updated_at === r.updated_at) continue;
    if (have && Number.isFinite(a) && Number.isFinite(b) && b < a) continue;
    map.set(k, r);
    changed++;
  }
  for (const g of drops) {
    const have = map.get(g.key);
    if (!have) continue;
    // Deleted, then made again (a found brand seen again): the newer row stays.
    if (Number.isFinite(stampOf(have)) && stampOf(have) > Date.parse(g.at)) continue;
    map.delete(g.key);
    changed++;
  }
  return changed ? { rows: [...map.values()], changed } : { rows, changed: 0 };
}

/** Everything in one answer; `changed` counts rows added, replaced or removed. */
export function applyChanges(state: MatchRows, ch: Changes): { state: MatchRows; changed: number; tables: (keyof MatchRows)[] } {
  const gone = (ch.gone || []).filter((g) => g && typeof g.key === "string" && typeof g.tbl === "string" && Number.isFinite(Date.parse(g.at)));
  const out = { ...state };
  let changed = 0;
  const tables: (keyof MatchRows)[] = [];
  for (const name of Object.keys(TABLE) as (keyof MatchRows)[]) {
    const t = TABLE[name] as unknown as { tbl: string; key: (r: { updated_at?: string }) => string };
    const r = mergeTable(state[name] as { updated_at?: string }[], ch[name] as { updated_at?: string }[] | undefined, gone, t.tbl, t.key);
    if (r.changed) { (out as Record<string, unknown>)[name] = r.rows; changed += r.changed; tables.push(name); }
  }
  return { state: changed ? out : state, changed, tables };
}
