// Run: node --experimental-strip-types supabase/functions/_shared/brandSite.test.ts
import { marketsOf, parseHtml, parseShopify, parseWoo, priceStats, readProgram, siteIsBrand, siteName } from "./brandSite.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };

const html = `<!doctype html><html lang="en"><head><title>TRYX | Premium PC Cases, AIO Coolers &amp; Keyboards</title>
<meta name="description" content="Discover TRYX premium PC cases and AIO liquid coolers.">
<meta property="og:site_name" content="TRYX">
<link rel="alternate" hreflang="en-gb" href="/uk"><link rel="alternate" hreflang="de-de" href="/de"><link rel="alternate" hreflang="x-default" href="/">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"TRYX","sameAs":["https://www.youtube.com/@tryx","https://www.instagram.com/tryx_official"]}</script>
<script>Shopify.shop = "tryx.myshopify.com"; Shopify.currency = {"active":"USD","rate":"1.0"};</script>
<script src="https://cdn.shopify.com/s/files/x.js"></script></head><body>
<header><nav><a href="/collections/cases">Cases</a><a href="/collections/coolers">AIO Coolers</a><a href="/cart">Cart</a><a href="/account/login">Log in</a></nav></header>
<footer><a href="/pages/affiliate-program">Affiliate Program</a><a href="/pages/careers">Careers</a><a href="https://twitter.com/tryx">X</a></footer></body></html>`;
const f = parseHtml(html, "https://www.tryx.com/");
eq("title", f.title, "TRYX | Premium PC Cases, AIO Coolers & Keyboards");
eq("description", f.description, "Discover TRYX premium PC cases and AIO liquid coolers.");
eq("platform + currency", [f.platform, f.currency], ["shopify", "USD"]);
eq("menu words (no cart/login)", f.nav, ["Cases", "AIO Coolers"]);
eq("socials", f.socials.map((s) => s.platform), ["X", "YouTube", "Instagram"]);
eq("affiliate program, not careers", f.programs.map((p) => [p.kind, p.url]), [["affiliate", "https://www.tryx.com/pages/affiliate-program"]]);
eq("not a bot wall", f.blocked, false);
eq("markets from hreflang", marketsOf(f.locales), ["GB", "DE"]);
eq("site name", siteName(f, "tryx.com"), "TRYX");
eq("site is the brand", siteIsBrand("TRYX", "tryx.com", f), true);
eq("bot wall", parseHtml("<html><head><title>Just a moment...</title></head><body>cf-chl</body></html>", "https://x.com/").blocked, true);
eq("site name prefers the domain over an odd og:site_name", siteName({ title: "Valvoline | Motor Oil", siteName: "Vcom", orgName: "" }, "valvoline.com"), "Valvoline");
eq("region suffix dropped", siteName({ title: "Secretlab US", siteName: "", orgName: "" }, "secretlab.co"), "Secretlab");
eq("a different company's site", siteIsBrand("Corsair", "corsairfly.example", { title: "Air travel deals", siteName: "Fly Away", orgName: "" }), false);

eq("site name from a long og:site_name", siteName({ title: "", siteName: "Polestar – Elektroautos | Polestar", orgName: "" }, "polestar.com"), "Polestar");
eq("site name drops a tagline", siteName({ title: "OBSBOT - Die beste Auto-Tracking-Webcam", siteName: "", orgName: "" }, "obsbot.com"), "OBSBOT");
eq("a domain-spelled name needs the page to agree", siteIsBrand("Jasonsentme", "jasonsentme.com", { title: "Mattresses for every sleeper", siteName: "Dreamy", orgName: "" }), false);
eq("…unless the page says nothing about itself", siteIsBrand("Tryx", "tryx.com", { title: "", siteName: "", orgName: "" }), true);

const shop = parseShopify({ products: [{ title: "Luca L70 Case", product_type: "Case", tags: "white, atx", variants: [{ price: "129.99" }] }, { title: "Gift card", product_type: "", tags: [], variants: [{ price: "999999" }] }] });
eq("shopify products", shop.map((p) => [p.title, p.type, p.price]), [["Luca L70 Case", "Case", 129.99], ["Gift card", "", 999999]]);
eq("price stats ignore placeholders", priceStats([...shop, { title: "Fan", price: 19 }]), { min: 19, median: 129.99, max: 129.99, currency: "" });
eq("woo products", parseWoo([{ name: "Dash cam X1", prices: { price: "8999", currency_code: "USD", currency_minor_unit: 2 }, categories: [{ name: "Dash Cams" }] }]).map((p) => [p.title, p.type, p.price, p.currency]), [["Dash cam X1", "Dash Cams", 89.99, "USD"]]);
eq("program commission + network", readProgram(`<p>Earn 15% commission on every sale.</p><a href="https://app.goaffpro.com/x">Join</a>`), { commission: "15%", network: "GoAffPro" });

if (fail) { console.log(`\n${fail} failing`); (globalThis as { process?: { exit: (n: number) => void } }).process?.exit(1); } else console.log("\nall brand site tests pass");
