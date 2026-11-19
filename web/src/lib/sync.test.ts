// Run: cd web && node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/sync.test.ts
// The rule after 19 Nov 2026: a record is only ever deleted in the cloud when it was deleted ON PURPOSE here.
import { changedRows, mergeWorkspace, removedIds } from "./sync.ts";
import { blankWorkspace } from "./seed.ts";
import type { WorkspaceData } from "../types";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};

const rec = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, ...extra });
const ws = (creators: ReturnType<typeof rec>[], brands: ReturnType<typeof rec>[] = []): WorkspaceData =>
  ({ ...blankWorkspace("u1"), creators, brands } as unknown as WorkspaceData);

const base = ws([rec("a"), rec("b"), rec("c")], [rec("x"), rec("y")]);

// 1. Granit's case: this device's saved copy came back empty, the base was full.
const empty = ws([], []);
eq("an empty copy deletes nothing", [removedIds(empty.creators, base.creators), removedIds(empty.brands, base.brands)], [[], []]);
eq("…not even with an unrelated delete on record", removedIds(empty.creators, base.creators, ["zzz"]), []);
const healed = mergeWorkspace(empty, base, base, () => true, 500, {});
eq("…and the merge keeps the cloud's records", [healed.creators.map((c) => c.id), healed.brands.map((b) => b.id)], [["a", "b", "c"], ["x", "y"]]);

// 2. A delete the person made on purpose still reaches the cloud.
const deletedB = ws([rec("a"), rec("c")], [rec("x"), rec("y")]);
eq("deleted on purpose → deleted in the cloud", removedIds(deletedB.creators, base.creators, ["b"]), ["b"]);
eq("…and the merge keeps it deleted", mergeWorkspace(deletedB, base, base, () => true, 500, { creators: ["b"] }).creators.map((c) => c.id).sort(), ["a", "c"]);

// 3. An older copy (missing a record added on another device) neither deletes nor hides it.
const older = ws([rec("a"), rec("b")], [rec("x"), rec("y")]);
eq("older copy: nothing deleted", removedIds(older.creators, base.creators), []);
eq("older copy: the newer record comes back from the cloud", mergeWorkspace(older, base, base, () => true, 500).creators.map((c) => c.id).sort(), ["a", "b", "c"]);

// 4. Edits still win record by record; deleted elsewhere still goes away.
const edited = ws([rec("a", { name: "A (mine)" }), rec("b"), rec("c")], [rec("x"), rec("y")]);
const cloudNoC = ws([rec("a"), rec("b")], [rec("x"), rec("y")]);
const m = mergeWorkspace(edited, base, cloudNoC, () => true, 500);
eq("my edit wins over an untouched cloud copy", m.creators.find((c) => c.id === "a")?.name, "A (mine)");
eq("deleted on another device (not edited here) goes away", m.creators.map((c) => c.id).sort(), ["a", "b"]);
eq("only changed rows are written", changedRows(edited.creators, base.creators).map((c) => c.id), ["a"]);

// 5. No base: the cloud wins, nothing is deleted.
eq("no base → no deletes", removedIds(empty.creators, null, ["a"]), []);

// 6. A blank / stale profile (missing settings its base had) never beats the cloud's — Granit's templates case.
{
  const withPrefs = (prefs: Record<string, unknown>) => ({ ...base, profile: { ...base.profile, preferences: prefs } } as unknown as WorkspaceData);
  const baseP = withPrefs({ timezone: "Europe/Belgrade", followup_templates: { 1: ["a"] } });
  const blank = withPrefs({ timezone: "Europe/Budapest" });
  const cloudP = withPrefs({ timezone: "Europe/Belgrade", followup_templates: { 1: ["a"] }, autopilot: { fill: true } });
  eq("stale local profile → the cloud's settings", (mergeWorkspace(blank, baseP, cloudP, () => true, 500).profile.preferences as unknown as Record<string, unknown>).followup_templates, { 1: ["a"] });
  const edited = withPrefs({ timezone: "Europe/Paris", followup_templates: { 1: ["a"] } });
  eq("a real local edit still wins", (mergeWorkspace(edited, baseP, cloudP, () => true, 500).profile.preferences as unknown as Record<string, unknown>).timezone, "Europe/Paris");
}

if (fail) { console.error(`\n${fail} failed`); process.exit(1); }
console.log("\nall sync tests passed");
