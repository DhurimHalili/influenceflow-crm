// Run: node --experimental-strip-types supabase/functions/_shared/priceReader.test.ts
import { isPlainYes, saysAmount, readAgainstOffer, readMine, readOffer, readPrices, moneyMentions, statesAudience } from "./priceReader.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};
const pick = (r: ReturnType<typeof readPrices>) => ({ stated: r.stated.map((h) => [h.key, h.amount, h.currency]), agreed: r.agreed.map((h) => [h.key, h.amount, h.currency]) });

eq("rate list", pick(readPrices("Hi!\nMy rates:\nIntegration: $1,500\nDedicated video: $4,000\nYouTube Short: $600\nThanks")), { stated: [["video", 1500, "USD"], ["dedicated", 4000, "USD"], ["short", 600, "USD"]], agreed: [] });
eq("clear agreement", pick(readPrices("Ok, $2,500 for the integration works for me. Send the brief over.")), { stated: [], agreed: [["video", 2500, "USD"]] });
eq("k suffix + euro", pick(readPrices("Deal — €2.5k for the dedicated video.")), { stated: [], agreed: [["dedicated", 2500, "EUR"]] });
eq("counter offer is not agreement", pick(readPrices("I can do the integration for $2,000 but not lower than that.")), { stated: [["video", 2000, "USD"]], agreed: [] });
eq("question ignored", pick(readPrices("Could you do $1,800 for the integration?")), { stated: [], agreed: [] });
eq("their budget ignored", pick(readPrices("Your budget of $500 for an integration is too low for us.")), { stated: [], agreed: [] });
eq("range ignored", pick(readPrices("Integrations are usually $1,500-2,000 depending on length.")), { stated: [], agreed: [] });
eq("views are not prices", pick(readPrices("My shorts average 50k views and the integration gets 120k.")), { stated: [], agreed: [] });
eq("cpm ignored", pick(readPrices("For the integration I'd go with a $25 CPM.")), { stated: [], agreed: [] });
eq("quoted history ignored", pick(readPrices("Sounds good, talk soon!\n\nOn Mon, Oct 6, 2026 at 10:00 Agency <a@b.com> wrote:\n> We can offer $3,000 for the integration.")), { stated: [], agreed: [] });
eq("two prices in one sentence, each with its format", pick(readPrices("Integration is $1,000 and a short is $300.")), { stated: [["video", 1000, "USD"], ["short", 300, "USD"]], agreed: [] });
eq("gbp words", pick(readPrices("I charge 800 pounds for a TikTok.")), { stated: [["short", 800, "GBP"]], agreed: [] });
eq("happy to proceed", pick(readPrices("Happy to go with $1,200 for the integrated segment.")), { stated: [], agreed: [["video", 1200, "USD"]] });
eq("no money marker = nothing", pick(readPrices("Integration 1500, dedicated 4000")), { stated: [], agreed: [] });

eq("plain yes", isPlainYes("Sounds good! Let's do it.\n\nThanks,\nMatt"), true);
eq("yes with counter is not plain", isPlainYes("Sounds good but I'd need more time."), false);
eq("question is not plain yes", isPlainYes("Sounds good, when do you need it?"), false);
eq("offer read", readOffer("Hi Matt,\nWould you do $2,500 for the integration?\nBest")?.amount, 2500);
eq("two offers = ambiguous", readOffer("We can do $2,500 for the integration.\nAnd $600 for a short."), null);

