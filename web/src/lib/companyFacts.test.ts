// Run (from web/): node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/companyFacts.test.ts
import { agreesWithLinkedin, cleanMine, normalizeCheck, parseAmount, officialSource, ageBand, buildFacts, companyView, estimateUsd, moneyShort, qidsToName, rawFacts, revenueBand, siteOrg, sizeBand, sizeFromText, withSite, type WikiEntity } from "./companyFacts";

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
check("official (SEC-cited) count wins over Apollo's; uncited Wikidata values are dropped", [v1.employees?.v, v1.employees?.verified, v1.quality, v1.size, v1.rev, v1.age, v1.program, v1.shop, v1.estimate?.via], [7300, true, "verified", "s5", undefined, undefined, true, "US", "apollo"]);

// Which sources count (owner's rule: no crowd edits without an official source).
check("official sources", [officialSource("https://www.sec.gov/x.htm", "logitech.com"), officialSource("https://ir.logitech.com/annual", "logitech.com"), officialSource("https://find-and-update.company-information.service.gov.uk/company/1", "x.com"), officialSource("https://money.cnn.com/quote", "logitech.com"), officialSource("https://en.wikipedia.org/wiki/Logitech", "logitech.com"), officialSource(undefined, "x.com")], [true, true, true, false, false, false]);
check("buildFacts with the domain keeps only cited-official values", Object.keys(buildFacts(raw, info, "x", "logitech.com")).sort(), ["at", "employees", "qid"]);
// Your LinkedIn check is the final say on size; a service's number is only "what Apollo says" next to it.
const v3 = companyView({ company: { domain: "acme.com", size: "51-200", facts_via: "apollo" } } as never, { linkedin_size: "51-200", at: "2026-11-21T10:00:00Z" });
check("LinkedIn check verifies the size, Apollo agrees", [v3.employees?.label, v3.employees?.via, v3.employees?.verified, v3.size, v3.estimate?.agrees, v3.quality], ["51–200", "linkedin", true, "s3", true, "verified"]);
const v4 = companyView({ company: { domain: "acme.com", employees: 640, facts_via: "apollo" } } as never, { linkedin_size: "11-50" });
check("LinkedIn wins when Apollo disagrees", [v4.employees?.label, v4.size, v4.estimate?.v, v4.estimate?.agrees], ["11–50", "s2", 640, false]);
check("no check, only Apollo → not verified", [companyView({ company: { domain: "acme.com", employees: 640, facts_via: "apollo" } } as never).employees?.verified, companyView({ company: { domain: "acme.com", employees: 640, facts_via: "apollo" } } as never).quality], [false, "estimate"]);
check("agrees", [agreesWithLinkedin(120, "51-200"), agreesWithLinkedin(201, "51-200"), agreesWithLinkedin(20000, "10001+")], [true, false, true]);
const v2 = companyView({ company: { size: "51-200", revenue: "$10M-$50M", facts_via: "hunter" } } as never);
check("estimate only", [v2.employees?.verified, v2.employees?.label, v2.revenue?.label, v2.quality], [false, "51–200", "$10M–$50M", "estimate"]);
check("nothing known", companyView(null).quality, "none");

// Facts you set yourself (Edit facts): typed amounts read, junk dropped, yours win, wrong found values hidden.
check("amounts as people type them", [parseAmount("4.6B"), parseAmount("$12.5M"), parseAmount("250,000"), parseAmount("250 000"), parseAmount("1,2 Mio"), parseAmount("3bn"), parseAmount("750k"), parseAmount("12"), parseAmount("lots"), parseAmount(""), parseAmount("-5"), parseAmount("€ 1.5 billion")], [4.6e9, 12.5e6, 250000, 250000, 1.2e6, 3e9, 750000, 12, undefined, undefined, undefined, 1.5e9]);
check("cleanMine keeps only well-formed facts", cleanMine({ employees: "120", revenue: { amount: 4.6e9, currency: "usd", year: 2024 }, founded: 3000, country: "de", hq: "  Berlin <b>", industry: ["PC hardware", "PC hardware", ""], listed: { exchange: "NASDAQ", ticker: "logi!" }, legal: "", source: "javascript:alert(1)", extra: 1 }, 2026), { employees: 120, revenue: { amount: 4.6e9, currency: "USD", year: 2024 }, country: "DE", hq: "Berlin b", industry: ["PC hardware"], listed: { exchange: "NASDAQ", ticker: "LOGI" } });
check("cleanMine refuses odd currencies and zero people", cleanMine({ employees: 0, revenue: { amount: 5, currency: "XYZ" } }), {});
const v5 = companyView({ company: { domain: "acme.com", employees: 640, revenue: "$10M-$50M", facts_via: "apollo" } } as never, { linkedin_size: "51-200", mine: { employees: 130, revenue: { amount: 25e6, currency: "EUR", year: 2025 }, founded: 2012, source: "https://acme.com/about" }, mine_at: "2026-11-21T10:00:00Z" });
check("yours win: people, revenue, founded — set by you, with your source", [v5.employees?.v, v5.employees?.via, v5.employees?.ref, v5.revenue?.label, v5.revenue?.as_of, v5.founded?.via, v5.size, v5.rev, v5.mine, v5.quality, v5.estimate?.v, v5.estimate?.agrees], [130, "you", "https://acme.com/about", "€25M", "2025", "you", "s3", "r3", ["employees", "revenue", "founded"], "verified", 640, false]);
const v6 = companyView({ company: { domain: "acme.com", employees: 640, revenue: "$10M-$50M", facts_via: "apollo" } } as never, { hide: ["employees", "revenue", "bogus" as never] });
check("a found value you hid stays hidden", [v6.employees, v6.revenue, v6.quality, v6.hidden], [undefined, undefined, "none", ["employees", "revenue"]]);
const v7 = companyView(null, { mine: { country: "SE", hq: "Stockholm", parent: "Acme Group", listed: { exchange: "Nasdaq Stockholm", ticker: "ACME" } } });
check("no research at all: your facts still make a company", [v7.country?.v, v7.hq, v7.parent, v7.listed?.ticker, v7.quality], ["SE", "Stockholm", "Acme Group", "ACME", "verified"]);
check("stored check normalised", [normalizeCheck({ linkedin_size: "51-200", at: "t", mine: { founded: 2012, junk: 1 }, mine_at: "m", hide: ["revenue", "x"] }), normalizeCheck({ linkedin_size: "lots" }), normalizeCheck("x"), normalizeCheck({ mine: {} })], [{ linkedin_size: "51-200", at: "t", mine: { founded: 2012 }, mine_at: "m", hide: ["revenue"] }, null, null, null]);

if (fail) throw new Error(`${fail} failed`);
console.log("\nall company facts tests passed");
