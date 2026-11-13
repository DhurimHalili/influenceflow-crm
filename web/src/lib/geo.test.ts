// Run: cd web && node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/geo.test.ts
import { affinity, audienceOf, brandMarkets, marketFit, tldCountry } from "./geo.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
};
const yes = (name: string, cond: boolean, info?: unknown) => { if (!cond) fail++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : ` ${JSON.stringify(info)}`}`); };
const fitOf = (brand: Parameters<typeof brandMarkets>[0], intel: Parameters<typeof brandMarkets>[1], creator: Parameters<typeof audienceOf>[0], sponsored: string[] = []) => marketFit(brandMarkets(brand, intel, sponsored), audienceOf(creator))?.fit ?? null;

const us = { country: "United States" }, uk = { country: "United Kingdom" }, de = { country: "Germany" }, ca = { country: "Canada" }, at = { country: "Austria" }, none = {};

// The owner's examples.
const usOnly = { brief: { markets: ["United States"] } };
yes("US-only brand: a US creator is a full match", fitOf(usOnly, null, us) === 1);
yes("US-only brand: a UK creator is a poor match", (fitOf(usOnly, null, uk) ?? 1) <= 0.45, fitOf(usOnly, null, uk));
yes("US-only brand: a German creator is a bad match", (fitOf(usOnly, null, de) ?? 1) < 0.1, fitOf(usOnly, null, de));
const usUk = { brief: { markets: ["United States", "United Kingdom"] } };
const fUs = fitOf(usUk, null, us)!, fUk = fitOf(usUk, null, uk)!;
yes("US (main) + UK brand: both are good…", fUs >= 0.9 && fUk >= 0.7, [fUs, fUk]);
yes("…and the US creator ranks above the UK one", fUs > fUk, [fUs, fUk]);
yes("a neighbour scores below the market itself (Canada for a US brand)", fitOf(usOnly, null, ca)! < 1 && fitOf(usOnly, null, ca)! >= 0.5, fitOf(usOnly, null, ca));
yes("a German brand fits an Austrian creator well", fitOf({ brief: { markets: ["DE"] } }, null, at)! >= 0.75, fitOf({ brief: { markets: ["DE"] } }, null, at));
eq("no country on the creator: no market part at all (never a penalty)", fitOf(usOnly, null, none), null);
eq("no markets on the brand: no market part", fitOf({ brief: { markets: [] } }, null, us), null);

// The media kit's audience wins over the creator's own country.
const deCreatorUsAudience = { country: "Germany", audience: { verified: { top_countries: [{ country: "United States", pct: 61 }, { country: "Germany", pct: 14 }, { country: "United Kingdom", pct: 9 }] } } };
eq("audience source: kit", audienceOf(deCreatorUsAudience).source, "kit");
yes("a German creator whose audience is mostly American fits a US brand", fitOf(usOnly, null, deCreatorUsAudience)! >= 0.7, fitOf(usOnly, null, deCreatorUsAudience));
yes("…and fits a German brand much less", fitOf({ brief: { markets: ["DE"] } }, null, deCreatorUsAudience)! <= 0.4, fitOf({ brief: { markets: ["DE"] } }, null, deCreatorUsAudience));
const kitShare = (us: number) => ({ country: "Germany", audience: { verified: { top_countries: [{ country: "United States", pct: us }, { country: "Germany", pct: 100 - us - 30 }] } } });
eq("a German creator with 40% US viewers is a full match for a US brand", fitOf(usOnly, null, kitShare(40)), 1);
yes("25% US: still a good match", fitOf(usOnly, null, kitShare(25))! >= 0.6, fitOf(usOnly, null, kitShare(25)));
yes("8% US: not their market", fitOf(usOnly, null, kitShare(8))! < 0.3, fitOf(usOnly, null, kitShare(8)));
eq("kit percentages are kept as they are (61 = 61%)", audienceOf(deCreatorUsAudience).list[0].share, 0.61);

// Found by research (no brief): store country + currency + domain + sponsored creators, main first.
eq("country domains", [tldCountry("ugreen.de"), tldCountry("https://www.scan.co.uk/x"), tldCountry("nzxt.com"), tldCountry("brand.io"), tldCountry("x.com.au")], ["DE", "GB", "", "", "AU"]);
const found = brandMarkets({ domain: "ridge.com" }, { currency: "USD", markets: ["US", "CA", "GB"], geo: { shop: "US" } });
eq("research: main market first", found.list.map((x) => x.code)[0], "US");
yes("research: secondary markets weigh less", found.list.slice(1).every((x) => x.weight < 1), found.list);
const bySponsors = brandMarkets({ domain: "acme.com" }, { currency: "EUR", markets: [] }, ["GB", "GB", "GB", "US"]);
eq("research: where the creators they pay are", bySponsors.list[0]?.code, "GB");
eq("your brief beats research", brandMarkets({ domain: "acme.de", brief: { markets: ["France"] } }, { currency: "EUR", geo: { shop: "DE" } }).list.map((x) => x.code), ["FR"]);
const global = brandMarkets({ domain: "big.com" }, { markets: ["US", "GB", "DE", "FR", "JP", "BR", "IN", "ES", "IT"], currency: "USD" });
yes("a global brand reaches a market it doesn't list, a little", global.global && (marketFit(global, audienceOf({ country: "Poland" }))?.fit ?? 0) >= 0.45, global);

eq("affinity is symmetric and 1 for the same country", [affinity("US", "US"), affinity("GB", "IE"), affinity("IE", "GB"), affinity("US", "DE")], [1, 0.8, 0.8, 0]);

if (fail) { console.log(`\n${fail} failing`); (globalThis as { process?: { exit(n: number): void } }).process?.exit(1); } else console.log("\nall geo tests pass");