// ---- real emails -------------------------------------------------------------
const fluxphy = `Hi Dhurim,

Thanks for reaching out!

I'm definitely interested in exploring a paid collaboration with Sihoo and TRYX.

For reference, my current rates for dedicated promotional content are:

🟢 Dedicated Short-Form (Cross-posted to TikTok, YouTube Shorts, Instagram Reels, Facebook, and X): $1,200 USD

🔵 YouTube Integration (60–90 sec): $2,000 USD

🟣 Extended YouTube Integration (2–3 min): $2,500 USD

🟠 Bundle (YouTube Integration + Dedicated Short-Form): $2,800 USD

My current availability for new projects is in November 2026.`;
eq("fluxphy rate list (durations, dedicated short, bundle)", pick(readPrices(fluxphy)), { stated: [["short", 1200, "USD"], ["video", 2000, "USD"], ["extended", 2500, "USD"], ["bundle", 2800, "USD"]], agreed: [] });
eq("weenie 2-3 minute integration", pick(readPrices("Yes I have attached my metrics. My rate is currently $500 for a 2-3 minute integration.")), { stated: [["extended", 500, "USD"]], agreed: [] });
eq("your offer with a duration", readOffer("Hi Seth,\nThanks again for sharing the details.\nI've reviewed the channel performance and audience. For the 60-90 second YouTube integration, I can work with $1,400 for this opportunity.\nI think that would be a fair rate based on the current YouTube reach and recent performance.")?.amount, 1400);
eq("plain yes with signature", isPlainYes("Sounds good, let's do it.\n\nBest,\nSeth Huston\nFounder, Fluxphy\n🌊 Full Media Kit\n🔴 YouTube: @Fluxphy"), true);
eq("you accept their price", readMine("Thanks for sending them over. The $500 looks good for a 2-3 minute integration. Could we continue on whatsapp?", { extended: 500 }).accepted?.key, "extended");
eq("you accept by amount only", readMine("The $500 works for us.", { extended: 500 }).accepted?.key, "extended");
eq("your counter is an offer, not a yes", JSON.stringify(readMine("For the 60-90 second YouTube integration, I can work with $1,400 for this opportunity.", { video: 2000 })), JSON.stringify({ accepted: null, offer: { key: "video", amount: 1400, currency: "USD", quote: "For the 60-90 second YouTube integration, I can work with $1,400 for this opportunity." } }));
eq("views with m are not minutes", pick(readPrices("I charge $900 for a short and they get 1.2m views.")), { stated: [["short", 900, "USD"]], agreed: [] });

