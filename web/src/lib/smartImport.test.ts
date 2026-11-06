// Run: cd web && node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/smartImport.test.ts
import { countryOf, dateOf, numberOf, planColumns, priorityWord, readSheet, statusValues, statusWord, toCanonical } from "./smartImport.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};

// Values
eq("numbers: k / M / thousands / decimals", ["1.2M", "120k", "1,234,567", "12 345", "2.35", "~50K views", "abc"].map(numberOf).map((n) => (Number.isNaN(n) ? "NaN" : n)), [1200000, 120000, 1234567, 12345, 2.35, 50000, "NaN"]);
eq("dates: ISO, US, day-first, words, Excel serial", [dateOf("2026-10-05"), dateOf("10/5/2026"), dateOf("25/10/2026"), dateOf("05/10/2026", true), dateOf("Oct 5, 2026"), dateOf("5 October 2026"), dateOf("46300"), dateOf("soon")], ["2026-10-05", "2026-10-05", "2026-10-25", "2026-10-05", "2026-10-05", "2026-10-05", "2026-10-05", ""]);
eq("countries: codes, aliases, flags, cities", [countryOf("US"), countryOf("usa"), countryOf("UK"), countryOf("🇩🇪 Germany"), countryOf("Berlin, Germany"), countryOf("Kosovo"), countryOf("Mars")], ["United States", "United States", "United Kingdom", "Germany", "Germany", "Kosovo", ""]);
eq("status words people actually use", ["Reached", "emailed ✉️", "Ghosted", "not interested", "In talks", "Signed!", "Won", "to contact", "Replied", "Waiting for reply", "pending"].map((w) => statusWord(w, "creator")), ["contacted", "contacted", "no_reply", "denied", "negotiating", "roster", "roster", "new", "replied", "contacted", "contacted"]);
eq("a won brand is Signed, not Roster", statusWord("closed won", "brand"), "signed");
eq("priorities", ["High", "medium", "low", "🔥", "whatever"].map(priorityWord), ["urgent", "soon", "none", "urgent", ""]);

// A messy sheet: a title row, own column names, a section row, extras.
const raw = [
  ["My YouTubers 2026 — Q4 list", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["Creator", "YT", "E-mail Address", "Subs", "Avg. Views (last 10)", "ER", "Stage", "Shoe size"],
  ["CONTACTED", "", "", "", "", "", "", ""],
  ["Maya Chen", "https://youtube.com/@maya", "Maya <maya@example.com>", "1.2M", "120k", "0.045", "", "42"],
  ["", "@theotech", "theo@example.com; mgmt@theo.co", "85k", "40,000", "0.031", "Reached", ""],
  ["Nora James", "https://www.instagram.com/nora", "nora@example.com", "12k", "9k", "0.02", "ghosted", ""],
  ["", "", "", "", "", "", "", ""],
];
const sheet = readSheet(raw, "creator");
eq("title rows skipped, header found", [sheet.headerRow, sheet.skippedTop], [2, 2]);
eq("empty and section rows aren't records", sheet.rows.length, 3);
eq("the section row labels the rows under it", sheet.sectionOf, ["CONTACTED", "CONTACTED", "CONTACTED"]);
const plan = planColumns(sheet, "creator");
eq("columns understood", plan.map((p) => p.field), ["name", "social:YouTube", "email", "followers", "avg_views", "engagement_rate", "status", "extra"]);
eq("a column with no field is kept in notes", plan[7].confidence, "none");
const statuses = statusValues(sheet, plan, "creator");
eq("status words: section + cells", statuses.map((s) => [s.raw, s.status]), [["CONTACTED", "contacted"], ["Reached", "contacted"], ["ghosted", "no_reply"]]);
const out = toCanonical(sheet, plan, "creator", {});
const col = (name: string) => out.header.indexOf(name);
const row = (i: number, name: string) => out.rows[i][col(name)];
eq("email pulled out of 'Name <email>'", row(0, "Email"), "maya@example.com");
eq("two emails in a cell → Email + Email 2", [row(1, "Email"), row(1, "Email 2")], ["theo@example.com", "mgmt@theo.co"]);
eq("views cleaned", [row(0, "Avg views"), row(1, "Avg views")], ["120000", "40000"]);
eq("engagement written as a fraction → percent", [row(0, "Engagement %"), row(1, "Engagement %")], ["4.5", "3.1"]);
eq("a bare YouTube @handle becomes a channel link", row(1, "Channel"), "https://www.youtube.com/@theotech");
eq("an Instagram link in the YouTube column goes to Instagram", [row(2, "Channel"), row(2, "Instagram")], ["", "https://www.instagram.com/nora"]);
eq("statuses from the cell, else the section", [row(0, "Status"), row(1, "Status"), row(2, "Status")], ["contacted", "contacted", "no_reply"]);
eq("missing name taken from the handle", [row(1, "Name"), out.guessedNames], ["theotech", 1]);
eq("subscribers and extras land in notes", row(0, "Notes"), "Subs: 1,200,000\nShoe size: 42");
eq("a status you pick wins", toCanonical(sheet, plan, "creator", { ghosted: "denied" }).rows[2][col("Status")], "denied");

// No header row at all: content alone.
const bare = readSheet([["Maya Chen", "maya@example.com", "https://youtube.com/@maya", "US"], ["Theo", "theo@example.com", "https://youtube.com/@theo", "Germany"]], "creator");
eq("headerless sheet read by contents", planColumns(bare, "creator").map((p) => p.field), ["name", "email", "social:YouTube", "country"]);

// Brands
const brands = readSheet([["Brand", "Website", "Contact", "POC", "Industry", "Status"], ["Nord Audio", "https://www.nordaudio.com/", "hello@nordaudio.com", "Jane Doe", "Audio", "pitched"], ["", "keychron.com", "sales@keychron.com", "", "Peripherals", "won"]], "brand");
const bp = planColumns(brands, "brand");
eq("brand columns", bp.map((p) => p.field), ["name", "domain", "email", "contact_name", "brand_type", "status"]);
const bo = toCanonical(brands, bp, "brand", {});
eq("brand domain cleaned, name from domain, won = signed", [bo.rows[0][bo.header.indexOf("Domain")], bo.rows[1][bo.header.indexOf("Company")], bo.rows[1][bo.header.indexOf("Status")]], ["nordaudio.com", "Keychron", "signed"]);

if (fail) { console.log(`${fail} failed`); (globalThis as { process?: { exit(n: number): void } }).process?.exit(1); } else console.log("all smart import tests pass");
