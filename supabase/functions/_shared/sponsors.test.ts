// Run: node --experimental-strip-types supabase/functions/_shared/sponsors.test.ts
import { brandish, cleanName, combine, dealProof, domainFits, nameAsDomain, readTranscript, hostKind, linksToFollow, normalizeDomain, readVideo, sureness, type Known, type VideoIn } from "./sponsors.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};
const yes = (name: string, cond: boolean, info?: unknown) => { if (!cond) fail++; console.log(cond ? "ok  " : "FAIL", name, cond ? "" : JSON.stringify(info)); };

const known: Known[] = [{ key: "tryx.com", name: "TRYX", domain: "tryx.com" }, { key: "keychron.com", name: "Keychron", domain: "keychron.com" }];
const ctx = { creator: "Lecctron", handle: "lecctron", known };
const vid = (over: Partial<VideoIn>): VideoIn => ({ id: "abcdefghijk", title: "My new build", description: "", at: "2026-10-01T00:00:00Z", secs: 900, ...over });
const brands = (r: ReturnType<typeof readVideo>) => r.mentions.map((m) => `${m.name}|${m.kind}|${m.domain || "-"}`);
const conf = (r: ReturnType<typeof readVideo>, name: string) => r.mentions.find((m) => m.name === name)?.confidence || 0;

// ---- domains ----
eq("domain from a full url", normalizeDomain("https://www.tryx.com/en?x=1"), "tryx.com");
eq("regional subdomain", normalizeDomain("eu.3wliners.com"), "3wliners.com");
eq("two-level suffix", normalizeDomain("https://shop.scan.co.uk/products"), "scan.co.uk");
eq("tracking junk", normalizeDomain("simsonn.com/?ref=DEAL&gad_source=1"), "simsonn.com");
eq("not a domain", normalizeDomain("hello world"), "");
eq("host kinds", ["amzn.to", "nordvpn.sjv.io", "twitter.com", "tryx.com", "geni.us"].map(hostKind), ["store", "redirect", "social", "brand", "redirect"]);
eq("short links to follow", linksToFollow("a https://bit.ly/x b https://tryx.com c https://geni.us/y"), ["https://bit.ly/x", "https://geni.us/y"]);

// ---- names ----
eq("clean: friends at", cleanName("our friends at Squarespace for this video"), "Squarespace");
eq("clean: rejects pronoun", cleanName("me this case"), "");
eq("clean: rejects generic", cleanName("the PC"), "");

// ---- a classic sponsor read + a parts list on Amazon + a plain brand link ----
const classic = readVideo(vid({ description: `Thanks to Squarespace for sponsoring this video! Go to https://squarespace.com/lecctron for 10% off your first purchase.

Parts list:
CPU: https://amzn.to/abc
GPU: https://amzn.to/def
Case: https://tryx.com/products/luca

Follow me:
https://twitter.com/lecctron` }), ctx);
eq("classic: squarespace sponsored + amazon store affiliate, plain case link is no deal", brands(classic), ["Squarespace|sponsored|squarespace.com", "Amazon|affiliate|amazon.com"]);
yes("classic: sponsor is sure", conf(classic, "Squarespace") >= 0.85, classic.mentions);
yes("classic: amazon is a store", classic.mentions.find((m) => m.name === "Amazon")?.store === true);

// ---- "TRYX sent me" in the description, not sponsored ----
const seeded = readVideo(vid({ description: "TRYX sent me the Luca L70 for this build — not sponsored, all opinions are my own.\nhttps://tryx.com/luca" }), ctx);
eq("seeded: TRYX seeded", brands(seeded), ["TRYX|seeded|tryx.com"]);
eq("seeded: not sponsored noticed", seeded.notSponsored, true);

// ---- in the title ----
const titled = readVideo(vid({ title: "TRYX sent me their craziest case yet…", description: "Music by Epidemic Sound" }), ctx);
eq("title: seeded from the title", brands(titled), ["TRYX|seeded|tryx.com"]);
yes("title: likely or better", conf(titled, "TRYX") >= 0.8);