// ---- smarter rules (no AI) -------------------------------------------------------
eq("slash list on one line", pick(readPrices("Integration $1,500 / Dedicated $3,000 / Shorts $400")), { stated: [["video", 1500, "USD"], ["dedicated", 3000, "USD"], ["short", 400, "USD"]], agreed: [] });
eq("amount before format, twice", pick(readPrices("I charge $1,000 for an integration and $350 for a TikTok.")), { stated: [["video", 1000, "USD"], ["short", 350, "USD"]], agreed: [] });
eq("pipe separated", pick(readPrices("YouTube integration: €900 | Instagram story: €150")), { stated: [["video", 900, "EUR"], ["story", 150, "EUR"]], agreed: [] });
eq("tangled sentence stays out", pick(readPrices("The integration and the short together are $1,000 or $300 alone.")), { stated: [], agreed: [] });
eq("price list with currency named once", pick(readPrices("Hey! Here are my rates (USD):\n\nIntegration: 1,500\nDedicated video – 4k\nShorts - 600\nAverage views: 80,000\n\nCheers")), { stated: [["video", 1500, "USD"], ["dedicated", 4000, "USD"], ["short", 600, "USD"]], agreed: [] });
eq("price list in euros, words", pick(readPrices("My prices are in euros.\nReel: 450\nStory: 120")), { stated: [["short", 450, "EUR"], ["story", 120, "EUR"]], agreed: [] });
eq("no currency named = list ignored", pick(readPrices("My rates:\nIntegration: 1500\nShort: 400")), { stated: [], agreed: [] });
eq("views in a list are never prices", pick(readPrices("Rates in USD below.\nShorts views: 45,000\nShorts: 500")), { stated: [["short", 500, "USD"]], agreed: [] });
eq("a year is not a price", pick(readPrices("Pricing (USD)\nIntegrations - November 2026\nIntegration: 1,200")), { stated: [["video", 1200, "USD"]], agreed: [] });
eq("two currencies = list ignored", pick(readPrices("Rates: $ for US brands, € for EU.\nIntegration: 1500")), { stated: [], agreed: [] });
eq("usually price dropped", pick(readPrices("For you the integration is $1,800 (usually $2,500).")), { stated: [["video", 1800, "USD"]], agreed: [] });
eq("normally price dropped, inline", pick(readPrices("Dedicated video is normally $5,000, now $4,000 this month only.")), { stated: [["dedicated", 4000, "USD"]], agreed: [] });
eq("two videos for one price = bundle", pick(readPrices("I can do 2 integrations for $3,000.")), { stated: [["bundle", 3000, "USD"]], agreed: [] });
eq("integration x3 = bundle", pick(readPrices("Integrations x3 at $4,200 total.")), { stated: [["bundle", 4200, "USD"]], agreed: [] });
eq("monthly retainer ignored", pick(readPrices("$3,000 per month for 4 shorts.")), { stated: [], agreed: [] });
eq("retainer word ignored", pick(readPrices("Monthly retainer: $2,000 for shorts.")), { stated: [], agreed: [] });
eq("tiktok post is a short", pick(readPrices("A TikTok post is $700.")), { stated: [["short", 700, "USD"]], agreed: [] });
eq("usage rights", pick(readPrices("Usage rights for 30 days add $300.")), { stated: [["usage_rights", 300, "USD"]], agreed: [] });
eq("standalone video = dedicated", pick(readPrices("A standalone video runs $3,500.")), { stated: [["dedicated", 3500, "USD"]], agreed: [] });
eq("starting at is their price", pick(readPrices("Integrations start at $1,200.")), { stated: [["video", 1200, "USD"]], agreed: [] });
eq("agree to two prices at once", pick(readPrices("Deal — $1,000 for the integration and $300 for the short works for me.")), { stated: [], agreed: [["video", 1000, "USD"], ["short", 300, "USD"]] });
eq("percent never a price", pick(readPrices("My integration has 60% US audience and costs $1,100.")), { stated: [], agreed: [] });
eq("european thousands", pick(readPrices("Integration: 1.500 € pro Video")), { stated: [["video", 1500, "EUR"]], agreed: [] });
eq("html table text", pick(readPrices("Format Price\nYouTube Integration $1,750\nYouTube Short $450")), { stated: [["video", 1750, "USD"], ["short", 450, "USD"]], agreed: [] });


// When the AI is worth calling: prices the rules didn't read, audience numbers.
eq("money mentions: two marked prices", moneyMentions("Integration $1,500 / Dedicated $3,000"), 2);
eq("money mentions: price list with currency named once", moneyMentions("My rates (USD):\nIntegration: 1,500\nShort: 400"), 2);
eq("money mentions: durations and years aren't prices", moneyMentions("A 60-90 sec integration in March 2026"), 0);
eq("money mentions: thanks email", moneyMentions("Thanks, sounds good! Talk soon."), 0);
eq("audience stated", statesAudience("My audience is 68% US, mostly 18-24, 70% male"), true);
eq("no audience in a plain reply", statesAudience("Sure, sending the kit now"), false);

