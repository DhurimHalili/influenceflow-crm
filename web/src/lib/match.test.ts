// Run: node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/match.test.ts
import { brandDoubts, brandTwin, budgetOf, byCreator, foundBrands, matchOf, sellsOf, trustedLinks, type BrandLink, type MatchWorld } from "./match.ts";
import type { Brand, Campaign, Creator } from "../types/index.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
const yes = (name: string, cond: boolean, info?: unknown) => { if (!cond) fail++; console.log(cond ? "ok  " : "FAIL", name, cond ? "" : JSON.stringify(info)); };

const brand = (over: Partial<Brand> & { match_topics?: string[] }): Brand & { match_topics?: string[] } => ({ id: "b1", user_id: "u", name: "TRYX", domain: "https://www.tryx.com/en", brand_type: "", contact_email: "", secondary_email: "", secondary_email_label: "", brief: { niches: [], platforms: [], formats: [], tiers: [], budget_min: 0, budget_max: 0, budget_period: "campaign", goals: [], markets: [], ages: [], gender: "", payment_terms: "", usage_rights: "", exclusivity: "", gifting: false, avoid: [], next_launch: null }, socials: [], pipeline_status: "new", date_contacted: null, status_updated_at: "", draft_subject: "", draft_body: "", notes: "", priority: "none", next_action_date: null, lost_reason: "", lost_at: null, archived_at: null, created_at: "", ...over } as Brand);
const creator = (id: string, over: Partial<Creator> = {}): Creator => ({ id, user_id: "u", name: id, contact_email: "", secondary_email: "", secondary_email_label: "", channel_link: "", socials: [], niche: "", country: "United States", avg_views: 120_000, engagement_rate: 3, stars: 0, stars_consistency: 0, stars_demographics: 0, stars_niche: 0, stars_engagement: 0, rates: {} as Creator["rates"], draft_subject: "", draft_body: "", platform: "YouTube", pipeline_status: "new", on_roster: false, date_contacted: null, status_updated_at: "", notes: "", lost_reason: "", lost_at: null, followup_count: 0, last_followup_at: null, priority: "none", next_action_date: null, archived_at: null, created_at: "", youtube: { channel_id: "UCxxxxxxxxxxxxxxxxxxxxxx", subscribers: 300_000 }, ...over } as Creator);
const content = (topics: [string, number][]) => ({ creator_id: "", status: "ok", scanned_at: "", content: { v: 1, at: "", videos: 40, clear: 36, shorts: 0, topics: topics.map(([key, share]) => ({ key, share, videos: Math.round(share * 40) })), examples: {}, newest: "", by: "rules" } });
const link = (over: Partial<BrandLink>): BrandLink => ({ id: Math.random().toString(36).slice(2), creator_id: "", brand_key: "", brand_name: "", domain: "", brand_id: null, kind: "sponsored", confidence: 0.9, store: false, videos: 1, first_at: "2026-10-01", last_at: "2026-10-01", evidence: [], by_ai: false, manual: false, verdict: "", verdict_kind: null, verdict_at: null, updated_at: "", ...over });

const tryx = brand({ intel: undefined } as never);
const world = (over: Partial<MatchWorld> = {}): MatchWorld => {
  const w: MatchWorld = {
    links: [], pitches: [], campaigns: [], creators: [creator("builder"), creator("mixed"), creator("cars")], brands: [tryx],
    intel: new Map([["b1", { brand_id: "b1", status: "ok", researched_at: "", intel: { v: 1, at: "", domain: "tryx.com", url: "", name: "TRYX", summary: "", sells: [{ key: "pc_cases", weight: 0.6 }, { key: "pc_cooling", weight: 0.4 }], by: "rules", products: 0, examples: [], price: null, platform: "", programs: [], socials: [], markets: ["US"], currency: "USD", wiki: "", pages: [], verified: true } }]]),
    content: new Map([["builder", content([["pc_builds", 0.7], ["gpus", 0.2]])], ["mixed", content([["pc_builds", 0.35], ["games", 0.5]])], ["cars", content([["car_reviews", 0.9]])]]),
    seen: new Map(), now: new Date("2026-11-13T00:00:00Z"), ...over,
  };
  w.linksBy = byCreator(w.links);
  return w;
};

const w0 = world();
const [mb, mm, mc] = ["builder", "mixed", "cars"].map((id) => matchOf(tryx, w0.creators.find((c) => c.id === id)!, w0));
yes("PC builder is a great match for a case + cooler brand", mb.score >= 75 && mb.tone !== "weak", mb);
yes("half PC, half gameplay is close but lower", mm.score < mb.score && mm.score >= 35, mm);
yes("car channel is a weak match", mc.score < 20, mc);
eq("reason names their content", mb.reasons[0].text, "90% of their videos: PC builds + Graphics cards");
yes("pure PC channel reads great", mb.tone === "great", mb.score);

