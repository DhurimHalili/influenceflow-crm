// Run (from web/): node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/matchSync.test.ts
import { applyChanges, fresh, MAX_AGE_MS, mergeTable, sinceOf, type MatchRows } from "./matchSync.ts";

let fail = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` → got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

type R = { id: string; v: number; updated_at?: string };
const key = (r: R) => r.id;
const t = (m: number) => new Date(Date.UTC(2026, 10, 21, 10, m)).toISOString();
const base: R[] = [{ id: "a", v: 1, updated_at: t(0) }, { id: "b", v: 1, updated_at: t(1) }];

const same = mergeTable(base, [], [], "x", key);
check("nothing new → the same array (no re-score)", [same.rows === base, same.changed], [true, 0]);
const overlap = mergeTable(base, [{ id: "a", v: 1, updated_at: t(0) }], [], "x", key);
check("the overlap re-sends a row we have → ignored", [overlap.rows === base, overlap.changed], [true, 0]);
const newer = mergeTable(base, [{ id: "a", v: 2, updated_at: t(5) }, { id: "c", v: 1, updated_at: t(5) }], [], "x", key);
check("newer replaces, new is added", [newer.changed, newer.rows.find((r) => r.id === "a")?.v, newer.rows.length], [2, 2, 3]);
const older = mergeTable(base, [{ id: "b", v: 0, updated_at: t(0) }], [], "x", key);
check("an older copy never overwrites", [older.changed, older.rows.find((r) => r.id === "b")?.v], [0, 1]);
const del = mergeTable(base, [], [{ tbl: "x", key: "a", at: t(3) }, { tbl: "y", key: "b", at: t(3) }], "x", key);
check("a delete note removes the row (only for its own table)", [del.changed, del.rows.map((r) => r.id)], [1, ["b"]]);
const reborn = mergeTable(base, [{ id: "a", v: 3, updated_at: t(6) }], [{ tbl: "x", key: "a", at: t(4) }], "x", key);
check("deleted then made again → the new row stays", [reborn.rows.find((r) => r.id === "a")?.v], [3]);
const stale = mergeTable([{ id: "a", v: 1, updated_at: t(9) }], [], [{ tbl: "x", key: "a", at: t(4) }], "x", key);
check("a delete note older than our row doesn't remove it", stale.rows.length, 1);
const unstamped = mergeTable([{ id: "a", v: 1 }], [{ id: "a", v: 2, updated_at: t(1) }], [], "x", key);
check("a row without a stamp (optimistic) takes the server's", unstamped.rows[0].v, 2);

const world = { links: [], intel: [{ brand_id: "B", intel: null, status: "ok", researched_at: null, updated_at: t(0) }], content: [], seen: [{ brand_key: "acme", name: "Acme", domain: "", domain_check: "", site: null, checked_at: null, hidden: false, added_brand_id: null, updated_at: t(0) }], pitches: [] } as unknown as MatchRows;
const r1 = applyChanges(world, { at: t(10), full: false, links: [], intel: [], content: [], seen: [], pitches: [], gone: [] });
check("an empty answer keeps the whole state object", [r1.state === world, r1.changed, r1.tables], [true, 0, []]);
const r2 = applyChanges(world, { at: t(10), full: false, seen: [{ ...world.seen[0], hidden: true, updated_at: t(7) }], gone: [{ tbl: "brand_intel", key: "B", at: t(8) }] });
check("changes land per table; untouched tables keep their array", [r2.changed, r2.tables, r2.state.seen[0].hidden, r2.state.intel.length, r2.state.links === world.links], [2, ["intel", "seen"], true, 0, true]);
const r3 = applyChanges(world, { at: t(10), full: false, gone: [{ tbl: "seen_brands", key: "acme", at: "nonsense" }, null as never] });
check("malformed delete notes are ignored", r3.changed, 0);

check("asks again from 2 minutes before the last answer", sinceOf("2026-11-21T10:10:00.000Z"), "2026-11-21T10:08:00.000Z");
const now = Date.parse("2026-11-21T10:00:00Z");
check("a copy is fresh until the delete notes would be gone", [fresh(new Date(now - 3600_000).toISOString(), now), fresh(new Date(now - MAX_AGE_MS - 1).toISOString(), now), fresh("", now), fresh("garbage", now)], [true, false, false, false]);

if (fail) throw new Error(`${fail} failed`);
console.log("\nall match sync tests passed");
