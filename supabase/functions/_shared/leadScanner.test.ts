// Run: node --experimental-strip-types supabase/functions/_shared/leadScanner.test.ts
import { scanForLead } from "./leadScanner.ts";
const own = ["dhurim@mimibridge.com", "granit@grannset.com"];
const base = { labels: ["INBOX", "CATEGORY_PERSONAL"], headers: {}, own, to: own[0] };
const cases: [string, any, boolean, string?][] = [
  ["brand sponsorship", { from: "Sara Lee <sara@glowskin.co>", subject: "Sponsorship for your creators", snippet: "Hi! We're launching our new serum and are looking for creators for our Q1 campaign. What are your rates for a dedicated video?" }, true, "brand"],
  ["creator wants management", { from: "Mike <mikegames@gmail.com>", subject: "Looking for management", snippet: "Hey, I'm a YouTuber with 250k subscribers, looking for an agency to represent me. My channel: youtube.com/@mike" }, true, "creator"],
  ["website form", { from: "Wix Forms <no-reply@wix.com>", replyTo: "Anna <anna@brandly.io>", subject: "New form submission", snippet: "Name: Anna Email: anna@brandly.io Message: We'd love to collaborate on a paid partnership with your talent" }, true, "brand"],
  ["newsletter", { from: "Brand News <news@brand.com>", subject: "Our new campaign is live", snippet: "Partner with us... unsubscribe", headers: { "list-unsubscribe": "<mailto:x>", "list-id": "news.brand.com" } }, false],
  ["promotions tab", { from: "Deals <hello@shop.com>", subject: "Collab drop 50% off", snippet: "sale", labels: ["INBOX", "CATEGORY_PROMOTIONS"] }, false],
  ["warmup", { from: "Tom Becker <tom.becker88@gmail.com>", subject: "Quick sync on the roadmap 7XK2PQ", snippet: "Hey, wanted to circle back on the partnership doc we talked about. 7XK2PQ" }, false],
  ["personal", { from: "Mom <mom@gmail.com>", subject: "Dinner sunday?", snippet: "Are you coming for dinner? Bring the kids" }, false],
  ["seo spam", { from: "Raj <raj@seoagency.biz>", subject: "Collaboration proposal", snippet: "We offer SEO and backlinks, guest post collaboration for your website" }, false],
  ["growth spam", { from: "Promo <promo@ytboost.net>", subject: "Partnership for your channel", snippet: "We can grow your channel and increase your views with our promotion service" }, false],
  ["auto reply", { from: "sara@glowskin.co", subject: "Out of office: Sponsorship", snippet: "I'm away", headers: { "auto-submitted": "auto-replied" } }, false],
  ["colleague", { from: "Ana <ana@mimibridge.com>", subject: "Sponsorship brief for the Nike campaign", snippet: "attached the campaign brief and budget" }, false],
  ["receipt", { from: "Stripe <receipts@stripe.com>", subject: "Your receipt", snippet: "payment received for campaign" }, false],
  ["own", { from: "dhurim@mimibridge.com", subject: "sponsorship", snippet: "campaign budget" }, false],
  ["pr gifting", { from: "PR Team <pr@lumabeauty.com>", subject: "PR package for you", snippet: "We'd love to send you a product from our new line, no strings attached — happy to discuss a paid partnership too" }, true, "brand"],
  ["cold pitch campaign", { from: "Seth <seth@faircrest-studios.store>", subject: "Dhurim, am I mistaken in my perception?", snippet: "Most agencies struggle to fill every campaign. We help agencies book more clients — worth a quick chat?", labels: ["INBOX", "IMPORTANT"] }, false],
  ["talent pitch", { from: "Dan <dan@scrytalent.com>", subject: "Re: The real answer...", snippet: "Happy to share our media kit of talent", labels: ["INBOX", "IMPORTANT"], headers: { references: "<a@b>" } }, false],
  ["campaign inquiry", { from: "Su <su@prettymomsu.com>", subject: "Campaign inquiry — PrettyMomSu", snippet: "Hi, we're planning a campaign for our new product line", labels: ["INBOX", "IMPORTANT"] }, true, "brand"],
  ["fake re: pitch", { from: "Pete <pete@connexos.co.uk>", subject: "Re: That Reliable?", snippet: "Following up on my note about your next campaign request", labels: ["INBOX", "IMPORTANT"], headers: { "in-reply-to": "<x@y>" } }, false],
];
let fail = 0;
for (const [name, c, expect, kind] of cases) {
  const r = scanForLead({ ...base, ...c, headers: { ...(c.headers || {}) }, labels: c.labels || base.labels });
  const ok = !!r === expect && (!kind || r?.kind === kind);
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, r ? `${r.kind} ${r.score} ${r.email} [${r.reasons.join("; ")}]` : "null");
}
process.exit(fail ? 1 : 0);
