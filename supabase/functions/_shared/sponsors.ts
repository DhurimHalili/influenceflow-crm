// Which brands a creator works with, read from their own videos.
//
// Every video is read from what is public and what the creator wrote:
//   • YouTube's own "Includes paid promotion" label (the creator ticks it)
//   • the description, line by line: "sponsored by", "thanks to X for…",
//     "X sent me", "use code…", the links under those lines (short links and
//     affiliate redirects are followed to the real shop first), chapters
//     ("1:20 Sponsor – NordVPN") and the "gear I use" lists (store affiliate
//     links there are NOT a deal with the product's brand)
//   • the title ("TRYX sent me their craziest case")
//   • SponsorBlock: the community marks sponsor segments and "exclusive
//     access" (the brand gave them the product / early access)
// Three kinds, kept apart because they mean different things for a pitch:
//   sponsored = paid placement ("sponsored by", paid label, sponsor segment)
//   seeded    = the brand sent / lent the product ("X sent me this PC") —
//               often a deal, always a relationship
//   affiliate = a link or code that pays them commission, no paid placement
// Every finding carries the exact line or signal it came from and a
// confidence; nothing is guessed silently. The AI (Clef) only re-judges the
// unsure ones on the server. Pure — tested in sponsors.test.ts.

export type DealKind = "sponsored" | "seeded" | "affiliate";
export type Signal = "paid_label" | "description" | "title" | "chapters" | "sponsorblock" | "voice" | "transcript" | "ai" | "you";
export type Segment = { category: string; action: string; start: number; end: number; description?: string; votes?: number };
export type VideoIn = { id: string; title: string; description: string; tags?: string[]; paid?: boolean; segments?: Segment[]; at: string; secs?: number };
export type Known = { key: string; name: string; domain: string; aliases?: string[] };
export type Mention = {
  /** Registrable domain when known ("tryx.com"), else "n:" + name slug. */
  key: string;
  name: string;
  domain: string;
  /** Where the domain came from: the creator's own link, a known brand, or nothing yet. */
  domainFrom: "link" | "known" | "";
  kind: DealKind;
  confidence: number;
  signals: Signal[];
  /** The line (or signal) that shows it, ≤ 220 chars. */
  quote: string;
  /** Seconds into the video when known (chapter / SponsorBlock). */
  t?: number;
  /** A shop (Amazon, Best Buy…) — their affiliate program, not a deal with the product's brand. */
  store?: boolean;
  /** A rules call the AI should double-check (ambiguous wording). */
  unsure?: boolean;
};
export type Reading = {
  mentions: Mention[];
  paid: boolean;
  sponsorSegments: { start: number; end: number }[];
  /** The video says it isn't sponsored ("not sponsored", "bought it myself"). */
  notSponsored: boolean;
  /** Paid label or a sponsor segment, but no brand could be named from text: listen to this window. */
  listen?: { start: number; end: number; why: string };
};

// ---- domains --------------------------------------------------------------------------

const TWO_LEVEL = /\.(?:co|com|net|org|gov|ac|edu|ne|or)\.(?:uk|jp|kr|au|nz|za|in|br|mx|tr|cn|hk|tw|sg|my|id|th|il|ar|co)$|\.(?:com|net|org)\.(?:au|br|mx|cn|hk|tw|sg|my|tr|ar|co|pl|ua)$/i;

