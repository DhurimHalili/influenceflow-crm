// Run: node --experimental-strip-types supabase/functions/_shared/priceReader.test.ts
import { isPlainYes, readOffer, readPrices } from "./priceReader.ts";

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

if (fail) { console.log(`${fail} failed`); (globalThis as { process?: { exit(n: number): void } }).process?.exit(1); } else console.log("all price-reader tests pass");
