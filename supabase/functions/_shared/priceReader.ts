import type { RateKey } from "./negotiation.ts";

// Prices from a creator's email WITHOUT any AI — strict rules, so a wrong
// number is far less likely than a missed one:
//   • only the creator's own words count (quoted replies are cut off);
//   • an amount needs a money marker ($ € £ USD EUR GBP dollars euros) — a bare
//     "50k" is views, not a price; ranges ("1,500–2,000"), CPM / per-view
//     prices and anything with a question mark are skipped;
//   • one amount + one format in the same line/sentence, or it's skipped;
//   • a sentence about YOUR budget/offer ("your 500 is too low") is skipped;
//   • an AGREED price needs a clear yes in that same sentence ("2,500 for the
//     integration works for me") and no counter words ("but", "instead",
//     "minimum", "can't", "would need"…).
// What the rules find is labelled "read by rules" in the rate history and can
// be undone with one tap, like every other change.

export type PriceHit = { key: RateKey; amount: number; currency: string; quote: string };
export type PriceReading = { stated: PriceHit[]; agreed: PriceHit[] };

const FORMATS: [RateKey, RegExp][] = [
  ["dedicated", /\b(dedicated|full|whole|entire)\s+(youtube\s+)?(video|review|upload|episode)\b|\bdedicated\b/i],
  ["video", /\b(integrat(ed|ion|ions)|sponsor(ed)?\s+(segment|spot|slot|read|mention)|ad\s+(read|spot|segment)|(60|90|30)\s*-?\s*s(ec(ond)?s?)?\s+(spot|segment|integration|mention)|mid-?roll|pre-?roll|shout-?out|mention)\b/i],
  ["short", /\b(shorts?|reels?|tik\s?toks?|yt\s+short|vertical\s+video)\b/i],
  ["story", /\b(stor(y|ies)|ig\s+story)\b/i],
  ["carousel", /\bcarousels?\b/i],
  ["stream", /\b(live\s?streams?|streams?|twitch)\b/i],
  ["podcast", /\bpodcasts?\b/i],
  ["ugc", /\bugc\b|\buser[- ]generated\b/i],
  ["link_in_bio", /\blink\s+in\s+(the\s+)?bio\b/i],
  ["usage_rights", /\b(usage|whitelisting|paid\s+usage|ad\s+rights|licen[cs]ing)\b/i],
  ["exclusivity", /\bexclusiv(e|ity)\b/i],
  ["post", /\b(feed\s+post|ig\s+post|instagram\s+post|static\s+post|posts?|tweets?)\b/i],
];

