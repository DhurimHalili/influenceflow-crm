// Does the next follow-up make sense after the last one? (owner's rule, Nov 2026: "Should I check back later?"
// was followed by "Seems like it might be. I'll reach out another day." — it might be WHAT?)
//
// Every email your follow-up answers is read for the KIND of question it ended on, and every template for the
// KIND of answer it opens with. A template that answers a different question is never sent — not by the rules,
// not by an AI's opinion. When none of a follow-up's templates can answer someone's last question, Autopilot
// holds that person and says why, and Settings marks the missing answer in red with ready-made ones.
// Shared by the app and gmail-sync (explicit `.ts` imports only).

/** What your last email asked. */
export type QuestionKind =
  | "is_bad"      // "Is this a bad time?" / "Maybe it's a bad time?" / "Are you busy?" — yes = bad timing
  | "not_good"    // "Not the best time?" / "Not the right time?" — asked the negative way
  | "later"       // "Should I check back later?" / "Should I come back later?"
  | "present"     // "Are you still there?" / "Are you here?"
  | "interested"  // "Are you interested?" / "Would this be something for you?"
  | "other"       // a question the rules can't place
  | "statement";  // no question at all ("Wouldn't want you missing out.")

/** How a template opens. */
export type AnswerKind =
  | "yes_bad"     // "Seems like it might be." / "Maybe it is." / "I guess it might."
  | "no_good"     // "Looks like it's not." / "I guess its not."
  | "will"        // "I guess I will." / "I'll take that as a yes."
  | "absent"      // "I guess you're not around." / "Seems like you're busy."
  | "not_now"     // "I guess not right now." / "Guess not."
  | "neutral"     // "No worries." / "Don't worry." — reads fine after any question
  | "fresh";      // not an answer at all: a new line of its own ("We are close to finalizing…")