// Already working with them (by domain), pitched, rival.
const w1 = world({ links: [link({ creator_id: "builder", brand_key: "tryx.com", brand_name: "TRYX", domain: "tryx.com", kind: "seeded" }), link({ creator_id: "mixed", brand_key: "nzxt.com", brand_name: "NZXT", domain: "nzxt.com", kind: "sponsored", last_at: "2026-10-20" })],
  pitches: [{ id: "p", brand_id: "b1", creator_id: "cars", at: "2026-11-01", source: "pitch" }],
  seen: new Map([["nzxt.com", { brand_key: "nzxt.com", name: "NZXT", domain: "nzxt.com", domain_check: "site", site: { topics: [{ key: "pc_cases", weight: 0.5 }, { key: "pc_builds", weight: 0.5 }] }, checked_at: "", hidden: false, added_brand_id: null }]]) });
eq("works with them (seeded)", matchOf(tryx, w1.creators[0], w1).flags.works?.kind, "seeded");
eq("rival deal 24 days ago", matchOf(tryx, w1.creators[1], w1).flags.rival?.name, "NZXT");
eq("already pitched", !!matchOf(tryx, w1.creators[2], w1).flags.pitched, true);
eq("an affiliate link is not a deal", (() => { const x = matchOf(tryx, w1.creators[0], world({ links: [link({ creator_id: "builder", brand_key: "tryx.com", domain: "tryx.com", kind: "affiliate" })] })); return [!!x.flags.works, x.flags.affiliate?.kind]; })(), [false, "affiliate"]);
eq("a rejected link doesn't count", matchOf(tryx, w1.creators[0], world({ links: [link({ creator_id: "builder", brand_key: "tryx.com", domain: "tryx.com", verdict: "no" })] })).flags.works, undefined);

// What a brand sells: yours wins, then the site, then its type.
eq("sells: your pick", sellsOf(brand({ match_topics: ["keyboards", "mice"] })), [{ key: "keyboards", weight: 0.5 }, { key: "mice", weight: 0.5 }]);
eq("sells: from the brand type", sellsOf(brand({ brand_type: "Laptops" })).map((s) => s.key), ["laptops"]);
eq("no data → missing brand", matchOf(brand({ id: "b9" }), w0.creators[0], w0).missing, "brand");
eq("no videos read → missing creator", matchOf(tryx, creator("new"), w0).missing, "creator");

// Budget.
const camp = { id: "c", brand_id: "b1", status: "completed", agreed_payment: 6000, creator_ids: ["a", "b"] } as unknown as Campaign;
eq("budget from deals", budgetOf(tryx, { links: [], creators: [], campaigns: [camp] }), { kind: "deals", low: 3000, high: 3000, per: "campaign", from: "1 deal you closed", n: 1 });
const est = budgetOf(tryx, { links: [link({ creator_id: "builder", brand_key: "tryx.com", domain: "tryx.com" })], creators: [creator("builder", { avg_views: 200_000 })], campaigns: [] });
eq("budget estimate from who they sponsor", [est?.kind, est?.low, est?.high], ["estimate", 3000, 7000]);

// Found brands: not in the CRM, shops left out.
const w2 = world({ links: [link({ creator_id: "builder", brand_key: "raycon.com", brand_name: "Raycon", domain: "raycon.com", evidence: [{ video: "r1", title: "t", at: "2026-10-01", kind: "sponsored", confidence: 0.9, signals: ["description", "paid_label"], quote: "Sponsored by Raycon" }] }), link({ creator_id: "mixed", brand_key: "raycon.com", brand_name: "Raycon", domain: "raycon.com", evidence: [{ video: "r2", title: "t", at: "2026-10-01", kind: "sponsored", confidence: 0.9, signals: ["description"], quote: "Thanks to Raycon for sponsoring" }] }), link({ creator_id: "mixed", brand_key: "amazon.com", brand_name: "Amazon", domain: "amazon.com", store: true, kind: "affiliate" }), link({ creator_id: "builder", brand_key: "tryx.com", brand_name: "TRYX", domain: "tryx.com" })] });
eq("found brands", foundBrands(w2).map((f) => [f.seen.name, f.creators]), [["Raycon", 2]]);
const said = (q: string, sig: string[] = ["description", "paid_label"]) => [{ video: "v" + q.length, title: "t", at: "2026-10-01", kind: "sponsored", confidence: 0.9, signals: sig, quote: q }] as never;
const w3 = world({ links: [
  link({ creator_id: "builder", brand_key: "autodoc.de", brand_name: "AUTODOC", domain: "autodoc.de", evidence: said("Sponsored by AUTODOC") }),
  link({ creator_id: "mixed", brand_key: "autodoc.com", brand_name: "Autodoc", domain: "autodoc.com", evidence: said("This video is sponsored by Autodoc") }),
  link({ creator_id: "cars", brand_key: "n:autodoc", brand_name: "Autodoc", domain: "", evidence: said("Thanks to Autodoc for sponsoring") }),
  link({ creator_id: "builder", brand_key: "aztech.com", brand_name: "Aztech", domain: "aztech.com", evidence: said("Aztech wheels https://aztech.com") }),
  link({ creator_id: "builder", brand_key: "epidemicsound.com", brand_name: "Epidemic Sound", domain: "epidemicsound.com", kind: "affiliate", evidence: said("Music: https://epidemicsound.com/referral/x") }),
  link({ creator_id: "mixed", brand_key: "tryx.com", brand_name: "TRYX", domain: "tryx.com", evidence: said("TRYX sent me this PC", ["description", "title"]) }),
  link({ creator_id: "cars", brand_key: "oldbrand.com", brand_name: "Old Brand", domain: "oldbrand.com", evidence: said("Sponsored by Old Brand") }),
], archivedBrands: [{ name: "Old Brand", domain: "oldbrand.com" }] });
eq("found: one row per brand across domains and names; no hint, affiliate, CRM or archived brand", foundBrands(w3).map((f) => [f.seen.name, f.creators]), [["AUTODOC", 3]]);

