// deno run --unstable-sloppy-imports --allow-env --allow-read supabase/functions/_shared/apollo.test.ts
// The Apollo client against a recorded fake: what's asked, what's kept, and when nothing is.
import { apolloCompany, apolloPeople, apolloUnlock, type Call } from "./apollo.ts";

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failed++; console.error(`✗ ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); } else console.log(`✓ ${name}`);
};
const sent: { method: string; url: string; body: unknown; key: string }[] = [];
const fake = (answers: { status: number; body: unknown }[]): Call => async (method, url, body, key) => { sent.push({ method, url, body, key }); return answers.shift() || { status: 200, body: { people: [] } }; };

// Search: free endpoint, by website + titles (+ common spellings), seniority passed through, key in a header only.
const people = Array.from({ length: 3 }, (_, i) => ({ id: `apollo${i}abc`, first_name: ["Sarah", "Tom", "Ana"][i], last_name_obfuscated: "Ko***i", title: ["CMO", "Influencer Marketing Manager", "Head of Partnerships"][i], has_email: i !== 1 }));
const r = await apolloPeople("https://www.Acme.com/shop", ["Marketing", "Partnerships"], "director", { key: "k-123", call: fake([{ status: 200, body: { people, total_entries: 3 } }]) });
eq("asks the free people search", [sent[0].method, sent[0].url], ["POST", "https://api.apollo.io/api/v1/mixed_people/api_search"]);
const q = sent[0].body as Record<string, unknown>;
eq("by their website, your titles + spellings, seniority", [q.q_organization_domains_list, q.person_titles, q.person_seniorities, q.include_similar_titles], [["acme.com"], ["Marketing", "CMO", "Partnerships"], ["owner", "founder", "c_suite", "partner", "vp", "head", "director"], true]);
eq("key never in the URL", sent.every((s) => !s.url.includes("k-123")), true);
eq("people kept with hint + seniority + has email", r.ok ? r.value.list.map((p) => [p.first_name, p.last_hint, p.seniority, p.has_email]) : r, [["Sarah", "Ko***i", 6, true], ["Tom", "Ko***i", 2, false], ["Ana", "Ko***i", 4, true]]);
eq("plan without API search → plan", await apolloPeople("acme.com", ["Marketing"], "all", { key: "k", call: fake([{ status: 403, body: { error_code: "API_INACCESSIBLE" } }]) }), { ok: false, why: "plan" });
eq("refused key → bad_key", await apolloPeople("acme.com", ["Marketing"], "all", { key: "k", call: fake([{ status: 401, body: {} }]) }), { ok: false, why: "bad_key" });
eq("no key → nothing asked", await apolloPeople("acme.com", ["Marketing"], "all", { key: "" }), { ok: false, why: "no_key" });

// Unlock: work email only, never somebody at another company.
sent.length = 0;
const u = await apolloUnlock({ id: "apollo0abc", domain: "acme.com", company: "Acme" }, { key: "k", call: fake([{ status: 200, body: { person: { first_name: "Sarah", last_name: "Kowalski", title: "CMO", email: "sarah@acme.com", email_status: "verified", linkedin_url: "http://www.linkedin.com/in/sarahk", organization: { primary_domain: "acme.com" } } } }]) });
eq("unlock: no personal emails, no phones", [(sent[0].body as Record<string, unknown>).reveal_personal_emails, (sent[0].body as Record<string, unknown>).reveal_phone_number], [false, false]);
eq("unlock: full name, LinkedIn (https), email", u.ok ? [u.value.last_name, u.value.linkedin_url, u.value.email, u.value.email_status] : u, ["Kowalski", "https://www.linkedin.com/in/sarahk", "sarah@acme.com", "verified"]);
eq("unlock: someone now at another company → none", await apolloUnlock({ id: "apollo0abc", domain: "acme.com" }, { key: "k", call: fake([{ status: 200, body: { person: { first_name: "S", email: "s@other.com", organization: { primary_domain: "other.com" } } } }]) }), { ok: false, why: "none" });
eq("unlock: Apollo's placeholder email is not an email", await apolloUnlock({ id: "apollo0abc", domain: "acme.com" }, { key: "k", call: fake([{ status: 200, body: { person: { first_name: "S", email: "email_not_unlocked@domain.com", organization: { primary_domain: "acme.com" } } } }]) }).then((x) => (x.ok ? x.value.email : x)), "");
eq("unlock: out of credits → quota", await apolloUnlock({ id: "apollo0abc", domain: "acme.com" }, { key: "k", call: fake([{ status: 422, body: { error: "You have insufficient credits" } }]) }), { ok: false, why: "quota" });

// Company: only a record for this very website.
const c = await apolloCompany("acme.com", { key: "k", call: fake([{ status: 200, body: { organization: { name: "Acme", primary_domain: "acme.com", linkedin_url: "http://www.linkedin.com/company/acme", estimated_num_employees: 120, annual_revenue: 25000000, industry: "consumer electronics", country: "Germany", founded_year: 2012 } } }]) });
eq("company facts", c.ok ? [c.value.linkedin, c.value.employees, c.value.revenue, c.value.industry, c.value.country, c.value.founded] : c, ["https://www.linkedin.com/company/acme", 120, "$25M", "Consumer Electronics", "DE", 2012]);
eq("another company's record → none", await apolloCompany("acme.com", { key: "k", call: fake([{ status: 200, body: { organization: { primary_domain: "acme-group.com" } } }]) }), { ok: false, why: "none" });

if (failed) { console.error(`\n${failed} failed`); Deno.exit(1); }
console.log("\nall Apollo tests passed");
