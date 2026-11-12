import type { RateKey } from "./negotiation.ts";

// Prices from a creator's email WITHOUT any AI. Strict rules, so a wrong
// number is far less likely than a missed one, but smart enough to read how
// creators actually write their rates:
//   • only the creator's own words count (quoted replies are cut off);
//   • an amount needs money context: a marker on it ($ € £ USD EUR GBP dollars
//     euros pounds) — or a price LIST ("My rates (USD):" then "Integration: 1,500"),
//     where the email names its currency once and each line is "format: amount";
//   • every amount must sit with exactly one format in its own clause:
//     "Integration $1,500 / Dedicated $3,000" and "$1,000 for an integration and
//     $300 for a short" are read as two prices; anything tangled is skipped;
//   • never a price: ranges ("1,500–2,000"), CPM / per-view / revenue share,
//     monthly retainers, questions, views / subscribers / followers, years,
//     percentages, and a sentence about YOUR budget or offer;
//   • durations are lengths, not ranges ("60–90 sec"); 2+ minutes of
//     integration is an extended integration; "bundle", "A + B" or "2 videos
//     for $3,000" is a package; "dedicated short" is a short;
//   • "usually $2,500" / "(normally $2,500)" — the old price is dropped and the
//     one they quote now is kept;
//   • an AGREED price needs a clear yes in that same sentence ("2,500 for the
//     integration works for me") and no counter words ("but", "instead",
//     "minimum", "can't", "would need"…).
//   • in a negotiation the format is often left out ("$3,500 is a reasonable
//     offer, happy to move forward"): `readAgainstOffer` matches such a
//     sentence to the price YOU put on the table (a yes to that exact amount =
//     agreed) or reads a number between your offer and their asking price as
//     them coming down (a counter). Deposits, product value and stats never count.
// What the rules find is labelled "read by rules" in the rate history and can
// be undone with one tap, like every other change.

export type PriceHit = { key: RateKey; amount: number; currency: string; quote: string };
export type PriceReading = { stated: PriceHit[]; agreed: PriceHit[] };

const FORMATS: [RateKey, RegExp][] = [
  ["bundle", /\b(bundles?|packages?|combo|package\s+deal)\b|\b(integration|video|short|reel|tiktok|post|story)s?\s*\+\s*\w|\b(2|3|4|5|two|three|four|five)\s*(?:x\s*)?(?:youtube\s+|yt\s+|ig\s+|instagram\s+)?(integrations|videos|shorts|reels|tiktoks|posts|stories)\b|\b(integrations|videos|shorts|reels|tiktoks|posts)\s*x\s*[2-5]\b/i],
  ["dedicated", /\b(dedicated|full|whole|entire|standalone|stand-alone|solo)\s+(youtube\s+|yt\s+)?(video|review|upload|episode)\b|\bdedicated\b/i],
  ["video", /\b(integrat(ed|ion|ions)|sponsor(ed)?\s+(segment|spot|slot|read|mention)|ad\s+(read|spot|segment)|(60|90|30)\s*-?\s*s(ec(ond)?s?)?\s+(spot|segment|integration|mention)|mid-?roll|pre-?roll|shout-?outs?|mentions?|product\s+placement)\b/i],
  ["short", /\b(shorts?|reels?|tik\s?toks?|yt\s+short|vertical\s+videos?|short[- ]form)\b/i],
  ["story", /\b(stor(y|ies)|ig\s+story|story\s+frames?)\b/i],
  ["carousel", /\bcarousels?\b/i],
  ["stream", /\b(live\s?streams?|streams?|twitch)\b/i],
  ["podcast", /\bpodcasts?\b/i],
  ["ugc", /\bugc\b|\buser[- ]generated\b/i],
  ["link_in_bio", /\blink\s+in\s+(the\s+)?bio\b/i],
  ["usage_rights", /\b(usage(\s+rights)?|whitelisting|paid\s+usage|ad\s+rights|licen[cs]ing|spark\s+ads?|boosting)\b/i],
  ["exclusivity", /\bexclusiv(e|ity)\b/i],
  ["post", /\b(feed\s+post|ig\s+post|instagram\s+post|static\s+post|community\s+post|linkedin\s+post|x\s+post|posts?|tweets?)\b/i],
];