const flat = (s: string) => s.toLowerCase().replace(/[’‘`´]/g, "'").replace(/\s+/g, " ").trim();
const DAYS = "(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*";

/** The words you wrote in that email: no quoted thread ("On Tue, Nov 17 … wrote:"), no signature. */
export function ownWords(text: string): string {
  let t = String(text || "").replace(/\r\n?/g, "\n");
  const lines: string[] = [];
  for (const l of t.split("\n")) {
    if (/^\s*>/.test(l) || /^\s*On .{4,160}wrote:?\s*$/i.test(l) || /^-{2,}\s*(original|forwarded) message/i.test(l) || /^--\s*$/.test(l)) break;
    lines.push(l);
  }
  t = lines.join("\n");
  // Gmail's one-line preview ("Should I check back later? On Tue, Nov 17, 2026 at 7:59 AM Dhurim … wrote:").
  const cut = t.search(new RegExp(`\\bOn (?:${DAYS},? )?(?:\\d{1,2} )?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.? \\d{1,2}|\\bOn \\d{1,2}[./]\\d{1,2}[./]\\d{2,4}|\\bOn ${DAYS},`, "i"));
  if (cut > 0) t = t.slice(0, cut);
  return t.trim();
}

/** The question your email ended on (the one a reply would answer), or "" when it asked nothing. */
export function lastQuestion(text: string): string {
  const own = ownWords(text);
  const sentences = own.replace(/\n+/g, " \n ").split(/(?<=[?!.])\s+|\n/).map((s) => s.trim()).filter(Boolean);
  const qs = sentences.filter((s) => /\?\s*$/.test(s));
  return qs.length ? qs[qs.length - 1] : "";
}

export function questionKind(text: string): QuestionKind {
  const q0 = lastQuestion(text);
  if (!q0) return "statement";
  const q = ` ${flat(q0).replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ")} `;
  // Asked the negative way first: "Not the best time?" is answered "it's not", never "it is".
  if (/ (not|n't|isn't|wasn't) (the |a |really )?(best|right|good|great|ideal|perfect) (time|moment|timing) /.test(q) || /^ not (a |the )?(good|right|best) /.test(q)) return "not_good";
  if (/ (bad|wrong|busy|hectic|crazy|tough|difficult) (time|timing|moment|week|period|season) /.test(q) || / (are|r) (you|u) (busy|swamped|slammed) /.test(q) || / too busy /.test(q) || / bad timing /.test(q)) return "is_bad";
  if (/ (should|shall|can|could|may) (i|we) (check|come|get|reach|circle|follow) (back|out|up)? ?(with you )?(later|another time|another day|some other time|in a few|next) /.test(q)
    || / (should|shall) (i|we) (check|come|get|reach|circle) back /.test(q)
    || / (want|like) (me|us) to (check|come|get|reach|circle) back /.test(q)
    || / (better|best) (if|to) (i |we )?(check|come|get|reach) back /.test(q)
    || / (try|ask) again later /.test(q)) return "later";
  if (/ (are|r) (you|u) (still )?(there|here|around|alive|receiving) /.test(q) || /^ (still )?(there|here|around) /.test(q) || / anyone (there|home) /.test(q) || / did (you|u) (get|see|receive) (this|my|our|it) /.test(q)) return "present";
  if (/ interest(ed|ing)? /.test(q) || / something (you'?d|you would|you could) /.test(q) || / (a )?(good )?fit (for you)? /.test(q) || / (open|up) (to|for) /.test(q) || / consider /.test(q) || / for you /.test(q)) return "interested";
  return "other";
}

/** The opening sentence of a template, ready to judge. */
function opener(template: string): string {
  const own = ownWords(template).split("\n").map((l) => l.trim()).filter(Boolean);
  // Skip a greeting line ("Hi {first_name},").
  if (own.length > 1 && /^(hi|hey|hello|dear|yo|good (morning|afternoon|evening))\b[^.!?]{0,40}[,!.]?$/i.test(own[0])) own.shift();
  const first = (own.join(" ").match(/^[^.!?]*[.!?]?/) || [""])[0];
  return flat(first.replace(/^(hi|hey|hello)\s+\{?[a-z_ ]+\}?\s*[,!]\s*/i, ""));
}

export function answerKind(template: string): AnswerKind {
  const o = opener(template);
  if (!o || /\?\s*$/.test(o)) return "fresh"; // a question isn't an answer
  const s = ` ${o.replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ")} `;
  if (/^ (no worries|don'?t worry|no problem|no rush|no pressure|all good|totally fine|that'?s (ok|okay|fine|alright)|understood|got it|fair enough|ok(ay)?|alright|all right) /.test(s)) return "neutral";
  if (/^ (i )?(guess|take it|suppose) (you'?re|you are|you aren'?t|you are not|you'?re not) /.test(s) || /^ (looks|seems|sounds) like you'?re (busy|away|not|swamped|out) /.test(s) || /^ (looks|seems) like you are (busy|away|not) /.test(s)) return "absent";
  if (/^ (i )?(guess|will|i'?ll|we'?ll) (i|we) (will|shall|can) /.test(s) || /^ (i )?guess (i|we) (will|shall|can|should) /.test(s) || /^ (i'?ll|we'?ll|i will|we will) take (that|it) as a yes /.test(s) || /^ will do /.test(s) || /^ (sounds|looks|seems) like a (yes|later) /.test(s)) return "will";
  if (/^ (i )?guess not right now /.test(s) || /^ (looks|seems) like (it'?s |its )?not for you /.test(s) || /^ not (for )?(right )?now /.test(s) || /^ (i )?guess (it'?s |its )?not for you /.test(s)) return "not_now";
  if (/ (it'?s|its|it is|this is|that'?s) not /.test(s) || / (isn'?t|wasn'?t) /.test(s) || /^ (i )?guess not /.test(s)) return "no_good";
  if (/^ (i )?(guess|think|suppose) it (might|may|is|could) /.test(s) || /^ (maybe|perhaps|probably) it (is|might|may) /.test(s) || /^ (looks|seems|sounds) like it (is|might|may|could) /.test(s) || /^ it (might|may|could) (be|well) /.test(s) || /^ it (is|does) /.test(s) || /^ (looks|seems) like (it )?(a )?(busy|bad) /.test(s)) return "yes_bad";
  return "fresh";
}

/**
 * 0 = never (it answers a different question), 1 = answers it exactly. Neutral openers ("No worries.") read fine
 * after any question; a fresh line is fine after a statement and acceptable, not ideal, after a question.
 */
const FIT: Record<QuestionKind, Partial<Record<AnswerKind, number>>> = {
  is_bad: { yes_bad: 1, neutral: 0.75, fresh: 0.5 },
  not_good: { no_good: 1, neutral: 0.75, fresh: 0.5 },
  later: { will: 1, neutral: 0.8, fresh: 0.5 },
  present: { absent: 1, not_now: 0.8, neutral: 0.65, fresh: 0.5 },
  interested: { not_now: 1, absent: 0.6, neutral: 0.8, fresh: 0.8 },
  other: { neutral: 0.75, fresh: 0.6 },
  statement: { fresh: 1, neutral: 0.7 },
};
export const pairFit = (q: QuestionKind, a: AnswerKind) => FIT[q][a] ?? 0;
/** The answer that fits a question exactly. */
export const DIRECT: Record<QuestionKind, AnswerKind> = { is_bad: "yes_bad", not_good: "no_good", later: "will", present: "absent", interested: "not_now", other: "neutral", statement: "fresh" };

/** For people and warnings: "asks if it's a bad time". */
export const ASKS: Record<QuestionKind, string> = {
  is_bad: "asks if it's a bad time", not_good: "asks if it's not the right time", later: "asks if you should check back later",
  present: "asks if they're still there", interested: "asks if they're interested", other: "asks something the CRM can't place", statement: "doesn't ask anything",
};
export const ANSWERS: Record<AnswerKind, string> = {
  yes_bad: "says it is a bad time", no_good: "says it's not the right time", will: "says you'll check back", absent: "says they're not around",
  not_now: "says not right now", neutral: "says no worries", fresh: "starts something new",
};

/** Why a template can't follow that email, in plain words (for the profile sheet and the plan). */
export function clashWhy(previous: string, template: string): string {
  const q = questionKind(previous), a = answerKind(template);
  if (pairFit(q, a) > 0) return "";
  const asked = lastQuestion(previous);
  return `It ${ANSWERS[a]}, but your last email ${asked ? `asked “${asked.length > 60 ? `${asked.slice(0, 58)}…` : asked}”` : "didn't ask that"}`;
}

export type Gap = { round: number; question: string; kind: QuestionKind; direct: boolean; any: boolean; answers: string[] };

/**
 * For each question your follow-ups ask, can the NEXT follow-up answer it? `direct` = one of them answers it
 * exactly; `any` = at least one can follow it (a neutral "No worries." counts). No `any` = Autopilot has to hold
 * everyone who got that question.
 */
export function templateGaps(book: Record<number, { text: string }[]>): Gap[] {
  const out: Gap[] = [];
  for (const r of [1, 2, 3]) {
    const next = book[r + 1] || [];
    if (!next.length) continue;
    const seen = new Set<string>();
    for (const t of book[r] || []) {
      const kind = questionKind(t.text);
      // A follow-up that asks nothing is shown by its own words.
      const question = kind === "statement" ? ownWords(t.text).replace(/\s+/g, " ").slice(0, 90) : lastQuestion(t.text);
      const key = `${kind}|${question.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const fits = next.map((n) => pairFit(kind, answerKind(n.text)));
      // Yes/no questions need a real answer; an open one ("Interested?") is followed fine by a fresh line.
      const direct = kind === "statement" ? fits.some((f) => f > 0) : kind === "other" || kind === "interested" ? fits.some((f) => f >= 0.6) : fits.some((f) => f >= 1);
      out.push({ round: r + 1, question, kind, direct, any: fits.some((f) => f > 0), answers: [] });
    }
  }
  return out;
}
