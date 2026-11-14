// Run: deno run --allow-read --allow-env supabase/functions/_shared/companyInfo.test.ts
// Recorded answers — no network.
import { clayCompany, clayPeople, hunterCompany, hunterPeople, mergePeople, linkedinCompany, roleRank, siteLinkedin, wikidataLinkedin } from "./companyInfo.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
};
const answer = (status: number, body: unknown) => async () => ({ status, body });

// Company page URLs, cleaned.
eq("locale + /about cleaned", linkedinCompany("https://uk.linkedin.com/company/acme-inc/about/?trk=x"), "https://www.linkedin.com/company/acme-inc");
eq("numeric id", linkedinCompany("linkedin.com/company/552285"), "https://www.linkedin.com/company/552285");
eq("showcase page", linkedinCompany("https://www.linkedin.com/showcase/razer-gaming/"), "https://www.linkedin.com/showcase/razer-gaming");
eq("a person is not a company page", linkedinCompany("https://www.linkedin.com/in/someone"), "");
eq("a share link is not a company page", linkedinCompany("https://www.linkedin.com/shareArticle?url=x"), "");
eq("site socials pick LinkedIn", siteLinkedin([{ platform: "Instagram", url: "https://instagram.com/x" }, { platform: "LinkedIn", url: "https://www.linkedin.com/company/pny-technologies/" }]), "https://www.linkedin.com/company/pny-technologies");

// Wikidata: only an item whose official site IS this domain.
const wd = (rows: { site: string; li: string }[]) => answer(200, { results: { bindings: rows.map((r) => ({ site: { value: r.site }, li: { value: r.li } })) } });
eq("wikidata: own domain", await wikidataLinkedin("Sonos", "sonos.com", wd([{ site: "https://www.sonos.com/", li: "sonos-inc" }])), "https://www.linkedin.com/company/sonos-inc");
eq("wikidata: another company's site with the same name", await wikidataLinkedin("Gamma", "gamma.app", wd([{ site: "https://www.gamma.nl", li: "gamma-nederland" }])), "");
eq("wikidata: two different pages = unsure", await wikidataLinkedin("Acme", "acme.com", wd([{ site: "https://acme.com", li: "acme-a" }, { site: "https://acme.com/", li: "acme-b" }])), "");

// Hunter company record: kept only for this very domain.
const rec = { domain: "bambulab.com", domainAliases: [], name: "Bambu Lab", linkedin: { handle: "company/bambulab" }, metrics: { employees: "1K-5K", employeesCount: 1800, estimatedAnnualRevenue: "$100M-$250M" }, geo: { countryCode: "CN" }, category: { industry: "Electronic Equipment" }, foundedYear: 2020 };
eq("hunter: no key", await hunterCompany("bambulab.com", answer(200, { data: rec }), ""), { ok: false, why: "no_key" });
eq("hunter: full record", await hunterCompany("bambulab.com", answer(200, { data: rec }), "k"), { ok: true, value: { linkedin: "https://www.linkedin.com/company/bambulab", name: "Bambu Lab", size: "1K-5K", employees: 1800, revenue: "$100M-$250M", industry: "Electronic Equipment", country: "CN", founded: 2020 } });
eq("hunter: a record for another domain is refused", await hunterCompany("bambu.com", answer(200, { data: rec }), "k"), { ok: false, why: "none" });
eq("hunter: 429 = credits used up", await hunterCompany("bambulab.com", answer(429, {}), "k"), { ok: false, why: "quota" });
eq("hunter: 403 = slow down", await hunterCompany("bambulab.com", answer(403, {}), "k"), { ok: false, why: "busy" });
eq("hunter: 401 = bad key", await hunterCompany("bambulab.com", answer(401, {}), "k"), { ok: false, why: "bad_key" });