// ---- affiliate code ----
const aff = readVideo(vid({ description: "Use code ZAC for 10% off at Keychron: https://keychron.com/?ref=zac" }), ctx);
eq("affiliate: keychron", brands(aff), ["Keychron|affiliate|keychron.com"]);

// ---- paid label + an unnamed promo link up top ----
const paidLead = readVideo(vid({ paid: true, title: "This $500 PC is insane", description: "Get 20% off Ridge with my link: https://ridge.com/LECCTRON\n\nMy gear: https://kit.co/lecctron" }), ctx);
eq("paid lead link = sponsor", brands(paidLead), ["Ridge|sponsored|ridge.com"]);
yes("paid lead link: flagged unsure for the AI", paidLead.mentions[0]?.unsure === true);

// ---- chapters ----
const chapters = readVideo(vid({ description: "0:00 Intro\n1:12 Sponsor - NordVPN\n2:30 The build" }), ctx);
eq("chapters: nordvpn at 72s", chapters.mentions.map((m) => [m.name, m.kind, m.t]), [["NordVPN", "sponsored", 72]]);

// ---- business inquiries and merch are the creator's own ----
const own = readVideo(vid({ description: "For sponsorships: business@lecctron.com\nMy merch: https://lecctron.store\nSupport the channel on Patreon: https://patreon.com/lecctron" }), ctx);
eq("own: nothing", brands(own), []);

// ---- sponsor segment with nothing in the text → listen ----
const silent = readVideo(vid({ description: "New video every week!", segments: [{ category: "sponsor", action: "skip", start: 64.2, end: 121.9 }] }), ctx);
eq("silent sponsor segment → listen window", silent.listen, { start: 61, end: 125, why: "sponsor segment" });

// ---- impact link (not followed yet) named on the line ----
const impact = readVideo(vid({ description: "This video is sponsored by NordVPN: https://nordvpn.sjv.io/abc" }), ctx);
eq("impact: name from the sentence", brands(impact), ["NordVPN|sponsored|nordvpn.com"]);
const followed = readVideo(vid({ description: "Check out the deal: https://bit.ly/3xyz" }), { ...ctx, resolved: { "https://bit.ly/3xyz": "https://www.fanttik.com/products/x9?ref=lec" } });
eq("followed short link: tracking → affiliate", brands(followed), ["Fanttik|affiliate|fanttik.com"]);

// ---- #ad + sent ----
const adSent = readVideo(vid({ description: "#ad Thanks Corsair for sending the 6500X! https://www.corsair.com/6500x" }), ctx);
eq("#ad wins over sent", brands(adSent), ["Corsair|sponsored|corsair.com"]);

// ---- bought it myself ----
const bought = readVideo(vid({ title: "Fractal North review", description: "This video is not sponsored. I bought the Fractal North with my own money." }), ctx);
eq("bought it: nothing", brands(bought), []);

// ---- a shop as the sponsor ----
const shop = readVideo(vid({ description: "This video is sponsored by Newegg! Shop the deals below." }), ctx);
eq("store sponsor", brands(shop), ["Newegg|sponsored|newegg.com"]);

// ---- header "Sponsored by:" then a line with the link ----
const header = readVideo(vid({ description: "Sponsored by:\nNordVPN - https://nordvpn.com/lecctron\n\nTimestamps:\n0:00 Intro" }), ctx);
eq("sponsor header covers the next line", brands(header), ["NordVPN|sponsored|nordvpn.com"]);

// ---- gear list: a brand link with a ref code is their affiliate ----
const gear = readVideo(vid({ description: "Gear I use:\nKeyboard: https://www.keychron.com/products/q1?ref=abc\nCamera: https://www.sony.com/a7iv" }), ctx);
eq("gear: ref link = affiliate, plain link = nothing", brands(gear), ["Keychron|affiliate|keychron.com"]);

// ---- creator's own site by name ----
const site = readVideo(vid({ description: "Shop: https://lecctronstore.com" }), ctx);
eq("own store by handle", brands(site), []);

// ---- exclusive access marked on SponsorBlock + brand in title ----
const excl = readVideo(vid({ title: "Hands on with the new TRYX Panorama", segments: [{ category: "exclusive_access", action: "full", start: 0, end: 0 }] }), ctx);
eq("exclusive access → seeded", brands(excl), ["TRYX|seeded|tryx.com"]);