/** "https://www.Tryx.com/en?x=1" → "tryx.com"; "eu.3wliners.com" → "3wliners.com"; "" when it isn't a domain. */
export function normalizeDomain(input: string): string {
  let raw = String(input || "").trim().toLowerCase();
  if (!raw) return "";
  raw = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/^\/\//, "");
  raw = raw.split(/[/?#\s]/)[0].replace(/:\d+$/, "").replace(/\.$/, "");
  if (raw.includes("@")) raw = raw.split("@").pop() || "";
  if (!/^[a-z0-9.-]+\.[a-z]{2,24}$/.test(raw) || raw.includes("..")) return "";
  const parts = raw.split(".");
  const keep = TWO_LEVEL.test(raw) ? 3 : 2;
  return parts.slice(-keep).join(".");
}
export const hostOf = (url: string) => {
  try { return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\d?\./, ""); } catch { return ""; }
};

const list = (s: string) => new Set(s.split(/\s+/).filter(Boolean));
const SOCIAL = list(`youtube.com youtu.be instagram.com tiktok.com twitter.com x.com facebook.com fb.com fb.me discord.gg discord.com twitch.tv kick.com
  patreon.com linktr.ee beacons.ai threads.net reddit.com spotify.com apple.com music.apple.com podcasts.apple.com soundcloud.com bandcamp.com ko-fi.com
  buymeacoffee.com gofundme.com streamlabs.com streamelements.com throne.com fourthwall.com teespring.com creator-spring.com spri.ng represent.com
  linkedin.com snapchat.com pinterest.com tumblr.com medium.com substack.com github.com gitlab.com docs.google.com forms.gle goo.gl google.com
  bsky.app mastodon.social t.me telegram.me wa.me whatsapp.com cash.app paypal.me paypal.com venmo.com gumroad.com ytjobs.co
  vimeo.com imgur.com dropbox.com drive.google.com onlyfans.com fansly.com mailchi.mp eepurl.com convertkit.com kit.com flowcode.com
  wikipedia.org archive.org youtube-nocookie.com ytimg.com ggpht.com googleusercontent.com apps.apple.com play.google.com itunes.apple.com
  testflight.apple.com kickstarter.com indiegogo.com tr.ee lnk.bio campsite.bio solo.to bio.link hoo.be
  mobile.de autoscout24.de autoscout24.com autotrader.com autotrader.co.uk cars.com carsandbids.com bringatrailer.com kleinanzeigen.de craigslist.org
  marktplaats.nl leboncoin.fr willhaben.at subito.it olx.pl`);
// (The last line: marketplaces and classifieds — a listing link "→ Zum Bentley: mobile.de/…" is not a deal.)
const STORES: Record<string, string> = {
  "amazon.com": "Amazon", "amzn.to": "Amazon", "link.amazon": "Amazon", "amazon.com.mx": "Amazon", "amzn.eu": "Amazon", "a.co": "Amazon", "amazon.co.uk": "Amazon", "amazon.de": "Amazon", "amazon.ca": "Amazon",
  "amazon.com.au": "Amazon", "amazon.fr": "Amazon", "amazon.it": "Amazon", "amazon.es": "Amazon", "amazon.co.jp": "Amazon", "amazon.in": "Amazon", "amazon.nl": "Amazon",
  "bestbuy.com": "Best Buy", "bestbuy.ca": "Best Buy", "bestbuy.7tiv.net": "Best Buy", "newegg.com": "Newegg", "newegg.ca": "Newegg", "bhphotovideo.com": "B&H", "bhpho.to": "B&H",
  "walmart.com": "Walmart", "target.com": "Target", "adorama.com": "Adorama", "ebay.com": "eBay", "aliexpress.com": "AliExpress", "temu.com": "Temu",
  "scan.co.uk": "Scan", "overclockers.co.uk": "Overclockers UK", "ldlc.com": "LDLC", "mindfactory.de": "Mindfactory", "canadacomputers.com": "Canada Computers",
  "memoryexpress.com": "Memory Express", "pccasegear.com": "PC Case Gear", "jbhifi.com.au": "JB Hi-Fi", "currys.co.uk": "Currys", "argos.co.uk": "Argos", "costco.com": "Costco",
  "homedepot.com": "Home Depot", "lowes.com": "Lowe's", "sweetwater.com": "Sweetwater", "guitarcenter.com": "Guitar Center", "rockauto.com": "RockAuto",
  "autozone.com": "AutoZone", "tirerack.com": "Tire Rack", "etsy.com": "Etsy", "kit.co": "Kit", "microcenter.com": "Micro Center", "bol.com": "bol.com",
  "alternate.de": "Alternate", "caseking.de": "Caseking", "proshop.dk": "Proshop", "box.co.uk": "Box", "ebuyer.com": "Ebuyer", "flipkart.com": "Flipkart",
};
const REDIRECTS = list(`bit.ly bitly.com geni.us tinyurl.com t.co ow.ly rebrand.ly short.io dub.sh dub.co lnk.to cutt.ly shorturl.at is.gd buff.ly tidd.ly prf.hn
  go.skimresources.com skimresources.com howl.me howl.link shopmy.us rstyle.me liketk.it urlgeni.us glnk.io fave.co shareasale.com awin1.com linksynergy.com
  anrdoezrs.net jdoqocy.com tkqlhce.com dpbolvw.net kqzyfj.com emjcd.com avantlink.com pntra.com pjtra.com pjatr.com redirect.viglink.com go.redirectingat.com
  yt.link ts.la opr.as dada.link geni.us amzlink.to onelink.me app.link page.link sng.link adj.st smart.link go.link l.instagram.com lmg.gg lttstore.link trk.link bfy.tw ko.gl hyperurl.co amzlink.to joinsg.co go2.page fas.st clk.ink sovrn.co link.ltk.com`);
// impact.com tracking hosts: "<brand>.sjv.io", "<brand>.pxf.io", "<brand>.8odi.net"… — the first label is the brand.
const IMPACT = /^([a-z0-9-]+)\.(?:onelink\.me|app\.link|page\.link|sng\.link|go\.link|smart\.link|test-app\.link|sjv\.io|pxf\.io|[a-z0-9]{4}\.net|evyy\.net|ojrq\.net|xhuz\.net|syuh\.net|mno8\.net|vzew\.net|uqhv\.net|ngih\.net|4cl5\.net|i387\.net|y8uw\.net|r65t\.net|fafn\.net)$/;

export type HostKind = "social" | "store" | "redirect" | "brand";
export function hostKind(host: string): HostKind {
  const h = host.toLowerCase().replace(/^www\d?\./, "");
  const reg = normalizeDomain(h);
  if (SOCIAL.has(h) || SOCIAL.has(reg)) return "social";
  if (STORES[h] || STORES[reg] || /^amazon\.[a-z.]+$/.test(h)) return "store";
  if (REDIRECTS.has(h) || REDIRECTS.has(reg) || IMPACT.test(h) || /^[a-z0-9]{4}\.net$/.test(reg) && /\d|^(?:ojrq|evyy|xhuz|syuh|vzew|uqhv|ngih|fafn|gtgu|zvxo)\.net$/.test(reg)) return "redirect";
  return "brand";
}
const STORE_HOME = new Map<string, string>();
for (const [domain, name] of Object.entries(STORES)) if (!STORE_HOME.has(name) && !/\.to$|^a\.co$|7tiv|bhpho/.test(domain)) STORE_HOME.set(name, domain);
/** The shop's main domain ("amzn.to" → "amazon.com"), so one shop is one row. */
export const storeHome = (name: string) => STORE_HOME.get(name) || "";
const STORE_KNOWN: Known[] = Array.from(STORE_HOME.entries()).map(([name, domain]) => ({ key: domain, name, domain }));
export const storeName = (host: string) => STORES[host] || STORES[normalizeDomain(host)] || (/^amazon\./.test(host) ? "Amazon" : "");
/** Links that should be followed to their real shop before reading (short links, affiliate redirects). */
export function linksToFollow(description: string): string[] {
  return Array.from(new Set(urlsIn(description).filter((u) => hostKind(hostOf(u)) === "redirect" && !/^(?:www\.)?(?:lnk\.to)$/.test(hostOf(u))))).slice(0, 25);
}

// ---- a directory of brands that sponsor creators a lot (verified domains) --------------

const D = (name: string, domain: string, ...aliases: string[]): Known => ({ key: domain, name, domain, aliases });
export const DIRECTORY: Known[] = [
  D("NordVPN", "nordvpn.com"), D("Surfshark", "surfshark.com"), D("ExpressVPN", "expressvpn.com"), D("Private Internet Access", "privateinternetaccess.com", "PIA VPN"),
  D("Proton", "proton.me", "ProtonVPN", "Proton VPN", "Proton Mail"), D("NordPass", "nordpass.com"), D("Incogni", "incogni.com"), D("DeleteMe", "joindeleteme.com", "Delete Me"),
  D("Aura", "aura.com"), D("Squarespace", "squarespace.com"), D("Hostinger", "hostinger.com"), D("Wix", "wix.com"), D("Shopify", "shopify.com"),
  D("BetterHelp", "betterhelp.com"), D("Raycon", "rayconglobal.com"), D("Ridge", "ridge.com", "Ridge Wallet"), D("MANSCAPED", "manscaped.com"),
  D("Audible", "audible.com"), D("Skillshare", "skillshare.com"), D("Brilliant", "brilliant.org"), D("Ground News", "ground.news"), D("Honey", "joinhoney.com"),
  D("Opera GX", "opera.com", "Opera"), D("RAID: Shadow Legends", "plarium.com", "Raid Shadow Legends", "Plarium"), D("Displate", "displate.com"),
  D("Grammarly", "grammarly.com"), D("Canva", "canva.com"), D("Notion", "notion.so"), D("Speechify", "speechify.com"), D("Rocket Money", "rocketmoney.com"),
  D("HelloFresh", "hellofresh.com"), D("Factor", "factor75.com"), D("AG1", "drinkag1.com", "Athletic Greens"), D("Keeps", "keeps.com"), D("Established Titles", "establishedtitles.com"),
  D("Epidemic Sound", "epidemicsound.com"), D("Artlist", "artlist.io"), D("Storyblocks", "storyblocks.com"), D("Adobe", "adobe.com"), D("Wispr Flow", "wisprflow.ai", "Wispr"),
  D("Corsair", "corsair.com"), D("NZXT", "nzxt.com"), D("Lian Li", "lian-li.com"), D("Fractal Design", "fractal-design.com", "Fractal"), D("Phanteks", "phanteks.com"),
  D("be quiet!", "bequiet.com", "be quiet", "bequiet"), D("Noctua", "noctua.at"), D("ARCTIC", "arctic.de"), D("Thermalright", "thermalright.com"), D("DeepCool", "deepcool.com"),
  D("Cooler Master", "coolermaster.com"), D("Seasonic", "seasonic.com"), D("Thermaltake", "thermaltake.com"), D("Antec", "antec.com"), D("HYTE", "hyte.com"),
  D("Montech", "montechpc.com"), D("TRYX", "tryx.com"), D("Jonsbo", "jonsbo.com"), D("MSI", "msi.com"), D("ASUS", "asus.com", "ROG", "Republic of Gamers", "ASUS ROG"),
  D("GIGABYTE", "gigabyte.com", "AORUS"), D("ASRock", "asrock.com"), D("ZOTAC", "zotac.com"), D("Sapphire", "sapphiretech.com"), D("PowerColor", "powercolor.com"),
  D("XFX", "xfxforce.com"), D("NVIDIA", "nvidia.com", "GeForce"), D("AMD", "amd.com", "Radeon", "Ryzen"), D("Intel", "intel.com"), D("Samsung", "samsung.com"),
  D("Western Digital", "westerndigital.com", "WD"), D("Crucial", "crucial.com"), D("Kingston", "kingston.com"), D("G.SKILL", "gskill.com", "GSkill"), D("TEAMGROUP", "teamgroupinc.com", "T-FORCE"),
  D("PNY", "pny.com"), D("Logitech", "logitech.com"), D("Logitech G", "logitechg.com"), D("Razer", "razer.com"), D("SteelSeries", "steelseries.com"), D("HyperX", "hyperx.com"),
  D("Glorious", "gloriousgaming.com"), D("Keychron", "keychron.com"), D("Wooting", "wooting.io"), D("Elgato", "elgato.com"), D("Secretlab", "secretlab.co"),
  D("FlexiSpot", "flexispot.com"), D("Govee", "govee.com"), D("Nanoleaf", "nanoleaf.me"), D("Anker", "anker.com"), D("UGREEN", "ugreen.com"), D("EcoFlow", "ecoflow.com"),
  D("Jackery", "jackery.com"), D("DJI", "dji.com"), D("Insta360", "insta360.com"), D("GoPro", "gopro.com"), D("Framework", "frame.work"), D("Minisforum", "minisforum.com"),
  D("Beelink", "bee-link.com"), D("GEEKOM", "geekompc.com"), D("Jawa", "jawa.gg"), D("Origin PC", "originpc.com"), D("iBUYPOWER", "ibuypower.com"),
  D("CyberPowerPC", "cyberpowerpc.com"), D("MAINGEAR", "maingear.com"), D("Starforge Systems", "starforgesystems.com", "Starforge"), D("Alienware", "alienware.com"),
  D("Dell", "dell.com"), D("HP", "hp.com"), D("Lenovo", "lenovo.com", "Legion"), D("Acer", "acer.com", "Predator"), D("LG", "lg.com"), D("OnePlus", "oneplus.com"),
  D("Nothing", "nothing.tech"), D("Xbox", "xbox.com"), D("PlayStation", "playstation.com"), D("Nintendo", "nintendo.com"), D("Steam", "steampowered.com", "Valve"),
  D("Epic Games", "epicgames.com"), D("Wargaming", "wargaming.net", "World of Tanks", "World of Warships"), D("War Thunder", "warthunder.com"),
  D("Kinguin", "kinguin.net"), D("Eneba", "eneba.com"), D("G2A", "g2a.com"), D("CDKeys", "cdkeys.com"), D("Fanatec", "fanatec.com"), D("MOZA Racing", "mozaracing.com", "MOZA"),
  D("Simagic", "simagic.com"), D("Thrustmaster", "thrustmaster.com"), D("Asetek SimSports", "asetek.com", "Asetek"), D("8BitDo", "8bitdo.com"), D("GameSir", "gamesir.hk"),
  D("Chemical Guys", "chemicalguys.com"), D("Meguiar's", "meguiars.com", "Meguiars"), D("Griot's Garage", "griotsgarage.com"), D("Adam's Polishes", "adamspolishes.com"),
  D("Mobil 1", "mobil1.com"), D("Castrol", "castrol.com"), D("Valvoline", "valvoline.com"), D("Turtle Wax", "turtlewax.com"), D("CarGurus", "cargurus.com"),
  D("Carvana", "carvana.com"), D("Hagerty", "hagerty.com"), D("Tesla", "tesla.com"), D("ChargePoint", "chargepoint.com"), D("Lectron", "ev-lectron.com"),
  D("VIOFO", "viofo.com"), D("Fanttik", "fanttik.com"), D("Ancel", "ancel.com"), D("Carlinkit", "carlinkit.com"), D("Enhance", "enhauto.com", "S3XY Buttons"),
  D("Bambu Lab", "bambulab.com"), D("Prusa", "prusa3d.com"), D("Creality", "creality.com"), D("Elegoo", "elegoo.com"), D("xTool", "xtool.com"),
  D("Ka'Chava", "kachava.com"), D("Liquid I.V.", "liquid-iv.com"), D("Magic Spoon", "magicspoon.com"), D("Shady Rays", "shadyrays.com"),
];

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
export const nameKey = (name: string) => `n:${norm(name).slice(0, 40)}`;
/** "nordvpn.com" → "Nordvpn", "lian-li.com" → "Lian Li" (until the site's own name is read). */
export function prettyName(domain: string) {
  const label = (domain.split(".")[0] || domain).replace(/-/g, " ");
  return label.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 40);
}