const MONEY = /(?:(?<pre>[$€£]|\b(?:usd|eur|gbp|us\$)\s?)\s?(?<a>\d{1,3}(?:[,.\s]\d{3})+|\d+(?:[.,]\d{1,2})?)\s?(?<ka>k\b)?|(?<b>\d{1,3}(?:[,.\s]\d{3})+|\d+(?:[.,]\d{1,2})?)\s?(?<kb>k\b)?\s?(?<post>[$€£]|\b(?:usd|eur|gbp|dollars?|euros?|pounds?)\b))/gi;
const RANGE = /(\d[\d,.\s]*k?)\s*(?:-|–|—|to)\s*[$€£]?\s*\d/i;
const PER_UNIT = /\b(cpm|cpv|cpc|cpa|per\s+(1,?000|thousand|view|click|sale|sign-?up|install)|\/\s?(view|click|1k)|rev(enue)?\s*share|commission|%)/i;
const THEIR_OFFER = /\b(your|you['’]?re|you\s+(offered|proposed|mentioned|said|quoted)|budget|offer(ed)?|too\s+low|below|lowball)\b/i;
const YES = /\b(works?\s+for\s+(me|us)|that\s+works|sounds\s+(good|great|fair|perfect)|(it['’]?s\s+a\s+|we\s+have\s+a\s+)?deal\b|agreed|i\s+agree|we\s+agree|happy\s+(to|with)|(i|we)\s+(can|could|will)\s+(do|go\s+with|accept|work\s+with)|let['’]?s\s+(do|go|lock|proceed)|confirm(ed)?|accept(ed)?|fine\s+(by|with)\s+(me|us)|i['’]?m\s+(in|good\s+with|ok(ay)?\s+with)|ok(ay)?\s+(for|with|at))\b/i;
const COUNTER = /\b(but|however|instead|unfortunately|minimum|at\s+least|lowest|can['’]?t|cannot|could\s+not|couldn['’]?t|won['’]?t|would\s+need|need\s+at|if\s+you|unless|counter|how\s+about|what\s+about|could\s+you|would\s+you|not\s+able|unable)\b/i;

const CURRENCY = (marker: string) => {
  const m = marker.toLowerCase().trim();
  if (m === "€" || m.startsWith("eur")) return "EUR";
  if (m === "£" || m.startsWith("gbp") || m.startsWith("pound")) return "GBP";
  return "USD";
};

const parseAmount = (raw: string, k: boolean) => {
  let s = raw.replace(/\s/g, "");
  // "1,500" / "1.500" (thousands) vs "2.5" (decimal)
  if (/^\d{1,3}([,.]\d{3})+$/.test(s)) s = s.replace(/[,.]/g, "");
  else s = s.replace(",", ".");
  const n = Number(s) * (k ? 1000 : 1);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

/** Only what the sender wrote in this message — quoted history and signatures-after-"On … wrote:" removed. */
export const ownText = (body: string) => {
  const out: string[] = [];
  for (const line of body.replace(/\r/g, "").split("\n")) {
    if (/^\s*>/.test(line)) continue;
    if (/^\s*On .{5,160} wrote:\s*$/.test(line) || /^\s*-{2,}\s*(original message|forwarded message)/i.test(line) || /^\s*(From|Von|De):\s.+@/.test(line) || /^_{8,}/.test(line)) break;
    out.push(line);
  }
  return out.join("\n").slice(0, 8000);
};

const sentences = (text: string) =>
  text.split(/\n+/).flatMap((line) => line.split(/(?<=[.!])\s+(?=[A-Z])/)).map((s) => s.trim()).filter((s) => s.length > 2 && s.length < 400);

export function readPrices(body: string): PriceReading {
  const stated: PriceHit[] = [];
  const agreed: PriceHit[] = [];
  for (const sentence of sentences(ownText(body))) {
    if (sentence.includes("?") || RANGE.test(sentence) || PER_UNIT.test(sentence)) continue;
    const money = Array.from(sentence.matchAll(MONEY));
    if (money.length !== 1) continue;
    const m = money[0].groups || {};
    const amount = parseAmount(m.a || m.b || "", !!(m.ka || m.kb));
    if (amount < 25 || amount > 1_000_000) continue;
    const formats = FORMATS.filter(([, re]) => re.test(sentence)).map(([key]) => key);
    // "dedicated video" also matches the generic patterns of other formats — keep the most specific.
    const keys = formats.includes("dedicated") ? ["dedicated" as RateKey] : formats;
    if (keys.length !== 1) continue;
    const hit = { key: keys[0], amount, currency: CURRENCY(m.pre || m.post || "$"), quote: sentence.slice(0, 300) };
    if (YES.test(sentence) && !COUNTER.test(sentence)) agreed.push(hit);
    else if (!THEIR_OFFER.test(sentence)) stated.push(hit);
  }
  // One price per format: the first time it's mentioned wins; an agreement beats a statement.
  const once = (list: PriceHit[]) => list.filter((h, i) => list.findIndex((x) => x.key === h.key) === i);
  const a = once(agreed);
  return { agreed: a, stated: once(stated).filter((s) => !a.some((x) => x.key === s.key)) };
}

/** Does the email look like it talks about money or audience at all? (saves AI calls) */
export const mentionsMoneyOrAudience = (body: string) => /[$€£]|\b(usd|eur|gbp|rate|rates|price|pricing|fee|cost|charge|budget|media\s?kit|demographic|audience|countries|age|female|male|views|subscribers|followers)\b/i.test(ownText(body));

/** A short "yes" with no price of its own ("Sounds good!", "Deal, let's do it"). */
export const isPlainYes = (body: string) => {
  const own = ownText(body).replace(/\n(thanks|thank you|best|cheers|regards|kind regards)[\s\S]*$/i, "").trim();
  return own.length > 0 && own.length < 400 && YES.test(own) && !COUNTER.test(own) && !own.includes("?") && Array.from(own.matchAll(MONEY)).length === 0;
};

/** The one price YOU offered in your message ("Would you do $2,500 for the integration?"). Null when there's none or more than one. */
export function readOffer(body: string): PriceHit | null {
  const hits: PriceHit[] = [];
  for (const sentence of sentences(ownText(body))) {
    if (RANGE.test(sentence) || PER_UNIT.test(sentence)) continue;
    const money = Array.from(sentence.matchAll(MONEY));
    if (!money.length) continue;
    if (money.length > 1) return null;
    const m = money[0].groups || {};
    const amount = parseAmount(m.a || m.b || "", !!(m.ka || m.kb));
    const formats = FORMATS.filter(([, re]) => re.test(sentence)).map(([key]) => key);
    const keys = formats.includes("dedicated") ? ["dedicated" as RateKey] : formats;
    if (amount < 25 || amount > 1_000_000 || keys.length !== 1) return null;
    hits.push({ key: keys[0], amount, currency: CURRENCY(m.pre || m.post || "$"), quote: sentence.slice(0, 300) });
  }
  return hits.length === 1 ? hits[0] : null;
}
