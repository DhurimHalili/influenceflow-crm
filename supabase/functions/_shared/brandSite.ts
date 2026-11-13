// Reading a brand's own website: who they are in their own words, what they
// sell (the store's catalog when it is public — Shopify /products.json,
// WooCommerce's Store API, JSON-LD products), price range, where they sell,
// whether they run an affiliate / creator program, and their socials.
// Plain HTML parsing (no browser); the edge function does the fetching.
// Pure — tested in brandSite.test.ts.

export type Product = { title: string; type?: string; tags?: string[]; price?: number; currency?: string };
export type Program = { kind: "affiliate" | "creator" | "ambassador" | "partner"; url: string; text: string; commission?: string; network?: string };
export type SiteFacts = {
  title: string; siteName: string; description: string; lang: string; orgName: string; logo: string;
  platform: string; currency: string; socials: { platform: string; url: string }[]; programs: Program[];
  nav: string[]; products: Product[]; collections: string[]; locales: string[]; sameAs: string[];
  /** A bot wall / captcha page instead of the site. */
  blocked: boolean;
};

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", hellip: "…", trade: "™", reg: "®", copy: "©" };
export const decode = (s: string) => String(s || "")
  .replace(/&#(\d+);/g, (_, n) => { const c = Number(n); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : " "; })
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => { const c = parseInt(n, 16); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : " "; })
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const text = (html: string) => decode(String(html || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const attrs = (tag: string) => {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) out[m[1].toLowerCase()] = decode(m[3] ?? m[4] ?? m[5] ?? "");
  return out;
};
const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

const SOCIAL_RE: [string, RegExp][] = [
  ["YouTube", /^https?:\/\/(?:www\.)?youtube\.com\/(?:@[\w.-]+|channel\/UC[\w-]{22}|c\/[\w.-]+|user\/[\w.-]+)/i],
  ["Instagram", /^https?:\/\/(?:www\.)?instagram\.com\/[\w.]+\/?$/i], ["TikTok", /^https?:\/\/(?:www\.)?tiktok\.com\/@[\w.]+/i],
  ["X", /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/\w+\/?$/i], ["Facebook", /^https?:\/\/(?:www\.)?facebook\.com\/[\w.-]+\/?$/i],
  ["LinkedIn", /^https?:\/\/(?:www\.)?linkedin\.com\/company\/[\w-]+/i], ["Discord", /^https?:\/\/(?:www\.)?discord\.(?:gg|com\/invite)\/[\w-]+/i],
  ["Twitch", /^https?:\/\/(?:www\.)?twitch\.tv\/\w+\/?$/i],
];
const PROGRAM_RE = /\b(affiliates?|affiliate program|ambassadors?|ambassador program|creators? program|creator ?hub|for creators|influencers?|influencer program|partner(?:s| program| with us)|partnerships?|collab(?:orat(?:e|ion))?s?|sponsorships?|content creators?|brand ambassadors?)\b/i;
const NETWORKS: [string, RegExp][] = [
  ["impact.com", /impact\.com|impactradius|sjv\.io|pxf\.io/i], ["Refersion", /refersion/i], ["GoAffPro", /goaffpro/i], ["UpPromote", /uppromote|secomapp/i],
  ["ShareASale", /shareasale/i], ["Awin", /awin/i], ["Partnerize", /partnerize|prf\.hn/i], ["CJ", /\bcj\.com|commission junction/i], ["Rakuten", /rakuten advertising|linksynergy/i],
  ["GRIN", /grin\.co|grin\.app/i], ["Aspire", /aspire\.io|aspireiq/i], ["Upfluence", /upfluence/i], ["Collabs (Shopify)", /shopify collabs|collabs\.shopify/i],
  ["Social Snowball", /socialsnowball/i], ["Tapfiliate", /tapfiliate/i], ["PartnerStack", /partnerstack/i], ["Rewardful", /rewardful/i], ["FirstPromoter", /firstpromoter/i],
  ["Amazon Influencer", /amazon\.com\/shop\/influencer/i], ["LTK", /shopltk|liketoknow/i], ["Levanta", /levanta/i], ["Archive", /archive\.com\/brands/i],
];

/** Everything useful on one HTML page. */
export function parseHtml(html: string, pageUrl: string): SiteFacts {
  const h = String(html || "").slice(0, 2_500_000);
  const metas = Array.from(h.matchAll(/<meta\s[^>]*>/gi), (m) => attrs(m[0]));
  const meta = (key: string) => clip(metas.find((m) => (m.name || m.property || m.itemprop || "").toLowerCase() === key)?.content || "", 400);
  const title = clip(decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(h)?.[1] || "").replace(/<[^>]+>/g, ""), 200);
  const lang = (/<html[^>]*\blang=["']?([\w-]+)/i.exec(h)?.[1] || "").toLowerCase().slice(0, 10);
  // A bot wall instead of the site: its title says so, or a tiny page that is only a challenge.
  const blocked = /^(?:just a moment|attention required|access denied|request unsuccessful|are you a robot|verify you are human|403 forbidden|forbidden|pardon our interruption)/i.test(title)
    || (h.length < 25_000 && /cf-chl|challenge-platform|px-captcha|incapsula|_Incapsula_Resource|perimeterx/i.test(h));

  // JSON-LD: the organisation and any products / offers.
  let orgName = "", logo = "";
  const sameAs: string[] = [];
  const products: Product[] = [];
  const walk = (node: unknown, depth = 0) => {
    if (!node || depth > 6) return;
    if (Array.isArray(node)) { for (const n of node.slice(0, 80)) walk(n, depth + 1); return; }
    if (typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    const type = String(Array.isArray(o["@type"]) ? (o["@type"] as unknown[])[0] : o["@type"] || "");
    if (/^(Organization|Corporation|Brand|OnlineStore|Store|LocalBusiness)$/i.test(type)) {
      if (!orgName && typeof o.name === "string") orgName = clip(decode(o.name), 80);
      if (!logo) logo = typeof o.logo === "string" ? o.logo : typeof (o.logo as Record<string, unknown>)?.url === "string" ? String((o.logo as Record<string, unknown>).url) : "";
      if (Array.isArray(o.sameAs)) for (const s of o.sameAs.slice(0, 20)) if (typeof s === "string") sameAs.push(s);
    }
    if (/^Product$/i.test(type) && typeof o.name === "string" && products.length < 120) {
      const offers = (Array.isArray(o.offers) ? o.offers[0] : o.offers) as Record<string, unknown> | undefined;
      const price = Number(offers?.price ?? offers?.lowPrice ?? 0);
      products.push({ title: clip(decode(o.name), 140), type: typeof o.category === "string" ? clip(o.category, 60) : undefined, price: price > 0 ? price : undefined, currency: typeof offers?.priceCurrency === "string" ? offers.priceCurrency.toUpperCase().slice(0, 3) : undefined });
    }
    for (const k of ["@graph", "itemListElement", "item", "mainEntity", "hasOfferCatalog", "brand", "publisher"]) if (o[k]) walk(o[k], depth + 1);
  };
  for (const m of h.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim())); } catch { /* broken JSON-LD is common */ }
  }

  const base = (() => { try { return new URL(pageUrl); } catch { return null; } })();
  const abs = (href: string) => { try { return new URL(href, base || undefined).toString(); } catch { return ""; } };
  const links = Array.from(h.matchAll(/<a\s[^>]*href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi), (m) => ({ url: abs(decode(m[1])), text: clip(text(m[2]), 80) })).filter((l) => l.url);
  const socials: SiteFacts["socials"] = [];
  for (const l of [...links.map((x) => x.url), ...sameAs]) {
    for (const [platform, re] of SOCIAL_RE) if (re.test(l) && !socials.some((s) => s.platform === platform)) socials.push({ platform, url: l.split("?")[0] });
  }
  const host = base?.hostname.replace(/^www\./, "") || "";
  const programs: Program[] = [];
  for (const l of links) {
    const hay = `${l.text} ${l.url.replace(/[-_/]/g, " ")}`;
    if (!PROGRAM_RE.test(hay) || /careers?|jobs|wholesale|retailers?|distributors?|investors?|press|privacy|terms|login|sign ?in|account/i.test(hay)) continue;
    const kind: Program["kind"] = /affiliate/i.test(hay) ? "affiliate" : /ambassador/i.test(hay) ? "ambassador" : /creator|influencer|collab|sponsor/i.test(hay) ? "creator" : "partner";
    if (programs.some((p) => p.url === l.url) || programs.length >= 6) continue;
    const net = NETWORKS.find(([, re]) => re.test(l.url));
    programs.push({ kind, url: l.url.slice(0, 300), text: l.text || kind, ...(net ? { network: net[0] } : {}) });
  }
  // Menu words: what the store files things under ("Cases", "Cooling", "Fans").
  const navBlocks = Array.from(h.matchAll(/<(nav|header)[\s>][\s\S]*?<\/\1>/gi), (m) => m[0]).join(" ");
  const nav = Array.from(new Set(Array.from(navBlocks.matchAll(/<a\s[^>]*>([\s\S]*?)<\/a>/gi), (m) => clip(text(m[1]), 40))
    .filter((t) => t.length >= 3 && t.length <= 36 && !/^(home|shop|shop all|all|account|log ?in|sign ?in|sign ?up|cart|bag|search|menu|close|support|help|contact(?: us)?|about(?: us)?|blog|news|faq|wishlist|track order|english|usd|eur|gbp|\$|€|£|.*\d{3,}.*)$/i.test(t))))
    .slice(0, 40);
  const platform = /cdn\.shopify\.com|Shopify\.shop|shopify-section|myshopify\.com/i.test(h) ? "shopify"
    : /woocommerce|wp-content\/plugins\/woocommerce/i.test(h) ? "woocommerce" : /bigcommerce/i.test(h) ? "bigcommerce"
    : /Magento|mage\/cookies|\/static\/version\d+\/frontend\//.test(h) ? "magento" : /static\.wixstatic|wix-site/i.test(h) ? "wix"
    : /static1\.squarespace|squarespace-cdn/i.test(h) ? "squarespace" : /shopware/i.test(h) ? "shopware" : /salesforce-commercecloud|demandware/i.test(h) ? "salesforce" : "";
  const currency = (/Shopify\.currency\s*=\s*\{\s*"active"\s*:\s*"([A-Z]{3})"/.exec(h)?.[1] || meta("og:price:currency") || meta("product:price:currency") || products.find((p) => p.currency)?.currency || "").toUpperCase().slice(0, 3);
  const locales = Array.from(new Set(Array.from(h.matchAll(/<link[^>]*hreflang=["']([\w-]+)["'][^>]*>/gi), (m) => m[1].toLowerCase()).filter((x) => x !== "x-default"))).slice(0, 40);
  return {
    title, siteName: meta("og:site_name"), description: meta("description") || meta("og:description") || meta("twitter:description"), lang, orgName, logo: clip(logo, 300),
    platform, currency, socials, programs, nav, products, collections: [], locales, sameAs: sameAs.slice(0, 12), blocked,
  };
  void host;
}

/** Shopify's public /products.json. */
export function parseShopify(json: unknown): Product[] {
  const list = (json as { products?: unknown[] })?.products;
  if (!Array.isArray(list)) return [];
  return list.slice(0, 250).map((p) => {
    const o = p as Record<string, unknown>;
    const tags = Array.isArray(o.tags) ? o.tags.map(String) : typeof o.tags === "string" ? o.tags.split(",") : [];
    const v = Array.isArray(o.variants) ? (o.variants[0] as Record<string, unknown>) : undefined;
    const price = Number(v?.price || 0);
    return { title: clip(decode(String(o.title || "")), 140), type: clip(String(o.product_type || ""), 60), tags: tags.map((t: string) => clip(t, 40)).filter(Boolean).slice(0, 15), price: price > 0 ? price : undefined };
  }).filter((p) => p.title);
}
/** Shopify's public /collections.json — collection titles. */
export function parseShopifyCollections(json: unknown): string[] {
  const list = (json as { collections?: unknown[] })?.collections;
  if (!Array.isArray(list)) return [];
  return list.map((c) => clip(decode(String((c as Record<string, unknown>).title || "")), 60)).filter((t) => t && !/^(all|home ?page|frontpage|sale|new|best ?sellers?|featured)$/i.test(t)).slice(0, 60);
}
/** WooCommerce Store API (/wp-json/wc/store/v1/products). */
export function parseWoo(json: unknown): Product[] {
  if (!Array.isArray(json)) return [];
  return json.slice(0, 100).map((p) => {
    const o = p as Record<string, unknown>;
    const prices = (o.prices || {}) as Record<string, unknown>;
    const minor = Number(prices.currency_minor_unit ?? 2);
    const price = Number(prices.price || 0) / 10 ** (Number.isFinite(minor) ? minor : 2);
    const cats = Array.isArray(o.categories) ? o.categories.map((c) => String((c as Record<string, unknown>).name || "")) : [];
    return { title: clip(decode(String(o.name || "")), 140), type: clip(cats[0] || "", 60), tags: cats.slice(1, 6), price: price > 0 ? Math.round(price * 100) / 100 : undefined, currency: typeof prices.currency_code === "string" ? prices.currency_code : undefined };
  }).filter((p) => p.title);
}

/** Min / median / max of what they sell (ignores accessories under 3% of the median when there are many). */
export function priceStats(products: Product[], currency = ""): { min: number; median: number; max: number; currency: string } | null {
  // Placeholder prices (99999, 999999) and gift cards at 0.01 are not prices.
  const p = products.map((x) => x.price || 0).filter((x) => x >= 0.5 && x < 100_000 && !/^9{5,}(?:\.\d+)?$/.test(String(x))).sort((a, b) => a - b);
  if (p.length < 2) return null;
  const median = p[Math.floor(p.length / 2)];
  const kept = p.length >= 10 ? p.filter((x) => x >= median * 0.03 && x <= median * 25) : p;
  return { min: kept[0], median, max: kept[kept.length - 1], currency: currency || products.find((x) => x.currency)?.currency || "" };
}

const squash = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
/** Does the site say it is this brand? (title, og:site_name, the organisation's name or the domain itself). */
export function siteIsBrand(name: string, domain: string, f: Pick<SiteFacts, "title" | "siteName" | "orgName">): boolean {
  const n = squash(name);
  if (n.length < 2) return false;
  const label = squash(domain.split(".")[0] || "");
  const hay = [f.siteName, f.orgName, f.title.split(/[|\-–—:·]/)[0], f.title].map(squash).filter(Boolean);
  // The exact domain is enough ("tryx.com" for TRYX); a domain that only contains the name
  // ("corsairfly…") must also call itself that name on the page.
  const said = hay.some((x) => x === n || (n.length >= 4 && x.includes(n)) || (x.length >= 4 && n.includes(x)));
  // The domain alone only counts when the page says nothing about itself (a script-only shell);
  // otherwise the page must call itself that name ("jasonsentme.com" titled something else is not a brand check).
  if (label && label === n) return said || !hay.some((x) => x.length >= 3);
  return said;
}

/**
 * A readable name from what the site calls itself ("TRYX | Official Store" → "TRYX").
 * The candidate that looks like the domain or the name we already have wins
 * (a site_name of "Vcom" on valvoline.com loses to the title's "Valvoline").
 */
export function siteName(f: Pick<SiteFacts, "title" | "siteName" | "orgName">, domain: string, hint = ""): string {
  const label = squash(domain.split(".")[0] || "");
  const want = [label, squash(hint)].filter((x) => x.length >= 3);
  // Every part of every name the site gives ("Polestar – Elektroautos | Polestar" → "Polestar", "Elektroautos"…), shortest match wins.
  const cands = [f.siteName, f.orgName, f.title].flatMap((x) => [...x.split(/\s[|\-–—:·]\s|\s[|–—]\s?/), x])
    .map((x) => x.replace(/\b(official|store|shop|online|website|home ?page|welcome to)\b/gi, "").replace(/\s+(?:US|USA|UK|EU|CA|AU|NZ|DE|NL|FR|ES|IT|AT|CH|BE|SE|DK|NO|PL|Global|International|Europe|Shop|Store)$/i, "").replace(/\s+/g, " ").trim())
    .filter((x) => x.length >= 2 && x.length <= 40);
  const match = cands.filter((x) => { const q = squash(x); return q.length >= 2 && want.some((w) => q === w || (q.length >= 4 && (w.includes(q) || q.includes(w)))); }).sort((a, b) => a.length - b.length)[0];
  return match || (want.length ? "" : cands[0]) || hint || (domain.split(".")[0] || domain);
}

/** Commission and network named on an affiliate / creator program page. */
export function readProgram(html: string): { commission: string; network: string } {
  const t = text(html).slice(0, 60_000);
  const com = /(\d{1,2}(?:\.\d)?\s?%)\s*(?:commission|per sale|on (?:every|each|all) (?:sale|order)s?|of (?:every|each) sale)/i.exec(t) || /commission(?:s)? (?:of|up to|rate of)?\s*(\d{1,2}(?:\.\d)?\s?%)/i.exec(t);
  const net = NETWORKS.find(([, re]) => re.test(html));
  return { commission: com ? com[1].replace(/\s/g, "") : "", network: net ? net[0] : "" };
}

/** Markets from hreflang ("en-gb" → GB) — where the site sells. */
export function marketsOf(locales: string[]): string[] {
  return Array.from(new Set(locales.map((l) => (l.split("-")[1] || "").toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)))).slice(0, 30);
}