/** Every way a known brand can be written: exact names (for a name cut out of a sentence) and safe words to spot in free text. */
export function knownIndex(known: Known[]) {
  const byName = new Map<string, Known>();
  const byDomain = new Map<string, Known>();
  const scan: [RegExp, Known, string][] = [];
  for (const k of known) {
    if (k.domain && !byDomain.has(k.domain)) byDomain.set(k.domain, k);
    const label = k.domain ? k.domain.split(".")[0] : "";
    for (const n of [k.name, ...(k.aliases || []), label]) {
      const key = norm(n || "");
      if (key.length < 2 || byName.has(key)) continue;
      byName.set(key, k);
      // Too-short or everyday words would match everywhere in free text; they still match an exact name.
      if (key.length >= 3 && !COMMON.has(key) && !/^\d+$/.test(key)) scan.push([new RegExp(`(?:^|[^a-z0-9])${key.split("").join("[^a-z0-9]?")}(?=$|[^a-z0-9])`), k, key]);
    }
  }
  // Longest names first, so "Logitech G" wins over "Logitech".
  scan.sort((a, b) => b[0].source.length - a[0].source.length);
  return { byName, byDomain, scan };
}
const COMMON = new Set(["the", "and", "you", "pro", "max", "one", "new", "get", "now", "app", "hub", "box", "lab", "tech", "gaming", "store", "shop", "official", "world", "home", "life", "car", "cars", "nothing", "honey", "aura", "factor", "keeps", "ridge", "brilliant", "proton", "steam", "legion", "predator", "enhance", "notion", "canva", "adobe", "framework", "opera", "kit", "dell", "intel", "logitech", "nvidia", "samsung", "tesla", "apple", "google", "microsoft", "amazon", "valve", "rog", "radeon", "ryzen", "geforce", "fractal", "arctic", "moza", "elegoo", "prusa"]);

/** Known brands named in a piece of text (whole words, longest names first). */
export function namesIn(text: string, idx: ReturnType<typeof knownIndex>): Known[] {
  const found: Known[] = [];
  const squashed = ` ${String(text || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ")} `;
  // Cheap check first (the name's letters in a row), the exact word-boundary test only then.
  const flat = squashed.replace(/ /g, "");
  for (const [re, k, key] of idx.scan) if (flat.includes(key) && !found.includes(k) && re.test(squashed)) found.push(k);
  return found;
}

// ---- reading a description ----------------------------------------------------------

const URL_RE = /\bhttps?:\/\/[^\s<>"'()\]　]+/gi;
export function urlsIn(text: string): string[] {
  return Array.from(String(text || "").matchAll(URL_RE), (m) => m[0].replace(/[.,;:!?)\]]+$/, ""));
}

