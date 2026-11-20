import { ROUNDS, type Round, type TemplateBook } from "./autopilot.ts";
import { answerKind, lastQuestion, pairFit, questionKind, templateGaps, type QuestionKind } from "./followupPairing.ts";

// Suggested follow-ups, written the way YOU write them (greeting or not, sign-off or not, one line or more),
// that fit where they go: a 4th that answers your 3rd ("Not the best time?" → "Looks like it's not. I'll come
// back another time." / "Should I check back later?" → "I guess I will. I'll reach out another day."), a 1st that
// asks differently from a first email. Plain words like a person types them: no dashes, no bold, no "I hope this
// email finds you well". Never a claim you didn't make: no
// deadlines, numbers, "brands are ready", "last chance" — unless your own templates already say it.
// Shared with the server, which uses the same checks on what the AI suggests.

export type Style = { greeting: string | null; signoff: string | null; oneLine: boolean };
/** important = your templates have no answer for one of your own questions — add it (Autopilot holds people otherwise). */
export type Suggestion = { text: string; why: string; by: "rules" | "ai"; important?: boolean };

const GREETING = /^(hi|hey|hello|dear|yo|good (morning|afternoon|evening))\b[^\n]{0,40}$/i;
const SIGNOFF = /^(best|thanks|thank you|many thanks|cheers|kind regards|regards|best regards|warm regards|talk soon|all the best|speak soon|have a (great|good) (day|week))\b[^\n]{0,30}$/i;