// ---- "who sent" ----
const who = readVideo(vid({ description: "Huge thanks to Lian Li, who sent the O11 Vision for this build." }), ctx);
eq("thanks X who sent", brands(who), ["Lian Li|seeded|lian-li.com"]);

// ---- unknown brand named, no link ----
const unknown = readVideo(vid({ description: "This video is sponsored by Zephyrix Labs." }), ctx);
eq("unknown brand kept without a domain", unknown.mentions.map((m) => [m.name, m.kind, m.key, m.domain]), [["Zephyrix Labs", "sponsored", "n:zephyrixlabs", ""]]);
yes("unknown brand less sure than a linked one", conf(unknown, "Zephyrix Labs") < 0.85);

// ---- tricky real-world lines ----
eq("sponsored by nobody", brands(readVideo(vid({ description: "Video sponsored by: nobody, I bought this myself." }), ctx)), []);
const person = readVideo(vid({ description: "Huge thanks to Linus for sending the GPU over!" }), ctx);
yes("a person who sent something is at most possible", person.mentions.every((m) => m.confidence <= 0.6), person.mentions);
const cta = readVideo(vid({ description: "Get NordVPN 2Y plan + 4 months extra here ➼ https://nordvpn.com/linus It's risk-free with Nord's 30-day money-back guarantee!\n\nTimestamps:\n0:00 Intro" }), ctx);
eq("a CTA link up top is read (unsure, for the AI)", cta.mentions.map((m) => [m.name, m.kind, !!m.unsure]), [["NordVPN", "affiliate", true]]);
const ctaPaid = readVideo(vid({ paid: true, description: "Get NordVPN 2Y plan + 4 months extra here ➼ https://nordvpn.com/linus" }), ctx);
eq("…and with the paid label it's the sponsor", ctaPaid.mentions.map((m) => [m.name, m.kind]), [["NordVPN", "sponsored"]]);
const epi = readVideo(vid({ description: "Music from Epidemic Sound (free 30-day trial): https://www.epidemicsound.com/referral/abc123" }), ctx);
eq("music referral link = affiliate", epi.mentions.map((m) => [m.name, m.kind]), [["Epidemic Sound", "affiliate"]]);
const notSp = readVideo(vid({ title: "Apple sent me nothing — iPhone 18 review", description: "This video is not sponsored by Apple." }), ctx);
eq("not sponsored by X", notSp.mentions.filter((m) => m.confidence >= 0.4).map((m) => m.name), []);
const members = readVideo(vid({ description: "Thanks to all channel members for supporting the channel!" }), ctx);
eq("thanks to members", brands(members), []);

// ---- seen on real channels ----
const app = readVideo(vid({ description: "Mit meinem Code „MoodyCars“ erhältst du 5 % Rabatt auf AUTODOC-Produkte! Lade die AUTODOC-App herunter: https://bit.ly/AUTODOC_Mo\nAutodoc Shop: https://www.autodoc.de/?utm_source=youtube&utm_campaign=moody" }), { ...ctx, resolved: { "https://bit.ly/AUTODOC_Mo": "https://autodoc.onelink.me/abc?pid=youtube" } });
eq("an app deep link isn't a brand of its own", app.mentions.some((m) => /onelink/.test(m.domain)), false);
const listing = readVideo(vid({ description: "→ Zum Bentley: https://suchen.mobile.de/fahrzeuge/details.html?id=439082080&cn=DE&utm_source=yt" }), ctx);
eq("a car listing on a marketplace isn't a deal (not even a store link)", listing.mentions.map((m) => m.name), []);
const joined = combine([
  { video: { id: "v1", title: "a", at: "2026-10-01" }, m: { key: "autodoc.de", name: "Autodoc", domain: "autodoc.de", domainFrom: "link", kind: "sponsored", confidence: 0.9, signals: ["description"], quote: "x" } },
  { video: { id: "v2", title: "b", at: "2026-10-02" }, m: { key: "n:autodoc", name: "AUTODOC", domain: "", domainFrom: "", kind: "sponsored", confidence: 0.7, signals: ["description"], quote: "y" } },
]);
eq("a name-only find joins the same brand's domain", joined.map((l) => [l.key, l.videos]), [["autodoc.de", 2]]);