// ---- only trusted deals reach the screen ----
const sureEv = (q: string, sig: string[]) => [{ video: "t" + q.length, title: "t", at: "2026-10-01", kind: "sponsored", confidence: 0.9, signals: sig, quote: q }] as never;
const seenOk = (key: string, name: string, domain: string, check = "site") => [key, { brand_key: key, name, domain, domain_check: check, site: { via: "link" }, checked_at: "x", hidden: false, added_brand_id: null }] as [string, never];
const raw = [
  link({ id: "a", creator_id: "builder", brand_key: "raycon.com", brand_name: "Raycon", domain: "raycon.com", evidence: sureEv("Sponsored by Raycon", ["description", "paid_label"]) }),
  link({ id: "b", creator_id: "builder", brand_key: "n:either", brand_name: "either", domain: "", evidence: sureEv("Sponsored by either", ["description", "paid_label"]) }),
  link({ id: "c", creator_id: "builder", brand_key: "sbck.me", brand_name: "RevenueCat", domain: "sbck.me", evidence: sureEv("Sponsored by RevenueCat", ["description", "paid_label"]) }),
  link({ id: "d", creator_id: "builder", brand_key: "aztech.com", brand_name: "Aztech", domain: "aztech.com", evidence: sureEv("Aztech https://aztech.com", ["description"]) }),
  link({ id: "e", creator_id: "builder", brand_key: "tryx.com", brand_name: "TRYX", domain: "tryx.com", confidence: 0.5, evidence: sureEv("TRYX sent me this", ["description"]) }),
  link({ id: "f", creator_id: "builder", brand_key: "keychron.com", brand_name: "Keychron", domain: "keychron.com", verdict: "yes" }),
];
const seenMap = new Map([seenOk("raycon.com", "Raycon", "raycon.com"), seenOk("n:either", "either", ""), seenOk("sbck.me", "RevenueCat", "sbck.me", "mismatch"), seenOk("aztech.com", "Aztech", "aztech.com")]);
eq("trusted: verified sure deal yes; phrase, short link, no-words link, weak and unchecked no; your yes always", trustedLinks(raw, seenMap, [tryx]).map((l) => l.id), ["a", "f"]);
const mk = (id: string, name: string, domain: string, extra: Record<string, unknown> = {}) => brand({ id, name, domain, created_at: `2026-11-1${id.length}`, discovered: { creator_id: "x", creator: "x", kind: "sponsored", at: "" }, ...extra } as never);
eq("doubts: phrases, handles, trackers, copies, no site; real brands kept", [...brandDoubts([brand({ id: "own", name: "NZXT", domain: "nzxt.com", created_at: "2026-01-01" }), mk("1", "Asus and their Expertbook Ultra", "bestlaptop.deals"), mk("22", "@NZXTglobal", ""), mk("333", "RevenueCat", "sbck.me"), mk("4444", "Sony", ""), mk("55555", "febi", "febi.com"), mk("666666", "HOLY", "weareholy.com"), mk("7777777", "Nothing", "nothing.tech")]).keys()], ["1", "22", "333", "4444"]);

