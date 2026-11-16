import { ROUNDS, type Round, type TemplateBook } from "./autopilot.ts";

// Suggested follow-ups, written the way YOU write them (greeting or not, sign-off or not, one line or more),
// that fit where they go: a 4th that answers your 3rd ("Not the best time?" → "Looks like it's not — I'll come
// back another time."), a 1st that asks differently from a first email. Never a claim you didn't make: no
// deadlines, numbers, "brands are ready", "last chance" — unless your own templates already say it.
// Shared with the server, which uses the same checks on what the AI suggests.

export type Style = { greeting: string | null; signoff: string | null; oneLine: boolean };
export type Suggestion = { text: string; why: string; by: "rules" | "ai" };

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
  1: ["In case you missed my last email — would you be open to it?", "Just following up on my email below — is this something you'd consider?", "Wanted to make sure this didn't get lost — would you be up for it?", "Circling back on this — would it be worth a quick chat?"],
  2: ["Just bumping this up in case it got buried.", "Floating this back to the top of your inbox.", "Did you get a chance to look at this?", "Any thoughts on this?"],
  3: ["Is this a bad time?", "Not the right time?", "Should I check back later?", "Too busy right now?"],
};
/** How a last email answers a yes/no question in the one before ("Not the best time?" → "Looks like it's not…"). */
export function answersTo(question: string): string[] {
  const q = question.toLowerCase();
  if (/\b(not|n't)\b.{0,15}\b(best|right|good|great|ideal)\s+(time|moment)\b/.test(q)) return ["Looks like it's not — I'll come back another time.", "Seems like it's not. I'll reach out another day.", "Guess it's not the right time — I'll check back later."];
  if (/\b(bad|wrong|busy|hectic)\b/.test(q)) return ["Looks like it is — I'll come back another time.", "Seems like it might be. I'll reach out another day.", "Guess it's a busy time — I'll check back later."];
  if (/\b(check back|reach out|come back|later)\b/.test(q)) return ["I'll take that as a later — I'll come back another time.", "No worries — I'll check back another day."];
  if (/\b(not|n't)\b.{0,12}\b(for you|a fit|interested|your thing)\b/.test(q)) return ["Looks like it's not a fit right now — I'll leave it here.", "Seems like it's not for you right now — all good."];
  return ["No worries — I'll come back another time.", "All good — I'll reach out another day."];
}

export function suggestTemplates(round: Round, book: TemplateBook, max = 3): Suggestion[] {
  const style = styleOf(book);
  const have = book[round].map((t) => t.text);
  const out: Suggestion[] = [];
  const push = (body: string, why: string) => {
    const text = applyStyle(body, style);
    if (out.length >= max || have.some((h) => tooSimilar(h, text)) || out.some((o) => o.text === text || tooSimilar(o.text, text, 0.9)) || claimProblem(text, book)) return;
    out.push({ text, why, by: "rules" });
  };
  if (round === 4) {
    const thirds = book[3].map((t) => bodyOf(t.text)).filter(Boolean);
    const qs = thirds.length ? thirds : ["Is this a bad time?"];
    // Round-robin over your 3rd follow-ups, so every one of them has a 4th that answers it.
    const lists = qs.map((q) => ({ q, a: answersTo(q) }));
    for (let i = 0; out.length < max && i < 4; i++) for (const { q, a } of lists) if (a[i]) push(a[i], thirds.length ? `Answers your 3rd: “${q.length > 48 ? `${q.slice(0, 46)}…` : q}”` : "A last email that answers “Is this a bad time?”");
    return out;
  }
  for (const body of LIBRARY[round]) push(body, round === 1 ? "Asks in different words than a first email" : round === 2 ? "A light nudge, in your style" : "An easy yes/no question");
  return out;
}