const SPONSOR = /\b(?:sponsor(?:ed|ing|s)?|today'?s sponsor|paid (?:promotion|partnership|placement)|#ad\b|#sponsored|in (?:paid )?partnership with|partnered with|in collaboration with|presented by|brought to you by|made possible by|thanks? (?:you )?(?:so much )?(?:to )?[^.\n]{1,50}? for (?:sponsoring|supporting|partnering|making this video))/i;
const SEEDED = /\b(?:sent (?:me|us|over|this|these|them|it|the)|(?:has|have|kindly) sent|provided (?:by|this|these|the|me|us|a|an)|(?:review|press|loaner|test) (?:units?|samples?|models?)|samples? (?:was |were )?(?:provided|sent|supplied)|courtesy of|gifted|loaned|on loan|free of charge|supplied (?:by|me|us)|was given (?:to me|to us)|(?:given|lent) to (?:me|us)|for sending (?:this|these|it|me|us|over))\b/i;
const AFFILIATE = /\b(?:affiliate|commission|(?:use|with|enter|apply) (?:my |the |our |promo |discount |coupon )?(?:code|link)\b|(?:discount|promo|coupon) code|code:\s*\w|\d{1,2} ?% off|save \d{1,2} ?%|ref(?:erral)? link|as an amazon associate|i (?:may|might|will) (?:earn|receive|get)|(?:earn|get) a (?:small )?(?:commission|kickback)|support (?:the|this) channel (?:by|when)|using (?:my|these|the) links?)\b/i;
const OWN = /\b(?:my (?:own )?(?:merch|store|shop|course|book|app|company|brand|patreon|website|site|newsletter|discord|podcast|second channel|other channel|clothing|apparel|presets|luts|template)|our (?:merch|store|shop|course|discord|podcast|newsletter)|merch(?:andise)?\b|join (?:the |this )?(?:channel|membership)|channel membership)/i;
const NOT_SPONSORED = /\b(?:no (?:affiliation|sponsorship)|not (?:affiliated|endorsed)|(?:is|was|are|were)(?: not|n'?t) (?:a )?(?:sponsored|paid|an ad)|not (?:a )?sponsored|no (?:one|body) (?:paid|sponsored)|nobody (?:paid|sponsored)|unsponsored|no sponsors?|bought (?:it|this|these|them|the \w+) (?:myself|with my own money)|purchased (?:it|this|these|them) (?:myself|with my own))\b/i;
const HEADER = /^[\W_]*(gear|my gear|my setup|setup|equipment|kit|my kit|parts|pc parts|parts list|build|the build|components|specs|products?(?: (?:used|mentioned|in this video|featured))?|links?|useful links|music|songs?|socials?|follow(?: me)?|connect|find me|sponsors?|partners?|affiliates?|affiliate links|support|support the channel|merch|chapters|timestamps|tools|software|apps|camera gear|what i use|stuff i use|things i use|recommended)\b[^\n]{0,40}$/i;
const CHAPTER = /^\s*\(?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?\s*[-–—:|•.]?\s*(.{2,90})$/;
// A call to action with a link: "Get NordVPN here ➼", "Try Notion free", "Head to brilliant.org/x".
const CTA = /\b(?:get|try|check out|download|sign up(?: for)?|grab|head (?:over )?to|go to|visit|start your|claim)\b[^\n]{0,70}?\b(?:here|below|at|for free|free|today|now|deal|discount|trial|off|risk-free|offer)\b/i;
const TRACKING = /[?&](?:ref|aff|affiliate|aff_id|affid|aff_sub|via|tag|partner|pid|irclickid|irgwc|sca_ref|rfsn|cjevent|clickid|coupon|discount|code|promo|utm_campaign|utm_source|utm_medium|sid|subid|wt_mc|pp|campaign)=|\/(?:ref|referral|aff|affiliate|go|discount|r|partner|invite|promo)\/[\w-]{2,}/i;
// Credits, not deals: "🎵 Copyrighted music licensed from Lickd", "Music by Epidemic Sound", "Stock footage from Storyblocks".
const CREDIT = /(?:[\u{1F3B5}\u{1F3B6}\u{1F3BC}]\s*|\b(?:copyrighted |royalty[- ]free |background |intro |outro )?(?:music|songs?|tracks?|soundtrack|beats?|sound effects|sfx|footage|b-?roll|stock (?:footage|video|clips?|images?|photos?)|thumbnail|artwork|font)\b)[^.\n|]{0,60}?\b(?:licensed|copyright|provided|courtesy|by|from|via|on)\b[^.\n|]*\.?/giu;
const CREDIT_HOSTS = /(?:^|\.)(?:lickd\.co|epidemicsound\.com|artlist\.io|musicbed\.com|soundstripe\.com|uppbeat\.io|bensound\.com|audiojungle\.net|pond5\.com|envato\.com|storyblocks\.com|pexels\.com|incompetech\.com|ncs\.io|youtube\.com\/audiolibrary)$/i;
/** The line without its credits, or null when it has none. A credit that says sponsored/sent is a deal, never cut. */
function stripCredits(text: string): string | null {
  let cut = false;
  const out = text.replace(CREDIT, (m) => (SPONSOR.test(m) || /\b(?:sent|gifted|loaned|for sending)\b/i.test(m) ? m : ((cut = true), " ")));
  return cut ? out.replace(/\s+/g, " ").trim() : null;
}
// "For business inquiries / sponsorships: email…" is the creator selling, not a sponsor.
const INQUIRY = /business (?:inquir|enquir)|(?:sponsorship|partnership|collab\w*) (?:inquir|enquir|opportunit|request)|for (?:sponsorships?|business|collabs?|partnerships?)\b|interested in (?:sponsoring|working|partnering)|sponsor (?:me|this channel|the channel|a video|my)|become a (?:sponsor|member|patron)|(?:want|like) to sponsor|contact(?: me)?:|e-?mail:|\bpatreon\b|github sponsors/i;
const STOP_NAMES = new Set(["sponsorship", "sponsorships", "partnership", "partnerships", "collab", "collaboration", "giveaway", "ad read", "kickstarter", "indiegogo", "patreon", "gofundme", "promotion", "promo", "sponsor", "sponsors", "deal", "deals", "discount", "code", "coupon", "link", "links", "website", "app", "store", "shop", "brand", "product", "werbung", "anzeige", "ad", "ads", "advertising", "nobody", "no one", "none", "myself", "no sponsor", "noone", "pc", "the pc", "gpu", "cpu", "case", "the case", "laptop", "phone", "monitor", "keyboard", "mouse", "car", "product", "products", "parts", "the parts", "unit", "sample", "company", "manufacturer", "manufacturers", "retailers", "retailer", "sellers", "mom", "dad", "my wife", "my brother", "viewer", "a fan", "fans", "subscriber", "subscribers", "patron", "me", "us", "you", "this", "that", "them", "it", "everyone", "today", "video", "the video", "this video", "channel", "sponsor", "our sponsor", "the sponsor", "link", "below", "here", "description", "the link", "him", "her", "my friend", "a friend", "friends", "my friends", "the team", "a viewer", "viewers", "patrons", "members", "supporters", "the company", "the brand", "a brand", "brands", "itself", "our partners", "partners", "my patrons", "you guys"]);

const secondsOf = (stamp: string) => stamp.split(":").reduce((s, p) => s * 60 + Number(p), 0);

/** Tidy a brand name cut out of a sentence; "" when it isn't a usable name. */
export function cleanName(raw: string): string {
  let s = String(raw || "").replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ").replace(/[®™©]/g, "").replace(/\s+/g, " ").trim();
  // "- Keysfan.com", "• NordVPN", "> Ridge"
  s = s.replace(/^[\s\-–—•*·>»:~]+/, "");
  // A social handle: "@NZXTglobal" → "NZXT", "@HerschelSupply#ad" → "Herschel Supply".
  if (s.startsWith("@")) {
    s = s.slice(1).split(/[\s#]/)[0].replace(/(?:global|official|hq|uk|usa|us|eu|de|fr|videos?|tv|gaming|channel|team|store|shop|brand)$/i, "");
    if (/[a-z][A-Z]/.test(s)) s = s.replace(/([a-z])([A-Z])/g, "$1 $2");
  }
  s = s.replace(/#\w+/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/^(?:the (?:folks|team|people|guys|crew) (?:at|over at|from)|(?:our|my) (?:good )?(?:friends?|partners?|sponsors?) (?:at|over at|from)|(?:our|my) (?:friends?|partners?|sponsors?)|friends (?:at|over at)|everyone (?:at|over at)|the amazing|for|our|my|the|this|today'?s sponsor,?)\s+/i, "");
  s = s.split(/\s+(?:for|to|with|at|and|and get|and use|their|who|which|that|because|on|in|so|via|plus|shoutout|-|–|—|\||:)\s+|\s*[|:;,!?(["“”]\s*|\s+[-–—]\s*|\.\s/)[0].trim();
  s = s.replace(/\s+(?:today|again|this video|this episode|for this|here|below|everyone)$/i, "").replace(/[.'’"]+$/, "").trim();
  // "Gamma sponsorship", "Tonal segment", "Ridge promo"
  for (let i = 0; i < 3; i++) s = s.replace(/\s+(?:sponsorships?|sponsors?|sponsored|segments?|promos?|promotions?|giveaways?|deals?|discounts?|codes?|links?|ads?|videos?|reviews?|units?|samples?|partnerships?)$/i, "").trim();
  if (s.length < 2 || s.length > 40 || !/[a-z]/i.test(s) || s.split(" ").length > 4) return "";
  if (/[%()[\]{}<>=+]/.test(s) || /^\d/.test(s) && /\b(?:off|percent|free|days?|months?|years?|weeks?|hours?)\b/i.test(s)) return "";
  if (STOP_NAMES.has(s.toLowerCase())) return "";
  if (/^(?:a|an|some|every|all|any|lots?|loads|many|our|my|your|their|his|her|its)\b/i.test(s)) return "";
  if (/^(?:i|we|they|he|she|it|you|me|us|him|them|this|that|these|those|there|here|what|when|how|just|also|so|and|but)\b/i.test(s)) return "";
  return s;
}

// Everyday words that a sentence cut can leave behind ("sponsored by either…", "in advance", "teams").
const PLAIN_WORDS = new Set("about above after again against ago ahead all along already also always among another any anyone anything around away back because been before being below best better between big both bring brought but buy came can cannot check come coming could day days did different does doing done down during each early either else enough even ever every everything far few find first following free friend from full get gets getting give given go going good got great guys had has have having help her here high him his home hope how however huge important in inside instead into just keep kind know last later least less let life like little live long look looking lot made make making many may maybe me more most much must my myself need never new next nice night no none not nothing now of off often old on once one only open or other others our out over own part people place please plus point possible pretty probably put quick quite rather real really right same say see segment segments set several she should show side since small so some someone something sometimes soon special spot start still stuff such sure take team teams than thank thanks that the their them then there these they thing things think this those though through time times to today together too top total toward try two under until up upon us use used using very via want was way we week well were what when where which while who whole why will with within without work world would year years yes yet you your advance".split(" "));

/** Could this be a brand's name (not a phrase, a handle or an everyday word)? */
export function brandish(name: string): boolean {
  const clean = cleanName(name);
  if (!clean) return false;
  if (nameAsDomain(clean)) return true;
  const words = clean.toLowerCase().split(" ");
  if (words.every((w) => PLAIN_WORDS.has(w))) return false;
  // Brands are written as names: a capital or a digit somewhere ("eBay", "NZXT", "3M"), never all lowercase.
  return /[A-Z0-9]/.test(clean);
}

/** "Keysfan.com", "Monday.com", "Boot.dev" → the domain it names; "" otherwise. */
export function nameAsDomain(name: string): string {
  const m = /^([a-z0-9][a-z0-9-]{1,40})\.(com|net|org|io|co|ai|app|dev|gg|tv|de|uk|co\.uk|me|so|xyz|shop|store|tech)$/i.exec(String(name || "").trim());
  return m ? normalizeDomain(`${m[1]}.${m[2]}`) : "";
}

/** A short personal / campaign link domain ("x.la", "sbck.me", "plug.dev", "andauth.co"): says nothing about the brand. */
export const shortLinkDomain = (domain: string) => {
  const d = normalizeDomain(domain);
  const [label, ...rest] = d.split(".");
  return !!label && label.length <= 6 && /^(?:me|la|ly|co|link|dev|gg|so|to|io|sh|cc|li|is|at|be|fyi|page|app)$/.test(rest.join("."));
};

/** Is this domain plausibly that brand's own (its main label is the name, or contains it, or the other way round)? */
export function domainFits(name: string, domain: string): boolean {
  const n = norm(cleanName(name) || name).replace(/(?:official|global|inc|llc|ltd|gmbh|corp|store|shop|hq)$/, "");
  const raw = norm(normalizeDomain(domain).split(".")[0] || "");
  if (n.length < 2 || raw.length < 2) return false;
  // "weareholy.com", "getsurfshark", "trynordvpn", "ridgewallet", "helixsleep" → the name inside.
  const l = raw.length > n.length + 1 ? raw.replace(/^(?:weare|we|get|try|shop|use|go|my|the|join|hello|meet|buy|wear|drink|eat|play)(?=.{3,})/, "") : raw;
  if (l === n || raw === n) return true;
  if (n.length >= 4 && l.replace(/(?:hq|app|official|store|shop|global|inc|labs?|tech|co|us|uk|world|online|wallet|travel|audio|sleep|home|gear|wear|club|direct)$/, "") === n) return true;
  if (n.length >= 3 && l.startsWith(n)) return true;
  if (l.length >= 4 && n.startsWith(l)) return true;
  if (n.length >= 5 && l.includes(n)) return true;
  if (l.length >= 5 && n.includes(l)) return true;
  return false;
}

// Name cut out of a cue sentence. Each pattern says which kind it points to.
const NAME_PATTERNS: [RegExp, DealKind][] = [
  [/(?:sponsored|presented|brought to you|made possible|powered) by:?\s+(?:our (?:friends|partners) (?:at|over at)\s+)?([^\n]{2,60})/i, "sponsored"],
  [/(?:in (?:paid )?partnership|partnered|in collaboration) with:?\s+([^\n]{2,60})/i, "sponsored"],
  [/(?:today'?s|this video'?s|our) sponsor(?: is|:|,|\s+-)\s*([^\n]{2,60})/i, "sponsored"],
  [/thanks? (?:you )?(?:so much |a lot |again )?(?:to\s+)?([^\n]{2,50}?)\s+for\s+(sponsoring|supporting|partnering|making this video|sending|providing|loaning|lending|the review sample|the sample|the unit)/i, "sponsored"],
  [/thanks? (?:you )?(?:so much )?to\s+([^\n,]{2,40}),?\s+(?:who|that|which)\s+(sponsored|sent|provided|loaned|lent|supplied)/i, "sponsored"],
  [/(?:provided|sent|supplied|loaned|lent|gifted|given)\s+(?:to (?:me|us)\s+)?(?:for (?:free|review)\s+)?by:?\s+([^\n]{2,60})/i, "seeded"],
  [/courtesy of:?\s+([^\n]{2,60})/i, "seeded"],
  [/use (?:my |the |our )?code\s+["'“]?[A-Z0-9_-]{3,20}["'”]?\s+(?:at|on|for|when (?:you )?(?:shop|buy)(?:ing)? (?:at|on)?)\s+([^\n]{2,60})/i, "affiliate"],
];
// "TRYX sent me…", "Corsair kindly provided…" — the name is the capitalised words just before the verb.
const NAME_BEFORE_VERB = /(?:^|[^\w])((?:[A-Z0-9][\w&'.+!-]*)(?:\s+[A-Z0-9][\w&'.+!-]*){0,3})\s+(?:(?:has|have|kindly|generously|very kindly)\s+)?(sent|provided|gifted|loaned|lent|supplied|sponsored)\b/;

type Line = { text: string; urls: string[]; section: string; lead: boolean; index: number };

function linesOf(description: string): Line[] {
  const out: Line[] = [];
  let section = "", para = 0, idx = 0;
  for (const rawLine of String(description || "").split(/\r?\n/)) {
    const text = rawLine.trim();
    if (!text) { section = ""; para++; continue; }
    const urls = urlsIn(text);
    const naked = text.replace(URL_RE, "").trim();
    if (!urls.length && naked.length <= 70 && (HEADER.test(naked) || /:\s*$/.test(naked) && naked.split(" ").length <= 7)) {
      section = naked.toLowerCase();
    }
    out.push({ text: text.slice(0, 600), urls, section, lead: para === 0 && idx < 8 || idx < 4, index: idx++ });
  }
  return out;
}
const sectionKind = (s: string) =>
  /sponsor|partner/.test(s) ? "sponsor" : /affiliate/.test(s) ? "affiliate" : /music|song/.test(s) ? "music" : /social|follow|connect|find me/.test(s) ? "social"
    : /merch|support/.test(s) ? "own" : /chapter|timestamp/.test(s) ? "chapters" : /gear|setup|equipment|kit|parts|build|component|spec|product|use|recommended|tools|camera/.test(s) ? "gear" : s ? "other" : "";

export type ReadContext = {
  creator: string;
  handle?: string;
  /** Domains that belong to the creator (their site, merch store). */
  ownDomains?: string[];
  known: Known[];
  /** Short link → where it really goes (followed on the server). */
  resolved?: Record<string, string>;
};

const clamp = (n: number) => Math.max(0, Math.min(0.97, Math.round(n * 100) / 100));
const quoteOf = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 220);

// One index per list of known brands (a creator's 150 videos share it).
let lastKnown: Known[] | null = null, lastIdx: ReturnType<typeof knownIndex> | null = null;
const indexFor = (known: Known[]) => {
  if (known !== lastKnown || !lastIdx) { lastKnown = known; lastIdx = knownIndex([...known, ...DIRECTORY, ...STORE_KNOWN]); }
  return lastIdx;
};

/** Read one video. Mentions are per brand (strongest finding wins), never per line. */
export function readVideo(v: VideoIn, ctx: ReadContext): Reading {
  const idx = indexFor(ctx.known);
  const own = new Set((ctx.ownDomains || []).map(normalizeDomain).filter(Boolean));
  const tokens = [ctx.creator, ctx.handle || ""].map((s) => norm(s)).filter((s) => s.length >= 4);
  const isOwn = (domain: string) => own.has(domain) || tokens.some((t) => norm(domain.split(".")[0]).includes(t) || t.includes(norm(domain.split(".")[0])) && norm(domain.split(".")[0]).length >= 5);
  const desc = String(v.description || "");
  const lines = linesOf(desc);
  const segments = (v.segments || []).filter((s) => s && typeof s.start === "number");
  const sponsorSegs = segments.filter((s) => s.category === "sponsor");
  const exclusive = segments.some((s) => s.category === "exclusive_access");
  const notSponsored = NOT_SPONSORED.test(desc) || NOT_SPONSORED.test(v.title);
  const paid = v.paid === true;
  const found = new Map<string, Mention>();
  // Links made "the sponsor" only because they sat up top in a paid video.
  const promoted = new Set<string>();

  const resolveKnown = (name: string, domain: string): { key: string; name: string; domain: string; domainFrom: Mention["domainFrom"] } | null => {
    if (domain) {
      const k = idx.byDomain.get(domain);
      return { key: domain, name: k?.name || name || prettyName(domain), domain, domainFrom: "link" };
    }
    const clean = cleanName(name);
    if (!clean) return null;
    const k = idx.byName.get(norm(clean)) || namesIn(clean, idx)[0];
    if (k) return { key: k.domain || nameKey(k.name), name: k.name, domain: k.domain, domainFrom: k.domain ? "known" : "" };
    return { key: nameKey(clean), name: clean, domain: "", domainFrom: "" };
  };
  const add = (m: Omit<Mention, "signals"> & { signals: Signal[] }) => {
    if (m.domain && isOwn(m.domain)) return;
    const prev = found.get(m.key);
    if (!prev) { found.set(m.key, { ...m, quote: quoteOf(m.quote) }); return; }
    const rank = (k: DealKind) => (k === "sponsored" ? 3 : k === "seeded" ? 2 : 1);
    const stronger = m.confidence > prev.confidence + 0.05 || (Math.abs(m.confidence - prev.confidence) <= 0.05 && rank(m.kind) > rank(prev.kind));
    const merged: Mention = stronger ? { ...m, quote: quoteOf(m.quote) } : { ...prev };
    merged.signals = Array.from(new Set([...prev.signals, ...m.signals]));
    merged.confidence = clamp(Math.max(prev.confidence, m.confidence) + (prev.kind === m.kind && prev.quote !== m.quote ? 0.04 : 0));
    if (!merged.domain && (m.domain || prev.domain)) { merged.domain = m.domain || prev.domain; merged.domainFrom = m.domain ? m.domainFrom : prev.domainFrom; }
    merged.t = merged.t ?? m.t ?? prev.t;
    merged.unsure = (stronger ? m.unsure : prev.unsure) && merged.confidence < 0.8;
    found.set(m.key, merged);
  };
  const linkTarget = (url: string) => {
    const final = ctx.resolved?.[url] || url;
    const host = hostOf(final);
    const kind = hostKind(host);
    // Followed, but it stopped on another tracker: treat it as not followed.
    const impact = IMPACT.exec(hostOf(url));
    return { url: final, host, kind, domain: kind === "brand" ? normalizeDomain(host) : "", hint: impact ? impact[1] : "" };
  };

  // 1. Lines with a cue: the sentence names the brand, and/or a link sits on it (or just below).
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const sec = sectionKind(line.section);
    if (sec === "music" || sec === "social") continue;
    // "Presented by LEGENDZ 🎵 Copyrighted music licensed from Lickd": the soundtrack credit (and its link)
    // is cut off; whatever else the line says is still read.
    // (A credit with a referral link — "Music from Epidemic Sound: …/referral/abc" — earns them money: an affiliate, read as usual.)
    const credited = line.urls.some((u) => TRACKING.test(u)) ? null : stripCredits(line.text.replace(URL_RE, " "));
    if (credited !== null) {
      if (!/[a-z]{3}/i.test(credited)) continue;
      line = { ...line, text: credited, urls: line.urls.filter((u) => !CREDIT_HOSTS.test(hostOf(u))) };
    }
    const naked = line.text.replace(URL_RE, " ");
    const prev = lines[i - 1];
    const prevCue = prev && !prev.urls.length ? prev.text : "";
    const cueText = line.urls.length && !SPONSOR.test(naked) && !SEEDED.test(naked) && !AFFILIATE.test(naked) && prevCue && i - 1 === prev.index ? `${prevCue} ${naked}` : naked;
    if (INQUIRY.test(cueText)) continue;
    const ownLine = OWN.test(cueText) || sec === "own";
    const sponsorCue = SPONSOR.test(cueText) || sec === "sponsor";
    const seededCue = SEEDED.test(cueText);
    const affCue = AFFILIATE.test(cueText) || sec === "affiliate";
    // Chapters: "1:20 Sponsor – NordVPN", "0:45 Thanks to Ridge".
    const ch = CHAPTER.exec(line.text);
    if (ch && /sponsor|thanks? to|\bad\b|partner|ad read/i.test(ch[2])) {
      const nm = ch[2].replace(/\b(?:sponsor(?:ed)?(?: by)?|sponsor segment|ad read|ad|thanks? (?:you )?to|partner(?:ed)?(?: with)?|our|today'?s)\b/gi, " ").replace(/[()[\]:–—-]/g, " ");
      const r = resolveKnown(nm, "");
      if (r) add({ ...r, kind: "sponsored", confidence: 0.8 + (paid ? 0.08 : 0), signals: ["chapters"], quote: line.text, t: secondsOf(ch[1]) });
      continue;
    }
    if (!sponsorCue && !seededCue && !affCue && !line.urls.length) {
      // A title-cased brand before "sent/provided" even without a link: "TRYX sent me this PC".
      const nb = NAME_BEFORE_VERB.exec(naked);
      if (nb && SEEDED.test(naked)) {
        const r = resolveKnown(nb[1], "");
        if (r) add({ ...r, kind: nb[2].toLowerCase() === "sponsored" ? "sponsored" : "seeded", confidence: 0.78, signals: ["description"], quote: line.text });
      }
      continue;
    }
    if (ownLine && !sponsorCue && !seededCue) continue;
    const cueKind: DealKind | null = sponsorCue ? "sponsored" : seededCue ? "seeded" : affCue ? "affiliate" : null;
    // Names written in the sentence itself.
    const named: { name: string; kind: DealKind }[] = [];
    for (const [re, kind] of NAME_PATTERNS) {
      const m = re.exec(cueText);
      if (!m) continue;
      const verb = (m[2] || "").toLowerCase();
      const k: DealKind = kind === "sponsored" && /sending|providing|loaning|lending|sample|unit|sent|provided|loaned|lent|supplied/.test(verb) ? "seeded" : kind;
      named.push({ name: m[1], kind: k });
    }
    const nb = NAME_BEFORE_VERB.exec(cueText);
    if (nb) named.push({ name: nb[1], kind: /sponsored/i.test(nb[2]) ? "sponsored" : "seeded" });
    // "#ad", "sponsored by", "paid partnership" on the line: paid, even if they also sent the product.
    if (/#ad\b|#sponsored|sponsored by|paid (?:promotion|partnership)|today'?s sponsor/i.test(cueText)) for (const n of named) n.kind = "sponsored";
    // Known brands written anywhere on a cue line ("#ad Corsair 6500X").
    // ("Remaking the Crystal XBOX — thank you Fanttik for sponsoring" names Fanttik, not Xbox.)
    if (cueKind && cueKind !== "affiliate" && !named.length) for (const k of namesIn(naked, idx)) named.push({ name: k.name, kind: cueKind });
    const negated = NOT_SPONSORED.test(cueText);

    let usedName = false;
    for (const url of line.urls) {
      const t = linkTarget(url);
      if (t.kind === "social") continue;
      if (t.kind === "store") {
        // A shop link on a sponsor line is a deal with the shop ("sponsored by Newegg").
        const store = storeName(t.host);
        if ((sponsorCue || seededCue) && named.some((n) => norm(n.name) === norm(store))) continue; // handled below by name
        const home = storeHome(store) || normalizeDomain(t.host);
        if (affCue || TRACKING.test(t.url) || sec === "gear" || /amzn|tag=/.test(t.url)) add({ key: home, name: store, domain: home, domainFrom: "link", kind: "affiliate", confidence: 0.72, signals: ["description"], quote: line.text, store: true });
        continue;
      }
      if (t.kind === "redirect") {
        // Not followed (yet): use the name on the line, or the brand label of an impact.com link.
        const r = named[0] ? resolveKnown(named[0].name, "") : t.hint ? resolveKnown(t.hint, "") : null;
        if (r && cueKind) { add({ ...r, kind: named[0]?.kind || cueKind, confidence: cueKind === "affiliate" ? 0.6 : 0.7, signals: ["description"], quote: line.text, unsure: true }); usedName = true; }
        continue;
      }
      // A brand's own site.
      const nameHere = named.find((n) => { const c = cleanName(n.name); return c && (norm(t.domain).includes(norm(c).slice(0, 5)) || norm(c).includes(norm(t.domain.split(".")[0]))); }) || (named.length === 1 ? named[0] : null);
      const base = resolveKnown(nameHere ? nameHere.name : "", t.domain);
      if (!base) continue;
      if (nameHere) { usedName = true; base.name = idx.byDomain.get(t.domain)?.name || cleanName(nameHere.name) || base.name; }
      const tracked = TRACKING.test(t.url);
      let kind: DealKind | null = nameHere?.kind || cueKind;
      let conf = 0;
      if (kind === "sponsored") conf = negated ? 0.3 : 0.88;
      else if (kind === "seeded") conf = 0.8;
      else if (kind === "affiliate") conf = tracked ? 0.75 : 0.66;
      else if (tracked) { kind = "affiliate"; conf = 0.6; }
      else if (line.lead && CTA.test(cueText)) { kind = "affiliate"; conf = 0.56; }
      if (!kind) continue;
      // An unnamed promo link up top in a paid video is most likely the sponsor read.
      let unsure = false;
      const referral = /referral|[?&](?:ref|aff|affiliate|via)=|\/(?:ref|aff)\//i.test(t.url) || /\b(?:comes? from|i use|i used|my gear|i recommend)\b/i.test(cueText);
      if (kind === "affiliate" && line.lead && !named.length && !referral && (paid || sponsorSegs.length)) { kind = "sponsored"; conf = paid ? 0.74 : 0.66; unsure = true; promoted.add(base.key); }
      else if (kind === "affiliate" && line.lead && (/(?:\d{1,2} ?% off|free trial|use code)/i.test(cueText) || CTA.test(cueText))) unsure = true;
      add({ ...base, kind, confidence: conf + (paid && kind === "sponsored" ? 0.06 : 0), signals: ["description"], quote: line.text, unsure });
    }
    // A cue sentence that names a brand but has no link of its own.
    if (!usedName) for (const n of named) {
      const r = resolveKnown(n.name, "");
      if (!r) continue;
      const conf = n.kind === "sponsored" ? (negated ? 0.3 : 0.84) : n.kind === "seeded" ? 0.78 : 0.62;
      add({ ...r, kind: n.kind, confidence: conf + (paid && n.kind === "sponsored" ? 0.06 : 0), signals: ["description"], quote: line.text, unsure: r.domainFrom === "" });
    }
  }

  // 2. The title: "TRYX sent me…", "(sponsored)", or the brand the paid video is about.
  const inTitle = namesIn(v.title, idx);
  if (inTitle.length) {
    const k = inTitle[0];
    const r = { key: k.domain || nameKey(k.name), name: k.name, domain: k.domain, domainFrom: (k.domain ? "known" : "") as Mention["domainFrom"] };
    if (SEEDED.test(v.title) || /\b(?:they|brands?) sent\b/i.test(v.title)) add({ ...r, kind: "seeded", confidence: 0.84, signals: ["title"], quote: v.title });
    else if (/\b(?:sponsored|#ad|ad)\b|\bpaid\b/i.test(v.title) && !notSponsored) add({ ...r, kind: "sponsored", confidence: 0.8, signals: ["title"], quote: v.title });
    else if (exclusive) add({ ...r, kind: "seeded", confidence: 0.74, signals: ["title", "sponsorblock"], quote: `${v.title} — marked "exclusive access" on SponsorBlock`, t: segments.find((s) => s.category === "exclusive_access")?.start });
    else if (paid && !notSponsored && ![...found.values()].some((m) => m.kind === "sponsored" && m.confidence >= 0.7)) add({ ...r, kind: "sponsored", confidence: 0.66, signals: ["title", "paid_label"], quote: `${v.title} — YouTube shows "Includes paid promotion"`, unsure: true });
  }

  // 3. A sponsor segment / paid label with no named sponsor yet: the first promo link up top.
  const sponsoredNow = () => [...found.values()].filter((m) => m.kind === "sponsored" && m.confidence >= 0.6);
  if ((sponsorSegs.length || paid) && !sponsoredNow().length && !notSponsored) {
    for (const line of lines.filter((l) => l.lead)) {
      if (sectionKind(line.section) === "social" || sectionKind(line.section) === "music" || OWN.test(line.text)) continue;
      if (/\b(?:comes? from|i use|i used|my gear|i recommend)\b/i.test(line.text)) continue;
      if (stripCredits(line.text.replace(URL_RE, " ")) !== null) continue;
      const target = line.urls.map(linkTarget).find((t) => t.kind === "brand" && t.domain && !isOwn(t.domain) && !/referral|[?&](?:ref|aff|affiliate|via)=|\/(?:ref|aff)\//i.test(t.url));
      if (!target) continue;
      const r = resolveKnown("", target.domain)!;
      add({ ...r, kind: "sponsored", confidence: paid && sponsorSegs.length ? 0.72 : 0.6, signals: ["description", ...(sponsorSegs.length ? ["sponsorblock" as Signal] : []), ...(paid ? ["paid_label" as Signal] : [])], quote: line.text, t: sponsorSegs[0]?.start, unsure: true });
      break;
    }
  }

  // A sponsor named in plain words wins: links that were only promoted for sitting up top go back to affiliate.
  const named = [...found.values()].some((m) => m.kind === "sponsored" && !promoted.has(m.key) && m.confidence >= 0.8);
  if (named) for (const k of promoted) { const m = found.get(k); if (m && m.kind === "sponsored") { m.kind = "affiliate"; m.confidence = 0.6; } }

  // 4. Signals that back up what the text says.
  for (const m of found.values()) {
    if (m.kind === "sponsored") {
      if (sponsorSegs.length) { m.signals = Array.from(new Set([...m.signals, "sponsorblock" as Signal])); m.t ??= sponsorSegs[0].start; m.confidence = clamp(m.confidence + 0.04); }
      if (paid) { m.signals = Array.from(new Set([...m.signals, "paid_label" as Signal])); }
      if (notSponsored && !/sponsored by|sponsor/i.test(m.quote)) { m.confidence = Math.min(m.confidence, 0.35); }
    }
    if (m.kind === "seeded" && exclusive) { m.signals = Array.from(new Set([...m.signals, "sponsorblock" as Signal])); m.confidence = clamp(m.confidence + 0.04); }
    // A brand we can't place on the web yet is less certain — "Linus sent me this GPU" may be a person.
    if (!m.domain) m.confidence = clamp(m.kind === "sponsored" ? m.confidence * 0.92 : Math.min(m.confidence * 0.92, 0.6));
  }
  // "thank you in advance for supporting the channel" → "in advance": a phrase, not a brand. A name that
  // isn't brand-like only stays when a website that fits it backs it up ("febi" → febi.com).
  const mentions = [...found.values()].filter((m) => m.confidence >= 0.3 && (m.store || brandish(m.name) || (!!m.domain && domainFits(m.name, m.domain)))).sort((a, b) => b.confidence - a.confidence);
  // Something is being promoted but nothing in the text says what: worth a listen.
  // (A link that was only promoted for sitting up top doesn't count as named: listening says who it really is.)
  const anyNamed = mentions.some((m) => (m.kind === "sponsored" || m.kind === "seeded") && m.confidence >= 0.6 && saysDeal(m));
  let listen: Reading["listen"];
  if (!anyNamed && !notSponsored) {
    const seg = sponsorSegs[0] || segments.find((s) => s.category === "exclusive_access" && s.action !== "full");
    if (seg) listen = { start: Math.max(0, Math.floor(seg.start) - 3), end: Math.ceil(seg.end) + 3, why: seg.category === "sponsor" ? "sponsor segment" : "exclusive access" };
    else if (paid) listen = { start: 0, end: Math.min(150, v.secs || 150), why: "paid promotion label" };
  }
  return { mentions, paid, sponsorSegments: sponsorSegs.map((s) => ({ start: s.start, end: s.end })), notSponsored, listen };
}

// ---- across videos ------------------------------------------------------------------

export type Evidence = { video: string; title: string; at: string; kind: DealKind; confidence: number; signals: Signal[]; quote: string; t?: number };
export type Link = {
  key: string; name: string; domain: string; domainFrom: string; kind: DealKind; confidence: number; store: boolean;
  videos: number; first: string; last: string; evidence: Evidence[];
  /** Every video it was seen in, newest first (evidence keeps the best few quotes). */
  videoIds: string[];
};

/**
 * One row per creator × brand from every video's findings. More videos make it
 * surer (each extra sighting closes part of the gap), the kind is the one with
 * the most weight (a paid deal beats an affiliate link when both are solid).
 */
export function combine(itemsIn: { video: { id: string; title: string; at: string }; m: Mention }[]): Link[] {
  // A name-only finding joins the brand with that name's domain when this creator links it elsewhere.
  const byLabel = new Map<string, Mention>();
  const linkFirst = [...itemsIn].sort((a, b) => Number(b.m.domainFrom === "link") - Number(a.m.domainFrom === "link"));
  for (const it of linkFirst) if (it.m.domain && !it.m.store) { const l = norm(it.m.domain.split(".")[0]); if (l.length >= 3 && !byLabel.has(l)) byLabel.set(l, it.m); const n = norm(it.m.name); if (n.length >= 3 && !byLabel.has(n)) byLabel.set(n, it.m); }
  const items = itemsIn.map((it) => {
    if (it.m.domain && !it.m.store) {
      // Same brand on another country domain ("autodoc.com" vs the creator's "autodoc.de"): one row.
      const same = byLabel.get(norm(it.m.domain.split(".")[0]));
      return same && same.key !== it.m.key ? { ...it, m: { ...it.m, key: same.key, domain: same.domain, domainFrom: same.domainFrom } } : it;
    }
    if (it.m.domain) return it;
    const hit = byLabel.get(norm(it.m.name)) || byLabel.get(it.m.key.replace(/^n:/, ""));
    return hit ? { ...it, m: { ...it.m, key: hit.key, domain: hit.domain, domainFrom: hit.domainFrom, name: hit.name } } : it;
  });
  const by = new Map<string, { video: { id: string; title: string; at: string }; m: Mention }[]>();
  for (const it of items) (by.get(it.m.key) || by.set(it.m.key, []).get(it.m.key)!).push(it);
  const out: Link[] = [];
  for (const [key, rows] of by) {
    rows.sort((a, b) => b.m.confidence - a.m.confidence || b.video.at.localeCompare(a.video.at));
    const weight: Record<DealKind, number> = { sponsored: 0, seeded: 0, affiliate: 0 };
    for (const r of rows) weight[r.m.kind] += r.m.confidence;
    const kind: DealKind = weight.sponsored >= 0.6 ? "sponsored" : weight.seeded >= 0.6 && weight.seeded >= weight.affiliate * 0.6 ? "seeded" : (Object.entries(weight).sort((a, b) => b[1] - a[1])[0][0] as DealKind);
    // Distinct videos only; each extra one closes 40% of what is left.
    const perVideo = new Map<string, number>();
    for (const r of rows) perVideo.set(r.video.id, Math.max(perVideo.get(r.video.id) || 0, r.m.confidence));
    const confs = [...perVideo.values()].sort((a, b) => b - a);
    let conf = confs[0] || 0;
    for (const c of confs.slice(1)) conf += (1 - conf) * 0.4 * c;
    const best = rows.find((r) => r.m.domain) || rows[0];
    const dates = rows.map((r) => r.video.at).filter(Boolean).sort();
    const seen = new Set<string>();
    const evidence: Evidence[] = [];
    for (const r of rows) {
      if (seen.has(r.video.id) || evidence.length >= 8) continue;
      seen.add(r.video.id);
      evidence.push({ video: r.video.id, title: r.video.title.slice(0, 140), at: r.video.at, kind: r.m.kind, confidence: r.m.confidence, signals: r.m.signals, quote: r.m.quote, ...(r.m.t !== undefined ? { t: Math.round(r.m.t) } : {}) });
    }
    const videoIds = Array.from(new Set([...rows].sort((a, b) => b.video.at.localeCompare(a.video.at)).map((r) => r.video.id))).slice(0, 400);
    out.push({
      key, name: (rows.find((r) => r.m.domainFrom === "known") || best).m.name, domain: best.m.domain, domainFrom: best.m.domainFrom,
      kind, confidence: clamp(conf), store: rows.some((r) => r.m.store), videos: perVideo.size, first: dates[0] || "", last: dates[dates.length - 1] || "", evidence, videoIds,
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

/** Words for a confidence, the same everywhere. */
export const sureness = (c: number, confirmed = false) => (confirmed ? "Confirmed" : c >= 0.85 ? "Sure" : c >= 0.65 ? "Likely" : c >= 0.45 ? "Possible" : "Unsure");
export const KIND_LABEL: Record<DealKind, string> = { sponsored: "Sponsored", seeded: "Seeded", affiliate: "Affiliate" };

// ---- how sure a deal is a REAL brand deal ------------------------------------------------
//
// An agency pitches brand deals, so a brand only counts as "worked with them"
// when something says the video was paid for or the product was sent:
//   proven  their own words ("sponsored by X", "X sent me this", a sponsor
//           chapter, heard in the video) AND something else backs it up:
//           YouTube's paid-promotion label, a SponsorBlock sponsor segment, the
//           title, or the same words in a second video.
//   stated  their words say it in ONE place only (e.g. one description line).
//   hint    nothing says it in words: a link up top in a paid video, a name.
//   affiliate  a link or code that pays commission — never a brand deal.
// Only "proven" brands are added to the CRM by themselves.

export type Proof = "proven" | "stated" | "hint" | "affiliate";
const SAYS_DEAL = new RegExp(`${SPONSOR.source}|${SEEDED.source}`, "i");
// Quotes the reader wrote itself ("<title> — YouTube shows …") are not their words.
const madeUp = (q: string) => /— (?:YouTube shows|marked ")/.test(q);
const BACKING: Signal[] = ["paid_label", "sponsorblock", "title", "chapters", "voice", "transcript"];

/** Did they say it in words in this video? */
export const saysDeal = (e: Pick<Evidence, "kind" | "signals" | "quote">) =>
  e.kind !== "affiliate" && (e.signals.includes("voice") || e.signals.includes("chapters") || (!madeUp(e.quote) && SAYS_DEAL.test(e.quote)) || (e.signals.includes("transcript") && SAID_ALOUD.test(e.quote)));

export function dealProof(l: { kind: DealKind; store?: boolean; evidence: Evidence[]; verdict?: string; verdict_kind?: DealKind | null; manual?: boolean }): { level: Proof; why: string } {
  const kind = l.verdict_kind || l.kind;
  if (l.store || kind === "affiliate") return { level: "affiliate", why: "Only a link or code that pays them commission — not a brand deal." };
  if (l.verdict === "yes" || l.manual) return { level: "proven", why: "You confirmed it." };
  const deal = l.evidence.filter((e) => e.kind !== "affiliate");
  const said = deal.filter(saysDeal);
  const heard = said.find((e) => e.signals.includes("voice") && e.quote.split(/\s+/).length >= 4);
  if (heard) return { level: "proven", why: "Heard them say it in the video." };
  // Their spoken words in the captions, naming a brand we can place (a known brand, or the one their description links).
  const spoken = said.find((e) => e.signals.includes("transcript") && e.confidence >= 0.8);
  if (spoken) return { level: "proven", why: `They say it in the video${spoken.t !== undefined ? ` (at ${Math.floor(spoken.t / 60)}:${String(Math.floor(spoken.t % 60)).padStart(2, "0")})` : ""}.` };
  const backed = said.find((e) => new Set(e.signals.filter((s) => BACKING.includes(s) || s === "description")).size >= 2);
  if (backed) {
    const also = backed.signals.filter((s) => BACKING.includes(s) && s !== "chapters");
    return { level: "proven", why: `Said in their own words, and ${also.includes("paid_label") ? "YouTube marks the video as paid" : also.includes("sponsorblock") ? "viewers marked the sponsor segment" : also.includes("title") ? "the title says it too" : "the chapters say it too"}.` };
  }
  const videos = new Set(said.map((e) => e.video)).size;
  if (videos >= 2) return { level: "proven", why: `Said in their own words in ${videos} videos.` };
  if (said.length) return { level: "stated", why: "Said once in the description — nothing in the video itself backs it up yet." };
  if (deal.some((e) => e.signals.includes("paid_label") || e.signals.includes("sponsorblock"))) return { level: "hint", why: "The video is marked as paid, but no words name this brand — it may be a different sponsor." };
  return { level: "hint", why: "Only a link or a name — nothing says it was paid for or sent." };
}

// ---- reading what they SAY (captions) ----------------------------------------------------
//
// Captions come from YouTube (manual or automatic, translated to English when
// the video isn't). Automatic captions have no capitals and little punctuation,
// so names are matched against brands we can place: the ones this video's own
// description links or names, your CRM, found brands and the directory. A name
// nobody can place ("sponsored by fluxio") stays an unsure find.

export type Caption = [ms: number, text: string];
export type TranscriptRead = { mentions: Mention[]; hits: { t: number; text: string }[]; notSponsored: boolean };

const SPOKEN_SPONSOR = /\b(?:(?:this|today'?s) (?:video|episode|stream) is (?:sponsored|brought to you|made possible|presented|powered) by|(?:is|was) sponsored by|sponsored by|today'?s sponsor(?: is)?|our sponsor (?:today|for today'?s video)|sponsor of (?:this|today'?s) video|thanks? (?:you )?(?:so much |a lot |again )?to ([a-z0-9][\w .&'-]{1,40}?) for (?:sponsoring|partnering|supporting this video|making this video possible)|in (?:paid )?partnership with|partnered (?:up )?with|teamed up with|brought to you by|a word from (?:our|today'?s) sponsor|(?:paid|sponsored) (?:promotion|segment|partnership))\b/g;
const SPOKEN_SEEDED = /\b(?:sent (?:me|us|over|this|these|it) (?:over|out)?|(?:was|were) sent (?:to (?:me|us) )?by|(?:were|was) (?:kindly )?provided by|provided (?:to (?:me|us) )?by|(?:kindly )?(?:gifted|loaned|lent) (?:to )?(?:me|us)|for sending (?:this|these|me|us|it|over)|review (?:unit|sample) (?:from|provided)|courtesy of)\b/g;
const SPOKEN_CODE = /\b(?:use (?:my |the |our )?(?:code|link)|with (?:my |the )?code|code [a-z0-9]{3,16} (?:at|for|to get)|(?:the )?(?:first )?link (?:is )?(?:in|down in|below in) the description|link below)\b/g;
const SPOKEN_NO = /\b(?:(?:is|was|it'?s|this is)(?: not|n'?t) (?:a )?sponsored|not (?:a )?sponsored|no ?one (?:paid|sponsored)|nobody (?:paid|sponsored)|not an ad\b|bought (?:it|this|these|them) (?:myself|with my own money)|no sponsor)/;
// Their spoken words say it's a deal (used by the proof check on transcript quotes).
const SAID_ALOUD = new RegExp(`${SPOKEN_SPONSOR.source}|${SPOKEN_SEEDED.source}`, "i");
const SPOKEN_DOMAIN = /\b([a-z0-9][a-z0-9-]{2,30})\s?(?:dot|\.)\s?(com|co|io|net|gg|org|de|tv|app|ai|co\.uk)\b/g;

/** What the creator says about brands, from timed captions. Pure. */
export function readTranscript(caps: Caption[], ctx: ReadContext & { local?: Mention[]; paid?: boolean }): TranscriptRead {
  // Words with the time each was said.
  const words: string[] = [], times: number[] = [];
  for (const [ms, text] of caps) {
    for (const w of String(text || "").replace(/\[[^\]]{0,30}\]/g, " ").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[“”"]/g, " ").split(/\s+/)) {
      if (!w) continue;
      words.push(w); times.push(Math.max(0, Math.round(Number(ms) / 1000)));
    }
    if (words.length > 40_000) break;
  }
  const text = words.join(" ");
  const starts: number[] = [];
  { let at = 0; for (const w of words) { starts.push(at); at += w.length + 1; } }
  const wordAt = (char: number) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= char) lo = mid; else hi = mid - 1; } return lo; };
  const windowOf = (char: number, before = 22, after = 30) => { const w = wordAt(char); const a = Math.max(0, w - before), b = Math.min(words.length, w + after); return { from: a, to: b, text: words.slice(a, b).join(" "), t: times[w] ?? 0 }; };
  // The opening says "this isn't sponsored": the whole video is treated that way.
  const notSponsored = SPOKEN_NO.test(words.slice(0, 400).join(" "));

  const idx = indexFor(ctx.known || []);
  const own = new Set((ctx.ownDomains || []).map(normalizeDomain));
  // Brands this video's description names or links: matched by name even when it's an everyday word ("Ridge").
  const local = (ctx.local || []).filter((m) => !m.store && m.name).map((m) => ({ m, keys: Array.from(new Set([norm(m.name), m.domain ? norm(m.domain.split(".")[0]) : ""].filter((k) => k.length >= 3))) }));
  const found = new Map<string, Mention>();
  const hits: { t: number; text: string }[] = [];
  const add = (m: Mention) => {
    if (m.domain && own.has(m.domain)) return;
    const prev = found.get(m.key);
    if (!prev || m.confidence > prev.confidence) found.set(m.key, prev ? { ...m, signals: Array.from(new Set([...prev.signals, ...m.signals])) } : m);
  };
  const place = (win: { text: string }, cueAt: number, capture?: string): { key: string; name: string; domain: string; domainFrom: Mention["domainFrom"]; how: "local" | "known" | "domain" | "guess" } | null => {
    const flat = ` ${win.text.replace(/[^a-z0-9]+/g, " ")} `;
    const squashedWin = flat.replace(/ /g, "");
    // Closest to the cue wins when several are named.
    const dist = (needle: string) => { const i = win.text.indexOf(needle); return i < 0 ? 1e9 : Math.abs(i - cueAt); };
    let best: ReturnType<typeof place> = null, bestD = 1e9;
    for (const l of local) for (const k of l.keys) {
      if (!(flat.includes(` ${k} `) || (k.length >= 6 && squashedWin.includes(k)))) continue;
      const d = dist(k.slice(0, 4));
      if (d < bestD) { bestD = d; best = { key: l.m.key, name: l.m.name, domain: l.m.domain, domainFrom: l.m.domainFrom, how: "local" }; }
    }
    if (best) return best;
    for (const k of namesIn(win.text, idx)) {
      const d = dist(norm(k.name).slice(0, 4));
      if (d < bestD) { bestD = d; best = { key: k.domain || nameKey(k.name), name: k.name, domain: k.domain, domainFrom: k.domain ? "known" : "", how: "known" }; }
    }
    if (best) return best;
    for (const m of win.text.matchAll(SPOKEN_DOMAIN)) {
      const domain = normalizeDomain(`${m[1]}.${m[2]}`);
      if (!domain || hostKind(domain) !== "brand") continue;
      const k = idx.byDomain.get(domain);
      return { key: domain, name: k?.name || prettyName(domain), domain, domainFrom: "link", how: "domain" };
    }
    const guess = cleanName(capture || "");
    if (guess && guess.split(" ").length <= 3) {
      const k = idx.byName.get(norm(guess));
      if (k) return { key: k.domain || nameKey(k.name), name: k.name, domain: k.domain, domainFrom: k.domain ? "known" : "", how: "known" };
      return { key: nameKey(guess), name: guess.replace(/\b\w/g, (c) => c.toUpperCase()), domain: "", domainFrom: "", how: "guess" };
    }
    return null;
  };

  const cues: { at: number; kind: DealKind; capture: string; len: number }[] = [];
  for (const m of text.matchAll(SPOKEN_SPONSOR)) cues.push({ at: m.index!, kind: "sponsored", capture: m[1] || "", len: m[0].length });
  for (const m of text.matchAll(SPOKEN_SEEDED)) cues.push({ at: m.index!, kind: "seeded", capture: "", len: m[0].length });
  for (const m of text.matchAll(SPOKEN_CODE)) cues.push({ at: m.index!, kind: "affiliate", capture: "", len: m[0].length });
  cues.sort((a, b) => a.at - b.at);
  for (const c of cues.slice(0, 60)) {
    const win = windowOf(c.at);
    if (SPOKEN_NO.test(win.text)) continue;
    const cueAt = c.at - starts[win.from];
    // The words right after "sponsored by" are the likeliest name.
    const after = c.kind === "sponsored" && !c.capture ? text.slice(c.at + c.len, c.at + c.len + 40).trim().split(/\s+/).slice(0, 2).join(" ") : c.capture;
    const p = place(win, cueAt, after);
    if (!p) continue;
    // A code read inside a sponsor read is the sponsor read.
    let kind = c.kind;
    if (kind === "affiliate" && cues.some((o) => o.kind === "sponsored" && Math.abs(o.at - c.at) < 400)) kind = "sponsored";
    if (notSponsored && kind === "sponsored") continue;
    const base = p.how === "local" ? 0.9 : p.how === "known" ? 0.86 : p.how === "domain" ? 0.82 : 0.5;
    const conf = kind === "affiliate" ? Math.min(base, 0.6) : kind === "seeded" ? base - 0.04 : base + (ctx.paid ? 0.03 : 0);
    const quote = words.slice(Math.max(win.from, wordAt(c.at) - 8), Math.min(win.to, wordAt(c.at) + 22)).join(" ");
    add({ key: p.key, name: p.name, domain: p.domain, domainFrom: p.domainFrom, kind, confidence: clamp(conf), signals: ["transcript"], quote: `“${quoteOf(quote)}”`, t: win.t, unsure: p.how === "guess" });
    if (hits.length < 8 && !hits.some((h) => Math.abs(h.t - win.t) < 20)) hits.push({ t: win.t, text: win.text.slice(0, 320) });
  }
  return { mentions: [...found.values()].filter((m) => m.confidence >= 0.3).sort((a, b) => b.confidence - a.confidence), hits, notSponsored };
}
