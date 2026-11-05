// Run: node --experimental-strip-types supabase/functions/_shared/priceReader.test.ts
import { isPlainYes, readMine, readOffer, readPrices } from "./priceReader.ts";

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
eq("two amounts in one sentence skipped", pick(readPrices("Integration is $1,000 and a short is $300.")), { stated: [], agreed: [] });
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

if (fail) { console.log(`${fail} failed`); (globalThis as { process?: { exit(n: number): void } }).process?.exit(1); } else console.log("all price-reader tests pass");