// People: deal-makers first, no email = not listed.
const people = await hunterPeople("acme.com", answer(200, { data: { domain: "acme.com", emails: [
  { value: "ceo@acme.com", first_name: "Ann", last_name: "Lee", position: "CEO", confidence: 99, linkedin: "https://www.linkedin.com/in/annlee" },
  { value: "sam@acme.com", first_name: "Sam", last_name: "Roe", position: "Influencer Marketing Manager", confidence: 90, linkedin: null },
  { value: "", first_name: "No", last_name: "Mail", position: "Partnerships", confidence: 80 },
  { value: "kim@acme.com", first_name: "Kim", last_name: "Diaz", position: "Head of Marketing", confidence: 95, linkedin: "javascript:alert(1)" },
] }, meta: { results: 14 } }), "k");
eq("people: order by role", people.ok ? people.value.list.map((p) => p.first) : people, ["Sam", "Kim", "Ann"]);
eq("people: unsafe LinkedIn dropped", people.ok ? people.value.list.find((p) => p.first === "Kim")?.linkedin : people, "");
eq("people: total from Hunter", people.ok ? people.value.total : people, 14);
eq("roles: partnerships beats CEO", roleRank("Partnerships Lead") > roleRank("Founder & CEO"), true);

// Clay: search by website; a 400 (unknown field) tries the next query; a record for another site is refused.
const clay = (runs: { status: number; body: unknown }[], seen: string[] = []) => {
  let i = 0;
  return async (url: string, body: unknown) => {
    seen.push(url.endsWith("/run") ? "run" : String((body as { query?: string }).query || ""));
    if (!url.endsWith("/run")) return runs[i]?.status === 400 ? { status: (i++, 400), body: {} } : { status: 200, body: { search_id: "srch_1" } };
    return runs[i++] || { status: 500, body: {} };
  };
};
const crec = { name: "Bambu Lab", domain: "bambulab.com", linkedin_url: "https://www.linkedin.com/company/bambulab/", annual_revenue: 180000000, size: "1,001-5,000", industry: "Computer Hardware", country: "CN" };
eq("clay: no key", await clayCompany("bambulab.com", clay([]), ""), { ok: false, why: "no_key" });
eq("clay: company record", await clayCompany("bambulab.com", clay([{ status: 200, body: { data: [crec] } }]), "k"), { ok: true, value: { linkedin: "https://www.linkedin.com/company/bambulab", name: "Bambu Lab", size: "1,001-5,000", revenue: "$180M", industry: "Computer Hardware", country: "CN" }, results: 1 });
eq("clay: another site's record is refused", (await clayCompany("bambu.com", clay([{ status: 200, body: { data: [crec] } }]), "k")).ok, false);
eq("clay: 402 = results used up", await clayCompany("bambulab.com", clay([{ status: 402, body: {} }]), "k"), { ok: false, why: "quota" });
const tried: string[] = [];
eq("clay: unknown field → next query", (await clayCompany("bambulab.com", clay([{ status: 400, body: {} }, { status: 200, body: { data: [crec] } }], tried), "k")).ok, true);
eq("clay: second query used website", tried.some((q) => q.includes('website = "bambulab.com"')), true);
const cp = await clayPeople("acme.com", 5, clay([{ status: 200, body: { data: [
  { name: "Lee Chan", first_name: "Lee", last_name: "Chan", linkedin_url: "https://www.linkedin.com/in/leechan?x=1", matched_experiences: [{ company: "Acme", title: "Brand Partnerships Lead" }] },
  { name: "Ann Lee", matched_experiences: [{ title: "Founder" }], linkedin_url: "https://evil.example/in/x" },
] } }]), "k");
eq("clay people: names, titles, safe LinkedIn only", cp.ok ? cp.value.map((p) => [p.first, p.last, p.title, p.linkedin]) : cp, [["Lee", "Chan", "Brand Partnerships Lead", "https://www.linkedin.com/in/leechan"], ["Ann", "Lee", "Founder", ""]]);
const merged = mergePeople([{ first: "Ann", last: "Lee", title: "Founder", email: "ann@acme.com", linkedin: "", confidence: 98, department: "", seniority: "" }], cp.ok ? cp.value : []);
eq("merge: one row per person, Hunter's email + Clay's LinkedIn", merged.map((p) => [p.first, p.email, p.via]), [["Lee", "", "clay"], ["Ann", "ann@acme.com", "hunter"]]);

if (fail) { console.log(`\n${fail} failed`); Deno.exit(1); } else console.log("\nall passed");
