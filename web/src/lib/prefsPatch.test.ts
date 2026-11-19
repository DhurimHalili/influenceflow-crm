// Run: cd web && node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/prefsPatch.test.ts
import { preferencesPatch } from "./prefsPatch.ts";
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
// The bug: tab A (old copy, no templates) turns Autopilot on — it must not send its whole stale copy.
const cloudBefore = { goal: 40, autopilot: { fill: false } };
const tabA = { goal: 40, autopilot: { fill: true } };
eq("only the changed key goes", preferencesPatch(tabA, cloudBefore), { patch: { autopilot: { fill: true } }, drop: [], stale: false });
eq("nothing changed → nothing", preferencesPatch(cloudBefore, cloudBefore), { patch: {}, drop: [], stale: false });
eq("a copy missing a key its base had writes NOTHING (blank / stale copy)", preferencesPatch({ goal: 40 }, { goal: 40, notices: { a: 1 } }), { patch: {}, drop: [], stale: true });
eq("Granit's case: defaults over real settings → nothing written", preferencesPatch({ timezone: "Europe/Budapest", goal: 50 }, { timezone: "Europe/Belgrade", goal: 40, followup_templates: { 1: [1] }, autopilot: { fill: false } }), { patch: {}, drop: [], stale: true });
eq("a new key is added", preferencesPatch({ goal: 40, templates: [1] }, { goal: 40 }), { patch: { templates: [1] }, drop: [], stale: false });
eq("deep change in a nested object", preferencesPatch({ t: { 1: ["a", "b"] } }, { t: { 1: ["a"] } }), { patch: { t: { 1: ["a", "b"] } }, drop: [], stale: false });
eq("a key another tab added (not in my base) is never dropped", preferencesPatch({ goal: 40 }, { goal: 40 }).drop, []);
if (fail) { console.log(`${fail} failed`); process.exit(1); }
console.log("all prefs patch tests passed");