const fanttik = readVideo(vid({ paid: true, description: "Remaking a modern version of the Crystal XBOX - Thank you Fanttik for sponsoring this video! Fanttik is running a big Father's Day promotion now: https://fanttik.com/zac" }), ctx);
eq("a console in the sponsor line isn't the sponsor", fanttik.mentions.map((m) => [m.name, m.kind]), [["Fanttik", "sponsored"]]);
const epiPaid = readVideo(vid({ paid: true, segments: [{ category: "sponsor", action: "skip", start: 40, end: 90 }], description: "All of the Music and SFX I use comes from: https://www.epidemicsound.com/referral/pw5gp9/\nThank you Opera for sponsoring this video! Try Opera for free: https://opr.as/Opera-browser-zac" }), { ...ctx, resolved: { "https://opr.as/Opera-browser-zac": "https://www.opera.com/gx?utm_campaign=zac" } });
eq("a referral up top stays an affiliate; the named sponsor wins", epiPaid.mentions.map((m) => [m.name, m.kind]), [["Opera GX", "sponsored"], ["Epidemic Sound", "affiliate"]]);
const kick = readVideo(vid({ paid: true, description: "UGREEN HomeAgent on Kickstarter: https://bit.ly/4xaVqla" }), { ...ctx, resolved: { "https://bit.ly/4xaVqla": "https://www.kickstarter.com/projects/ugreen/homeagent" } });
eq("a crowdfunding page isn't the brand", kick.mentions.some((m) => /kickstarter/i.test(m.name)), false);
const imp = readVideo(vid({ description: "Product link: https://makerainc.sjv.io/zacbuild" }), { ...ctx, resolved: { "https://makerainc.sjv.io/zacbuild": "https://ojrq.net/c/123/456" } });
eq("a tracker that lands on another tracker isn't a brand", imp.mentions.some((m) => /ojrq/i.test(m.domain)), false);

const tld = combine([
  { video: { id: "v1", title: "a", at: "2026-10-01" }, m: { key: "autodoc.de", name: "Autodoc", domain: "autodoc.de", domainFrom: "link", kind: "sponsored", confidence: 0.9, signals: ["description"], quote: "x" } },
  { video: { id: "v2", title: "b", at: "2026-10-02" }, m: { key: "autodoc.com", name: "AUTODOC", domain: "autodoc.com", domainFrom: "known", kind: "sponsored", confidence: 0.84, signals: ["voice"], quote: "y" } },
]);
eq("one brand on two country domains is one row (the creator's link wins)", tld.map((l) => [l.key, l.videos]), [["autodoc.de", 2]]);

// ---- across videos ----
const v1 = { id: "a1", title: "Build 1", at: "2026-08-01" }, v2 = { id: "a2", title: "Build 2", at: "2026-09-01" };
const links = combine([
  { video: v1, m: { key: "tryx.com", name: "TRYX", domain: "tryx.com", domainFrom: "known", kind: "seeded", confidence: 0.7, signals: ["description"], quote: "TRYX sent" } },
  { video: v2, m: { key: "tryx.com", name: "TRYX", domain: "tryx.com", domainFrom: "known", kind: "seeded", confidence: 0.7, signals: ["title"], quote: "TRYX sent me" } },
]);
eq("combine: one row, two videos", links.map((l) => [l.key, l.kind, l.videos, l.first, l.last]), [["tryx.com", "seeded", 2, "2026-08-01", "2026-09-01"]]);
yes("combine: two sightings surer than one", links[0].confidence > 0.7 && links[0].confidence < 0.97, links[0].confidence);
eq("sureness words", [sureness(0.9), sureness(0.7), sureness(0.5), sureness(0.2), sureness(0.2, true)], ["Sure", "Likely", "Possible", "Unsure", "Confirmed"]);