// ---- Add: the found list and its button agree (Gamma "Added 0" bug) ----
const tw = [
  { id: "g", name: "Gamma", domain: "", archived_at: "2026-11-10", discovered: { creator_id: "x", creator: "x", kind: "sponsored", at: "", cleanup: true } },
  { id: "m", name: "Meter.com", domain: "", archived_at: "2026-11-10", discovered: { creator_id: "x", creator: "x", kind: "sponsored", at: "", cleanup: true } },
  { id: "u", name: "Anker", domain: "anker.com", archived_at: null, discovered: null },
  { id: "y", name: "Mine", domain: "mine.com", archived_at: "2026-11-01", discovered: null },
] as never as Brand[];
eq("twin: archived clean-up copy is restored, not counted as 'have'", [brandTwin(tw, "Gamma", "gamma.app").cleanup?.id, brandTwin(tw, "Gamma", "gamma.app").active], ["g", undefined]);
eq("twin: 'Meter.com' is the same brand as Meter", brandTwin(tw, "Meter", "meter.com").cleanup?.id, "m");
eq("twin: active brand by website label", brandTwin(tw, "Ankerfast", "anker.com").active?.id, "u");
eq("twin: a brand you archived is neither (the list never offers it)", brandTwin(tw, "Mine", "mine.com"), { cleanup: undefined });
const w9 = { ...w3, brands: [], archivedBrands: tw.filter((b) => b.archived_at), links: w3.links.map((l) => ({ ...l })) } as MatchWorld;
eq("found: a clean-up copy doesn't hide a verified find", foundBrands(w9).length, foundBrands({ ...w3, brands: [], archivedBrands: [] } as MatchWorld).length);

// ---- market: where they sell vs where the audience is ----
const usBrief = { ...tryx.brief, markets: ["United States", "United Kingdom"] };
const usBrand = brand({ id: "b1", brief: usBrief } as never);
const geoWorld = world({ creators: [creator("us", { country: "United States" }), creator("uk", { country: "United Kingdom" }), creator("de", { country: "Germany" }), creator("nowhere", { country: "" }), creator("kit", { country: "Germany", audience: { verified: { top_countries: [{ country: "United States", pct: 70 }, { country: "Germany", pct: 10 }] } } } as never)],
  content: new Map(["us", "uk", "de", "nowhere", "kit"].map((id) => [id, content([["pc_builds", 0.7], ["gpus", 0.2]])])) });
const g = Object.fromEntries(geoWorld.creators.map((c) => [c.id, matchOf(usBrand, c, geoWorld)]));
yes("same content: US (main market) > UK (also sells) > Germany (doesn't)", g.us.score > g.uk.score && g.uk.score > g.de.score, [g.us.score, g.uk.score, g.de.score]);
yes("a creator outside the brand's markets is never a top pick", g.de.score <= 55, g.de.score);
yes("no country: scored on everything else, not marked down", g.nowhere.score >= g.uk.score && g.nowhere.geo === null, [g.nowhere.score, g.uk.score]);
eq("market reason reads plainly", [g.us.reasons[1].text, g.uk.reasons[1].text, g.de.reasons[1].text], ["US · their main market", "UK · they sell there too", "Germany · they don't sell there"]);
yes("media-kit audience beats the creator's own country", g.kit.geo?.source === "kit" && g.kit.score > g.de.score && g.kit.reasons[1].text.startsWith("Audience 70% US"), [g.kit.geo, g.kit.reasons[1]]);
// Edits show at once: change the country, the match follows (no stale cache across worlds).
const moved = world({ ...geoWorld, creators: geoWorld.creators.map((c) => (c.id === "de" ? { ...c, country: "United States" } : c)), content: geoWorld.content });
yes("changing a creator's country re-scores them", matchOf(usBrand, moved.creators.find((c) => c.id === "de")!, moved).score === g.us.score, matchOf(usBrand, moved.creators.find((c) => c.id === "de")!, moved).score);

// ---- content: the narrower the fit, the better (a PC brand: a PC-only channel beats a broad tech reviewer) ----
const pcBrand = brand({ id: "b1", brief: usBrief } as never);
const techWorld = world({ creators: [creator("pconly"), creator("broad"), creator("phones")],
  content: new Map([["pconly", content([["pc_builds", 0.75], ["pc_cases", 0.15], ["gpus", 0.1]])], ["broad", content([["phones", 0.3], ["pc_builds", 0.25], ["laptops", 0.2], ["audio", 0.15]])], ["phones", content([["phones", 0.85]])]]) });
const [tp, tb, tph] = ["pconly", "broad", "phones"].map((id) => matchOf(pcBrand, techWorld.creators.find((c) => c.id === id)!, techWorld));
yes("PC-only channel is the best match for a PC hardware brand", tp.score > tb.score && tp.tone === "great", [tp.score, tb.score]);
yes("a broad tech reviewer (phones, PCs, laptops) is a good match", tb.score >= 62 && tb.score > tph.score, [tb.score, tph.score]);
yes("a phones-only channel ranks lowest", tph.score < tb.score, tph.score);

if (fail) { console.log(`\n${fail} failing`); process.exit(1); } else console.log("\nall match tests pass");
