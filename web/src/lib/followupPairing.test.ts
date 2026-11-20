// Run: cd web && node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/followupPairing.test.ts
import { answerKind, clashWhy, lastQuestion, pairFit, questionKind, templateGaps } from "./followupPairing.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};

// The owner's real templates.
const THIRD = ["Is this a bad time?", "Would this be a bad time?", "Maybe its a bad time?", "Is this bad timing?", "Not the best time?", "Should I check back later?", "Not the right time?", "Should I come back later?", "Should I get back later?", "Is that a bad time?"];
eq("3rd questions", THIRD.map(questionKind), ["is_bad", "is_bad", "is_bad", "is_bad", "not_good", "later", "not_good", "later", "later", "is_bad"]);
const FOURTH = ["I guess it might, i'll come back another time.", "Maybe it is, i'll come back another day.", "I guess its not, i'll come back another time.", "I guess i will, i'll come back another time.", "Looks like it's not. I'll come back another time.", "Seems like it's not. I'll reach out another day.", "Seems like it might be. I'll reach out another day.", "No worries. I'll check back another day.", "Looks like it is. We'll come back another time.", "It might be. We'll be back another day.", "Don't worry. We'll come back another day."];
eq("4th answers", FOURTH.map(answerKind), ["yes_bad", "yes_bad", "no_good", "will", "no_good", "no_good", "yes_bad", "neutral", "yes_bad", "yes_bad", "neutral"]);

// The screenshot: "Should I check back later?" → "Seems like it might be." must never go.
eq("the bug: later → 'Seems like it might be' is never sent", pairFit(questionKind("Should I check back later?"), answerKind("Seems like it might be. I'll reach out another day.")), 0);
eq("later → 'I guess i will' fits exactly", pairFit("later", answerKind("I guess i will, i'll come back another time.")), 1);
eq("later → 'No worries' is fine", pairFit("later", answerKind("No worries. I'll check back another day.")) > 0, true);
eq("bad time → 'Looks like it's not' never (contradicts)", pairFit("is_bad", answerKind("Looks like it's not. I'll come back another time.")), 0);
eq("not the best time → 'Maybe it is' never", pairFit("not_good", answerKind("Maybe it is, i'll come back another day.")), 0);
eq("not the best time → 'Looks like it's not' exactly", pairFit("not_good", answerKind("Looks like it's not. I'll come back another time.")), 1);
eq("are you here? → 'I guess you aren't' exactly", pairFit(questionKind("Are you here?"), answerKind("I guess you aren't around. I'll come back another time.")), 1);
eq("a 2nd after 'interested?' is a normal follow-up", pairFit(questionKind("Would you be interested in this brand partnership opportunity?"), answerKind("We are close to finalizing the influencer list. Wouldn't want you missing out.")) > 0.7, true);
eq("a question isn't an answer", answerKind("Is this a bad time?"), "fresh");
eq("greeting skipped", answerKind("Hi {first_name},\n\nLooks like it is. I'll come back another time."), "yes_bad");

// Gmail's preview carries the quoted thread: only YOUR new words count.
eq("quoted thread cut from a preview", lastQuestion("Should I check back later? On Tue, Nov 17, 2026 at 7:59 AM Dhurim Halili <d@x.com> wrote: Is this a bad time? Would you be interested?"), "Should I check back later?");
eq("quoted lines cut from a body", questionKind("Should I come back later?\n\nOn Mon, Nov 9, 2026 at 8:00 AM Dhurim wrote:\n> Is this a bad time?"), "later");

eq("why, in words", clashWhy("Should I check back later?", "Seems like it might be. I'll reach out another day."), "It says it is a bad time, but your last email asked “Should I check back later?”");

// Gaps: the member's 4ths have no "I guess we will" and no "it's not" — marked; the owner's are complete.
const owner = { 3: ["Is this a bad time?", "Not the best time?", "Should I check back later?"].map((text) => ({ text })), 4: FOURTH.slice(0, 8).map((text) => ({ text })) };
eq("owner: every 3rd has a direct 4th", templateGaps(owner).filter((g) => !g.direct).map((g) => g.question), []);
const member = { 3: ["Is this a bad time?", "Not the right time?", "Should I come back later?"].map((text) => ({ text })), 4: ["Looks like it is. We'll come back another time.", "No worries. We'll check back another day."].map((text) => ({ text })) };
eq("member: two 3rds without a direct answer (still followable by 'No worries')", templateGaps(member).filter((g) => !g.direct).map((g) => [g.question, g.any]), [["Not the right time?", true], ["Should I come back later?", true]]);
const none = { 3: [{ text: "Are you here?" }], 4: [{ text: "Seems like it might be. I'll reach out another day." }] };
eq("no 4th can follow 'Are you here?' → blocks", templateGaps(none).map((g) => [g.kind, g.any]), [["present", false]]);

eq("a 3rd that asks nothing, before 4ths that only answer questions → a gap", templateGaps({ 3: [{ text: "Wouldn't want you missing out." }], 4: [{ text: "Seems like it is. I'll come back another time." }] }).map((g) => [g.kind, g.any, g.question]), [["statement", false, "Wouldn't want you missing out."]]);
eq("…not when a 4th works on its own", templateGaps({ 3: [{ text: "Wouldn't want you missing out." }], 4: [{ text: "No worries. I'll come back another time." }] }).filter((g) => !g.direct).length, 0);
if (fail) { console.log(`${fail} failed`); (globalThis as { process?: { exit(n: number): void } }).process?.exit(1); } else console.log("all follow-up pairing tests pass");
