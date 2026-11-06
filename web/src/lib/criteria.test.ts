// Run: cd web && node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/criteria.test.ts
import { DEFAULT_CRITERIA, judge, normalizeCriteria, short } from "./criteria.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};
const yt = (views: number, er: number, subs: number) => judge({ views, er, subs, youtube: true });

eq("fits: 164K views, 1.7%, 118K subs (+ plus)", [yt(164_000, 1.7, 118_000).level, yt(164_000, 1.7, 118_000).plus], ["fits", true]);
eq("fits: small channel is fine", [yt(60_000, 2, 5_000).level, yt(60_000, 2, 5_000).plus], ["fits", false]);
eq("exactly on the line fits", yt(50_000, 1, 50_000).level, "fits");
eq("slight: views fine, engagement under 1%", yt(80_000, 0.8, 200_000).level, "slight");
eq("hard: under 50K views", yt(32_000, 3, 90_000).level, "hard");
eq("hard beats over and slight", yt(20_000, 0.5, 3_000_000).level, "hard");
eq("over: past 1M subscribers", yt(400_000, 2, 1_400_000).level, "over");
eq("over beats slight", yt(400_000, 0.4, 1_400_000).level, "over");
eq("no numbers yet: not judged", yt(0, 0, 0).level, "none");
eq("not YouTube: not judged", judge({ views: 10, er: 0.1, subs: 1, youtube: false }).level, "none");
eq("checks off: not judged", judge({ views: 10, er: 0.1, subs: 1, youtube: true }, { ...DEFAULT_CRITERIA, on: false }).level, "none");
eq("max 0 = no maximum", judge({ views: 90_000, er: 2, subs: 9_000_000, youtube: true }, { ...DEFAULT_CRITERIA, max_subs: 0 }).level, "fits");
eq("hard says how far under", yt(25_000, 2, 10_000).why.startsWith("25K avg views is 50% under your 50K floor"), true);
eq("normalize: defaults", normalizeCriteria(undefined), DEFAULT_CRITERIA);
eq("normalize: junk and negatives", normalizeCriteria({ min_views: -5, min_er: "x", pref_subs: "20000", max_subs: 0, on: false }), { on: false, min_views: 0, min_er: 1, pref_subs: 20000, max_subs: 0 });
eq("short numbers", [short(50_000), short(1_000_000), short(1_450_000), short(163_500), short(950)], ["50K", "1M", "1.5M", "163.5K", "950"]);

if (fail) { console.log(`${fail} failed`); (globalThis as { process?: { exit(n: number): void } }).process?.exit(1); } else console.log("all criteria tests pass");
