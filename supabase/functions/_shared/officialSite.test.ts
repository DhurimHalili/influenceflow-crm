// Run: deno run --allow-read supabase/functions/_shared/officialSite.test.ts
// Recorded Wikidata / DuckDuckGo answers — no network.
import { duckSite, officialSite } from "./officialSite.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
};

type Hit = { id: string; label: string; description: string };
const fake = (hits: Hit[], sites: Record<string, string>) => async (url: string) => {
  if (url.includes("wbsearchentities")) return { search: hits };
  const id = /EntityData\/(Q\d+)\.json/.exec(url)?.[1] || "";
  const h = hits.find((x) => x.id === id);
  return { entities: { [id]: { descriptions: { en: { value: h?.description || "" } }, claims: { P31: [], ...(sites[id] ? { P856: [{ mainsnak: { datavalue: { value: sites[id] } }, rank: "normal" }] } : {}) } } } };
};

// "Dell": one computer brand among towns, a surname and a disambiguation page (Wikidata, Nov 2026).
const dell = fake([
  { id: "Q421192", label: "Dell", description: "Wikimedia disambiguation page" },
  { id: "Q2660583", label: "Dell", description: "town in Mississippi County, Arkansas, United States" },
  { id: "Q4157086", label: "Dell", description: "census-designated place in Beaverhead County, Montana, United States" },
  { id: "Q25297099", label: "Dell", description: "family name" },
  { id: "Q28206816", label: "Dell", description: "brand of computers owned by Dell, Inc." },
], { Q28206816: "https://www.dell.com" });
eq("Dell: places and names don't make it ambiguous", (await officialSite("Dell", dell))?.domain, "dell.com");

// "Gamma": the Greek letter and a Dutch DIY chain — a creator's "Gamma" could be either (or the app): say nothing.
const gamma = fake([
  { id: "Q1", label: "Gamma", description: "third letter of the Greek alphabet" },
  { id: "Q2", label: "Gamma", description: "Dutch chain of DIY stores" },
], { Q2: "https://www.gamma.nl" });
eq("Gamma: two things that could be it → unknown", await officialSite("Gamma", gamma), null);

// Two companies, two sites → unknown.
const two = fake([
  { id: "Q3", label: "Nova", description: "software company" },
  { id: "Q4", label: "Nova", description: "electronics manufacturer" },
], { Q3: "https://nova.io", Q4: "https://nova.com" });
eq("two companies with one name → unknown", await officialSite("Nova", two), null);

// A person is never a brand.
const person = fake([{ id: "Q5", label: "Linus", description: "Canadian YouTuber" }], { Q5: "https://linus.example" });
eq("a person is never a brand", await officialSite("Linus", person), null);

// DuckDuckGo: the heading must be the name, the site must fit it.
eq("ddg: exact heading + fitting site", await duckSite("NZXT", async () => ({ Heading: "NZXT", Type: "A", Results: [{ FirstURL: "https://nzxt.com/" }] })), "nzxt.com");
eq("ddg: near miss heading → nothing", await duckSite("Away", async () => ({ Heading: "Away (band)", Type: "A", Results: [{ FirstURL: "https://away.band" }] })), "");
eq("ddg: disambiguation → nothing", await duckSite("Gamma", async () => ({ Heading: "Gamma", Type: "D", Results: [] })), "");
eq("ddg: business qualifier is fine", await duckSite("Nothing", async () => ({ Heading: "Nothing (company)", Type: "A", Results: [{ FirstURL: "https://nothing.tech" }] })), "nothing.tech");

if (fail) { console.log(`\n${fail} failing`); Deno.exit(1); } else console.log("\nall officialSite tests pass");