// ---- names and negations seen live ----
eq("thanks FOR X for sponsoring", brands(readVideo(vid({ description: "Thanks for Grüns for sponsoring this video! Get up to 52% off! https://gruns.yt.link/Owa8xA3" }), ctx)).map((x) => x.split("|")[0]), ["Grüns"]);
eq("no affiliation or sponsorship = not a deal", readVideo(vid({ description: "You can order a Pebble Watch from https://repebble.com/ (no affiliation or sponsorship)." }), ctx).mentions.filter((m) => m.kind !== "affiliate" && m.confidence >= 0.45).length, 0);
eq("music licence line is not a deal", readVideo(vid({ description: "🎵 Copyrighted music licensed from Lickd. https://lickd.co" }), ctx).mentions.length, 0);

// ---- names and domains from real junk ----
eq("handle → name", ["@NZXTglobal", "@HerschelSupply#ad", "@LIANLIHQ", "@adidas", "@NoctuaVideos"].map(cleanName), ["NZXT", "Herschel Supply", "LIANLI", "adidas", "Noctua"]);
eq("phrases cut to the brand", ["Asus and their Expertbook Ultra", "Google and shoutout Skullcandy", "Gamma sponsorship", "- Keysfan.com", "FSA Store®"].map(cleanName), ["Asus", "Google", "Gamma", "Keysfan.com", "FSA Store"]);
eq("junk is not a brand", ["either", "segment", "teams", "in advance", "10% off)", "Spot", "spot", "Sponsorship", "Kickstarter"].map(brandish), [false, false, false, false, false, false, false, false, false]);
eq("real names are", ["NZXT", "eBay", "Eight Sleep", "Keysfan.com", "GL.iNET", "Abacus.AI", "3M"].map(brandish), [true, true, true, true, true, true, true]);
eq("name that is a domain", ["Monday.com", "Keysfan.com", "Boot.dev", "Ridge"].map(nameAsDomain), ["monday.com", "keysfan.com", "boot.dev", ""]);
eq("domain fits: prefixes and suffixes", [["HOLY", "weareholy.com"], ["Surfshark", "getsurfshark.com"], ["Ridge", "ridgewallet.com"], ["Away", "awaytravel.com"], ["Holy", "holiday.com"]].map(([n, d]) => domainFits(n, d)), [true, true, true, true, false]);
eq("domain fits the brand", [["RevenueCat", "sbck.me"], ["Twingate", "plug.dev"], ["Xsolla", "x.la"], ["Dotomi", "dotomi.com"], ["Eight Sleep", "eightsleep.com"], ["Abacus.AI", "abacus.ai"], ["Prusa", "prusa3d.com"], ["Sapphire", "sapphiretech.com"], ["Boot.Dev", "boot.dev"], ["Asus", "bestlaptop.deals"], ["Private Internet Access", "privateinternetaccess.com"]].map(([n, d]) => domainFits(n, d)), [false, false, false, true, true, true, true, true, true, false, true]);

// ---- proof: only real brand deals count ----
const ev = (over: Record<string, unknown>) => ({ video: "v1", title: "Build", at: "2026-09-01", kind: "sponsored", confidence: 0.9, signals: ["description"], quote: "This video is sponsored by NordVPN", ...over }) as never;
const P = (evidence: unknown[], kind = "sponsored", extra: Record<string, unknown> = {}) => dealProof({ kind: kind as never, evidence: evidence as never, ...extra }).level;
eq("words + paid label = proven", P([ev({ signals: ["description", "paid_label"] })]), "proven");
eq("words + sponsorblock = proven", P([ev({ signals: ["description", "sponsorblock"] })]), "proven");
eq("words in one description only = stated", P([ev({})]), "stated");
eq("words in two videos = proven", P([ev({}), ev({ video: "v2" })]), "proven");
eq("seeded in description + title = proven", P([ev({ kind: "seeded", signals: ["description", "title"], quote: "TRYX sent me this PC" })], "seeded"), "proven");
eq("heard in the video = proven", P([ev({ signals: ["voice"], quote: "thanks to Ridge for sponsoring today's video" })]), "proven");
eq("a link up top in a paid video = hint", P([ev({ signals: ["description", "paid_label"], quote: "Get 20% off: https://aztech.example" })]), "hint");
eq("a plain description link = hint (Aztech case)", P([ev({ quote: "Aztech wheels https://aztech.example" })]), "hint");
eq("the reader's own paid-label note isn't their words", P([ev({ signals: ["title", "paid_label"], quote: "My build — YouTube shows \u201cIncludes paid promotion\u201d" })]), "hint");
eq("affiliate never a deal", P([ev({ kind: "affiliate", quote: "use code ZAC" })], "affiliate"), "affiliate");
eq("store never a deal", P([ev({})], "sponsored", { store: true }), "affiliate");
eq("your yes = proven", P([ev({ quote: "x" })], "sponsored", { verdict: "yes" }), "proven");