// ---- read against the negotiation so far (no format named) ----
const vs = (body: string, offers: [string, number][], asking: Record<string, number>) => { const r = readAgainstOffer(body, { offers: offers.map(([key, amount]) => ({ key: key as "video", amount })), asking }); return { agreed: r.agreed.map((h) => [h.key, h.amount]), countered: r.countered.map((h) => [h.key, h.amount]) }; };
eq("real: yes to your offer, no format named", vs("Hi Dhurim,\nI think $3500 is a reasonable offer for our first collaboration, so I'm open to moving forward at that rate. Could you let me know which brand this campaign is for?\n\nOn Sun, Nov 8, 2026 at 7:58 PM Agency <a@b.com> wrote:\n> we can offer $3500", [["video", 3500]], { video: 5000 }), { agreed: [["video", 3500]], countered: [] });
eq("between your offer and their ask = they came down", vs("Thanks for the offer. I could do $4,500 for this one.", [["video", 3200]], { video: 5000 }), { agreed: [], countered: [["video", 4500]] });
eq("a counter asked as a question still counts", vs("Could we meet at $4,000?", [["video", 3200]], { video: 5000 }), { agreed: [], countered: [["video", 4000]] });
eq("your offer called too low is not a yes", vs("Honestly $3,200 is too low for me.", [["video", 3200]], { video: 5000 }), { agreed: [], countered: [] });
eq("yes with a 'but' is not a yes", vs("$3,200 works but I would need usage limited to 30 days.", [["video", 3200]], { video: 5000 }), { agreed: [], countered: [] });
eq("a deposit is not a counter", vs("I'd need $4,000 upfront before filming.", [["video", 3200]], { video: 5000 }), { agreed: [], countered: [] });
eq("product value is not a counter", vs("The laptop is worth $4,000 so that helps.", [["video", 3200]], { video: 5000 }), { agreed: [], countered: [] });
eq("above their ask is not a counter", vs("I could do $6,000.", [["video", 3200]], { video: 5000 }), { agreed: [], countered: [] });
eq("two different counters = ambiguous", vs("I could do $4,500.\nOr $4,000 if you book two.", [["video", 3200]], { video: 5000 }), { agreed: [], countered: [] });
eq("no offer yet, one priced format, price words", vs("For a first collab I can do $4,500.", [], { video: 5000 }), { agreed: [], countered: [["video", 4500]] });
eq("no offer yet, several formats priced: can't tell which", vs("For a first collab I can do $4,500.", [], { video: 5000, dedicated: 9000 }), { agreed: [], countered: [] });
eq("no price words, no offer: nothing", vs("Last brand paid me $4,500 fyi", [], { video: 5000 }), { agreed: [], countered: [] });
eq("a sentence with its format is left to readPrices", vs("I can do the integration for $4,500.", [["video", 3200]], { video: 5000 }), { agreed: [], countered: [] });
eq("views are never a counter", vs("My last video did 4,500 views in a day, $0 spent.", [["video", 3200]], { video: 5000 }), { agreed: [], countered: [] });

eq("amount is on the page", [saysAmount("I can do $4,500.", 4500), saysAmount("4.5k works", 4500), saysAmount("I can do 4500 usd", 4500)], [true, true, true]);
eq("amount only in the quoted history is not on the page", saysAmount("Sounds fine.\n\nOn Mon, Oct 6, 2026 at 10:00 Agency <a@b.com> wrote:\n> We can offer $4,500", 4500), false);
eq("an invented amount is not on the page", saysAmount("My rate is $5,000 per integration.", 4500), false);

// ---- your own emails ----
eq("real: your offer with no format, one priced format", readMine("We understand that the US audience in your other videos is slightly higher.\nTherefore, we can offer $3500 for our first collaboration.\nLet us know if this works.", { video: 5000 }, { soleKey: "video" }).offer?.amount, 3500);
eq("real: first offer names the format", readMine("Due to this audience we can offer $3200 for a first integration. Let me know if this works for you!", { video: 5000 }).offer?.amount, 3200);
eq("no sole format: an unnamed offer is not guessed", readMine("Therefore, we can offer $3500 for our first collaboration.", { video: 5000, short: 900 }).offer, null);
eq("yes to where they came down = agreed", readMine("$4,500 works for us, let's lock it in.", { video: 5000 }, { current: { video: 4500 } }).accepted?.amount, 4500);
eq("shipping cost is not an offer", readMine("We will pay $120 for shipping the product.", { video: 5000 }, { soleKey: "video" }).offer, null);
eq("moving forward at their price = agreed", pick(readPrices("Happy to move forward at $2,500 for the integration.")), { stated: [], agreed: [["video", 2500, "USD"]] });

if (fail) { console.log(`${fail} failed`); (globalThis as { process?: { exit(n: number): void } }).process?.exit(1); } else console.log("all price-reader tests pass");