const lines = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);
const mostCommon = (xs: string[]) => { const m = new Map<string, number>(); for (const x of xs) m.set(x, (m.get(x) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null; };
const allTexts = (book: TemplateBook) => ROUNDS.flatMap((r) => book[r].map((t) => t.text.trim())).filter(Boolean);

/** How you write: a greeting / sign-off only when most of your templates have one (the most common one is used). */
export function styleOf(book: TemplateBook): Style {
  const texts = allTexts(book);
  if (!texts.length) return { greeting: "Hi {first_name},", signoff: null, oneLine: false };
  const greets = texts.map((t) => { const l = lines(t); return l.length > 1 && GREETING.test(l[0]) ? l[0] : null; });
  const signs = texts.map((t) => {
    const l = lines(t);
    if (l.length < 2) return null;
    const last = l[l.length - 1], prev = l[l.length - 2];
    if (SIGNOFF.test(last)) return last;
    if (l.length > 2 && SIGNOFF.test(prev) && last.length <= 40) return `${prev}\n${last}`;
    return null;
  });
  const g = greets.filter(Boolean) as string[], s = signs.filter(Boolean) as string[];
  const bodies = texts.map((t) => bodyOf(t));
  return {
    greeting: g.length * 2 >= texts.length ? mostCommon(g) : null,
    signoff: s.length * 2 >= texts.length ? mostCommon(s) : null,
    oneLine: bodies.filter((b) => !b.includes("\n")).length * 2 >= bodies.length,
  };
}

/** The words between any greeting and sign-off. */
export function bodyOf(text: string): string {
  const l = lines(text);
  if (l.length > 1 && GREETING.test(l[0])) l.shift();
  if (l.length > 1 && SIGNOFF.test(l[l.length - 1])) l.pop();
  else if (l.length > 2 && SIGNOFF.test(l[l.length - 2]) && l[l.length - 1].length <= 40) l.splice(-2, 2);
  return l.join("\n");
}

export const applyStyle = (body: string, s: Style) => [s.greeting, body.trim(), s.signoff].filter(Boolean).join("\n\n");

const words = (t: string) => new Set(t.toLowerCase().replace(/\{[a-z_]+\}/g, " ").split(/[^a-z']+/).filter((w) => w.length > 1));
/** Same words AND the same kind of answer ("Looks like it is." vs "Looks like it's not." are different ideas). */
export const sameIdea = (a: string, b: string, limit = 0.6) => tooSimilar(a, b, limit) && answerKind(a) === answerKind(b);
export function tooSimilar(a: string, b: string, limit = 0.6) {
  const A = words(bodyOf(a)), B = words(bodyOf(b));
  if (!A.size || !B.size) return false;
  let both = 0; for (const w of A) if (B.has(w)) both++;
  return both / (A.size + B.size - both) >= limit;
}

// Claims a follow-up must never invent. Allowed only when your own templates already use the same word.
const CLAIMS: [RegExp, string][] = [
  [/\b(tomorrow|tonight|today|this (week|month|friday|monday)|next (week|month)|end of (the )?(day|week|month)|by (monday|tuesday|wednesday|thursday|friday|eod|eow))\b/i, "a date"],
  [/\b(deadline|last chance|final (call|chance|notice)|closing|closes|close (the|our) (list|roster|spots?)|limited|only \d|spots? (left|remaining)|filling (up|fast))\b/i, "a deadline"],
  [/\b(brands?|clients?|partners?|campaigns?)\b[^.\n]{0,25}\b(ready|waiting|lined up|on board|interested|asking for you)\b/i, "brands ready"],
  [/\b(guarantee[ds]?|promise[ds]?|exclusive|we('| ha)ve (a |an )?(offer|budget|deal) (ready|for you))\b/i, "a promise"],
  [/[$€£]\s?\d|\b\d+\s?(k|%|percent|usd|eur|dollars|euros)\b/i, "a number"],
  [/https?:\/\/|www\.|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, "a link or address"],
];
/** Why a suggestion would say something you never said ("a deadline", "brands ready"…), or null when it's safe. */
export function claimProblem(text: string, book: TemplateBook): string | null {
  const yours = allTexts(book).join("\n");
  for (const [re, what] of CLAIMS) {
    const m = text.match(re);
    if (m && !new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(yours)) return what;
  }
  return null;
}

// ---- the rules (no AI) -----------------------------------------------------------------------------

const LIBRARY: Record<Exclude<Round, 4>, string[]> = {
  1: ["In case you missed my last email. Would you be open to it?", "Just following up on my email below. Is this something you'd consider?", "Wanted to make sure this didn't get lost. Would you be up for it?", "Circling back on this. Would it be worth a quick chat?"],
  2: ["Just bumping this up in case it got buried.", "Bringing this back to the top of your inbox.", "Did you get a chance to look at this?", "Any thoughts on this?"],
  3: ["Is this a bad time?", "Not the right time?", "Should I check back later?", "Too busy right now?"],
};

/** "I" or "we": how your own templates speak. */
export function voiceOf(book: TemplateBook): "i" | "we" {
  const all = allTexts(book).join(" ").toLowerCase().replace(/[’']/g, "'");
  const we = (all.match(/\b(we|we'll|we're|we've|our|us)\b/g) || []).length;
  const i = (all.match(/\b(i|i'll|i'm|i've|my|me)\b/g) || []).length;
  return we > i ? "we" : "i";
}
const cap = (s: string) => s.replace(/^\s*([a-z])/, (m) => m.toUpperCase()).replace(/\bi('ll|'m|'ve|'d)?\b/g, (m) => m.toUpperCase().replace("'LL", "'ll").replace("'M", "'m").replace("'VE", "'ve").replace("'D", "'d"));
const end = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/** The way YOUR last follow-ups sign off the thread ("i'll come back another time." → "I'll come back another time."). */
export function closingsOf(book: TemplateBook): string[] {
  const out: string[] = [];
  for (const t of book[4]) {
    const b = bodyOf(t.text).replace(/\s+/g, " ").trim();
    const m = /^[^.!?,]+[.!?,]\s*(.+)$/.exec(b);
    if (!m) continue;
    const c = end(cap(m[1].replace(/^(and|so)\s+/i, "")));
    if (c.split(" ").length >= 3 && c.split(" ").length <= 10 && !/\?$/.test(c) && !out.some((x) => x.toLowerCase() === c.toLowerCase())) out.push(c);
  }
  return out;
}
const DEFAULT_CLOSE = { i: ["I'll come back another time.", "I'll reach out another day.", "I'll check back another day."], we: ["We'll come back another time.", "We'll reach out another day.", "We'll check back another day."] };

/** Ways to open an answer to each kind of question, in your voice. Plain, no dashes. */
const OPENERS: Record<QuestionKind, { i: string[]; we: string[] }> = {
  is_bad: { i: ["Seems like it is.", "Looks like it is.", "I guess it is.", "Maybe it is."], we: ["Seems like it is.", "Looks like it is.", "Maybe it is.", "Guess it is."] },
  not_good: { i: ["Looks like it's not.", "Seems like it's not.", "I guess it's not."], we: ["Looks like it's not.", "Seems like it's not.", "Guess it's not."] },
  later: { i: ["I guess I will.", "I'll take that as a yes.", "Guess I will then."], we: ["I guess we will.", "We'll take that as a yes.", "Guess we will then."] },
  present: { i: ["I guess you're not around.", "Seems like you're busy.", "Looks like you're away."], we: ["Guess you're not around.", "Seems like you're busy.", "Looks like you're away."] },
  interested: { i: ["I guess not right now.", "Seems like it's not for you right now."], we: ["Guess not right now.", "Seems like it's not for you right now."] },
  other: { i: ["No worries.", "All good."], we: ["No worries.", "All good."] },
  statement: { i: ["No worries.", "All good."], we: ["No worries.", "All good."] },
};
const VERB = (s: string) => (s.toLowerCase().match(/\b(check|come|reach|get|circle)\b/) || [""])[0];

/** Answers to one of your questions, in your voice, closed the way you close your last follow-ups. */
export function answersFor(question: string, book: TemplateBook, max = 3): string[] {
  const kind = questionKind(question);
  const voice = voiceOf(book);
  const closes = closingsOf(book);
  const pool = [...closes, ...DEFAULT_CLOSE[voice].filter((d) => !closes.some((c) => c.toLowerCase() === d.toLowerCase()))]
    // "Should I check back later?" → close with another verb ("I'll come back…"), not "check back" twice.
    .sort((a, b) => Number(!!VERB(question) && VERB(a) === VERB(question)) - Number(!!VERB(question) && VERB(b) === VERB(question)));
  const out: string[] = [];
  // "We'll take that as a yes." + "We'll reach out another day." → "We'll take that as a yes and reach out another day."
  const join = (o: string, c: string) => { const a = /^(I'll|We'll)\b/.exec(o)?.[1]; return a && c.startsWith(`${a} `) ? `${o.replace(/\.$/, "")} and ${c.slice(a.length + 1)}` : `${o} ${c}`; };
  OPENERS[kind][voice].forEach((o, i) => { const c = pool[i % pool.length]; if (out.length < max) out.push(join(o, c)); });
  return out.filter((a) => pairFit(kind, answerKind(a)) > 0);
}

/** Kept for older callers: answers to a question with your default voice. */
export const answersTo = (question: string) => answersFor(question, { 1: [], 2: [], 3: [], 4: [] } as TemplateBook);

/**
 * Your questions that the NEXT follow-up can't answer exactly, each with ready answers in your words. These come
 * first in the ideas, marked important.
 */
export function missingAnswers(book: TemplateBook) {
  return templateGaps(book).filter((g) => !g.direct).map((g) => ({ ...g, answers: answersFor(g.question, book, 3).filter((a) => !book[g.round as Round].some((t) => sameIdea(t.text, a, 0.85))) }));
}

export function suggestTemplates(round: Round, book: TemplateBook, max = 3): Suggestion[] {
  const style = styleOf(book);
  const have = book[round].map((t) => t.text);
  const out: Suggestion[] = [];
  const push = (body: string, why: string, important = false) => {
    const text = applyStyle(body, style);
    if (out.length >= max || have.some((h) => sameIdea(h, text)) || out.some((o) => o.text === text || sameIdea(o.text, text, 0.9)) || claimProblem(text, book)) return;
    out.push({ text, why, by: "rules", ...(important ? { important } : {}) });
  };
  const short = (q: string) => (q.length > 48 ? `${q.slice(0, 46)}…` : q);
  // First: answers to your own questions that this follow-up can't answer yet.
  for (const g of missingAnswers(book).filter((x) => x.round === round)) for (const a of g.answers.slice(0, 2)) push(a, `Missing: nothing answers your ${ordinalOf(round - 1)} “${short(g.question)}”`, true);
  if (round === 4) {
    const thirds = book[3].map((t) => bodyOf(t.text)).filter(Boolean);
    const qs = thirds.length ? thirds : ["Is this a bad time?"];
    // Round-robin over your 3rd follow-ups, so every one of them has a 4th that answers it.
    const lists = qs.map((q) => ({ q: lastQuestion(q) || q, a: answersFor(lastQuestion(q) || q, book, 4) }));
    for (let i = 0; out.length < max && i < 4; i++) for (const { q, a } of lists) if (a[i]) push(a[i], thirds.length ? `Answers your 3rd: “${short(q)}”` : "A last email that answers “Is this a bad time?”");
    return out;
  }
  for (const body of LIBRARY[round]) push(body, round === 1 ? "Asks in different words than a first email" : round === 2 ? "A light nudge, in your style" : "An easy yes/no question");
  return out;
}
const ordinalOf = (n: number) => ["", "1st", "2nd", "3rd", "4th"][n] || `${n}th`;