// ---- what they say (captions) ----
const capsOf = (text: string, startMs = 30_000) => text.split(/(?<=\.)\s+|\n/).map((line, i) => [startMs + i * 4000, line] as [number, string]);
const tr = (text: string, extra: Record<string, unknown> = {}) => readTranscript(capsOf(text), { ...ctx, ...extra } as never);
const trBrands = (r: ReturnType<typeof readTranscript>) => r.mentions.map((m) => `${m.name}|${m.kind}`);
eq("spoken: known brand after 'sponsored by'", trBrands(tr("hey guys welcome back. this video is sponsored by keychron. their new q1 keyboard is great")), ["Keychron|sponsored"]);
yes("spoken: known brand is sure + has a time", (() => { const m = tr("ok so today's video is sponsored by keychron and i love it").mentions[0]; return m.confidence >= 0.85 && m.t === 30 && m.signals.includes("transcript"); })());
eq("spoken: the brand the description links (everyday word)", trBrands(readTranscript(capsOf("before we start a huge thank you to ridge for sponsoring this video"), { ...ctx, local: [{ key: "ridge.com", name: "Ridge", domain: "ridge.com", domainFrom: "link", kind: "affiliate", confidence: 0.6, signals: ["description"], quote: "Ridge: https://ridge.com/x" }] } as never)), ["Ridge|sponsored"]);
eq("spoken: TRYX sent me this", trBrands(tr("so tryx sent me this case to check out and honestly")), ["TRYX|seeded"]);
eq("spoken: a domain said out loud", trBrands(tr("this episode is brought to you by fluxlamp go to fluxlamp dot com slash zac")).map((x) => x.split("|")[0]), ["Fluxlamp"]);
yes("spoken: unknown name stays unsure", (() => { const m = tr("this video is sponsored by zentrovia the app that").mentions[0]; return !!m && m.confidence < 0.6 && m.unsure === true; })());
eq("spoken: 'not sponsored' opening", tr("just so you know this video is not sponsored i bought it myself. keychron makes great boards").mentions.filter((m) => m.kind === "sponsored").length, 0);
eq("spoken: a code inside a sponsor read is the sponsor", trBrands(tr("today's sponsor is keychron. use code lecc for ten percent off")), ["Keychron|sponsored"]);
eq("spoken: brand named but no cue is nothing", tr("i used a keychron keyboard for years and it was fine").mentions.length, 0);
eq("proof: spoken + known = proven", P([ev({ signals: ["transcript"], quote: "“this video is sponsored by keychron their new keyboard”", confidence: 0.86 })]), "proven");
eq("proof: spoken unknown name = not proven", P([ev({ signals: ["transcript"], quote: "“this video is sponsored by zentrovia the app”", confidence: 0.5 })]), "stated");
eq("combine keeps every video id", combine([{ video: v1, m: { key: "x.com", name: "X", domain: "x.com", domainFrom: "link", kind: "sponsored", confidence: 0.9, signals: ["description"], quote: "Sponsored by X" } }, { video: v2, m: { key: "x.com", name: "X", domain: "x.com", domainFrom: "link", kind: "sponsored", confidence: 0.9, signals: ["description"], quote: "Sponsored by X" } }])[0].videoIds, ["a2", "a1"]);

if (fail) { console.log(`\n${fail} failing`); (globalThis as { process?: { exit: (n: number) => void } }).process?.exit(1); }
else console.log("\nall sponsor tests pass");
