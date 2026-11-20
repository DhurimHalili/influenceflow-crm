// Run (from web/): node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/companyFacts.test.ts
import { ageBand, buildFacts, companyView, estimateUsd, moneyShort, qidsToName, rawFacts, revenueBand, siteOrg, sizeBand, sizeFromText, withSite, type WikiEntity } from "./companyFacts";

let fail = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` → got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

// A Wikidata entity as Special:EntityData returns it (trimmed): two employee counts, a deprecated revenue,
// a former parent (ended), a listing with its ticker, a cited revenue.
const q = (id: string) => ({ snaktype: "value", datavalue: { value: { id } } });
const t = (time: string) => ({ snaktype: "value", datavalue: { value: { time } } });
const amount = (a: string, unit = "") => ({ snaktype: "value", datavalue: { value: { amount: a, unit } } });
const entity: WikiEntity = { id: "Q223127", claims: {
  P1128: [
    { rank: "normal", mainsnak: amount("+6000"), qualifiers: { P585: [t("+2021-03-31T00:00:00Z")] } },
    { rank: "normal", mainsnak: amount("+7300"), qualifiers: { P585: [t("+2024-03-31T00:00:00Z")] }, references: [{ snaks: { P854: [{ snaktype: "value", datavalue: { value: "https://www.sec.gov/x.htm" } }] } }] },
  ],
  P2139: [
    { rank: "deprecated", mainsnak: amount("+1", "http://www.wikidata.org/entity/Q4917") },
    { rank: "normal", mainsnak: amount("+4554900000", "http://www.wikidata.org/entity/Q4917"), qualifiers: { P585: [t("+2025-03-31T00:00:00Z")] } },
  ],
  P571: [{ rank: "normal", mainsnak: t("+1981-10-02T00:00:00Z") }],
  P17: [{ rank: "normal", mainsnak: q("Q39") }],
  P159: [{ rank: "normal", mainsnak: q("Q807") }],
  P452: [{ rank: "normal", mainsnak: q("Q1") }, { rank: "normal", mainsnak: q("Q2") }],
  P414: [{ rank: "normal", mainsnak: q("Q82059"), qualifiers: { P249: [{ snaktype: "value", datavalue: { value: "LOGI" } }] } }],
  P749: [{ rank: "normal", mainsnak: q("Q99"), qualifiers: { P582: [t("+2010-01-01T00:00:00Z")] } }],
  P1448: [{ rank: "normal", mainsnak: { snaktype: "value", datavalue: { value: { text: "Logitech International S.A." } } } }],
  P4264: [{ rank: "normal", mainsnak: { snaktype: "value", datavalue: { value: "logitech" } } }],
} as never };
const raw = rawFacts(entity);
check("newest employee count, with its date and source", raw.employees, { n: 7300, at: "2024-03-31", ref: "https://www.sec.gov/x.htm" });
check("deprecated revenue skipped", raw.revenue?.amount, 4554900000);
check("a former parent (ended) isn't the parent", raw.parent, undefined);
check("listing + ticker", raw.exchange, { qid: "Q82059", ticker: "LOGI" });
check("names needed", qidsToName(raw).sort(), ["Q1", "Q2", "Q39", "Q4917", "Q807", "Q82059"].sort());
const info = new Map([["Q4917", { label: "United States dollar", currency: "USD" }], ["Q39", { label: "Switzerland", iso2: "CH" }], ["Q807", { label: "Lausanne" }], ["Q1", { label: "computer hardware industry" }], ["Q82059", { label: "Nasdaq" }]]);
const f = buildFacts(raw, info, "2026-11-20T00:00:00Z");
check("built facts", [f.employees?.v, f.revenue?.v, f.founded?.v, f.country?.v, f.hq?.v, f.industry?.v, f.listed?.v, f.legal?.v], [7300, { amount: 4554900000, currency: "USD" }, 1981, "CH", "Lausanne", ["computer hardware industry"], { exchange: "Nasdaq", ticker: "LOGI" }, "Logitech International S.A."]);
check("an industry we couldn't name is left out (never a bare Q-id)", f.industry?.v.includes("Q2"), false);
check("no currency code → no revenue", buildFacts(raw, new Map(), "x").revenue, undefined);

// Their own site's Organization block.
check("site org", siteOrg({ numberOfEmployees: { "@type": "QuantitativeValue", value: 42 }, foundingDate: "2015-04-01", address: { addressCountry: "United Kingdom" }, legalName: "Acme Ltd" }), { employees: 42, founded: 2015, country: "GB", legal: "Acme Ltd" });
check("site org: nonsense ignored", siteOrg({ numberOfEmployees: "lots", foundingDate: "soon" }), {});
check("Wikidata wins, the site fills gaps", (({ employees, founded }) => [employees, founded])(withSite({ at: "x", employees: { v: 9, via: "wikidata" } }, { employees: 42, founded: 2015 })), [{ v: 9, via: "wikidata" }, { v: 2015, via: "site" }]);

// Bands + money.
check("size bands", [sizeBand(8), sizeBand(50), sizeBand(51), sizeBand(7300), sizeBand(20000), sizeBand(0)], ["s1", "s2", "s3", "s5", "s6", undefined]);
check("revenue band (USD)", [revenueBand(4.5e9), revenueBand(5e6), revenueBand(NaN)], ["r5", "r2", undefined]);
check("age band", [ageBand(1981, 2026), ageBand(2023, 2026), ageBand(2010, 2026)], ["a3", "a1", "a2"]);
check("money in its own currency", [moneyShort(4554900000, "USD"), moneyShort(12400000, "EUR"), moneyShort(950000, "GBP")], ["$4.6B", "€12.4M", "£950K"]);
check("paid estimates parsed", [estimateUsd("$10M-$50M"), estimateUsd("$1.2B"), sizeFromText("51-200"), sizeFromText("10,001+")], [1e7, 1.2e9, 126, 10001]);

// The view: verified beats estimates; estimates are labelled; nothing = none.
const v1 = companyView({ company: { employees: 300, facts_via: "apollo", verified: f }, products: 12, price: { median: 80, currency: "USD" }, programs: [{}], geo: { shop: "US" } } as never);
check("verified wins over Apollo's estimate", [v1.employees?.v, v1.employees?.verified, v1.quality, v1.size, v1.rev, v1.age, v1.program, v1.shop], [7300, true, "verified", "s5", "r5", "a3", true, "US"]);
const v2 = companyView({ company: { size: "51-200", revenue: "$10M-$50M", facts_via: "hunter" } } as never);
check("estimate only", [v2.employees?.verified, v2.employees?.label, v2.revenue?.label, v2.quality], [false, "51–200", "$10M–$50M", "estimate"]);
check("nothing known", companyView(null).quality, "none");

if (fail) throw new Error(`${fail} failed`);
console.log("\nall company facts tests passed");
