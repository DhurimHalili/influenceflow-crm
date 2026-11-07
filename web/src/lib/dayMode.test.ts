// Run: cd web && node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/dayMode.test.ts
import { BRIEF_LINES, dayWord, DEFAULT_WEEKEND, followupsResume, foundToday, modeOn, normalizeWeekend, pickLine, sendingResumes } from "./dayMode.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};
const sat = new Date(2026, 10, 7, 10), sun = new Date(2026, 10, 8, 10), mon = new Date(2026, 10, 9, 10), fri = new Date(2026, 10, 6, 10);
eq("default: Saturday light, Sunday scout, weekdays normal", [modeOn(sat), modeOn(sun), modeOn(mon), modeOn(fri)], ["light", "scout", "normal", "normal"]);
eq("follow-ups come back Monday (from Sat and Sun)", [followupsResume(sat, DEFAULT_WEEKEND).getDay(), followupsResume(sun, DEFAULT_WEEKEND).getDay()], [1, 1]);
eq("Sunday replies wait for Monday; Saturday ones could go Sat", [sendingResumes(sun, DEFAULT_WEEKEND).getDay()], [1]);
eq("day words", [dayWord(followupsResume(sun, DEFAULT_WEEKEND), sun), dayWord(followupsResume(sat, DEFAULT_WEEKEND), sat)], ["tomorrow", "Monday"]);
const allNormal = normalizeWeekend({ saturday: "normal", sunday: "normal" });
eq("both normal = no special days", [modeOn(sat, allNormal), modeOn(sun, allNormal)], ["normal", "normal"]);
eq("Saturday as scout day works too", modeOn(sat, normalizeWeekend({ saturday: "scout" })), "scout");
eq("bad values fall back, goal bounded", normalizeWeekend({ saturday: "party", scout_goal: 0, reminders: false }), { saturday: "light", sunday: "scout", scout_goal: 10, reminders: false });
eq("scouting counts today's adds, not archived ones", foundToday([{ created_at: new Date(2026, 10, 8, 9).toISOString() }, { created_at: new Date(2026, 10, 8, 23).toISOString(), archived_at: "x" }, { created_at: new Date(2026, 10, 7, 23).toISOString() }], sun), 1);
eq("every line is picked", new Set(Array.from({ length: 70 }, (_, i) => pickLine("scout", i / 70).title)).size, BRIEF_LINES.scout.length);
const banned = /\b(bless|holy|pray|church|god|sabbath|amen|face|smile|cat|dog|bird|lion|bear|damn|hell)\b/i;
eq("no faces, animals, religious words or rough slang", [...BRIEF_LINES.light, ...BRIEF_LINES.scout].filter((l) => banned.test(`${l.title} ${l.line}`)).map((l) => l.title), []);
const untrue = /\b(nap|naps|napping|sleep|sleeping|asleep|coffee|resting|vacation|holiday|break)\b/i;
eq("no line pretends follow-ups or the inbox are sleeping or on a break", [...BRIEF_LINES.light, ...BRIEF_LINES.scout].filter((l) => untrue.test(`${l.title} ${l.line}`)).map((l) => l.title), []);
eq("the day is filled in", pickLine("light", 4 / 7 + 0.01, "tomorrow").title, "Tomorrow-you will chase. Today-you discovers.");
eq("no placeholder left", [...Array(7).keys()].flatMap((i) => [pickLine("light", i / 7 + 0.01, "Monday"), pickLine("scout", i / 7 + 0.01, "Monday")]).filter((l) => /[{}]/.test(l.title + l.line)).length, 0);
if (fail) { console.log(`${fail} failed`); (globalThis as { process?: { exit(n: number): void } }).process?.exit(1); } else console.log("all day mode tests pass");
