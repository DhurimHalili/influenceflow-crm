// Run: cd web && node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/templateSuggest.test.ts
import { answersTo, applyStyle, bodyOf, claimProblem, styleOf, suggestTemplates, tooSimilar } from "./templateSuggest.ts";
import type { TemplateBook } from "./autopilot.ts";
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
const t = (text: string, i = 0) => ({ id: `t${i}${text.length}`, name: "x", text });
const book = (b: Partial<Record<1 | 2 | 3 | 4, string[]>>): TemplateBook => ({ 1: (b[1] || []).map(t), 2: (b[2] || []).map(t), 3: (b[3] || []).map(t), 4: (b[4] || []).map(t) });

// Dhurim's real style: short lines, no greeting, no sign-off.
const mine = book({ 3: ["Not the best time?", "Maybe its a bad time?"], 4: ["maybe it is ill come back another day", "I guess it might be ill come back another time"] });
const s = styleOf(mine);
eq("no greeting / no sign-off when yours have none", [s.greeting, s.signoff, s.oneLine], [null, null, true]);
const four = suggestTemplates(4, mine, 4);
eq("4th answers each 3rd (negation kept right)", four.slice(0, 2).map((x) => x.text), ["Looks like it's not — I'll come back another time.", "Looks like it is — I'll come back another time."]);
eq("…no 'Hi' or 'Kind regards' added", four.every((x) => !/^hi\b|regards/i.test(x.text)), true);
eq("…and says which 3rd it answers", four[0].why, "Answers your 3rd: “Not the best time?”");

// Someone who writes "Hi {first_name}," … "Best,\n{my_name}" gets the same frame.
const formal = book({ 1: ["Hi {first_name},\n\nWould you be open to it?\n\nBest,\n{my_name}"], 2: ["Hi {first_name},\n\nJust checking in.\n\nBest,\n{my_name}"] });
eq("greeting + sign-off copied from yours", [styleOf(formal).greeting, styleOf(formal).signoff], ["Hi {first_name},", "Best,\n{my_name}"]);
eq("body without the frame", bodyOf("Hi {first_name},\n\nJust checking in.\n\nBest,\n{my_name}"), "Just checking in.");
eq("frame applied", applyStyle("Any thoughts on this?", styleOf(formal)), "Hi {first_name},\n\nAny thoughts on this?\n\nBest,\n{my_name}");

// Never lie.
eq("a deadline you never used is refused", claimProblem("We close the list tomorrow.", mine), "a date");
eq("'brands are ready' is refused", claimProblem("We have brands ready for you.", mine), "brands ready");
eq("a number is refused", claimProblem("It pays $2,000.", mine), "a number");
eq("…unless your own templates say it", claimProblem("Wrapping up the list this week.", book({ 2: ["We wrap up this week."] })), null);
eq("plain words are fine", claimProblem("Looks like it's not — I'll come back another time.", mine), null);

eq("similar wording is caught", tooSimilar("Is this a bad time?", "Hi {first_name},\n\nIs this a bad time?"), true);
eq("different wording passes", tooSimilar("Is this a bad time?", "Any thoughts on this?"), false);
eq("never suggests what you already have", suggestTemplates(3, book({ 3: ["Is this a bad time?"] })).some((x) => /bad time/i.test(x.text)), false);
eq("answers: busy → is", answersTo("Too busy right now?")[0], "Looks like it is — I'll come back another time.");
eq("empty book → a gentle default frame", styleOf(book({})).greeting, "Hi {first_name},");
if (fail) { console.log(`${fail} failed`); process.exit(1); }
console.log("all template suggestion tests passed");