const NUM = String.raw`\d{1,3}(?:[,.\s]\d{3})+|\d+(?:[.,]\d{1,2})?`;
const MONEY = new RegExp(String.raw`(?:(?<pre>[$€£]|\b(?:usd|eur|gbp|us\$)\s?)\s?(?<a>${NUM})\s?(?<ka>k\b)?|(?<b>${NUM})\s?(?<kb>k\b)?\s?(?<post>[$€£]|\b(?:usd|eur|gbp|dollars?|euros?|pounds?)\b))`, "gi");
const RANGE = /(\d[\d,.\s]*k?)\s*(?:-|–|—|to)\s*[$€£]?\s*\d/i;
// "60–90 sec", "(2-3 min)", "30s", "a 2 minute" — a length, not a price range.
const DURATION = /\(?\s*(\d{1,3})(?:\s*(?:-|–|—|to)\s*(\d{1,3}))?\s*-?\s*(sec(?:ond)?s?|s|min(?:ute)?s?)\b\s*\)?/gi;
/** The longest length a sentence mentions, in seconds (0 = none). */
const secondsIn = (sentence: string) => {
  let longest = 0;
  for (const m of sentence.matchAll(DURATION)) {
    const n = Number(m[2] || m[1]);
    longest = Math.max(longest, /^m/i.test(m[3]) ? n * 60 : n);
  }
  return longest;
};
const withoutDurations = (sentence: string) => sentence.replace(DURATION, " ");
// The old price next to the one quoted now: "(usually $2,500)", "normally €900", "down from $3k", "~~$2,500~~".
const WAS = new RegExp(String.raw`\((?:[^()]*?\b(?:usually|normally|regularly|was|instead\s+of|reg\.?|list|retail|value|down\s+from|originally)\b[^()]*)\)|\b(?:usually|normally|regularly|instead\s+of|down\s+from|originally|was)\s*:?\s*(?:[$€£]|usd|eur|gbp)?\s*(?:${NUM})\s?k?\b\s*(?:usd|eur|gbp)?|~~[^~]+~~`, "gi");
const withoutOld = (sentence: string) => sentence.replace(WAS, " ");
const PER_UNIT = /\b(cpm|cpv|cpc|cpa|rpm|per\s+(1,?000|thousand|view|click|sale|sign-?up|install|month|week)|\/\s?(view|click|1k|mo|month|week|wk)\b|rev(enue)?\s*share|commission|retainer|monthly|%)/i;
const THEIR_OFFER = /\b(your|you['’]?re|you\s+(offered|proposed|mentioned|said|quoted)|budget|offer(ed)?|too\s+low|below|lowball)\b/i;
const YES = /\b(works?\s+for\s+(me|us)|that\s+works|(sounds|looks)\s+(good|great|fair|perfect|fine)|(it['’]?s\s+a\s+|we\s+have\s+a\s+)?deal\b|agreed|i\s+agree|we\s+agree|happy\s+(to|with)|(i|we)\s+(can|could|will)\s+(do|go\s+with|accept|work\s+with)|let['’]?s\s+(do|go|lock|proceed)|confirm(ed)?|accept(ed)?|fine\s+(by|with)\s+(me|us)|i['’]?m\s+(in|good\s+with|ok(ay)?\s+with)|ok(ay)?\s+(for|with|at)|(reasonable|fair|good|great|solid)\s+(offer|rate|price|deal|number)|open\s+to\s+(mov(e|ing)|go(ing)?|proceed(ing)?)\s+(forward|ahead)|(mov(e|ing)|go(ing)?|proceed(ing)?)\s+(forward|ahead)\s+(at|with|on))\b/i;
const COUNTER = /\b(but|however|instead|unfortunately|minimum|at\s+least|lowest|can['’]?t|cannot|could\s+not|couldn['’]?t|won['’]?t|would\s+need|need\s+at|if\s+you|unless|counter|how\s+about|what\s+about|could\s+you|would\s+you|not\s+able|unable)\b/i;
// Numbers that are never prices.
const STATS = /\b(views?|subs|subscribers?|followers?|impressions?|reach|ctr|retention|watch\s*time|average|avg|engagement|likes?|comments?|plays?|downloads?|listeners?|countr(y|ies)|age[sd]?|years?\s+old|demographics?|male|female)\b|%/i;
const MONTHS = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?|q[1-4]|year)\b/i;
// A price list heading ("My rates:", "Pricing (USD)", "Rate card").
const LIST_HEAD = /\b(rates?|pricing|price\s*list|prices|rate\s*card|packages?|fees?|investment|cost)\b/i;
const CURRENCY_WORD = /[$€£]|\b(usd|eur|gbp|us\$|dollars?|euros?|pounds?)\b/i;
// "Integration: 1,500" / "Dedicated video — 4k" / "Shorts - 600 USD": a label, a separator, one amount.
const LIST_LINE = new RegExp(String.raw`^[^\d$€£]{2,80}?[:\-–—=]\s*(?:[$€£]|usd|eur|gbp)?\s*(?<n>${NUM})\s?(?<k>k\b)?\s*(?:[$€£]|usd|eur|gbp|dollars?|euros?|pounds?)?\s*(?:(?:per|\/|each)\s*\w*)?\s*\.?\s*$`, "i");

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

/**
 * The one format a sentence is about, or null. "Dedicated short-form" is a short;
 * an integration of 2+ minutes is an extended integration; "bundle" / "A + B" /
 * "2 videos" is a bundle.
 */
const formatOf = (sentence: string): RateKey | null => {
  const plain = withoutDurations(sentence);
  const found = FORMATS.filter(([, re]) => re.test(plain)).map(([key]) => key);
  if (!found.length) return null;
  if (found.includes("bundle")) return "bundle";
  if (found.includes("dedicated") && found.includes("short") && /(dedicated|standalone|solo)\s+(yt\s+|youtube\s+)?(shorts?|short-form|short\s+form|reels?|tik\s?toks?|vertical)/i.test(plain)) return "short";
  if (found.includes("dedicated")) return "dedicated";
  // "TikTok post" / "Instagram reel post": the short-form format wins over the generic word "post".
  const specific = found.length > 1 && found.includes("post") ? found.filter((k) => k !== "post") : found;
  if (specific.length !== 1) return null;
  if (specific[0] === "video" && (secondsIn(sentence) >= 120 || /\b(extended|long(er)?)\s+(youtube\s+)?integration/i.test(plain))) return "extended";
  return specific[0];
};

const sentences = (text: string) =>
  text.split(/\n+/).flatMap((line) => line.split(/(?<=[.!])\s+(?=[A-Z])/)).map((s) => s.trim()).filter((s) => s.length > 2 && s.length < 400);

// Clause boundaries inside one sentence: "A $1 / B $2", "A $1; B $2", "A $1, B $2", "A $1 and B $2", "A $1 | B $2".
const SPLIT = /\s+\/\s+|\s*[;|•·]\s*|,(?=\s+[A-Za-z])|\s+(?:and|&|plus)\s+(?=[^+]*?(?:[$€£]|\d))/i;

type Clause = { key: RateKey; amount: number; currency: string };

/** Every "one format + one amount" clause in a sentence; [] when it can't be read cleanly. */
function clausesOf(sentence: string, ctxCurrency: string | null): Clause[] {
  const plain = withoutDurations(withoutOld(sentence));
  if (sentence.includes("?") || RANGE.test(plain) || PER_UNIT.test(plain)) return [];
  const money = Array.from(plain.matchAll(MONEY));
  const one = (text: string, m: RegExpMatchArray): Clause | null => {
    const g = m.groups || {};
    const amount = parseAmount(g.a || g.b || "", !!(g.ka || g.kb));
    if (amount < 25 || amount > 1_000_000) return null;
    const key = formatOf(text);
    return key ? { key, amount, currency: CURRENCY(g.pre || g.post || "$") } : null;
  };
  if (money.length === 1) {
    const hit = one(sentence, money[0]);
    return hit ? [hit] : [];
  }
  if (money.length > 1) {
    // Several prices: each must sit in its own clause with its own format.
    const parts = plain.split(SPLIT).map((p) => p.trim()).filter(Boolean);
    const out: Clause[] = [];
    for (const part of parts) {
      const m = Array.from(part.matchAll(MONEY));
      if (m.length > 1) return [];
      if (!m.length) continue;
      const hit = one(part, m[0]);
      if (!hit) return [];
      out.push(hit);
    }
    return out.length === money.length ? out : [];
  }
  // No marker on the line: only inside a price list that named its currency.
  if (!ctxCurrency) return [];
  const line = LIST_LINE.exec(plain.trim());
  if (!line || STATS.test(plain)) return [];
  const amount = parseAmount(line.groups!.n, !!line.groups!.k);
  if (amount < 25 || amount > 1_000_000) return [];
  if (amount >= 1900 && amount <= 2100 && !/[,.]/.test(line.groups!.n) && MONTHS.test(plain)) return []; // a year
  const key = formatOf(plain);
  return key ? [{ key, amount, currency: ctxCurrency }] : [];
}

/** The currency of a price list: the email has a rates heading and names one currency. */
function listCurrency(text: string): string | null {
  if (!LIST_HEAD.test(text)) return null;
  const found = new Set<string>();
  for (const m of text.matchAll(new RegExp(CURRENCY_WORD.source, "gi"))) found.add(CURRENCY(m[0]));
  return found.size === 1 ? [...found][0] : null;
}

export function readPrices(body: string): PriceReading {
  const stated: PriceHit[] = [];
  const agreed: PriceHit[] = [];
  const own = ownText(body);
  const ctx = listCurrency(own);
  for (const sentence of sentences(own)) {
    const hits = clausesOf(sentence, ctx);
    if (!hits.length) continue;
    // "I can do 2 videos for $3,000" from them is their price, not a yes to yours.
    const yes = YES.test(sentence.replace(/\b(i|we)\s+(can|could)\s+do\b/gi, " ")) && !COUNTER.test(sentence);
    const theirs = THEIR_OFFER.test(sentence);
    for (const h of hits) {
      const hit = { ...h, quote: sentence.slice(0, 300) };
      if (yes) agreed.push(hit);
      else if (!theirs) stated.push(hit);
    }
  }
  // One price per format: the first time it's mentioned wins; an agreement beats a statement.
  const once = (list: PriceHit[]) => list.filter((h, i) => list.findIndex((x) => x.key === h.key) === i);
  const a = once(agreed);
  return { agreed: a, stated: once(stated).filter((s) => !a.some((x) => x.key === s.key)) };
}

/**
 * How many prices the sender wrote in their own words: amounts with a money
 * marker, plus "format: amount" lines in a price list that names its currency.
 * When the rules read fewer than this, something is left for the AI.
 */
export function moneyMentions(body: string): number {
  const own = ownText(body);
  const marked = Array.from(withoutDurations(withoutOld(own)).matchAll(MONEY)).filter((m) => {
    const g = m.groups || {};
    const n = parseAmount(g.a || g.b || "", !!(g.ka || g.kb));
    return n >= 25 && n <= 1_000_000;
  }).length;
  const listed = listCurrency(own) ? own.split(/\n+/).filter((line) => !new RegExp(MONEY.source, "i").test(line) && LIST_LINE.test(withoutDurations(line).trim()) && !STATS.test(line)).length : 0;
  return marked + listed;
}

/** Audience numbers the sender states (shares, ages, countries) — worth reading when nothing is verified yet. */
export const statesAudience = (body: string) => /\b\d{1,3}(?:[.,]\d+)?\s?%/.test(ownText(body)) && /\b(audience|demographic|viewers?|followers?|age|female|male|women|men|countr(?:y|ies)|us|uk|usa|tier)\b/i.test(ownText(body));

/** Does the email look like it talks about money or audience at all? (saves AI calls) */
export const mentionsMoneyOrAudience = (body: string) => /[$€£]|\b(usd|eur|gbp|rate|rates|price|pricing|fee|cost|charge|budget|media\s?kit|demographic|audience|countries|age|female|male|views|subscribers|followers)\b/i.test(ownText(body));

/** The amount is literally written in the sender's own words ("4,500", "4.5k", "4500") — what an AI reports must be on the page. */
export const saysAmount = (body: string, amount: number) => {
  const own = withoutDurations(ownText(body));
  for (const m of own.matchAll(new RegExp(String.raw`(${NUM})\s?(k\b)?`, "gi"))) if (parseAmount(m[1], !!m[2]) === Math.round(amount)) return true;
  return false;
};

/** A short "yes" with no price of its own ("Sounds good!", "Deal, let's do it"). */
export const isPlainYes = (body: string) => {
  const own = ownText(body).replace(/\n(thanks|thank you|best|cheers|regards|kind regards)[\s\S]*$/i, "").trim();
  return own.length > 0 && own.length < 400 && YES.test(own) && !COUNTER.test(own) && !own.includes("?") && Array.from(own.matchAll(MONEY)).length === 0;
};

/** The one price YOU offered in your message ("Would you do $2,500 for the integration?"). Null when there's none or more than one. */
export function readOffer(body: string): PriceHit | null {
  const hits: PriceHit[] = [];
  for (const sentence of sentences(ownText(body))) {
    const plain = withoutDurations(withoutOld(sentence));
    if (RANGE.test(plain) || PER_UNIT.test(plain)) continue;
    const money = Array.from(plain.matchAll(MONEY));
    if (!money.length) continue;
    if (money.length > 1) return null;
    const m = money[0].groups || {};
    const amount = parseAmount(m.a || m.b || "", !!(m.ka || m.kb));
    const key = formatOf(sentence);
    if (amount < 25 || amount > 1_000_000 || !key) return null;
    hits.push({ key, amount, currency: CURRENCY(m.pre || m.post || "$"), quote: sentence.slice(0, 300) });
  }
  return hits.length === 1 ? hits[0] : null;
}

// An amount that isn't the fee itself: a deposit, what the product is worth, costs.
const NOT_FEE = /\b(up-?front|deposit|advance|half|remaining|balance|bonus|expenses?|travel|shipping|product|worth|valued?|retail|invoic\w*|refund\w*|tax(es)?|vat)\b/i;
// Words that put a price on the table without naming the format.
const PRICE_CUE = /\b(can\s+do|could\s+do|would\s+do|i['’]?d\s+do|we['’]?d\s+do|do\s+it\s+for|for\s+you|discount(ed)?|lowest|best\s+(i|we)\s+can|meet\s+(you\s+)?(in\s+the\s+middle|half-?way)|come\s+down|go\s+down|drop\s+(it\s+)?to|final|how\s+about|what\s+about|settle\s+(at|on|for)|my\s+(rate|price|fee)|offer|pay|budget|go\s+(up\s+)?to|stretch|propose)\b/i;

const oneAmount = (sentence: string) => {
  const plain = withoutDurations(withoutOld(sentence));
  if (RANGE.test(plain) || PER_UNIT.test(plain)) return null;
  const money = Array.from(plain.matchAll(MONEY));
  if (money.length !== 1) return null;
  const g = money[0].groups || {};
  const amount = parseAmount(g.a || g.b || "", !!(g.ka || g.kb));
  if (amount < 25 || amount > 1_000_000) return null;
  return { plain, amount, currency: CURRENCY(g.pre || g.post || "$") };
};

/**
 * Their email read against the negotiation so far — for sentences that name
 * an amount but no format (the ones `readPrices` can't place):
 *   agreed    — a yes to the exact amount YOU offered ("$3,500 is a reasonable
 *               offer, I'm open to moving forward at that rate")
 *   countered — they came down: one amount between your offer and their
 *               asking price ("I could do $4,500"), or — before you offered
 *               anything — a lower price for the only format they have priced,
 *               said with price words ("for you I can do $4,500")
 * Two different counters in one email are ambiguous: none is read.
 */
export function readAgainstOffer(body: string, ctx: { offers: { key: RateKey; amount: number }[]; asking: Partial<Record<RateKey, number>> }): { agreed: PriceHit[]; countered: PriceHit[] } {
  const agreed: PriceHit[] = [];
  const countered: PriceHit[] = [];
  const priced = (Object.keys(ctx.asking) as RateKey[]).filter((k) => Number(ctx.asking[k]) > 0);
  for (const sentence of sentences(ownText(body))) {
    const one = oneAmount(sentence);
    if (!one || formatOf(sentence)) continue;
    const quote = sentence.slice(0, 300);
    const same = ctx.offers.filter((o) => o.amount === one.amount);
    if (same.length === 1) {
      if (YES.test(one.plain) && !COUNTER.test(one.plain) && !sentence.includes("?")) agreed.push({ key: same[0].key, amount: one.amount, currency: one.currency, quote });
      continue;
    }
    if (NOT_FEE.test(one.plain) || STATS.test(one.plain)) continue;
    if (ctx.offers.length === 1) {
      const o = ctx.offers[0];
      const ask = Number(ctx.asking[o.key]) || 0;
      if (ask && one.amount > o.amount && one.amount < ask) countered.push({ key: o.key, amount: one.amount, currency: one.currency, quote });
    } else if (!ctx.offers.length && priced.length === 1 && PRICE_CUE.test(one.plain) && !THEIR_OFFER.test(one.plain.replace(/\boffer\b/gi, " "))) {
      const ask = Number(ctx.asking[priced[0]]);
      if (one.amount < ask && one.amount >= ask * 0.4) countered.push({ key: priced[0], amount: one.amount, currency: one.currency, quote });
    }
  }
  const once = (list: PriceHit[]) => list.filter((h, i) => list.findIndex((x) => x.key === h.key) === i);
  const clash = countered.some((c) => countered.some((x) => x.key === c.key && x.amount !== c.amount));
  const a = once(agreed);
  return { agreed: a, countered: clash ? [] : once(countered).filter((c) => !a.some((x) => x.key === c.key)) };
}

/**
 * What YOUR email says about money, read against their prices:
 *   accepted — you said yes to a price they asked, or to where they came down
 *              ("The $500 looks good")
 *   offer    — you proposed a price of your own ("I can work with $1,400 for the integration")
 * A yes to an amount that isn't one of their prices is an offer, never an agreement.
 * `opts.current` = the price each format stands at now (their counter);
 * `opts.soleKey` = the format an unnamed offer is about ("we can offer $3,500
 * for our first collaboration") — the only one they priced, or the one you
 * offered on before.
 */
export function readMine(body: string, theirPrices: Partial<Record<RateKey, number>>, opts: { current?: Partial<Record<RateKey, number>>; soleKey?: RateKey | null } = {}): { accepted: PriceHit | null; offer: PriceHit | null } {
  let accepted: PriceHit | null = null;
  let offer: PriceHit | null = null;
  for (const sentence of sentences(ownText(body))) {
    const plain = withoutDurations(withoutOld(sentence));
    if (RANGE.test(plain) || PER_UNIT.test(plain)) continue;
    const money = Array.from(plain.matchAll(MONEY));
    if (money.length !== 1) continue;
    const m = money[0].groups || {};
    const amount = parseAmount(m.a || m.b || "", !!(m.ka || m.kb));
    if (amount < 25 || amount > 1_000_000) continue;
    const named = formatOf(sentence);
    const current = opts.current || {};
    const theirs = Array.from(new Set([...(Object.keys(theirPrices) as RateKey[]).filter((k) => theirPrices[k] === amount), ...(Object.keys(current) as RateKey[]).filter((k) => current[k] === amount)]));
    const unnamed = opts.soleKey && PRICE_CUE.test(plain) && !NOT_FEE.test(plain) && !STATS.test(plain) ? opts.soleKey : null;
    const key = named || (theirs.length === 1 ? theirs[0] : null) || unnamed;
    if (!key) continue;
    const hit = { key, amount, currency: CURRENCY(m.pre || m.post || "$"), quote: sentence.slice(0, 300) };
    const yes = YES.test(plain) && !COUNTER.test(plain) && !sentence.includes("?");
    if (yes && (theirPrices[key] === amount || current[key] === amount)) accepted = accepted || hit;
    else offer = offer || hit;
  }
  return { accepted, offer: accepted ? null : offer };
}
