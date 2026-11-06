// Run: node --experimental-strip-types supabase/functions/_shared/leadScanner.test.ts
import { decodeEntities, scanForLead } from "./leadScanner.ts";

const own = ["dhurim@mimibridge.com", "dhurimi@mimibridge.com", "granit@grannset.com"];
const base = { labels: ["INBOX", "CATEGORY_PERSONAL"], headers: {} as Record<string, string>, own, to: own[0] };
type Case = [string, Record<string, unknown>, string | null];

const cases: Case[] = [
  // ---- real leads -------------------------------------------------------------
  ["creator wants management", { from: "Mike <mikegames@gmail.com>", subject: "Looking for management", snippet: "", body: "Hey! I'm a YouTuber with 250k subscribers (youtube.com/@mike) and I'm looking for a management agency to represent me for brand deals. Would you be interested in representing my channel?" }, "creator_management"],
  ["creator wants roster", { from: "Lea <lea.creates@gmail.com>", subject: "Joining your roster", snippet: "", body: "Hi, I am a TikTok creator — my TikTok account has 1.2M followers. I'd love to join your roster, are you taking new creators?" }, "creator_management"],
  ["brand wants creators", { from: "Sara Lee <sara@glowskin.co>", subject: "Influencer campaign for our serum", snippet: "", body: "Hi! I'm the influencer marketing manager at Glowskin. We're launching our new serum and are looking for 5 beauty creators for an influencer campaign in Q1. Budget is $20k — can you share your roster's rates?" }, "brand_needs_creators"],
  ["website form brand", { from: "Wix Forms <no-reply@wix.com>", replyTo: "Anna <anna@brandly.io>", subject: "New form submission", snippet: "", body: "Name: Anna\nEmail: anna@brandly.io\nMessage: Our brand Brandly is looking for gaming creators for a paid campaign next month." }, "brand_needs_creators"],
  ["agency partnership", { from: "Tom <tom@starlightagency.com>", subject: "Partnership between our agencies", snippet: "", body: "Hi Dhurim, I'm the founder of Starlight, an influencer marketing agency in London. We have brand clients that need YouTube creators and would love to partner — we bring our brands, you bring your talent, and we share the revenue." }, "agency_partnership"],
  // ---- not leads ----------------------------------------------------------------
  ["warm-up (real Riya email)", { from: "Riya Johnson <riya.johnson@pfitglobal.org>", subject: "Dhurim, what would your management of this be?", snippet: "Hi Dhurim Sending good vibes your way for the day We can help improve your demand generation with our marketing automation solution. This is just one of the many ideas I have to help you. Let&#39;s", body: "Hi Dhurim\nSending good vibes your way for the day\nWe can help improve your demand generation with our marketing automation solution.\nRiya Johnson\nPhone_N0: 548213907" }, null],
  ["warm-up phone marker only", { from: "Mark <mark.d@vertexa.co>", subject: "Quick thought on your roster", snippet: "", body: "I'm a YouTuber with 90k subscribers looking for management.\n\nMark\nPhone_N0: 902318475" }, null],
  ["warm-up phone marker variant", { from: "Kim <kim@novaline.io>", subject: "Our brand", snippet: "", body: "Our brand is looking for creators for an influencer campaign.\nPh_No: 7745 123 900" }, null],
  ["warm-up tag code", { from: "Tom Becker <tom.becker88@gmail.com>", subject: "Quick sync on the roadmap 7XK2PQ", snippet: "circle back on the partnership doc 7XK2PQ" }, null],
  ["agency selling software", { from: "Ben <ben@creatorstack.io>", subject: "Partnership for your agency", snippet: "", body: "We're an influencer marketing agency and our platform helps agencies manage their talent. Book a call to see a demo and a free trial." }, null],
  ["agency without assets", { from: "Zed <zed@zedmedia.com>", subject: "Collaboration", snippet: "", body: "We're an influencer marketing agency and we'd love to collaborate." }, null],
  ["vague collab ask", { from: "Joe <joe@gmail.com>", subject: "Collab?", snippet: "Hey want to collab sometime?" }, null],
  ["creator pitching product (not management)", { from: "Ava <ava@gmail.com>", subject: "My channel", snippet: "", body: "I'm a content creator with 40k followers. Check out my new merch store!" }, null],
  ["growth service", { from: "Promo <promo@ytboost.net>", subject: "Partnership for your channel", snippet: "", body: "We can grow your channel and increase your views with our promotion service. Our influencer agency works with creators." }, null],
  ["lead-gen pitch", { from: "Seth <seth@faircrest-studios.store>", subject: "Dhurim, am I mistaken?", snippet: "", body: "Most agencies struggle to fill every campaign. We help agencies book more clients — worth a quick chat?" }, null],
  ["newsletter", { from: "Brand News <news@brand.com>", subject: "Our new influencer campaign is live", snippet: "", headers: { "list-id": "news.brand.com" } }, null],
  ["promotions tab", { from: "Deals <hello@shop.com>", subject: "Creators wanted 50% off", snippet: "", labels: ["INBOX", "CATEGORY_PROMOTIONS"] }, null],
  ["auto reply", { from: "sara@glowskin.co", subject: "Out of office", snippet: "", headers: { "auto-submitted": "auto-replied" } }, null],
  ["colleague", { from: "Ana <ana@mimibridge.com>", subject: "Brand looking for creators", snippet: "", body: "Our brand client is looking for creators for an influencer campaign." }, null],
  ["brand lead in spam", { from: "Sara Lee <sara@glowskin.co>", subject: "Influencer campaign for our serum", snippet: "", labels: ["SPAM"], body: "Hi! I'm the influencer marketing manager at Glowskin. We're looking for 5 beauty creators for an influencer campaign. Budget is $20k." }, "brand_needs_creators"],
  ["spam pitch stays out", { from: "Seth <seth@faircrest-studios.store>", subject: "Dhurim, am I mistaken?", snippet: "", labels: ["SPAM"], body: "We help agencies book more clients — worth a quick chat?" }, null],
  ["fake re: thread", { from: "Pete <pete@connexos.co.uk>", subject: "Re: That Reliable?", snippet: "", headers: { "in-reply-to": "<x@y>" }, body: "Our brand is looking for creators for an influencer campaign." }, null],
  ["personal", { from: "Mom <mom@gmail.com>", subject: "Dinner sunday?", snippet: "Are you coming for dinner?" }, null],
  ["own", { from: "dhurim@mimibridge.com", subject: "talent", snippet: "", body: "I'm a YouTuber looking for management" }, null],
];

let fail = 0;
for (const [name, c, expected] of cases) {
  const r = scanForLead({ ...base, snippet: "", ...c, headers: { ...((c.headers as Record<string, string>) || {}) }, labels: (c.labels as string[]) || base.labels } as never);
  const ok = (r?.category ?? null) === expected;
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, r ? `${r.category} ${r.score} ${r.email} [${r.reasons.join("; ")}]` : "null");
}
const decoded = decodeEntities("Let&#39;s talk &amp; &quot;more&quot;");
if (decoded !== `Let's talk & "more"`) { fail++; console.log("FAIL decodeEntities", decoded); } else console.log("ok   decodeEntities");
console.log(`${cases.length + 1 - fail}/${cases.length + 1} passed`);
if (typeof process !== "undefined") process.exit(fail ? 1 : 0);
