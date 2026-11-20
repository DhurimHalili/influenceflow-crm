// Run: cd web && node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/peopleFinder.test.ts
import { DEFAULT_TITLES, groupPeople, rankOf, rankPeople, readFinder, searchTitles, seniorityOf, shownName, titleFit } from "./peopleFinder.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};

eq("defaults when nothing saved", readFinder(undefined), { titles: DEFAULT_TITLES, seniority: "all" });
eq("cleaned: trimmed, no repeats (any case), no tags, max 12", readFinder({ titles: [" Marketing ", "marketing", "<b>PR</b>", "x", ...Array.from({ length: 20 }, (_, i) => `T${i}x`)], seniority: "director" }).titles.slice(0, 3), ["Marketing", "bPR/b", "T0x"]);
eq("seniority kept when valid", [readFinder({ seniority: "head" }).seniority, readFinder({ seniority: "boss" }).seniority], ["head", "all"]);

eq("seniority levels", ["Chief Marketing Officer", "Co-Founder & CEO", "VP Marketing", "Head of Partnerships", "Director, Brand", "Influencer Marketing Manager", "Senior Social Media Specialist", "Marketing Coordinator"].map(seniorityOf), [6, 6, 5, 4, 3, 2, 1, 0]);
eq("an assistant to the CEO is not the CEO", seniorityOf("Executive Assistant to the CEO"), 1);

eq("CMO is Marketing", titleFit("CMO", "Marketing") > 0, true);
eq("Chief Marketing Officer is Marketing", titleFit("Chief Marketing Officer", "Marketing") > 0, true);
eq("Head of Creator Partnerships is Influencer marketing", titleFit("Head of Creator Partnerships", "Influencer marketing") > 0, true);
eq("Marketing Manager is NOT Influencer marketing (main word missing)", titleFit("Marketing Manager", "Influencer marketing"), 0);
eq("Influencer Marketing Lead fits better than Influencer Relations", titleFit("Influencer Marketing Lead", "Influencer marketing") > titleFit("Influencer Relations", "Influencer marketing"), true);
eq("Business Development is Partnerships", titleFit("Business Development Manager", "Partnerships") > 0, true);
eq("Co-founder is Founder", titleFit("Co-founder", "Founder") > 0, true);
eq("Public Relations Director is PR", titleFit("Public Relations Director", "PR") > 0, true);

const titles = ["Marketing", "Partnerships", "Founder"];
eq("first title that fits wins", rankOf("Partnerships & Marketing Manager", titles).rank, 0);
eq("no fit = other", rankOf("Software Engineer", titles).rank, 3);

const people = [
  { id: "a", title: "Marketing Coordinator", has_email: true },
  { id: "b", title: "VP Marketing", has_email: false },
  { id: "c", title: "Head of Partnerships", has_email: true },
  { id: "d", title: "Founder & CEO", has_email: true },
  { id: "e", title: "CMO", has_email: true },
  { id: "f", title: "Office Manager", has_email: true },
];
eq("your #1 first, top heads first inside it", rankPeople(people, titles).map((p) => p.id), ["e", "b", "a", "c", "d", "f"]);
eq("lanes in your order, other last", groupPeople(people, titles).map((l) => [l.label, l.people.length]), [["Marketing", 3], ["Partnerships", 1], ["Founder", 1], ["Other matches", 1]]);
eq("re-ranked when you reorder", groupPeople(people, ["Founder", "Marketing"]).map((l) => l.label), ["Founder", "Marketing", "Other matches"]);

eq("search words include the common spellings", searchTitles(["Marketing", "Founder"]), ["Marketing", "CMO", "Founder", "Co-Founder", "CEO"]);
eq("names before / after unlock", [shownName({ first_name: "Sarah", last_name: "", last_hint: "ko***i" }), shownName({ first_name: "Sarah", last_name: "Kowalski" })], ["Sarah K.", "Sarah Kowalski"]);

if (fail) { console.log(`${fail} failed`); (globalThis as { process?: { exit(n: number): void } }).process?.exit(1); } else console.log("all people finder tests pass");
